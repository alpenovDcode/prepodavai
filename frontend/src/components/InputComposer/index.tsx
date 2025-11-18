'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { functions, templates, messagePrompts, photosessionPrompts, Field } from './config'
import { apiClient } from '@/lib/api/client'

interface InputComposerProps {
  functionId: string
  values: Record<string, any>
  onValuesChange: (values: Record<string, any>) => void
  onFunctionChange: (functionId: string) => void
  onGenerate: () => void
  generationsCount?: number
}

export default function InputComposer({
  functionId,
  values,
  onValuesChange,
  onFunctionChange,
  onGenerate,
  generationsCount = 0
}: InputComposerProps) {
  const [currentFunction, setCurrentFunction] = useState(functionId)
  const [localValues, setLocalValues] = useState<Record<string, any>>(values || {})
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [currentCost, setCurrentCost] = useState<number | null>(null)
  const scrollWrapRef = useRef<HTMLDivElement>(null)

  const isTelegramWebApp = typeof window !== 'undefined' && 
    (window as any).Telegram?.WebApp?.initDataUnsafe?.user !== undefined

  const template = templates[currentFunction]
  const activeFields = getActiveFields(currentFunction, localValues)

  // Обновляем localValues при изменении values извне
  useEffect(() => {
    setLocalValues(values || {})
  }, [values])

  // Обновляем currentFunction при изменении functionId извне
  useEffect(() => {
    if (currentFunction !== functionId) {
      selectFunction(functionId)
    }
  }, [functionId])

  // Уведомляем родителя об изменении значений
  useEffect(() => {
    onValuesChange(localValues)
  }, [localValues])

  // Загружаем стоимость операции
  useEffect(() => {
    const loadCosts = async () => {
      try {
        const response = await apiClient.get('/subscriptions/costs')
        if (response.data.success) {
          const costsMap: Record<string, number> = {}
          response.data.costs.forEach((c: any) => {
            costsMap[c.operationType] = c.creditCost
          })
          const opMap: Record<string, string> = {
            worksheet: 'worksheet',
            quiz: 'quiz',
            vocabulary: 'vocabulary',
            lessonPlan: 'lesson_plan',
            content: 'content_adaptation',
            feedback: 'feedback',
            presentation: 'presentation',
            image: 'image_generation',
            photosession: 'photosession',
            transcription: 'transcription',
            message: 'message'
          }
          const op = opMap[currentFunction]
          setCurrentCost(op ? costsMap[op] || null : null)
        }
      } catch (e) {
        // ignore
      }
    }
    loadCosts()
  }, [currentFunction])

  // Обновление состояния прокрутки
  const updateScrollShadows = useCallback(() => {
    const el = scrollWrapRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    updateScrollShadows()
    const el = scrollWrapRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollShadows)
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }, { passive: false })
    return () => {
      el.removeEventListener('scroll', updateScrollShadows)
    }
  }, [updateScrollShadows])

  function selectFunction(id: string) {
    const fields = templates[id]?.fields || []
    const defaultValues: Record<string, any> = {}

    const specialDefaults: Record<string, Record<string, any>> = {
      presentation: {
        numCards: 10,
        exportAs: 'pdf',
        textAmount: 'detailed',
        language: 'ru',
        imageSource: 'aiGenerated',
        themeName: '',
        tone: '',
        audience: ''
      }
    }

    fields.forEach(field => {
      if (specialDefaults[id] && specialDefaults[id][field.key] !== undefined) {
        defaultValues[field.key] = specialDefaults[id][field.key]
      } else if (field.type === 'file') {
        defaultValues[field.key] = null
        defaultValues[field.key + 'Preview'] = null
      } else if (field.type === 'select' && field.options && field.options.length > 0) {
        const firstNonEmptyOption = field.options.find(opt => opt.value !== '') || field.options[0]
        defaultValues[field.key] = firstNonEmptyOption ? firstNonEmptyOption.value : field.options[0].value
      } else if (field.type === 'number') {
        defaultValues[field.key] = field.min !== undefined ? field.min : 0
      } else {
        defaultValues[field.key] = ''
      }
    })

    setLocalValues(defaultValues)
    setCurrentFunction(id)
    onFunctionChange(id)
  }

  function displayValue(key: string, placeholder: string): string {
    const v = localValues[key]
    if (v === undefined || v === null || v === '') return placeholder

    if (key === 'formData' && currentFunction === 'message') {
      const templateId = localValues.templateId || 'meeting'
      const prompts = messagePrompts[templateId] || messagePrompts.meeting
      const selectedPrompt = prompts.find(p => p.value === v)
      if (selectedPrompt) return selectedPrompt.label
    }

    if (key === 'prompt' && currentFunction === 'photosession') {
      const selectedPrompt = photosessionPrompts.find(p => p.value === v)
      if (selectedPrompt) return selectedPrompt.label
    }

    return String(v)
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>, key: string) {
    const file = event.target.files?.[0]
    if (!file) return

    const isVideo = file.type.startsWith('video/')

    if (isVideo && isTelegramWebApp) {
      const errorMsg = 'Загрузка видео недоступна в Telegram. Используйте веб-версию приложения вне Telegram.'
      if ((window as any).Telegram?.WebApp?.showAlert) {
        (window as any).Telegram.WebApp.showAlert(errorMsg).catch(() => alert(errorMsg))
      } else {
        alert(errorMsg)
      }
      if (event.target) {
        event.target.value = ''
      }
      return
    }

    const maxSize = isVideo ? 3 * 1024 * 1024 * 1024 : 10 * 1024 * 1024

    if (file.size > maxSize) {
      alert(`Файл слишком большой. Максимум ${isVideo ? '3 ГБ' : '10 МБ'}.`)
      return
    }

    try {
      setIsUploadingFile(true)

      // Для изображений загружаем на сервер
      if (!isVideo) {
        const formData = new FormData()
        formData.append('file', file)
        
        try {
          const response = await apiClient.post('/files/upload', formData)
          
          if (response.data.success) {
            // Для изображений создаем preview URL
            const previewUrl = response.data.url || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/files/${response.data.hash}`
            setLocalValues(prev => ({
              ...prev,
              [key]: response.data.hash,
              [key + 'Preview']: previewUrl
            }))
          } else {
            throw new Error(response.data.error || 'Ошибка загрузки файла')
          }
        } catch (err: any) {
          throw new Error(err.response?.data?.error || 'Ошибка загрузки файла')
        }
      } else {
        // Для видео нужна загрузка на сервер
        const formData = new FormData()
        formData.append('file', file)
        
        try {
          const response = await apiClient.post('/files/upload', formData)
          
          if (response.data.success) {
            setLocalValues(prev => ({
              ...prev,
              [key]: response.data.hash,
              [key + 'FileName']: file.name
            }))
          } else {
            throw new Error(response.data.error || 'Ошибка загрузки файла')
          }
        } catch (err: any) {
          throw new Error(err.response?.data?.error || 'Ошибка загрузки файла')
        }
      }
    } catch (error: any) {
      console.error('Error uploading file:', error)
      const errorMessage = error.message || 'Ошибка при загрузке файла'
      if ((window as any).Telegram?.WebApp?.showAlert) {
        (window as any).Telegram.WebApp.showAlert(errorMessage).catch(() => alert(errorMessage))
      } else {
        alert(errorMessage)
      }
    } finally {
      setIsUploadingFile(false)
    }
  }

  function scrollLeft() {
    scrollWrapRef.current?.scrollBy({ left: -240, behavior: 'smooth' })
  }

  function scrollRight() {
    scrollWrapRef.current?.scrollBy({ left: 240, behavior: 'smooth' })
  }

  return (
    <div className="w-full">
      {/* Function switcher */}
      <div className="relative mb-3">
        {canScrollLeft && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={scrollLeft}
              className="w-7 h-7 rounded-full bg-white/80 shadow border border-gray-200 flex items-center justify-center hover:bg-white"
            >
              <i className="fas fa-chevron-left text-gray-700 text-xs"></i>
            </button>
          </div>
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
            <button
              onClick={scrollRight}
              className="w-7 h-7 rounded-full bg-white/80 shadow border border-gray-200 flex items-center justify-center hover:bg-white"
            >
              <i className="fas fa-chevron-right text-gray-700 text-xs"></i>
            </button>
          </div>
        )}

        <div
          ref={scrollWrapRef}
          className="overflow-x-auto no-scrollbar px-8 -mx-2"
        >
          <div className="flex items-center gap-2 min-w-max p-1 rounded-full bg-white border border-gray-200 shadow-sm">
            {functions.map(fn => (
              <button
                key={fn.id}
                type="button"
                onClick={() => selectFunction(fn.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                  currentFunction === fn.id
                    ? 'bg-[#FF7E58] text-white shadow'
                    : 'text-gray-700 hover:bg-slate-50'
                }`}
              >
                <i className={`${fn.icon} opacity-90`}></i>
                <span>{fn.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sentence composer */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        {currentFunction === 'transcription' && (
          <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300">
            <div className="flex items-center space-x-3">
              <i className="fas fa-tools text-yellow-600 text-2xl"></i>
              <div>
                <p className="text-base font-semibold text-yellow-800 mb-1">Ведутся технические работы</p>
                <p className="text-sm text-yellow-700">Функция транскрибации временно недоступна.</p>
              </div>
            </div>
          </div>
        )}

        <div className={`text-lg sm:text-xl leading-8 sm:leading-9 text-gray-900 flex flex-wrap ${currentFunction === 'transcription' ? 'opacity-50 pointer-events-none' : ''}`}>
          {template.segments.map((segment, idx) => (
            <span key={idx}>
              {segment.type === 'text' ? (
                segment.value
              ) : (
                <button
                  type="button"
                  className="px-1 mx-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF7E58]"
                  onClick={() => {}}
                >
                  <span className="px-1.5 py-0.5 rounded-md bg-[#FF7E58]/10 text-[#FF7E58] underline decoration-dotted">
                    {displayValue(segment.key || '', segment.placeholder || '')}
                  </span>
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Inline editors */}
        <div className={`mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ${currentFunction === 'transcription' ? 'opacity-50 pointer-events-none' : ''}`}>
          {activeFields.map(field => (
            <div key={field.key}>
              <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                {field.label}
              </label>
              <FieldRenderer
                field={field}
                values={localValues}
                setValues={setLocalValues}
                handleFileUpload={handleFileUpload}
              />
            </div>
          ))}
        </div>

        {/* Action row */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="px-2 py-1 rounded-lg bg-white border border-gray-200">
              Генераций: {generationsCount}
            </div>
            {currentCost && (
              <div className="px-2 py-1 rounded-lg bg-white border border-gray-200 font-semibold text-[#FF7E58]">
                Стоимость: {currentCost} кред.
              </div>
            )}
          </div>
          {currentFunction === 'transcription' ? (
            <div className="w-full sm:w-auto">
              <div className="px-5 py-2 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold shadow-md text-center">
                <i className="fas fa-tools mr-2"></i>
                Ведутся технические работы
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGenerate}
              className="px-5 py-2 rounded-full bg-[#FF7E58] text-white font-semibold shadow-md active:scale-95"
            >
              Создать →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function getActiveFields(functionId: string, values: Record<string, any>): Field[] {
  const fields = templates[functionId]?.fields || []

  if (functionId === 'message') {
    const templateId = values.templateId || 'meeting'
    const prompts = messagePrompts[templateId] || messagePrompts.meeting

    return fields.map(field => {
      if (field.key === 'formData') {
        return {
          ...field,
          type: 'select',
          label: 'Готовый промпт',
          options: prompts
        }
      }
      return field
    })
  }

  if (functionId === 'photosession') {
    return fields.map(field => {
      if (field.key === 'prompt') {
        return {
          ...field,
          type: 'select',
          label: 'Готовый промпт',
          options: photosessionPrompts
        }
      }
      return field
    })
  }

  return fields
}

function FieldRenderer({
  field,
  values,
  setValues,
  handleFileUpload
}: {
  field: Field
  values: Record<string, any>
  setValues: React.Dispatch<React.SetStateAction<Record<string, any>>>
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>, key: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isTelegramWebApp = typeof window !== 'undefined' && 
    (window as any).Telegram?.WebApp?.initDataUnsafe?.user !== undefined

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={values[field.key] || ''}
          onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF7E58]"
        />
      )

    case 'select':
      return (
        <select
          value={values[field.key] || ''}
          onChange={(e) => {
            setValues(prev => ({ ...prev, [field.key]: e.target.value }))
            // Сбрасываем formData при изменении templateId
            if (field.key === 'templateId') {
              setValues(prev => ({ ...prev, formData: '' }))
            }
          }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF7E58]"
        >
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'number':
      return (
        <input
          type="number"
          value={values[field.key] || field.min || 0}
          onChange={(e) => setValues(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
          min={field.min}
          max={field.max}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF7E58]"
        />
      )

    case 'textarea':
      return (
        <textarea
          value={values[field.key] || ''}
          onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          rows={field.rows || 3}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FF7E58] resize-y"
        />
      )

    case 'file':
      const isVideo = field.accept?.includes('video')
      const hasFile = values[field.key] || values[field.key + 'Preview']

      return (
        <div className="space-y-2">
          {isVideo && isTelegramWebApp && (
            <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="flex items-start space-x-3">
                <i className="fas fa-exclamation-triangle text-yellow-600 mt-0.5"></i>
                <div>
                  <p className="text-sm font-medium text-yellow-800 mb-1">Загрузка видео недоступна в Telegram</p>
                  <p className="text-xs text-yellow-700">Для транскрибации видео используйте веб-версию приложения вне Telegram.</p>
                </div>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={field.accept || 'image/*'}
            onChange={(e) => handleFileUpload(e, field.key)}
            className="hidden"
          />
          {!hasFile && !(isVideo && isTelegramWebApp) && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-[#FF7E58] text-white rounded-lg font-semibold hover:shadow-lg active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              <i className="fas fa-cloud-arrow-up"></i>
              <span>{isVideo ? 'Выбрать видео' : 'Выбрать фото'}</span>
            </button>
          )}
          {hasFile && (
            <div className="relative">
              {isVideo ? (
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-video text-[#FF7E58] text-xl"></i>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {values[field.key + 'FileName'] || 'Видео файл'}
                        </p>
                        {values[field.key] && (
                          <p className="text-xs text-gray-500">Hash: {values[field.key]}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setValues(prev => ({
                        ...prev,
                        [field.key]: null,
                        [field.key + 'FileName']: null
                      }))}
                      className="bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={values[field.key + 'Preview']}
                    alt="Preview"
                    className="w-full rounded-lg object-contain"
                    style={{ maxHeight: '200px', background: '#f5f5f5' }}
                  />
                  <button
                    type="button"
                    onClick={() => setValues(prev => ({
                      ...prev,
                      [field.key]: null,
                      [field.key + 'Preview']: null
                    }))}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </>
              )}
              {!(isVideo && isTelegramWebApp) && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-sm text-[#FF7E58] font-medium hover:underline flex items-center justify-center"
                >
                  <i className="fas fa-sync-alt mr-1"></i>
                  {isVideo ? 'Загрузить другое видео' : 'Загрузить другое фото'}
                </button>
              )}
            </div>
          )}
        </div>
      )

    default:
      return null
  }
}

