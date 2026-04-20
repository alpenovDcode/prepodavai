'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import { cacheGeneration, getCachedGeneration, CachedGeneration } from '../utils/generationsCache'
import { getCurrentUser } from '../utils/userIdentity'

/**
 * Определяет, запущено ли приложение внутри Mini App и на какой платформе.
 * Возвращает 'telegram' | 'max' | null.
 */
function detectMiniAppPlatform(): 'telegram' | 'max' | null {
  if (typeof window === 'undefined') return null
  const tg = (window as any).Telegram?.WebApp
  const max = (window as any).WebApp
  if (tg?.initData && tg.initData.includes('hash=')) return 'telegram'
  if (max?.initData && max.initData.includes('hash=')) return 'max'
  const hash = window.location.hash
  if (hash?.includes('WebAppData=')) return 'max'
  const p = new URLSearchParams(window.location.search)
  if (p.has('tgWebAppData') || p.has('tgWebAppPlatform')) return 'telegram'
  if (p.has('max_init_data')) return 'max'
  return null
}

export interface GenerationRequest {
  type: string
  params: Record<string, any>
}

export interface GenerationResponse {
  success: boolean
  requestId?: string
  error?: string
  remainingCredits?: number
}

export interface GenerationStatus {
  status: 'pending' | 'completed' | 'failed'
  result?: any
  error?: string
}

