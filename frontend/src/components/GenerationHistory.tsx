'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ImageResultDisplay from './ImageResultDisplay'
import { apiClient } from '@/lib/api/client'
import { getUserGenerations, removeCachedGeneration, CachedGeneration } from '@/lib/utils/generationsCache'
import { getCurrentUser } from '@/lib/utils/userIdentity'

const typeLabels: Record<string, string> = {
  'image': '🎨 Изображение',
  'photosession': '📸 ИИ Фотосессия',
  'worksheet': '📄 Рабочий лист',
  'quiz': '❓ Тест',
  'vocabulary': '📚 Словарь',
  'lessonPlan': '📋 План урока',
  'lesson-plan': '📋 План урока',
  'content': '🔄 Адаптация контента',
  'content-adaptation': '🔄 Адаптация контента',
  'feedback': '💬 Обратная связь',
  'presentation': '📊 Презентация',
  'transcription': '🎬 Транскрипция видео',
  'message': '✉️ Сообщение'
}

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
    if (gen.params?.prompt) return String(gen.params.prompt).substring(0, 50)
    if (gen.params?.text) return String(gen.params.text).substring(0, 50)
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

  const viewGeneration = (gen: CachedGeneration) => {
    setSelectedGeneration(gen)
  }

  const downloadGeneration = async () => {
    const gen = selectedGeneration
    if (!gen || !gen.result || isDownloading) return

    setIsDownloading(true)

    try {
      const imageUrl = gen.result?.imageUrl || (gen.result as any)?.imageUrls?.[0]

      // Download image
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

      // Download text/content as HTML
      const typeLabel = getTypeLabel(gen.type)
      const filename = `${typeLabel}_${gen.id}`.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')
      
      let htmlContent = ''
      
      if (gen.result?.content && typeof gen.result.content === 'string') {
        if (/<[a-z][\s\S]*>/i.test(gen.result.content)) {
          htmlContent = gen.result.content
        } else {
          htmlContent = `<p>${gen.result.content.replace(/\n/g, '<br>')}</p>`
        }
      } else if (gen.result) {
        htmlContent = `<pre>${JSON.stringify(gen.result, null, 2)}</pre>`
      }
      
      const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${typeLabel}</title>
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
  <h1>${typeLabel}</h1>
  ${htmlContent}
</body>
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

  const deleteGeneration = async () => {
    if (!selectedGeneration) return
    if (!confirm('Вы уверены, что хотите удалить эту генерацию?')) return
    
    const genId = selectedGeneration.id
    
    // Удаляем из кэша
    removeCachedGeneration(genId)
    
    // Удаляем из списка
    setGenerations(prev => prev.filter(g => g.id !== genId))
    
    // Отправляем запрос на сервер для удаления из БД
    try {
      await apiClient.delete(`/generate/${genId}`)
    } catch (error) {
      console.error('Failed to delete generation:', error)
    }
    
    setSelectedGeneration(null)
  }

  const getDisplayContent = (content: any): string => {
    if (!content) return ''
    
    if (typeof content === 'string' && (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html'))) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(content, 'text/html')
      const textContent = doc.body?.textContent || doc.documentElement?.textContent || content
      return textContent.trim().replace(/\n\s*\n/g, '\n\n')
    }
    
    if (typeof content === 'object') {
      return JSON.stringify(content, null, 2)
    }
    
    return String(content)
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
                onClick={() => viewGeneration(gen)}
                className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm cursor-pointer hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{getTypeLabel(gen.type)}</span>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusBadgeClass(gen.status)}`}>
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
                  className="w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-medium disabled:opacity-50"
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
               (selectedGeneration.type === 'image' || selectedGeneration.type === 'photosession' || 
                (selectedGeneration.result as any)?.imageUrl) && (
                <ImageResultDisplay
                  imageUrl={(selectedGeneration.result as any)?.imageUrl || (selectedGeneration.result as any)?.imageUrls?.[0]}
                  title={selectedGeneration.params?.prompt as string}
                  metadata={{ style: selectedGeneration.params?.style as string }}
                  showDebug={false}
                />
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

