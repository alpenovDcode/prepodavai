'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import InputComposer from './InputComposer'
import AiAssistantChat from './AiAssistantChat'
import GenerationProgress from './GenerationProgress'
import {
  Wand2,
  Layout,
  MessageSquare,
  Image as ImageIcon,
  FileText,
  Mic,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Users
} from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { apiClient } from '@/lib/api/client'
import AssignMaterialModal from './AssignMaterialModal' // Используется в initUser для проверки подписки
import DOMPurify from 'isomorphic-dompurify'

interface WebAppIndexProps {
  embedded?: boolean
}

export default function WebAppIndex({ embedded = false }: WebAppIndexProps) {
  const router = useRouter()
  const [currentFunctionId, setCurrentFunctionId] = useState('worksheet')
  const [topLevelTab, setTopLevelTab] = useState<'wow' | 'all'>('wow') // По умолчанию "Вау-урок"
  const [form, setForm] = useState<Record<string, any>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusOk, setStatusOk] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [maxAttempts] = useState(60)
  const [generationResult, setGenerationResult] = useState<any>(null)
  const [activeSectionIndex, setActiveSectionIndex] = useState(0)
  const [userHash, setUserHash] = useState<string | null>(null)
  const [userSource, setUserSource] = useState<'web' | 'telegram' | 'max' | null>(null)

  const { generateAndWait, isGenerating: isGenGenerating, activeGenerationId, inputParams } = useGenerations()
  const { subscription, totalCredits, loading: subscriptionLoading } = useSubscription()
  const resultContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initUser = async () => {
      try {
        // Проверяем Telegram WebApp
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
          const tg = (window as any).Telegram.WebApp
          tg.ready?.()
          tg.expand?.()

          const initData = tg.initData
          try {
            const response = await apiClient.post('/auth/validate-init-data', { initData })
            if (response.data.success) {
              setUserHash(response.data.userHash)
              setUserSource('telegram')
              if (response.data.token) {
                localStorage.setItem('prepodavai_authenticated', 'true')
              }
            }
          } catch (e) {
            console.error('Failed to validate Telegram initData:', e)
          }
        } else if (typeof window !== 'undefined' && ((window as any).WebApp?.initData || (window as any).WebApp)) {
          // Проверяем MAX WebApp
          const max = (window as any).WebApp
          max?.ready?.()

          // Если max.initData нет напрямую в объекте WebApp, попробуем поискать в URL
          let initData = max?.initData;
          
          if (!initData) {
            // В зависимости от реализации MAX, initData может лежать в URL (window.location.search)
            const urlParams = new URLSearchParams(window.location.search)
            // Пытаемся достать сырой init_data, tgWebAppData, или весь query string
            initData = urlParams.get('initData') || urlParams.get('max_init_data') || urlParams.get('tgWebAppData') || window.location.search.replace(/^\?/, '');
          }

          if (initData) {
            try {
              const response = await apiClient.post('/auth/max/validate-init-data', { initData })
              if (response.data.success) {
                setUserHash(response.data.userHash)
                setUserSource('max')
                if (response.data.token) {
                  localStorage.setItem('prepodavai_authenticated', 'true')
                }
              } else {
                console.warn('MAX initData validate return false success');
              }
            } catch (e) {
              console.error('Failed to validate MAX initData:', e)
            }
          } else {
             console.warn('MAX WebApp detected, but no initData found');
          }
        }

        // Fallback: получаем userHash через API подписки
        if (!userHash && typeof window !== 'undefined' && localStorage.getItem('prepodavai_authenticated')) {
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
    !(window as any).Telegram?.WebApp?.initDataUnsafe?.user &&
    !(window as any).WebApp?.initData

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
    setActiveSectionIndex(0)
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

  // AI Assistant - показываем чат вместо результата
  const isAiAssistant = currentFunctionId === 'aiAssistant'

  const isTextResult = generationResult && (
    ['worksheet', 'quiz', 'vocabulary', 'lessonPlan', 'lessonPreparation', 'content', 'feedback', 'message', 'transcription', 'videoAnalysis', 'salesAdvisor'].includes(currentFunctionId)
  ) && (!generationResult?.sections) // Only treat as simple text if no sections


  const isImageResult = generationResult && (
    ['image', 'photosession'].includes(currentFunctionId)
  )

  const isPresentationResult = generationResult &&
    currentFunctionId === 'presentation'

  const isAudioResult = false

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
    setActiveSectionIndex(0)
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

  // Universal download — works for any result type
  const downloadAnyResult = async () => {
    if (!generationResult || isExporting) return
    setIsExporting(true)
    try {
      const typeLabel = getGenerationTypeLabel(currentFunctionId)

      // Auto-print script injected into the opened window
      const autoPrintScript = `<script>
        window.onload = function() {
          var mjax = window.MathJax;
          var doPrint = function() { setTimeout(function() { window.print(); }, 300); };
          if (mjax && mjax.typesetPromise) {
            mjax.typesetPromise().then(doPrint).catch(doPrint);
          } else if (mjax && mjax.Hub) {
            mjax.Hub.Queue(['Typeset', mjax.Hub], doPrint);
          } else {
            setTimeout(doPrint, 800);
          }
        };
      <\/script>`

      let htmlToExport = ''

      if (isStructuredResult && generationResult.sections?.[activeSectionIndex]) {
        const section = generationResult.sections[activeSectionIndex]
        if (section.fileType === 'pptx') {
          const link = document.createElement('a')
          link.href = section.fileUrl
          link.download = `presentation_${activeSectionIndex}.pptx`
          document.body.appendChild(link); link.click(); document.body.removeChild(link)
          return
        }
        htmlToExport = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${section.title || typeLabel}</title>
<style>body{font-family:Arial,sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:0 auto;background:#fff;color:#000;font-size:14pt}h1{color:#FF7E58;border-bottom:2px solid #D8E6FF;padding-bottom:10px;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:1em}th,td{border:1px solid #ddd;padding:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
${autoPrintScript}</head>
<body><h1>${section.title || typeLabel}</h1><div>${section.content}</div>
<p style="margin-top:40px;font-size:10px;color:#a0aec0;border-top:1px solid #edf2f7">Сгенерировано PrepodavAI</p></body></html>`

      } else if (isHtmlResult && htmlResult) {
        const printStyles = `<style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>`
        if (/<\/head>/i.test(htmlResult)) {
          htmlToExport = htmlResult.replace(/<\/head>/i, `${printStyles}${autoPrintScript}</head>`)
        } else if (/<head[\s>]/i.test(htmlResult)) {
          htmlToExport = htmlResult.replace(/<head([^>]*)>/i, `<head$1>${printStyles}${autoPrintScript}`)
        } else {
          htmlToExport = `<!DOCTYPE html><html><head>${printStyles}${autoPrintScript}</head><body>${htmlResult}</body></html>`
        }
      } else {
        const raw = textResultPayload || generationResult
        let bodyContent = ''
        if (typeof raw === 'object') {
          const json = JSON.stringify(raw, null, 2)
          bodyContent = `<pre style="font-family:monospace;white-space:pre-wrap;word-wrap:break-word">${json.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`
        } else {
          const str = String(raw || '')
          bodyContent = isHtmlString(str) ? str : `<div style="white-space:pre-wrap;word-wrap:break-word">${str.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`
        }
        htmlToExport = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${typeLabel}</title>
<style>body{font-family:Arial,sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:0 auto;background:#fff;color:#000;font-size:14pt}table{width:100%;border-collapse:collapse;margin-bottom:1em}th,td{border:1px solid #ddd;padding:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
${autoPrintScript}</head><body>${bodyContent}</body></html>`
      }

      const win = window.open('', '_blank')
      if (!win) {
        alert('Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для этого сайта.')
        return
      }
      win.document.open()
      win.document.write(htmlToExport)
      win.document.close()
    } catch (err: any) {
      console.error('Download error:', err)
      alert('Ошибка при экспорте: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setIsExporting(false)
    }
  }

  const downloadTextResult = async () => {
    if (!generationResult) return
    setIsExporting(true)
    try {
      const typeLabel = getGenerationTypeLabel(currentFunctionId)
      const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},800)}<\/script>`
      let html = ''
      if (isHtmlResult && htmlResult) {
        html = /<\/head>/i.test(htmlResult) ? htmlResult.replace(/<\/head>/i, `${autoPrint}</head>`) : htmlResult
      } else {
        let body = textResultPayload || ''
        if (typeof body === 'object') body = `<pre>${JSON.stringify(body,null,2)}</pre>`
        else if (typeof body === 'string' && !isHtmlString(body)) body = `<div style="white-space:pre-wrap">${body}</div>`
        html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${typeLabel}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:0 auto;font-size:14pt}@media print{body{-webkit-print-color-adjust:exact}}</style>${autoPrint}</head><body>${body}</body></html>`
      }
      const win = window.open('', '_blank')
      if (!win) { alert('Разрешите всплывающие окна для этого сайта'); return }
      win.document.open(); win.document.write(html); win.document.close()
    } catch (e: any) { alert('Ошибка: ' + e.message) } finally { setIsExporting(false) }
  }

  const downloadStructuredPdf = async () => {
    if (!generationResult?.sections?.[activeSectionIndex] || isExporting) return
    const section = generationResult.sections[activeSectionIndex]
    if (section.fileType === 'pptx') {
      const link = document.createElement('a'); link.href = section.fileUrl; link.download = `presentation_${activeSectionIndex}.pptx`
      document.body.appendChild(link); link.click(); document.body.removeChild(link); return
    }
    setIsExporting(true)
    try {
      const title = section.title || 'Материал'
      const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},800)}<\/script>`
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:0 auto;font-size:14pt}h1{color:#FF7E58}@media print{body{-webkit-print-color-adjust:exact}}</style>${autoPrint}</head><body><h1>${title}</h1><div>${section.content}</div><p style="margin-top:40px;font-size:10px;color:#a0aec0">Сгенерировано PrepodavAI</p></body></html>`
      const win = window.open('', '_blank')
      if (!win) { alert('Разрешите всплывающие окна для этого сайта'); return }
      win.document.open(); win.document.write(html); win.document.close()
    } catch (e: any) { alert('Ошибка: ' + e.message) } finally { setIsExporting(false) }
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
        params = { ...params, imageHashes: form.imageHashes || [] }
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
      }

      // Отправляем запрос на генерацию через useGenerations hook
      // Это автоматически отправит запрос и начнет polling
      const status = await generateAndWait({ type, params }, (partialResult: any) => {
        // Обновляем результат в реальном времени (для lessonPreparation)
        if (type === 'lessonPreparation') {
          setGenerationResult(partialResult)
          // Если это первая генерация секций, убедимся что индекс 0
          if (partialResult?.sections?.length > 0 && activeSectionIndex === -1) {
             setActiveSectionIndex(0)
          }
        }
      })

      // Сохраняем результат для отображения
      if (type === 'image' || type === 'photosession') {
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

  const handleAssignClick = async () => {
    if (!generationResult || !activeGenerationId) return

    setIsAssigning(true)
    try {
      // 1. Create a lesson
      const lessonRes = await apiClient.post('/lessons', {
        topic: inputParams.topic || 'AI Generation',
      })
      const lessonId = lessonRes.data.id

      // 2. Link generation to lesson
      await apiClient.post(`/generate/${activeGenerationId}/link-lesson`, {
        lessonId: lessonId
      })

      // 3. Open assign modal
      setCurrentLessonId(lessonId)
      setShowAssignModal(true)
    } catch (error) {
      console.error('Failed to prepare assignment:', error)
      alert('Ошибка при подготовке к выдаче')
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${embedded ? '' : 'pt-20'}`}>
      {/* Header - hide if embedded */}
      {!embedded && (
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
      )}

      {/* Hero gradient - hide if embedded */}
      {!embedded && (
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
      )}

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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                    <div className="px-3 py-1.5 rounded-lg bg-[#FFF2F6] text-[#FF2A5F] text-[10px] font-bold tracking-widest uppercase shrink-0">
                      ВАУ-УРОК
                    </div>
                    
                    {isStructuredResult && (
                      <div className="flex items-center bg-[#F1F5F9] rounded-lg px-1.5 py-1 gap-1 sm:gap-2 shrink-0">
                        <button 
                          onClick={() => setActiveSectionIndex(prev => Math.max(0, prev - 1))}
                          disabled={activeSectionIndex === 0}
                          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 disabled:opacity-20 transition"
                        >
                          <i className="fas fa-chevron-left text-[10px]"></i>
                        </button>
                        <div className="text-[10px] sm:text-[11px] font-bold text-[#475569] uppercase whitespace-nowrap px-1">
                          {activeSectionIndex + 1} ИЗ {generationResult.sections.length}: {generationResult.sections[activeSectionIndex].title}
                        </div>
                        <button 
                          onClick={() => setActiveSectionIndex(prev => Math.min(generationResult.sections.length - 1, prev + 1))}
                          disabled={activeSectionIndex === generationResult.sections.length - 1}
                          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 disabled:opacity-20 transition"
                        >
                          <i className="fas fa-chevron-right text-[10px]"></i>
                        </button>
                      </div>
                    )}

                    {!isStructuredResult && (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#FF7E58] flex items-center justify-center shrink-0">
                          <i className="fas fa-check text-white text-xs"></i>
                        </div>
                        <div className="shrink-0">
                          <h3 className="text-sm font-bold text-black leading-tight">Результат</h3>
                          <p className="text-[10px] text-black/50">{getGenerationTypeLabel(currentFunctionId)}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={clearResult}
                      className="h-10 px-3 sm:px-4 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-50 transition flex items-center gap-2 whitespace-nowrap"
                    >
                      <i className="fas fa-edit"></i>
                      <span className="hidden sm:inline">Редактировать</span>
                      <span className="sm:hidden">Изм.</span>
                    </button>

                    <div className="flex items-center gap-1 border-x border-gray-100 px-1 sm:px-2">
                      <button 
                        onClick={() => {
                          const text = isStructuredResult 
                            ? generationResult.sections[activeSectionIndex].content.replace(/<[^>]*>/g, '') 
                            : String(generationResult.content || generationResult)
                          navigator.clipboard.writeText(text)
                          if ((window as any).Telegram?.WebApp) {
                            (window as any).Telegram.WebApp.HapticFeedback?.notificationOccurred('success')
                          }
                        }}
                        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 transition"
                        title="Копировать"
                      >
                        <i className="far fa-copy text-base"></i>
                      </button>
                      <button 
                        onClick={() => generateMaterial()}
                        className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 transition"
                        title="Перегенерировать"
                      >
                        <i className="fas fa-sync-alt text-base"></i>
                      </button>
                    </div>

                    {!isImageResult && !isAudioResult && !isGameResult && !isPresentationResult && generationResult && (
                      <div className="flex items-center gap-2">
                        {isTextResult && (
                          <button
                            onClick={handleAssignClick}
                            disabled={isAssigning}
                            className="h-10 px-3 bg-[#EEF2FF] text-[#4F46E5] rounded-xl text-xs font-bold hover:bg-[#E0E7FF] transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                          >
                            <Users className="w-4 h-4" />
                            <span>Выдать</span>
                          </button>
                        )}
                        <button
                          onClick={downloadAnyResult}
                          disabled={isExporting}
                          className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                          <span>{isExporting ? 'Скачивание...' : 'Скачать'}</span>
                        </button>
                      </div>
                    )}
                    
                    <button
                      onClick={clearResult}
                      className="w-9 h-9 flex items-center justify-center text-gray-300 hover:text-red-500 transition"
                      title="Закрыть"
                    >
                      <i className="fas fa-times text-lg"></i>
                    </button>
                  </div>
                </div>

                {/* Structured Result (Lesson Preparation) */}
                {isStructuredResult && (
                  <div className="space-y-4">
                    {/* Tabs for sections */}
                    <div className="flex border-b border-[#D8E6FF] overflow-x-auto no-scrollbar">
                      {generationResult.sections.map((section: any, index: number) => (
                        <button
                          key={index}
                          onClick={() => setActiveSectionIndex(index)}
                          className={`px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
                            activeSectionIndex === index
                              ? 'border-[#FF7E58] text-[#FF7E58]'
                              : 'border-transparent text-gray-400 hover:text-gray-600'
                          }`}
                        >
                          {section.title.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* Active Section Content */}
                    {generationResult.sections[activeSectionIndex] && (
                      <div className="animate-fade-in">
                        {/* Warning about data persistence */}
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 mb-4">
                          <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5"></i>
                          <div className="text-sm text-amber-900">
                            <p className="font-semibold mb-1">Важно: Сохраните результаты!</p>
                            <p>Этот материал («{generationResult.sections[activeSectionIndex].title}») доступен только сейчас. Если вы обновите страницу, он исчезнет.</p>
                          </div>
                        </div>

                        <div className="p-1 rounded-xl border border-[#D8E6FF] bg-gray-50">
                           <div className="bg-white rounded-lg p-4 min-h-[400px]">
                              {generationResult.sections[activeSectionIndex].fileType === 'pptx' ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                   <div className="w-20 h-20 rounded-2xl bg-orange-100 flex items-center justify-center mb-4 text-[#FF7E58]">
                                      <i className="fas fa-file-powerpoint text-4xl"></i>
                                   </div>
                                   <h4 className="text-xl font-bold mb-2">{generationResult.sections[activeSectionIndex].title}</h4>
                                   <p className="text-gray-500 mb-6 max-w-md">Презентация готова к скачиванию. Вы можете открыть её для просмотра или скачать файл PPTX.</p>
                                   <div className="flex gap-3">
                                      <a
                                        href={generationResult.sections[activeSectionIndex].fileUrl}
                                        target="_blank"
                                        className="py-3 px-6 bg-[#FF7E58] text-white rounded-xl font-bold hover:shadow-lg transition active:scale-95 flex items-center gap-2"
                                      >
                                        <i className="fas fa-download"></i>
                                        Скачать PPTX
                                      </a>
                                   </div>
                                </div>
                              ) : (
                                <div 
                                  className="prose prose-sm max-w-none preview-content"
                                  dangerouslySetInnerHTML={{ 
                                    __html: DOMPurify.sanitize(generationResult.sections[activeSectionIndex].content, { allowVulnerableTags: true } as any) 
                                  }}
                                />
                              )}
                           </div>
                        </div>
                      </div>
                    )}
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
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMath(cleanedTextResult), { allowVulnerableTags: true } as any) }}
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
                      download="audio.mp3"
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
                        <button
                          onClick={handleAssignClick}
                          disabled={isAssigning}
                          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-2 disabled:opacity-50"
                        >
                          <Users className="w-4 h-4" />
                          {isAssigning ? 'Подготовка...' : 'Выдать'}
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([generationResult], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'worksheet.html';
                            a.click();
                          }}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Скачать HTML
                        </button>
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
      {/* Assign Modal */}
      {showAssignModal && currentLessonId && (
        <AssignMaterialModal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          lessonId={currentLessonId}
        />
      )}
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
const IFRAME_READY_SCRIPT = `<script>
  window.addEventListener('load', function() {
    if (window.MathJax) {
      setTimeout(function() { window.parent.postMessage('IFRAME_READY', '*'); }, 1500);
    } else {
      setTimeout(function() { window.parent.postMessage('IFRAME_READY', '*'); }, 500);
    }
  });
</script>`

function FullHtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'IFRAME_READY') {
        setIsLoading(false)
      }
    }
    window.addEventListener('message', handler)
    
    // Fallback: hide loader after 5 seconds anyway
    const fallbackTimer = setTimeout(() => setIsLoading(false), 5000)
    
    return () => {
      window.removeEventListener('message', handler)
      clearTimeout(fallbackTimer)
    }
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const resize = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (!doc) return
        const height = (doc.body?.scrollHeight || doc.documentElement?.scrollHeight || 600) + 40
        iframe.style.height = `${Math.max(height, 400)}px`
      } catch {
        // Cross-origin access blocked — use fallback height
        iframe.style.height = '800px'
      }
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

  const INJECTED_HEAD = `${IFRAME_STYLES}${hasMathJax ? MATHJAX_SCRIPT : ''}`
  const INJECTED_BODY = `${IFRAME_READY_SCRIPT}`

  let finalHtml = html
  if (hasHead) {
    // Вставляем стили/скрипты ДО закрывающего тега </head> или сразу после открывающего
    finalHtml = html.replace(
      /<head([^>]*)>/i,
      `<head$1>${INJECTED_HEAD}`,
    )
  } else if (hasBody) {
    finalHtml = html.replace(
      /<body([^>]*)>/i,
      `<head>${INJECTED_HEAD}</head><body$1`,
    )
  } else {
    finalHtml = `<!DOCTYPE html><html><head>${INJECTED_HEAD}</head><body><div class="container">${html}</div>${INJECTED_BODY}</body></html>`
  }

  // Если был head или body, вставим скрипт готовности перед </body>
  if (hasHead || hasBody) {
    if (/<\/body>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<\/body>/i, `${INJECTED_BODY}</body>`)
    } else {
      finalHtml += INJECTED_BODY
    }
  }

  return (
    <div className="relative w-full border border-[#D8E6FF] rounded-2xl overflow-hidden bg-white min-h-[600px] flex items-center justify-center">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white backdrop-blur-sm">
           <Loader2 className="w-8 h-8 text-[#FF7E58] animate-spin mb-4" />
           <p className="text-gray-500 font-medium animate-pulse">Готовим документ к просмотру (шрифты, формулы, верстка)...</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="HTML результат"
        srcDoc={finalHtml}
        className={`w-full border-0 transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        style={{ minHeight: '600px' }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
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
  // Safe approach: use regex instead of innerHTML to avoid XSS
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
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
