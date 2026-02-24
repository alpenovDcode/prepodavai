'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ImageResultDisplay from './ImageResultDisplay'
import { apiClient } from '@/lib/api/client'
import { getUserGenerations, removeCachedGeneration, CachedGeneration } from '@/lib/utils/generationsCache'
import { getCurrentUser } from '@/lib/utils/userIdentity'

// ─── Labels & Helpers ────────────────────────────────────────────────

const typeLabels: Record<string, string> = {
  'image': '🎨 Изображение',
  'photosession': '📸 ИИ Фотосессия',
  'worksheet': '📄 Рабочий лист',
  'quiz': '❓ Тест',
  'vocabulary': '📚 Словарь',
  'lessonPlan': '📋 План урока',
  'lesson-plan': '📋 План урока',
  'lessonPreparation': '🎓 Вау-урок',
  'content': '🔄 Адаптация контента',
  'content-adaptation': '🔄 Адаптация контента',
  'feedback': '💬 Обратная связь',
  'presentation': '📊 Презентация',
  'transcription': '🎬 Транскрипция видео',
  'videoAnalysis': '🎬 Анализ видео',
  'salesAdvisor': '💼 Продажник',
  'message': '✉️ Сообщение',
  'game': '🎮 Мини-игра',
  'unpacking': '📦 Распаковка',
  'gigachat-chat': '🧠 GigaChat (текст)',
  'gigachat-image': '🧠 GigaChat (изображение)',
  'gigachat-embeddings': '🧠 GigaChat (эмбеддинги)',
  'gigachat-audio-speech': '🧠 GigaChat (TTS)',
  'gigachat-audio-transcription': '🧠 GigaChat (STT)',
  'gigachat-audio-translation': '🧠 GigaChat (перевод аудио)'
}

const paramLabels: Record<string, string> = {
  subject: 'Предмет',
  topic: 'Тема',
  level: 'Уровень',
  questionsCount: 'Количество вопросов',
  answersCount: 'Вариантов ответа',
  wordsCount: 'Количество слов',
  language: 'Язык',
  duration: 'Продительность',
  objectives: 'Цели урока',
  format: 'Формат',
  prompt: 'Промпт',
  style: 'Стиль',
  text: 'Текст',
  action: 'Действие',
  studentWork: 'Работа ученика',
  taskType: 'Тип задания',
  criteria: 'Критерии',
  inputText: 'Текст',
  themeName: 'Тема презентации',
  numCards: 'Количество слайдов',
  exportAs: 'Формат экспорта',
  description: 'Описание',
  userPrompt: 'Запрос',
  systemPrompt: 'Системный промпт',
  interests: 'Интересы ученика',
  customPrompt: 'Дополнительные инструкции',
}

const hiddenParams = ['userHash', 'model', 'generationTypes', 'sourceType', 'photoHash', 'videoHash', 'audioHash', 'imageHashes', 'formData', 'templateId', 'temperature', 'topP', 'maxTokens', 'mode', 'negativePrompt', 'size', 'quality', 'voice', 'audioFormat', 'audioSpeed', 'targetLanguage', 'analysisType']

// ─── Result type detection ───────────────────────────────────────────

function looksLikeHtml(value: any): boolean {
  if (typeof value !== 'string') return false
  const t = value.trim()
  return /<!DOCTYPE html/i.test(t) || /<html[\s>]/i.test(t) || /<head[\s>]/i.test(t) || /<style[\s>]/i.test(t) || /<\/?[a-z][\s\S]*>/i.test(t)
}

function stripCodeFences(text: string) {
  let r = text.trim()
  const m = r.match(/^```(?:html|json|markdown|md)?\s*\n?([\s\S]*?)```\s*$/i)
  if (m) r = m[1].trim()
  return r
}

function getResultContent(gen: CachedGeneration): any {
  if (!gen.result) return null
  if (gen.result.content) return gen.result.content
  return gen.result
}

function isImageType(gen: CachedGeneration): boolean {
  return ['image', 'photosession'].includes(gen.type) ||
    gen.type?.startsWith('gigachat') && gen.params?.mode === 'image' ||
    !!(gen.result as any)?.imageUrl
}

function isAudioType(gen: CachedGeneration): boolean {
  return !!(gen.result as any)?.audioUrl
}

