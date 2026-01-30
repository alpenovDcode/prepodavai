'use client'

import { useState, useCallback } from 'react'
import { apiClient } from '../api/client'
import { cacheGeneration, getCachedGeneration, CachedGeneration } from '../utils/generationsCache'
import { getCurrentUser } from '../utils/userIdentity'

export interface GenerationRequest {
  type: string
  params: Record<string, any>
}

export interface GenerationResponse {
  success: boolean
  requestId?: string
  error?: string
}

export interface GenerationStatus {
  status: 'pending' | 'completed' | 'failed'
  result?: any
  error?: string
}

export function useGenerations() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (request: GenerationRequest): Promise<string | null> => {
    setIsGenerating(true)
    setError(null)

    try {
      const user = getCurrentUser()

      // Маппинг типов генераций на API endpoints
      const endpointMap: Record<string, string> = {
        worksheet: '/generate/worksheet',
        quiz: '/generate/quiz',
        vocabulary: '/generate/vocabulary',
        lessonPlan: '/generate/lesson-plan',
        lessonPreparation: '/generate/lesson-preparation',
        unpacking: '/generate/lesson-preparation',
        content: '/generate/content-adaptation',
        feedback: '/generate/feedback',
        presentation: '/generate/presentation',
        image: '/generate/image',
        photosession: '/generate/photosession',
        transcription: '/generate/transcribe-video',
        message: '/generate/message',
        gigachat: '/gigachat/generate'
      }

      const endpoint = endpointMap[request.type] || '/generate/worksheet'

      // Отправляем запрос на генерацию
      const response = await apiClient.post<GenerationResponse>(endpoint, request.params)

      if (!response.data.success || !response.data.requestId) {
        throw new Error(response.data.error || 'Не получен ID запроса')
      }

      const requestId = response.data.requestId

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
      const errorMessage = err.response?.data?.error || err.message || 'Ошибка генерации'
      setError(errorMessage)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const pollStatus = useCallback(async (requestId: string, maxAttempts: number = 300, onProgress?: (result: any) => void): Promise<GenerationStatus> => {
    let attempts = 0

    return new Promise((resolve, reject) => {
      const check = async () => {
        attempts++
        try {
          const response = await apiClient.get<{ success: boolean; status?: GenerationStatus; result?: any; error?: string }>(`/generate/${requestId}`)

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
            reject(new Error(status.error || 'Ошибка генерации'))
          } else if (attempts < maxAttempts) {
            setTimeout(check, 1000)
          } else {
            reject(new Error('Превышено время ожидания'))
          }
        } catch (err: any) {
          reject(err)
        }
      }
      check()
    })
  }, [])

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
    isGenerating,
    error
  }
}

