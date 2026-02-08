'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import InputComposer from './InputComposer'
import AiAssistantChat from './AiAssistantChat'
import GenerationProgress from './GenerationProgress'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { apiClient } from '@/lib/api/client' // Используется в initUser для проверки подписки

export default function WebAppIndex() {
  const router = useRouter()
  const [currentFunctionId, setCurrentFunctionId] = useState('worksheet')
  const [topLevelTab, setTopLevelTab] = useState<'wow' | 'all'>('wow') // По умолчанию "Вау-урок"
  const [form, setForm] = useState<Record<string, any>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusOk, setStatusOk] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [maxAttempts] = useState(60)
  const [generationResult, setGenerationResult] = useState<any>(null)
  const [userHash, setUserHash] = useState<string | null>(null)
  const [userSource, setUserSource] = useState<'web' | 'telegram' | null>(null)

  const { generateAndWait, isGenerating: isGenGenerating } = useGenerations()
  const { subscription, totalCredits, loading: subscriptionLoading } = useSubscription()
  const resultContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initUser = async () => {
      try {
        // Проверяем Telegram WebApp
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
          const tg = (window as any).Telegram.WebApp
          tg.ready()
          tg.expand()

          const initData = tg.initData
          if (initData) {
            try {
              const response = await apiClient.post('/auth/validate-init-data', { initData })
              if (response.data.success) {
                setUserHash(response.data.userHash)
                setUserSource('telegram')
                if (response.data.token) {
                  localStorage.setItem('prepodavai_token', response.data.token)
                }
              }
            } catch (e) {
              console.error('Failed to validate initData:', e)
            }
          }
        }

        // Fallback: получаем userHash через API подписки
        if (!userHash) {
          try {
            const response = await apiClient.get('/subscriptions/me')
            if (response.data.success && response.data.userHash) {
              setUserHash(response.data.userHash)
              setUserSource(response.data.source || 'telegram')
            }
          } catch (e) {
            console.error('Failed to get userHash from subscription API:', e)
          }
        }

        // Если все еще нет userHash, используем getCurrentUser
        if (!userHash) {
          const user = getCurrentUser()
          setUserHash(user.userHash)
          setUserSource(user.source)
        }
      } catch (e) {
        console.error('Failed to initialize user:', e)
      }
    }

    initUser()
  }, [])

  const resultHtmlRef = useRef<HTMLDivElement>(null)
  const [isMathJaxReady, setIsMathJaxReady] = useState(false)

  const textResultPayload = useMemo(() => {
    return typeof generationResult === 'object' && generationResult?.content
      ? generationResult.content
      : generationResult
  }, [generationResult])

  const { isHtmlResult, htmlResult, cleanedTextResult } = useMemo(
    () => normalizeResultPayload(textResultPayload),
    [textResultPayload],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).MathJaxLoader) {
      setIsMathJaxReady(true)
      return
    }

    ; (window as any).MathJaxLoader = true

      // Configure MathJax before loading
      ; (window as any).MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\(', '\\)']],
          displayMath: [['$$', '$$'], ['\\[', '\\]']],
          processEscapes: true
        },
        svg: {
          fontCache: 'global'
        }
      };

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
    script.async = true
    script.onload = () => {
      setIsMathJaxReady(true)
    }
    document.head.appendChild(script)

    return () => {
      script.remove()
      delete (window as any).MathJaxLoader
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isMathJaxReady) return
    if (!(window as any).MathJax?.typesetPromise) return
    if (!resultHtmlRef.current) return

      ; (window as any).MathJax.typesetClear?.([resultHtmlRef.current])
      ; (window as any).MathJax.typesetPromise?.([resultHtmlRef.current])
  }, [generationResult, cleanedTextResult, htmlResult, isHtmlResult, isMathJaxReady]);

  const showLogoutButton = typeof window !== 'undefined' &&
    !(window as any).Telegram?.WebApp?.initDataUnsafe?.user

  const onComposerUpdate = (values: Record<string, any>) => {
    setForm(values)
  }

  const onFunctionChange = (fnId: string) => {
    setCurrentFunctionId(fnId)
    setGenerationResult(null)
    setStatusMessage('')
  }

  // Effect to sync currentFunctionId when switching tabs
  useEffect(() => {
    if (topLevelTab === 'wow') {
      setCurrentFunctionId('lessonPreparation')
    } else {
      // When switching to 'all', default to 'worksheet' if currently on 'lessonPreparation'
      setCurrentFunctionId(prev => prev === 'lessonPreparation' ? 'worksheet' : prev)
    }
    setGenerationResult(null)
    setStatusMessage('')
  }, [topLevelTab])



  const openHistory = () => {
    router.push('/history')
  }

  const logout = () => {
    localStorage.removeItem('prepodavai_authenticated')
    localStorage.removeItem('prepodavai_user')
    window.location.reload()
  }

  const gigachatMode = currentFunctionId === 'gigachat' ? (form.mode || 'chat') : null

  // AI Assistant - показываем чат вместо результата
  const isAiAssistant = currentFunctionId === 'aiAssistant'

  const isTextResult = generationResult && (
    ['worksheet', 'quiz', 'vocabulary', 'lessonPlan', 'lessonPreparation', 'content', 'feedback', 'message', 'transcription', 'videoAnalysis', 'salesAdvisor'].includes(currentFunctionId) ||
    (currentFunctionId === 'gigachat' && ['chat', 'embeddings', 'audio_transcription', 'audio_translation', 'tokens_count'].includes(String(gigachatMode)))
  ) && (!generationResult?.sections) // Only treat as simple text if no sections


  const isImageResult = generationResult && (
    ['image', 'photosession'].includes(currentFunctionId) ||
    (currentFunctionId === 'gigachat' && gigachatMode === 'image')
  )

  const isPresentationResult = generationResult &&
    currentFunctionId === 'presentation'

  const isAudioResult = generationResult &&
    currentFunctionId === 'gigachat' &&
    gigachatMode === 'audio_speech'

  const isGameResult = generationResult && currentFunctionId === 'game'

  const isStructuredResult = generationResult && generationResult.sections && Array.isArray(generationResult.sections)


  const imageDisplayUrl = (() => {
    if (!generationResult) return null
    if (typeof generationResult === 'string') return generationResult
    return generationResult?.imageUrl || generationResult?.imageUrls?.[0] || null
  })()

  const audioDisplayUrl = (() => {
    if (!generationResult) return null
    if (typeof generationResult === 'object') return generationResult?.audioUrl || null
    if (typeof generationResult === 'string' && generationResult.startsWith('data:audio')) {
      return generationResult
    }
    return null
  })()

  const clearResult = () => {
    setGenerationResult(null)
    setStatusMessage('')
  }

  const copyResult = () => {
    if (generationResult && navigator.clipboard) {
      const textContent = isHtmlResult && htmlResult
        ? stripHtmlTags(htmlResult)
        : extractTextFromResult(generationResult)
      navigator.clipboard.writeText(textContent)
      setStatusMessage('Скопировано в буфер обмена!')
      setStatusOk(true)
      setTimeout(() => setStatusMessage(''), 2000)
    }
  }

  const downloadTextResult = async () => {
    if (!generationResult) return

    setIsExporting(true)
    try {
      if (isHtmlResult && htmlResult) {
        const typeLabel = getGenerationTypeLabel(currentFunctionId)
        const safeName = typeLabel.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
        const dateSuffix = new Date().toISOString().split('T')[0]
        const filename = `${safeName}_${dateSuffix}.pdf`

        const response = await apiClient.post<Blob>(
          '/gigachat/export/pdf',
          { html: htmlResult, filename },
          { responseType: 'blob' }
        )

        const blob = response.data
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.setAttribute('type', 'application/pdf')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setIsExporting(false)
        return
      }

      let content = textResultPayload || ''
      let mime = 'text/html'
      let extension = 'html'

      if (typeof content === 'object') {
        const jsonStr = JSON.stringify(content, null, 2)
        content = `<pre style="font-family: monospace; white-space: pre-wrap; word-wrap: break-word;">${jsonStr.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
      } else if (typeof content === 'string') {
        if (!isHtmlString(content)) {
          content = `<div style="font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; white-space: pre-wrap; word-wrap: break-word;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
        }
      } else {
        content = String(content)
        content = `<div style="font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; white-space: pre-wrap; word-wrap: break-word;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
      }

      const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${getGenerationTypeLabel(currentFunctionId)}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      padding: 20px; 
      max-width: 800px; 
      margin: 0 auto; 
      background: #ffffff;
      color: #000000;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`

      const typeLabel = getGenerationTypeLabel(currentFunctionId)
      const safeName = typeLabel.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
      const dateSuffix = new Date().toISOString().split('T')[0]

      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeName}_${dateSuffix}.html`
      link.setAttribute('type', 'text/html')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Download error:', error)
      if ((window as any).Telegram?.WebApp) {
        (window as any).Telegram.WebApp.showAlert('Ошибка при скачивании: ' + error.message)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const generateMaterial = async () => {
    if (!userHash) {
      setStatusOk(false)
      setStatusMessage('Ошибка: пользователь не инициализирован')
      return
    }

    setIsGenerating(true)
    setStatusMessage('')
    setStatusOk(false)
    setAttempts(0)

    try {
      const user = getCurrentUser()
      const type = currentFunctionId

      // Подготавливаем параметры в зависимости от типа генерации
      let params: Record<string, any> = { userHash }

      if (type === 'worksheet') {
        params = { ...params, subject: form.subject, topic: form.topic, level: form.level, questionsCount: form.questionsCount, format: form.format || 'DOCX', model: form.model || 'gpt-4o', customPrompt: form.customPrompt }
      } else if (type === 'quiz') {
        params = { ...params, subject: form.subject, topic: form.topic, level: form.level, questionsCount: form.questionsCount, answersCount: form.answersCount, format: form.format || 'HTML', model: form.model || 'gpt-4o', customPrompt: form.customPrompt }
      } else if (type === 'vocabulary') {
        params = { ...params, subject: form.subject, topic: form.topic, language: form.language, wordsCount: form.wordsCount, format: form.format || 'JSON', model: form.model || 'gpt-4o', customPrompt: form.customPrompt }
      } else if (type === 'lessonPlan') {
        params = { ...params, subject: form.subject, topic: form.topic, level: form.level, duration: form.duration, objectives: form.objectives }
      } else if (type === 'lessonPreparation') {
        params = { ...params, subject: form.subject, topic: form.topic, level: form.level, interests: form.interests, generationTypes: form.generationTypes }
      } else if (type === 'unpacking') {
        params = {
          ...params,
          generationTypes: ['unpacking'],
          subject: form.q1,
          topic: 'Распаковка экспертности',
          level: 'Expert',
          q1: form.q1, q2: form.q2, q3: form.q3, q4: form.q4, q5: form.q5,
          q6: form.q6, q7: form.q7, q8: form.q8, q9: form.q9, q10: form.q10,
          q11: form.q11, q12: form.q12, q13: form.q13
        }
      } else if (type === 'content') {
        params = { ...params, sourceType: 'text', text: form.text, youtubeUrl: '', action: form.action, level: form.level }
      } else if (type === 'feedback') {
        params = { ...params, studentWork: form.studentWork, taskType: form.taskType, criteria: form.criteria, level: form.level }
      } else if (type === 'presentation') {
        params = { ...params, inputText: form.inputText, themeName: form.themeName, numCards: form.numCards, exportAs: form.exportAs }
      } else if (type === 'image') {
        params = { ...params, prompt: form.prompt, style: form.style }
      } else if (type === 'photosession') {
        params = { ...params, prompt: form.prompt, style: form.style, photoHash: form.photoHash, size: form.size }
      } else if (type === 'transcription') {
        params = { ...params, videoHash: form.videoHash, description: form.topic || '', subject: form.subject || 'Общее', language: form.language || 'ru' }
      } else if (type === 'videoAnalysis') {
        params = { ...params, videoHash: form.videoHash, analysisType: form.analysisType }
      } else if (type === 'salesAdvisor') {
        params = { ...params, imageHash: form.imageHash }
      } else if (type === 'message') {
        let parsed
        try {
          parsed = form.formData ? JSON.parse(form.formData) : {}
        } catch (e) {
          parsed = {}
        }
        params = { ...params, templateId: form.templateId, formData: parsed }
      } else if (type === 'game') {
        // Для игр используем прямой вызов API, а не через useGenerations
        try {
          const response = await apiClient.post('/games/generate', {
            topic: form.topic,
            type: form.type
          })

          setGenerationResult(response.data)
          setStatusOk(true)
          setStatusMessage('Готово! Результат отображается ниже.')

          // Прокручиваем к результату
          setTimeout(() => {
            resultContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }, 100)

          return // Выходим из функции, так как уже обработали запрос
        } catch (e: any) {
          setStatusOk(false)
          setStatusMessage(`Ошибка: ${e.message}`)
          return
        } finally {
          setIsGenerating(false)
        }
      } else if (type === 'gigachat') {
        const mode = form.mode || 'chat'
        params = { ...params, mode, model: form.model }

        if (mode === 'chat') {
          params = {
            ...params,
            systemPrompt: form.systemPrompt,
            userPrompt: form.userPrompt,
            temperature: form.temperature,
            topP: form.topP,
            maxTokens: form.maxTokens
          }
        } else if (mode === 'image') {
          params = {
            ...params,
            prompt: form.prompt,
            negativePrompt: form.negativePrompt,
            size: form.size,
            quality: form.quality
          }
        } else if (mode === 'embeddings') {
          params = {
            ...params,
            inputTexts: form.inputText ? [form.inputText] : []
          }
        } else if (mode === 'tokens_count') {
          params = {
            ...params,
            text: form.inputText
          }
        } else if (mode === 'audio_speech') {
          params = {
            ...params,
            inputText: form.inputText,
            voice: form.voice,
            audioFormat: form.audioFormat,
            audioSpeed: form.audioSpeed
          }
        } else if (mode === 'audio_transcription') {
          params = {
            ...params,
            audioHash: form.audioHash,
            language: form.language
          }
        } else if (mode === 'audio_translation') {
          params = {
            ...params,
            audioHash: form.audioHash,
            targetLanguage: form.targetLanguage
          }
        }
      }

      // Отправляем запрос на генерацию через useGenerations hook
      // Это автоматически отправит запрос и начнет polling
      const status = await generateAndWait({ type, params }, (partialResult) => {
        // Обновляем результат в реальном времени (для lessonPreparation)
        if (type === 'lessonPreparation') {
          setGenerationResult(partialResult)
        }
      })

      // Сохраняем результат для отображения
      if (type === 'gigachat') {
        setGenerationResult(status.result || null)
      } else if (type === 'image' || type === 'photosession') {
        setGenerationResult(status.result?.imageUrl || status.result)
      } else if (type === 'presentation') {
        setGenerationResult(status.result?.message || status.result)
      } else {
        setGenerationResult(status.result?.content || status.result)
      }

      setStatusOk(true)
      setStatusMessage('Готово! Результат отображается ниже.')

      // Прокручиваем к результату
      setTimeout(() => {
        resultContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } catch (e: any) {
      setStatusOk(false)
      setStatusMessage(`Ошибка: ${e.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-lg bg-white/90 border-b border-[#D8E6FF] shadow-sm">
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden shadow">
              <img
                src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x"
                alt="prepodavAI"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-shrink-0">
              <h1 className="text-lg font-bold text-black">prepodavAI</h1>
              <p className="text-xs text-black/70">Ваш умный помощник</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!subscriptionLoading && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF7E58] text-white text-xs shadow">
                <i className="fas fa-coins"></i>
                <span className="font-semibold">{totalCredits}</span>
                <span className="opacity-90">кред.</span>
              </div>
            )}
            <button
              onClick={openHistory}
              className="w-9 h-9 rounded-xl bg-[#D8E6FF] border border-[#D8E6FF] hover:bg-[#FF7E58] hover:border-[#FF7E58] transition active:scale-95"
            >
              <i className="fas fa-history text-[#FF7E58]"></i>
            </button>
            {showLogoutButton && (
              <button
                onClick={logout}
                className="w-9 h-9 rounded-xl bg-[#D8E6FF] border border-[#D8E6FF] hover:bg-red-50 hover:border-red-300 transition active:scale-95"
              >
                <i className="fas fa-sign-out-alt text-red-500"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero gradient */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#D8E6FF]/30 via-[#FF7E58]/10 to-transparent"></div>
        <div className="px-4 pt-6 pb-2 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-[#FF7E58] to-[#FF7E58] bg-clip-text text-transparent">
                Создавайте учебные материалы быстрее
              </h2>
              <p className="text-sm text-black/70 mt-1">Рабочие листы, тесты, словари и планы уроков в один клик</p>
            </div>
            {!subscriptionLoading && (
              <div className="sm:hidden ml-3 px-3 py-1.5 rounded-full bg-[#FF7E58] text-white text-xs shadow">
                <i className="fas fa-coins mr-1"></i>{totalCredits}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main card with composer */}
      <div className="p-4">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl border border-[#D8E6FF] bg-white shadow-md overflow-hidden">
            <div className="p-4 sm:p-6 bg-gradient-to-r from-[#D8E6FF]/30 to-transparent">
              {/* Top-level Tabs */}
              <div className="flex space-x-1 mb-4 bg-gray-100/50 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setTopLevelTab('all')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${topLevelTab === 'all'
                    ? 'bg-white text-[#FF7E58] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                    }`}
                >
                  Все функции
                </button>
                <button
                  onClick={() => setTopLevelTab('wow')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${topLevelTab === 'wow'
                    ? 'bg-[#FF7E58] text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                    }`}
                >
                  Вау-урок
                </button>
              </div>

              <InputComposer
                functionId={topLevelTab === 'wow' ? 'lessonPreparation' : currentFunctionId}
                values={form}
                onValuesChange={onComposerUpdate}
                onFunctionChange={onFunctionChange}
                onGenerate={generateMaterial}
                generationsCount={(subscription as any)?.generationsCount || 0}
                hideNavigation={topLevelTab === 'wow'}
              />

            </div>

            {(isGenerating || statusMessage) && (
              <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                <GenerationProgress isGenerating={isGenerating} />

                {!isGenerating && statusMessage && (
                  <div className={`mt-3 p-3 sm:p-4 rounded-xl border ${statusOk
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    {statusMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Result section */}
          {generationResult && (
            <div
              ref={resultContainerRef}
              className="mt-4 rounded-3xl border border-[#D8E6FF] bg-white shadow-md overflow-hidden animate-fade-in"
            >
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FF7E58] flex items-center justify-center">
                      <i className="fas fa-check text-white"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-black">Результат генерации</h3>
                      <p className="text-xs text-black/70">{getGenerationTypeLabel(currentFunctionId)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isTextResult && (
                      <button
                        onClick={downloadTextResult}
                        disabled={isExporting}
                        className="px-3 py-2 bg-[#FF7E58] text-white rounded-lg text-xs font-medium hover:shadow-lg transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <i className="fas fa-download mr-1"></i>Скачать
                      </button>
                    )}
                    <button
                      onClick={clearResult}
                      className="px-3 py-2 bg-[#D8E6FF] border border-[#D8E6FF] text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 transition active:scale-95"
                    >
                      <i className="fas fa-times mr-1"></i>Закрыть
                    </button>
                  </div>
                </div>

                {/* Structured Result (Lesson Preparation) */}
                {isStructuredResult && (
                  <div className="space-y-4">
                    {/* Warning about data persistence */}
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                      <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>
                      <div className="text-sm text-amber-900">
                        <p className="font-semibold mb-1">Важно: Сохраните результаты!</p>
                        <p>Эти материалы доступны только сейчас. Если вы обновите страницу или закроете вкладку, они исчезнут навсегда. Пожалуйста, скачайте их прямо сейчас.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {generationResult.sections.map((section: any, index: number) => (
                        <div key={index} className="p-4 rounded-xl border border-[#D8E6FF] bg-gray-50 flex flex-col justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-1">{section.title}</h4>
                            <p className="text-xs text-gray-500 mb-3">Нажмите, чтобы открыть или распечатать</p>
                          </div>
                          <div className="flex gap-2">
                            {section.fileType === 'pptx' ? (
                              <a
                                href={section.fileUrl}
                                target="_blank"
                                className="flex-1 py-2 px-3 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-download"></i>
                                <span>Скачать презентацию (PPTX)</span>
                              </a>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    const blob = new Blob([section.content], { type: 'text/html;charset=utf-8' });
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                  }}
                                  className="flex-1 py-2 px-3 bg-white border border-[#FF7E58] text-[#FF7E58] rounded-lg text-sm font-medium hover:bg-[#FF7E58] hover:text-white transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                  <i className="fas fa-external-link-alt"></i>
                                  <span>Открыть</span>
                                </button>
                                <button
                                  onClick={() => {
                                    const printContent = `
                                      <html>
                                        <head>
                                          <title>${section.title}</title>
                                          <style>
                                            body { font-family: sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                                            img { max-width: 100%; }
                                            @media print {
                                              body { -webkit-print-color-adjust: exact; }
                                            }
                                          </style>
                                        </head>
                                        <body>
                                          ${section.content}
                                          <script>
                                            window.onload = function() { window.print(); }
                                          </script>
                                        </body>
                                      </html>
                                    `;
                                    const blob = new Blob([printContent], { type: 'text/html;charset=utf-8' });
                                    const url = URL.createObjectURL(blob);
                                    const win = window.open(url, '_blank');
                                  }}
                                  className="flex-1 py-2 px-3 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <i className="fas fa-file-pdf"></i>
                                  <span>Скачать PDF</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text result */}
                {isTextResult && (
                  isHtmlResult && htmlResult ? (
                    <FullHtmlPreview html={htmlResult} />
                  ) : (
                    <div
                      ref={resultHtmlRef}
                      className="formatted-content result-content prose prose-sm max-w-none text-black mathjax-wrapper"
                      dangerouslySetInnerHTML={{ __html: renderMath(cleanedTextResult) }}
                    />
                  )
                )}

                {/* Image result */}
                {isImageResult && imageDisplayUrl && (
                  <div className="space-y-3">
                    <img
                      src={imageDisplayUrl}
                      className="w-full rounded-xl border border-[#D8E6FF] shadow-lg"
                      alt="Generated image"
                    />
                    <a
                      href={imageDisplayUrl}
                      download
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95"
                    >
                      <i className="fas fa-download"></i>
                      <span>Скачать изображение</span>
                    </a>
                  </div>
                )}

                {/* Audio result */}
                {isAudioResult && audioDisplayUrl && (
                  <div className="space-y-3">
                    <audio
                      controls
                      src={audioDisplayUrl}
                      className="w-full rounded-xl border border-[#D8E6FF] bg-white"
                    >
                      Ваш браузер не поддерживает воспроизведение аудио.
                    </audio>
                    <a
                      href={audioDisplayUrl}
                      download="gigachat-audio.mp3"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95"
                    >
                      <i className="fas fa-download"></i>
                      <span>Скачать аудио</span>
                    </a>
                  </div>
                )}

                {/* Presentation result */}
                {isPresentationResult && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-[#D8E6FF] to-[#D8E6FF]/50 border border-[#D8E6FF]">
                      <i className="fas fa-presentation text-[#FF7E58] text-2xl mb-2"></i>
                      <p className="text-sm text-black mb-3">
                        {typeof generationResult === 'object' && generationResult.inputText
                          ? `Ваша презентация на тему: ${generationResult.inputText}`
                          : 'Ваша презентация готова!'}
                      </p>
                      {typeof generationResult === 'object' && (generationResult.exportUrl || generationResult.pdfUrl || generationResult.pptxUrl) && (
                        <>
                          {(() => {
                            const fileUrl = generationResult.exportUrl || generationResult.pdfUrl || generationResult.pptxUrl;
                            const isPptx = fileUrl?.toLowerCase().includes('.pptx') || fileUrl?.toLowerCase().includes('pptx');
                            const fileFormat = isPptx ? 'PPTX' : 'PDF';

                            return (
                              <button
                                onClick={() => window.open(fileUrl, '_blank')}
                                className="w-full px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-download"></i>
                                <span>Скачать презентацию ({fileFormat})</span>
                              </button>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>

                )}

                {/* Game result */}
                {isGameResult && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-r from-[#D8E6FF] to-[#D8E6FF]/50 border border-[#D8E6FF]">
                      <i className="fas fa-gamepad text-[#FF7E58] text-2xl mb-2"></i>
                      <p className="text-sm text-black mb-3">
                        Игра создана! Вы можете открыть её в браузере или скачать файл.
                      </p>
                      <div className="flex flex-col gap-2">
                        <a
                          href={generationResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-play"></i>
                          <span>Играть онлайн</span>
                        </a>
                        <a
                          href={generationResult.downloadUrl}
                          download
                          className="w-full px-4 py-2 bg-white border border-[#FF7E58] text-[#FF7E58] rounded-lg text-sm font-medium hover:bg-orange-50 transition active:scale-95 flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-download"></i>
                          <span>Скачать HTML файл</span>
                        </a>
                      </div>
                      <div className="mt-3 text-xs text-black/60">
                        <p>💡 Ссылку &quot;Играть онлайн&quot; можно отправить ученикам.</p>
                        <p>💡 HTML файл работает без интернета, если его скачать.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Assistant Chat */}
          {isAiAssistant && (
            <div className="mt-4">
              <AiAssistantChat />
            </div>
          )}

          {/* Secondary info row: tips */}
          <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-[#D8E6FF] flex items-center gap-2">
              <i className="fas fa-wand-magic-sparkles text-[#FF7E58]"></i>
              <span className="text-black/70">Нажмите оранжевые поля, чтобы ввести параметры</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D8E6FF] flex items-center gap-2">
              <i className="fas fa-clock text-[#FF7E58]"></i>
              <span className="text-black/70">Обычно готово за 40-50 с, результат ниже</span>
            </div>
            <div className="p-3 rounded-xl bg-white border border-[#D8E6FF] flex items-center gap-2">
              <i className="fas fa-coins text-[#FF7E58]"></i>
              <span className="text-black/70">Кредиты списываются при запуске генерации</span>
            </div>
          </div>
        </div>
      </div>
    </div >
  )
}

// Helper functions
function extractTextFromResult(result: any): string {
  if (!result) return ''
  if (typeof result === 'string') return result
  if (typeof result === 'object') {
    if (result.content) return result.content
    return JSON.stringify(result, null, 2)
  }
  return String(result)
}

function isHtmlString(value: any): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return /<!DOCTYPE html/i.test(trimmed) || /<\/?[a-z][\s\S]*>/i.test(trimmed)
}

function looksLikeFullHtmlDocument(value: any): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return (
    /<!DOCTYPE html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed) ||
    /<head[\s>]/i.test(trimmed) ||
    /<style[\s>]/i.test(trimmed) || // Treat content with styles as full HTML to isolate it
    /<\/?[a-z][\s\S]*>/i.test(trimmed)
  )
}

function formatMarkdown(text: any): string {
  if (!text) return ''

  if (typeof text === 'object') {
    text = JSON.stringify(text, null, 2)
  }

  text = stripCodeFences(String(text))

  if (looksLikeFullHtmlDocument(text)) {
    return text
  }

  return renderMath(text)
}

function getGenerationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    worksheet: 'Рабочий лист',
    quiz: 'Тест',
    vocabulary: 'Словарь',
    lessonPlan: 'План урока',
    content: 'Адаптация контента',
    feedback: 'Обратная связь',
    presentation: 'Презентация',
    image: 'Изображение',
    photosession: 'ИИ Фотосессия',
    transcription: 'Транскрипция видео',
    message: 'Сообщение',
    gigachat: 'GigaChat',
    aiAssistant: 'AI-ассистент',
    game: 'Мини-игра'
  }
  return labels[type] || 'Материал'
}

const MATHJAX_SCRIPT = `<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>`
const IFRAME_STYLES = `<style>
  body { margin: 0; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; background: white; color: #1a1a1a; }
  .container { max-width: 820px; margin: 0 auto; }
</style>`

function FullHtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const resize = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      const height = (doc.body?.scrollHeight || doc.documentElement?.scrollHeight || 600) + 40
      iframe.style.height = `${Math.max(height, 400)}px`
    }

    const handleLoad = () => resize()
    iframe.addEventListener('load', handleLoad)

    // Дополнительное измерение после отрисовки MathJax и т.п.
    const timer = setTimeout(resize, 1200)

    return () => {
      iframe.removeEventListener('load', handleLoad)
      clearTimeout(timer)
    }
  }, [html])

  const hasMathJax = /mathjax/i.test(html) || /\\\\\(|\\\\\[|\$\$|\$[^$]+\$/i.test(html)
  const hasHead = /<head[\s>]/i.test(html)
  const hasBody = /<body[\s>]/i.test(html)

  let finalHtml = html
  if (hasHead) {
    finalHtml = html.replace(
      /<head([^>]*)>/i,
      `<head$1>${IFRAME_STYLES}${hasMathJax ? MATHJAX_SCRIPT : ''}`,
    )
  } else if (hasBody) {
    finalHtml = html.replace(
      /<body([^>]*)>/i,
      `<head>${IFRAME_STYLES}${hasMathJax ? MATHJAX_SCRIPT : ''}</head><body$1`,
    )
  } else {
    finalHtml = `<!DOCTYPE html><html><head>${IFRAME_STYLES}${hasMathJax ? MATHJAX_SCRIPT : ''}</head><body><div class="container">${html}</div></body></html>`
  }

  return (
    <div className="w-full border border-[#D8E6FF] rounded-2xl overflow-hidden bg-white">
      <iframe
        ref={iframeRef}
        title="HTML результат"
        srcDoc={finalHtml}
        className="w-full border-0"
        style={{ minHeight: '600px' }}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}

function stripCodeFences(text: string) {
  let processed = text.trim()
  if (processed.startsWith('```')) {
    processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
  }
  return processed
}

function normalizeResultPayload(value: any) {
  if (typeof value !== 'string') {
    return { isHtmlResult: false, htmlResult: '', cleanedTextResult: value }
  }

  let processed = stripCodeFences(value)

  if (
    (processed.startsWith('"') && processed.endsWith('"')) ||
    (processed.startsWith("'") && processed.endsWith("'"))
  ) {
    processed = processed.slice(1, -1)
  }

  const isHtmlResult = looksLikeFullHtmlDocument(processed)

  return {
    isHtmlResult,
    htmlResult: isHtmlResult ? processed : '',
    cleanedTextResult: processed,
  }
}

function stripHtmlTags(html: string) {
  if (!html) return ''
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ')
  }
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}


function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMath(text: string) {
  if (!text) return ''

  let processed = stripCodeFences(String(text))
  const isHtml = isHtmlString(processed) || looksLikeFullHtmlDocument(processed)

  if (!isHtml) {
    processed = escapeHtml(processed)
  }

  processed = processed.replace(/\\\((.+?)\\\)/gs, (_, formula) => {
    // Formula might allow html entities, but we wrap it in a span
    return `<span class="math-inline">\\(${formula}\\)</span>`
  })

  processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, formula) => {
    return `<div class="math-block">\\[${formula}\\]</div>`
  })

  processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, formula) => {
    return `<div class="math-block">\\[${formula}\\]</div>`
  })

  if (!isHtml) {
    processed = processed.replace(/\n\n+/g, '</p><p class="my-3">')
    processed = '<p class="my-3">' + processed + '</p>'
    processed = processed.replace(/\n/g, '<br>')
  }

  if (typeof window !== 'undefined' && (window as any).MathJax?.typesetPromise) {
    setTimeout(() => {
      ; (window as any).MathJax.typesetPromise?.()
    }, 0)
  }

  return processed
}