function isPresentationType(gen: CachedGeneration): boolean {
  return gen.type === 'presentation'
}

function isGameType(gen: CachedGeneration): boolean {
  return gen.type === 'game'
}

function isStructuredType(gen: CachedGeneration): boolean {
  return gen.result?.sections && Array.isArray(gen.result.sections)
}

function getImageUrl(gen: CachedGeneration): string | null {
  if (!gen.result) return null
  return (gen.result as any)?.imageUrl || (gen.result as any)?.imageUrls?.[0] || null
}

// ─── FullHtmlPreview (iframe-based) ──────────────────────────────────

const IFRAME_STYLES = `<style>
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; background: white; color: #1a1a1a; }
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
      iframe.style.height = `${Math.max(height, 300)}px`
    }

    const handleLoad = () => resize()
    iframe.addEventListener('load', handleLoad)
    const timer = setTimeout(resize, 1200)

    return () => {
      iframe.removeEventListener('load', handleLoad)
      clearTimeout(timer)
    }
  }, [html])

  const hasHead = /<head[\s>]/i.test(html)
  let finalHtml = html
  if (hasHead) {
    finalHtml = html.replace(/<\/head>/i, `${IFRAME_STYLES}</head>`)
  } else {
    finalHtml = `<html><head>${IFRAME_STYLES}</head><body>${html}</body></html>`
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={finalHtml}
      className="w-full border-0 rounded-xl bg-white"
      sandbox="allow-scripts allow-same-origin"
      style={{ minHeight: 300 }}
    />
  )
}

// ─── Main Component ──────────────────────────────────────────────────

export default function GenerationHistory() {
  const router = useRouter()
  const [generations, setGenerations] = useState<CachedGeneration[]>([])
  const [selectedGeneration, setSelectedGeneration] = useState<CachedGeneration | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const limit = 20

  useEffect(() => {
    loadGenerations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadGenerations = async (currentOffset: number = offset) => {
    try {
      setLoading(true)

      if (currentOffset === 0) {
        const user = getCurrentUser()
        const userHash = user.userHash
        if (userHash) {
          const cachedGenerations = getUserGenerations(userHash)
          if (cachedGenerations.length > 0) {
            setGenerations(cachedGenerations)
            setLoading(false)
          }
        }
      }

      const response = await apiClient.get('/generate/history', {
        params: { limit, offset: currentOffset }
      })

      if (response.data.success) {
        const serverGenerations = response.data.generations || []
        if (currentOffset === 0) {
          setGenerations(serverGenerations)
        } else {
          setGenerations(prev => [...prev, ...serverGenerations])
        }
        const total = response.data.total || 0
        const currentTotal = currentOffset === 0 ? serverGenerations.length : generations.length + serverGenerations.length
        setHasMore(currentTotal < total)
      }
    } catch (error) {
      console.error('Failed to load generations:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    const newOffset = offset + limit
    setOffset(newOffset)
    setLoadingMore(true)
    try {
      const response = await apiClient.get('/generate/history', {
        params: { limit, offset: newOffset }
      })
      if (response.data.success) {
        const serverGenerations = response.data.generations || []
        setGenerations(prev => {
          const updated = [...prev, ...serverGenerations]
          const total = response.data.total || 0
          setHasMore(updated.length < total)
          return updated
        })
      }
    } catch (error) {
      console.error('Failed to load more generations:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const getTypeLabel = (type: string) => typeLabels[type] || type

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'pending': 'Генерация...',
      'completed': 'Готово',
      'failed': 'Ошибка'
    }
    return labels[status] || status
  }

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      'pending': 'bg-blue-100 text-blue-700',
      'completed': 'bg-green-100 text-green-700',
      'failed': 'bg-red-100 text-red-700'
    }
    return classes[status] || 'bg-gray-100 text-gray-700'
  }

  const getGenerationTitle = (gen: CachedGeneration) => {
    if (gen.params?.topic) return gen.params.topic
    if (gen.params?.prompt) return String(gen.params.prompt).substring(0, 60)
    if (gen.params?.text) return String(gen.params.text).substring(0, 60)
    if (gen.params?.userPrompt) return String(gen.params.userPrompt).substring(0, 60)
    if (gen.params?.inputText) return String(gen.params.inputText).substring(0, 60)
    if (gen.params?.subject) return gen.params.subject
    if (gen.params?.mode && gen.type?.startsWith('gigachat')) {
      return `GigaChat • ${gen.params.mode}`
    }
    return getTypeLabel(gen.type)
  }

  const formatDate = (date: string) => {
    if (!date) return ''
    const d = new Date(date)
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const deleteGeneration = async () => {
    if (!selectedGeneration) return
    if (!confirm('Вы уверены, что хотите удалить эту генерацию?')) return

    const genId = selectedGeneration.id
    removeCachedGeneration(genId)
    setGenerations(prev => prev.filter(g => g.id !== genId))

    try {
      await apiClient.delete(`/generate/${genId}`)
    } catch (error) {
      console.error('Failed to delete generation:', error)
    }

    setSelectedGeneration(null)
  }

  const downloadGeneration = async () => {
    const gen = selectedGeneration
    if (!gen || !gen.result || isDownloading) return

    setIsDownloading(true)
    try {
      // Audio
      const audioUrl = (gen.result as any)?.audioUrl
      if (audioUrl) {
        const a = document.createElement('a')
        a.href = audioUrl
        a.download = `gigachat-audio-${gen.id}.mp3`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }

      // Image
      const imageUrl = getImageUrl(gen)
      if (imageUrl) {
        const response = await fetch(imageUrl)
        if (!response.ok) throw new Error('Failed to fetch')
        const blob = await response.blob()
        const blobUrl = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `generated-${gen.id}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(blobUrl)
        return
      }

      // HTML content — export as PDF if possible, otherwise as HTML file
      const content = getResultContent(gen)
      if (content && typeof content === 'string' && looksLikeHtml(content)) {
        try {
          const typeLabel = getTypeLabel(gen.type)
          const safeName = typeLabel.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
          const dateSuffix = new Date().toISOString().split('T')[0]
          const filename = `${safeName}_${dateSuffix}.pdf`

          const pdfResponse = await apiClient.post<Blob>(
            '/gigachat/export/pdf',
            { html: content, filename },
            { responseType: 'blob' }
          )
          const blob = pdfResponse.data
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = filename
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          return
        } catch {
          // Fallback to HTML download
        }
      }

      // Fallback: download as HTML
      const typeLabel = getTypeLabel(gen.type)
      const filename = `${typeLabel}_${gen.id}`.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')
      let htmlContent = ''
      if (content && typeof content === 'string') {
        htmlContent = looksLikeHtml(content) ? content : `<p>${String(content).replace(/\n/g, '<br>')}</p>`
      } else if (content) {
        htmlContent = `<pre>${JSON.stringify(content, null, 2)}</pre>`
      }

      const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${typeLabel}</title>
  <style>body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; background: #fff; color: #000; }</style>
