'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import InputComposer from './InputComposer'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { apiClient } from '@/lib/api/client' // Используется в initUser для проверки подписки

export default function WebAppIndex() {
  const router = useRouter()
  const [currentFunctionId, setCurrentFunctionId] = useState('worksheet')
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

  const openHistory = () => {
    router.push('/history')
  }

  const logout = () => {
    localStorage.removeItem('prepodavai_authenticated')
    localStorage.removeItem('prepodavai_user')
    window.location.reload()
  }

  const gigachatMode = currentFunctionId === 'gigachat' ? (form.mode || 'chat') : null

  const isTextResult = generationResult && (
    ['worksheet', 'quiz', 'vocabulary', 'lessonPlan', 'content', 'feedback', 'message', 'transcription'].includes(currentFunctionId) ||
    (currentFunctionId === 'gigachat' && ['chat', 'embeddings', 'audio_transcription', 'audio_translation', 'tokens_count'].includes(String(gigachatMode)))
  )

  const isImageResult = generationResult && (
    ['image', 'photosession'].includes(currentFunctionId) ||
    (currentFunctionId === 'gigachat' && gigachatMode === 'image')
  )

  const isPresentationResult = generationResult &&
    currentFunctionId === 'presentation'

  const isAudioResult = generationResult &&
    currentFunctionId === 'gigachat' &&
    gigachatMode === 'audio_speech'

  const textResultPayload = typeof generationResult === 'object' && generationResult?.content
    ? generationResult.content
    : generationResult

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
      const textContent = extractTextFromResult(generationResult)
      navigator.clipboard.writeText(textContent)
      setStatusMessage('Скопировано в буфер обмена!')
      setStatusOk(true)
      setTimeout(() => setStatusMessage(''), 2000)
    }
  }

  const downloadTextResult = () => {
    if (!generationResult) return

    setIsExporting(true)
    try {
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
      } else if (type === 'message') {
        let parsed
        try {
          parsed = form.formData ? JSON.parse(form.formData) : {}
        } catch (e) {
          parsed = {}
        }
        params = { ...params, templateId: form.templateId, formData: parsed }
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
      const status = await generateAndWait({ type, params })

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
              <InputComposer
                functionId={currentFunctionId}
                values={form}
                onValuesChange={onComposerUpdate}
                onFunctionChange={onFunctionChange}
                onGenerate={generateMaterial}
              />
            </div>

            {(isGenerating || statusMessage) && (
              <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                {isGenerating && (
                  <div className="mt-2 p-3 sm:p-4 rounded-xl bg-[#D8E6FF] border border-[#D8E6FF] flex items-center gap-3">
                    <i className="fas fa-spinner fa-spin text-[#FF7E58]"></i>
                    <span className="text-sm text-black">Генерация... попытка {attempts}/{maxAttempts}</span>
                  </div>
                )}
                {statusMessage && (
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
                      <>
                        <button
                          onClick={downloadTextResult}
                          disabled={isExporting}
                          className="px-3 py-2 bg-[#FF7E58] text-white rounded-lg text-xs font-medium hover:shadow-lg transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <i className="fas fa-download mr-1"></i>Скачать
                        </button>
                        <button
                          onClick={copyResult}
                          className="px-3 py-2 bg-[#D8E6FF] border border-[#D8E6FF] text-black rounded-lg text-xs font-medium hover:bg-[#FF7E58] hover:text-white transition active:scale-95"
                        >
                          <i className="fas fa-copy mr-1"></i>Копировать
                        </button>
                      </>
                    )}
                    <button
                      onClick={clearResult}
                      className="px-3 py-2 bg-[#D8E6FF] border border-[#D8E6FF] text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 transition active:scale-95"
                    >
                      <i className="fas fa-times mr-1"></i>Закрыть
                    </button>
                  </div>
                </div>

                {/* Text result */}
                {isTextResult && (
                  <div
                    className="formatted-content result-content prose prose-sm max-w-none text-black"
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(textResultPayload) }}
                  />
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
                      {typeof generationResult === 'object' && generationResult.pdfUrl && (
                        <button
                          onClick={() => window.open(generationResult.pdfUrl, '_blank')}
                          className="w-full px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                        >
                          <i className="fas fa-download"></i>
                          <span>Скачать презентацию</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
    </div>
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
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value.trim())
}

function formatMarkdown(text: any): string {
  if (!text) return ''

  if (typeof text === 'object') {
    text = JSON.stringify(text, null, 2)
  }

  text = String(text)
  let html = text

  // Простое форматирование markdown
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2 text-[#FF7E58]">$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-5 mb-3 text-[#FF7E58]">$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 text-[#FF7E58]">$1</h1>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="bg-[#D8E6FF] px-2 py-1 rounded text-sm border border-[#D8E6FF] font-mono">$1</code>')
  html = html.replace(/\n\n+/g, '</p><p class="my-3">')
  html = '<p class="my-3">' + html + '</p>'
  html = html.replace(/\n/g, '<br>')

  return html
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
    gigachat: 'GigaChat'
  }
  return labels[type] || 'Материал'
}
