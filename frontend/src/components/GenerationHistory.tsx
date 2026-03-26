'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getGenerationTypeLabel } from '@/lib/utils/translations'
import ImageResultDisplay from './ImageResultDisplay'
import { apiClient } from '@/lib/api/client'
import { getUserGenerations, removeCachedGeneration, CachedGeneration } from '@/lib/utils/generationsCache'
import { getCurrentUser } from '@/lib/utils/userIdentity'

// ─── Labels & Helpers ────────────────────────────────────────────────

// ─── Labels & Helpers ────────────────────────────────────────────────

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
  const r = gen.result as any
  if (r.htmlResult) return r.htmlResult
  if (r.content) return r.content
  if (r.result) return r.result
  return gen.result
}

function isImageType(gen: CachedGeneration): boolean {
  if (['image', 'photosession', 'image_generation'].includes(gen.type)) return true
  if (gen.type?.startsWith('gigachat') && gen.params?.mode === 'image') return true
  if (getImageUrl(gen)) return true
  return false
}

function isAudioType(gen: CachedGeneration): boolean {
  const r = gen.result as any
  return !!(r?.audioUrl || r?.content?.audioUrl)
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
  const r = gen.result as any
  // Direct string URL
  if (typeof r === 'string' && (r.startsWith('http') || r.startsWith('data:image'))) return r
  // result.imageUrl
  if (r?.imageUrl) return r.imageUrl
  // result.imageUrls[0]
  if (r?.imageUrls?.[0]) return r.imageUrls[0]
  // result.content (which may be a URL string)
  if (typeof r?.content === 'string' && (r.content.startsWith('http') || r.content.startsWith('data:image'))) return r.content
  // result.content.imageUrl
  if (r?.content?.imageUrl) return r.content.imageUrl
  return null
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
      sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
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
      
      // Если это первая загрузка - показываем данные из кэша
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
      
      // Загружаем с сервера для синхронизации
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

  const getTypeLabel = (type: string) => getGenerationTypeLabel(type)

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
      const res = gen.result as any
      const rawContent = res.htmlResult || res.content || res.result || res
      
      if (typeof rawContent === 'string') {
        if (/<[a-z][\s\S]*>/i.test(rawContent)) {
          htmlContent = rawContent
        } else {
          htmlContent = `<p>${rawContent.replace(/\n/g, '<br>')}</p>`
        }
      } else {
        htmlContent = `<pre>${JSON.stringify(rawContent, null, 2)}</pre>`
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

  const getDisplayContent = (content: any): string => {
    if (!content) return ''
    
    let processed = content
    if (typeof content === 'object') {
        processed = content.htmlResult || content.content || content.result || JSON.stringify(content)
    }

    if (typeof processed === 'string' && (processed.trim().startsWith('<!DOCTYPE') || processed.trim().startsWith('<html') || processed.trim().startsWith('<div'))) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(processed, 'text/html')
      const textContent = doc.body?.textContent || doc.documentElement?.textContent || processed
      return textContent.trim().replace(/\n\s*\n/g, '\n\n')
    }
    
    return String(processed)
  }

  const goBack = () => {
    router.push('/')
  }

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
                  <div className="ml-2">
                    <i className="fas fa-chevron-right text-gray-400"></i>
                  </div>
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

      {/* Detail Modal */}
      {selectedGeneration && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50"
          onClick={() => setSelectedGeneration(null)}
        >
          <div 
            className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedGeneration(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
            >
              <i className="fas fa-times text-gray-700"></i>
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4">{getTypeLabel(selectedGeneration.type)}</h3>

            <div className="space-y-4">
              {/* Status */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Статус</p>
                <span className={`text-sm px-3 py-1 rounded inline-block ${getStatusBadgeClass(selectedGeneration.status)}`}>
                  {getStatusLabel(selectedGeneration.status)}
                </span>
              </div>

              {/* Date */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Дата</p>
                <p className="text-sm text-gray-900">{formatDate(selectedGeneration.createdAt)}</p>
              </div>

              {/* Params */}
              {selectedGeneration.params && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Параметры</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-900 font-mono overflow-auto max-h-32">
                    {JSON.stringify(selectedGeneration.params, null, 2)}
                  </div>
                </div>
              )}

              {/* Image Result */}
              {selectedGeneration.status === 'completed' && selectedGeneration.result && 
               (selectedGeneration.type === 'image' || selectedGeneration.type === 'image_generation' || selectedGeneration.type === 'photosession' || 
                (selectedGeneration.result as any)?.imageUrl) && (
                <ImageResultDisplay
                  imageUrl={(selectedGeneration.result as any)?.imageUrl || (selectedGeneration.result as any)?.imageUrls?.[0]}
                  title={selectedGeneration.params?.prompt as string}
                  metadata={{ style: selectedGeneration.params?.style as string }}
                  showDebug={false}
                />
              )}

              {/* Audio Result */}
              {selectedGeneration.status === 'completed' && (selectedGeneration.result as any)?.audioUrl && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Аудио</p>
                  <audio
                    controls
                    src={(selectedGeneration.result as any).audioUrl}
                    className="w-full rounded-lg border border-gray-200"
                  >
                    Ваш браузер не поддерживает воспроизведение аудио.
                  </audio>
                </div>
              )}

              {/* Text Result */}
              {selectedGeneration.status === 'completed' && selectedGeneration.result && 
               !((selectedGeneration.result as any)?.imageUrl) && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Результат</p>
                  {(selectedGeneration.result as any)?.content ? (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 max-h-48 overflow-auto whitespace-pre-wrap">
                      {getDisplayContent((selectedGeneration.result as any).content)}
                    </div>
                  ) : (selectedGeneration.result as any)?.quiz ? (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900">
                      <p className="font-semibold mb-2">{(selectedGeneration.result as any).quiz.title}</p>
                      <p className="text-xs">{(selectedGeneration.result as any).quiz.questions?.length || 0} вопросов</p>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-900">
                      {JSON.stringify(selectedGeneration.result).substring(0, 200)}...
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {selectedGeneration.status === 'failed' && selectedGeneration.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{selectedGeneration.error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 space-y-2">
                {selectedGeneration.status === 'completed' && (
                  <button 
                    onClick={downloadGeneration}
                    disabled={isDownloading}
                    className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-medium disabled:opacity-50"
                  >
                    <i className={`fas ${isDownloading ? 'fa-spinner fa-spin' : 'fa-download'} mr-2`}></i>
                    {isDownloading ? 'Скачивание...' : 'Скачать'}
                  </button>
                )}
                <button 
                  onClick={deleteGeneration}
                  className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium"
                >
                  <i className="fas fa-trash mr-2"></i>Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
