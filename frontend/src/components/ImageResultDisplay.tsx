'use client'

import { useState } from 'react'

interface ImageResultDisplayProps {
  imageUrl: string
  title?: string
  metadata?: {
    style?: string
    type?: string
  }
  showDebug?: boolean
  onShare?: (imageUrl: string) => void
}

export default function ImageResultDisplay({
  imageUrl,
  title,
  metadata,
  showDebug = false,
  onShare
}: ImageResultDisplayProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  const onImageLoad = () => {
    setIsLoading(false)
    console.log('✅ Image loaded successfully', imageUrl)
  }

  const onImageError = (evt: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoading(false)
    console.error('❌ Image load error:', imageUrl, evt)
    setError('Не удалось загрузить изображение. Проверьте консоль для деталей.')
  }

  const downloadImage = async () => {
    if (!imageUrl || isDownloading) return

    setIsDownloading(true)
    console.log('🔽 Starting download:', imageUrl)

    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch image')
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `generated-image-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      
      window.URL.revokeObjectURL(blobUrl)
      console.log('✅ Download completed')
    } catch (err) {
      console.error('❌ Download failed:', err)
      window.open(imageUrl, '_blank')
    } finally {
      setIsDownloading(false)
    }
  }

  const shareImage = () => {
    if (onShare) {
      onShare(imageUrl)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Image Container */}
      {imageUrl && (
        <div className="relative bg-gray-100">
          <img 
            src={imageUrl} 
            alt={title || 'Generated image'}
            className="w-full h-auto object-contain bg-gray-100"
            style={{ maxHeight: '500px' }}
            onLoad={onImageLoad}
            onError={onImageError}
          />
          {isLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 space-y-3">
        {title && (
          <div className="border-b pb-3">
            <p className="text-sm text-gray-600 mb-1">Описание:</p>
            <p className="text-gray-800 font-medium">{title}</p>
          </div>
        )}

        {metadata && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {metadata.style && (
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-gray-600">Стиль</p>
                <p className="text-gray-800 font-medium capitalize">{metadata.style}</p>
              </div>
            )}
            {metadata.type && (
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-gray-600">Тип</p>
                <p className="text-gray-800 font-medium">{metadata.type}</p>
              </div>
            )}
          </div>
        )}

        {/* URL Display (Optional Debug) */}
        {showDebug && imageUrl && (
          <div className="bg-gray-50 p-2 rounded text-xs text-gray-500 break-all font-mono">
            {imageUrl}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={downloadImage}
            disabled={!imageUrl || isDownloading}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            <i className={`fas ${isDownloading ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
            {isDownloading ? 'Скачивание...' : 'Скачать'}
          </button>
          {onShare && (
            <button
              onClick={shareImage}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <i className="fas fa-share"></i>
              Поделиться
            </button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border-t border-red-200 p-4">
          <p className="text-sm text-red-700">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </p>
        </div>
      )}
    </div>
  )
}