export function useGenerations() {
  const queryClient = useQueryClient()
  const [isGeneratingRequest, setIsGeneratingRequest] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const isGenerating = isGeneratingRequest || isPolling
  const [error, setError] = useState<string | null>(null)
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null)
  const [inputParams, setInputParams] = useState<Record<string, any>>({})

  const generate = useCallback(async (request: GenerationRequest): Promise<string | null> => {
    setIsGeneratingRequest(true)
    setError(null)
    setInputParams(request.params)

    try {
      const user = getCurrentUser()

      // Маппинг типов генераций на API endpoints
      const endpointMap: Record<string, string> = {
        worksheet: '/generate/worksheet',
        quiz: '/generate/quiz',
        vocabulary: '/generate/vocabulary',
        lessonPlan: '/generate/lesson-plan',
        lessonPreparation: '/generate/lesson-preparation',
        unpacking: '/generate/unpacking',
        content: '/generate/content-adaptation',
        feedback: '/generate/feedback',
        presentation: '/generate/presentation',
        image: '/generate/image',
        image_generation: '/generate/image',
        photosession: '/generate/photosession',
        transcription: '/generate/transcribe-video',
        message: '/generate/message',
        videoAnalysis: '/generate/video-analysis',
        'video-analysis': '/generate/video-analysis',
        salesAdvisor: '/generate/sales-advisor',
        sales_advisor: '/generate/sales-advisor',
        'exam-variant': '/generate/exam-variant',
        exam_variant: '/generate/exam-variant',
        assistant: '/generate/assistant',
      }

      const endpoint = endpointMap[request.type];
      if (!endpoint) {
        throw new Error(`Unknown generation type: ${request.type}`);
      }

      // Определяем платформу Mini App (если генерация из Telegram/MAX Mini App)
      const miniAppPlatform = detectMiniAppPlatform()
      const paramsWithPlatform = miniAppPlatform
        ? { ...request.params, _miniAppPlatform: miniAppPlatform }
        : request.params

      // Отправляем запрос на генерацию
      const response = await apiClient.post<GenerationResponse>(endpoint, paramsWithPlatform)

      if (!response.data.success || !response.data.requestId) {
        throw new Error(response.data.error || 'Не получен ID запроса')
      }

      // Optimistically update subscription balance
      if (typeof response.data.remainingCredits === 'number') {
        queryClient.setQueryData(['subscription'], (old: any) => {
          if (!old) return old
          return {
            ...old,
            creditsBalance: response.data.remainingCredits
          }
        })
      }

      const requestId = response.data.requestId
      setActiveGenerationId(requestId)

      // Кэшируем как pending
      cacheGeneration({
        id: requestId,
        userId: user.userHash,
        type: request.type,
        status: 'pending',
        params: request.params,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      return requestId
    } catch (err: any) {
      // NestJS usually puts the descriptive string in `message`, and `error` is just "Bad Request"
      const responseData = err.response?.data
      const errorMessage = responseData?.message || responseData?.error || err.message || 'Ошибка генерации'
      const finalError = Array.isArray(errorMessage) ? errorMessage[0] : errorMessage
      setError(finalError)
      throw new Error(finalError) // Throw so generateAndWait can catch it explicitly
    } finally {
      setIsGeneratingRequest(false)
    }
  }, [])

  const pollStatus = useCallback(async (requestId: string, maxAttempts: number = 300, onProgress?: (result: any) => void): Promise<GenerationStatus> => {
    setIsPolling(true)
    let attempts = 0

    return new Promise((resolve, reject) => {
      const check = async () => {
        attempts++
        try {
          const response = await apiClient.get<{ success: boolean; status?: GenerationStatus; result?: any; error?: string }>(`/generate/${requestId}?_t=${Date.now()}`)

          if (!response.data.success) {
            reject(new Error(response.data.error || 'Ошибка получения статуса'))
            return
          }

          const status = response.data.status || {
            status: response.data.result ? 'completed' : 'pending',
            result: response.data.result
          }

          // If we have a partial result, notify the callback
          if (status.result && onProgress) {
            onProgress(status.result)
          }

          if (status.status === 'completed') {
            // Обновляем кэш
            const cached = getCachedGeneration(requestId)
            if (cached) {
              cacheGeneration({
                ...cached,
                status: 'completed',
                result: status.result,
                updatedAt: new Date().toISOString()
              })
            }
            setIsPolling(false)
            resolve(status)
          } else if (status.status === 'failed') {
            // Обновляем кэш
            const cached = getCachedGeneration(requestId)
            if (cached) {
              cacheGeneration({
                ...cached,
                status: 'failed',
                error: status.error,
                updatedAt: new Date().toISOString()
              })
            }
            setIsPolling(false)
            reject(new Error(status.error || 'Ошибка генерации'))
          } else if (attempts < maxAttempts) {
            setTimeout(check, 15000)
          } else {
            setIsPolling(false)
            reject(new Error('Превышено время ожидания'))
          }
        } catch (err: any) {
          setIsPolling(false)
          reject(err)
        }
      }
      check()
    })
  }, [])

  const generateBundle = useCallback(async (types: string[], params: Record<string, any>) => {
    setIsGeneratingRequest(true)
    setError(null)

    try {
      const miniAppPlatform = detectMiniAppPlatform()
      const response = await apiClient.post<{ results: any[]; remainingCredits?: number }>('/generate/bundle', {
        types,
        params: miniAppPlatform ? { ...params, _miniAppPlatform: miniAppPlatform } : params,
      })

      // Optimistically update subscription balance
      if (typeof response.data.remainingCredits === 'number') {
        queryClient.setQueryData(['subscription'], (old: any) => {
          if (!old) return old
          return {
            ...old,
            creditsBalance: response.data.remainingCredits
          }
        })
      }

      return response.data
    } catch (err: any) {
      const responseData = err.response?.data
      const errorMessage = responseData?.message || responseData?.error || err.message || 'Ошибка генерации пакета'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsGeneratingRequest(false)
    }
  }, [queryClient])

  const generateAndWait = useCallback(async (request: GenerationRequest, onProgress?: (result: any) => void): Promise<GenerationStatus> => {
    const requestId = await generate(request)
    if (!requestId) {
      throw new Error('Не удалось создать запрос на генерацию')
    }

    return pollStatus(requestId, 300, onProgress)
  }, [generate, pollStatus])

  return {
    generate,
    pollStatus,
    generateAndWait,
    generateBundle,
    isGenerating,
    error,
    activeGenerationId,
    inputParams
  }
}