</head>
<body>${htmlContent}</body>
</html>`

      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Download failed:', err)
      alert('Ошибка при скачивании: ' + err.message)
    } finally {
      setIsDownloading(false)
    }
  }

  const goBack = () => {
    if (selectedGeneration) {
      setSelectedGeneration(null)
    } else {
      router.push('/')
    }
  }

  // ─── Render Human-Readable Params ────────────────────────────────

  const renderParams = (params: any) => {
    if (!params) return null
    const entries = Object.entries(params).filter(
      ([key, value]) => !hiddenParams.includes(key) && value !== null && value !== undefined && value !== ''
    )
    if (entries.length === 0) return null

    return (
      <div className="space-y-1">
        {entries.map(([key, value]) => {
          // Skip q1-q13 fields (unpacking questionnaire)
          if (/^q\d+$/.test(key)) return null
          const label = paramLabels[key] || key
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
          return (
            <div key={key} className="flex items-start gap-2 text-sm">
              <span className="text-gray-500 font-medium whitespace-nowrap">{label}:</span>
              <span className="text-gray-900 break-words">{displayValue}</span>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render Result ───────────────────────────────────────────────

  const renderResult = (gen: CachedGeneration) => {
    if (gen.status !== 'completed' || !gen.result) return null

    // 1. Structured (lessonPreparation with sections)
    if (isStructuredType(gen)) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gen.result.sections.map((section: any, index: number) => (
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
                      <span>Скачать (PPTX)</span>
                    </a>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          const blob = new Blob([section.content], { type: 'text/html;charset=utf-8' })
                          const url = URL.createObjectURL(blob)
                          window.open(url, '_blank')
                        }}
                        className="flex-1 py-2 px-3 bg-white border border-[#FF7E58] text-[#FF7E58] rounded-lg text-sm font-medium hover:bg-[#FF7E58] hover:text-white transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-external-link-alt"></i>
                        <span>Открыть</span>
                      </button>
                      <button
                        onClick={() => {
                          const printContent = `<html><head><title>${section.title}</title><style>body { font-family: sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; } img { max-width: 100%; } @media print { body { -webkit-print-color-adjust: exact; } }</style></head><body>${section.content}<script>window.onload = function() { window.print(); }<\/script></body></html>`
                          const blob = new Blob([printContent], { type: 'text/html;charset=utf-8' })
                          const url = URL.createObjectURL(blob)
                          window.open(url, '_blank')
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
      )
    }

    // 2. Image
    if (isImageType(gen)) {
      const imgUrl = getImageUrl(gen)
      if (imgUrl) {
        return (
          <div className="space-y-3">
            <img
              src={imgUrl}
              className="w-full rounded-xl border border-[#D8E6FF] shadow-lg"
              alt="Generated image"
            />
            <a
              href={imgUrl}
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95"
            >
              <i className="fas fa-download"></i>
              <span>Скачать изображение</span>
            </a>
          </div>
        )
      }
    }

    // 3. Audio
    if (isAudioType(gen)) {
      const audioUrl = (gen.result as any).audioUrl
      return (
        <div className="space-y-3">
          <audio
            controls
            src={audioUrl}
            className="w-full rounded-xl border border-[#D8E6FF] bg-white"
          >
            Ваш браузер не поддерживает воспроизведение аудио.
          </audio>
          <a
            href={audioUrl}
            download="gigachat-audio.mp3"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95"
          >
            <i className="fas fa-download"></i>
            <span>Скачать аудио</span>
          </a>
        </div>
      )
    }

    // 4. Presentation
    if (isPresentationType(gen)) {
      const res = gen.result as any
      const fileUrl = res?.exportUrl || res?.pdfUrl || res?.pptxUrl || res?.content?.exportUrl || res?.content?.pdfUrl || res?.content?.pptxUrl
      const message = res?.message || res?.content?.message || res?.inputText || ''
      return (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#D8E6FF] to-[#D8E6FF]/50 border border-[#D8E6FF]">
            <i className="fas fa-file-powerpoint text-[#FF7E58] text-2xl mb-2"></i>
            <p className="text-sm text-black mb-3">
              {message || 'Ваша презентация готова!'}
            </p>
            {fileUrl && (
              <button
                onClick={() => window.open(fileUrl, '_blank')}
                className="w-full px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fas fa-download"></i>
                <span>Скачать презентацию</span>
              </button>
            )}
          </div>
        </div>
      )
    }

    // 5. Game
    if (isGameType(gen)) {
      const res = gen.result as any
      return (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#D8E6FF] to-[#D8E6FF]/50 border border-[#D8E6FF]">
            <i className="fas fa-gamepad text-[#FF7E58] text-2xl mb-2"></i>
            <p className="text-sm text-black mb-3">
              Игра создана! Вы можете открыть её в браузере или скачать файл.
            </p>
            <div className="flex flex-col gap-2">
              {res.url && (
                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-4 py-2 bg-[#FF7E58] text-white rounded-lg text-sm font-medium hover:shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <i className="fas fa-play"></i>
                  <span>Играть онлайн</span>
                </a>
              )}
              {res.downloadUrl && (
                <a
                  href={res.downloadUrl}
                  download
                  className="w-full px-4 py-2 bg-white border border-[#FF7E58] text-[#FF7E58] rounded-lg text-sm font-medium hover:bg-orange-50 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <i className="fas fa-download"></i>
                  <span>Скачать HTML файл</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )
    }

    // 6. Text / HTML content (worksheet, quiz, vocabulary, lessonPlan, content, feedback, message, transcription, gigachat)
    const content = getResultContent(gen)
    if (content) {
      if (typeof content === 'string') {
        const processed = stripCodeFences(content)
        if (looksLikeHtml(processed)) {
          return <FullHtmlPreview html={processed} />
        }
        // Plain text
        return (
          <div
            className="prose prose-sm max-w-none text-black bg-white rounded-xl p-4"
            dangerouslySetInnerHTML={{ __html: processed.replace(/\n/g, '<br>') }}
          />
        )
      }

      // Quiz object
      if (content.quiz) {
        return (
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-2">{content.quiz.title}</h4>
            <p className="text-sm text-gray-600">{content.quiz.questions?.length || 0} вопросов</p>
          </div>
        )
      }

      // Object result — try to render as JSON prettily
      if (typeof content === 'object') {
        return (
          <pre className="bg-gray-50 rounded-xl p-4 text-sm text-gray-900 overflow-auto whitespace-pre-wrap font-mono">
            {JSON.stringify(content, null, 2)}
          </pre>
        )
      }
    }

    return null
  }

  // ─── Detail View ─────────────────────────────────────────────────

  if (selectedGeneration) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Detail Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 py-3 flex items-center space-x-3">
            <button
              onClick={goBack}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100"
            >
              <i className="fas fa-arrow-left text-gray-700"></i>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{getTypeLabel(selectedGeneration.type)}</h1>
              <p className="text-xs text-gray-500">{formatDate(selectedGeneration.createdAt)}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded ${getStatusBadgeClass(selectedGeneration.status)}`}>
              {getStatusLabel(selectedGeneration.status)}
            </span>
          </div>
        </div>

        {/* Detail Content */}
        <div className="p-4 pb-24 max-w-4xl mx-auto">
          {/* Params */}
          {selectedGeneration.params && (() => {
            const rendered = renderParams(selectedGeneration.params)
            if (!rendered) return null
            return (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  <i className="fas fa-sliders-h mr-2 text-[#FF7E58]"></i>Параметры
                </h3>
                {rendered}
              </div>
            )
          })()}

          {/* Result */}
          {selectedGeneration.status === 'completed' && selectedGeneration.result && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                <i className="fas fa-check-circle mr-2 text-green-500"></i>Результат
              </h3>
              {renderResult(selectedGeneration)}
            </div>
          )}

          {/* Error */}
          {selectedGeneration.status === 'failed' && selectedGeneration.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-800">
                <i className="fas fa-exclamation-circle mr-2"></i>{selectedGeneration.error}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {selectedGeneration.status === 'completed' && (
              <button
                onClick={downloadGeneration}
                disabled={isDownloading}
                className="flex-1 py-3 bg-[#FF7E58] text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg transition active:scale-95"
              >
                <i className={`fas ${isDownloading ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                {isDownloading ? 'Скачивание...' : 'Скачать'}
              </button>
            )}
            <button
              onClick={deleteGeneration}
              className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-trash"></i>Удалить
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── List View ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center space-x-3">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100"
          >
            <i className="fas fa-arrow-left text-gray-700"></i>
          </button>
          <h1 className="text-lg font-bold text-gray-900">История генераций</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-20">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {!loading && generations.length === 0 && (
          <div className="text-center py-8">
            <i className="fas fa-inbox text-4xl text-gray-400 opacity-50 mb-4"></i>
            <p className="text-gray-500">История генераций пуста</p>
          </div>
        )}

        {!loading && generations.length > 0 && (
          <div className="space-y-3">
            {generations.map(gen => (
              <div
                key={gen.id}
                onClick={() => setSelectedGeneration(gen)}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm cursor-pointer hover:border-[#FF7E58] hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{getTypeLabel(gen.type)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getStatusBadgeClass(gen.status)}`}>
                        {getStatusLabel(gen.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{getGenerationTitle(gen)}</p>
                    <p className="text-xs text-gray-400 mt-2">{formatDate(gen.createdAt)}</p>
                  </div>
                  {/* Thumbnail for image types */}
                  {gen.status === 'completed' && isImageType(gen) && getImageUrl(gen) && (
                    <div className="ml-3 w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img src={getImageUrl(gen)!} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {!(gen.status === 'completed' && isImageType(gen) && getImageUrl(gen)) && (
                    <div className="ml-2">
                      <i className="fas fa-chevron-right text-gray-400"></i>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="mt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 bg-[#FF7E58]/10 text-[#FF7E58] rounded-xl font-medium disabled:opacity-50 hover:bg-[#FF7E58]/20 transition"
                >
                  {loadingMore ? 'Загрузка...' : 'Загрузить еще'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
