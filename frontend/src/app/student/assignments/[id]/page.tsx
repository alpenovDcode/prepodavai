'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, FileText, MonitorPlay, PenTool, BookOpen, ArrowLeft,
  CheckCircle, AlertCircle, Send, Loader2, X, ImageIcon, Clock, Edit2,
  ClipboardList,
} from 'lucide-react'
import StudentSidebar from '@/components/StudentSidebar'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'
import Image from 'next/image'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface Generation {
  id: string
  generationType: string
  outputData: any
}

interface Assignment {
  id: string
  status: string
  dueDate: string | null
  lesson: {
    id: string
    title: string
    topic: string
    generations: Generation[]
  }
  submissions: any[]
}

interface StudentUser {
  id: string
  name: string
  role: string
  className?: string | null
}

// ─── Вспомогательные компоненты ───────────────────────────────────────────────

function DeadlineBadge({ dueDate }: { dueDate: string }) {
  const now = new Date()
  const due = new Date(dueDate)
  const diffMs = due.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const isPast = diffMs < 0
  const isUrgent = !isPast && diffH < 24

  const label = isPast
    ? `Срок истёк ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
    : diffH < 1 ? 'Осталось менее часа!'
    : diffH < 24 ? `Осталось ${diffH} ч`
    : `Сдать до ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${
      isPast ? 'bg-red-50 text-red-700 border border-red-200'
      : isUrgent ? 'bg-orange-50 text-orange-700 border border-orange-200'
      : 'bg-gray-50 text-gray-600 border border-gray-200'
    }`}>
      <Clock size={14} />
      {label}
    </div>
  )
}

function getGenIcon(type: string) {
  switch (type) {
    case 'plan': case 'lesson-plan': return <FileText className="w-5 h-5 text-blue-500" />
    case 'presentation': return <MonitorPlay className="w-5 h-5 text-orange-500" />
    case 'quiz': return <PenTool className="w-5 h-5 text-purple-500" />
    default: return <BookOpen className="w-5 h-5 text-gray-500" />
  }
}

function getGenLabel(type: string) {
  const map: Record<string, string> = {
    'plan': 'План урока', 'lesson-plan': 'План урока', 'presentation': 'Презентация',
    'quiz': 'Тест', 'worksheet': 'Рабочий лист', 'vocabulary': 'Словарь',
    'adaptation': 'Адаптация текста', 'feedback': 'Фидбек', 'unpacking': 'Распаковка',
    'exam': 'Вариант ОГЭ/ЕГЭ', 'lesson-prep': 'Вау-урок',
  }
  return map[type] || 'Учебный материал'
}

// ─── Утилита: удаление ключа ответов из контента ─────────────────────────────

function stripAnswerKey(content: string): string {
  let result = content

  // 1. Remove <div class="teacher-answers-only">...</div> and everything after it
  result = result.replace(/<div[^>]*class\s*=\s*["'][^"']*teacher-answers-only[^"']*["'][^>]*>[\s\S]*/i, '')

  // 2. <hr>, за которым в пределах ~200 символов идёт слово/заголовок из
  //    секции ответов. Без этой проверки контекста <hr> часто используется
  //    как декоративный разделитель между вопросами, и мы уничтожаем
  //    весь квиз. Правило с div.page-break|border-top|separator удалено
  //    по той же причине — слишком широкое совпадение.
  result = result.replace(
    /<hr[^>]*>[\s\S]{0,200}?(?:Ключ\s*[Оо]тветов|ОТВЕТЫ|[Оо]тветы(?:[\s<:]|\b))[\s\S]*/i,
    '',
  )

  // 3. Heading-based patterns — "Ключ ответов" and variants
  result = result.replace(/<(h[1-6]|p)\b[^>]*>[^<]*Ключ\s*ответов[^<]*<\/\1>[\s\S]*/i, '')
  result = result.replace(/<(h[1-6]|p)\b[^>]*>\s*<[^>]*>[^<]*Ключ\s*ответов[^<]*<\/[^>]*>\s*<\/\1>[\s\S]*/i, '')

  // 4. Heading tags STARTING with "ОТВЕТЫ"/"Ответы" (any text after allowed,
  //    e.g. "ОТВЕТЫ И КРИТЕРИИ ОЦЕНИВАНИЯ" в шаблоне КИМ).
  result = result.replace(/<(h[1-6])\b[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/\1>[\s\S]*/i, '')
  result = result.replace(/<(h[1-6])\b[^>]*>\s*(?:<[^>]*>)*\s*Ответы\b[^<]*(?:<\/[^>]*>)*\s*<\/\1>[\s\S]*/i, '')

  // 5. Paragraph/div acting as heading starting with "ОТВЕТЫ" (centered, bold, etc.)
  result = result.replace(/<p\b[^>]*(?:text-align\s*:\s*center|align\s*=\s*["']center["'])[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/p>[\s\S]*/i, '')
  result = result.replace(/<div\b[^>]*(?:text-align\s*:\s*center|align\s*=\s*["']center["'])[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/div>[\s\S]*/i, '')

  // 6. Table that looks like an answer key: has "Ответ" AND ("Баллы" OR "Балл") in header row
  result = result.replace(/<table\b[^>]*>(?:(?!<\/table>)[\s\S])*(?:Ответ|ОТВЕТ)(?:(?!<\/table>)[\s\S])*(?:Балл|БАЛЛ)(?:(?!<\/table>)[\s\S])*<\/table>/gi, '')

  // 7. Plain text patterns
  result = result.replace(/^[\s\-–—]*Ключ\s*ответов[^\n]*\n[\s\S]*/im, '')
  result = result.replace(/^[\s\-–—]*ОТВЕТЫ\s*\n[\s\S]*/im, '')

  // 8. Final fallback — if any of these keywords remain at top level, cut from there
  const ANSWER_PATTERNS = [/Ключ\s*ответов/i, /^ОТВЕТЫ$/im]
  for (const pat of ANSWER_PATTERNS) {
    if (pat.test(result)) {
      const idx = result.search(pat)
      if (idx > 0) result = result.slice(0, idx)
    }
  }

  return result.trim()
}

// ─── Основная страница ────────────────────────────────────────────────────────

export default function StudentAssignmentPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submissionText, setSubmissionText] = useState('')
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string; type: string }>>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const [user, setUser] = useState<StudentUser | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // formData от всех интерактивных генераций: { [generationId]: { fieldId: value } }
  const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, any>>>({})
  // кол-во интерактивных полей по каждой генерации
  const [fieldCountMap, setFieldCountMap] = useState<Record<string, number>>({})

  const totalInteractiveFields = Object.values(fieldCountMap).reduce((s, n) => s + n, 0)
  const hasAnyFormData = Object.values(formDataMap).some(d => Object.keys(d).length > 0)

  // ─── Загрузка ────────────────────────────────────────────────────────────

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) { router.push('/student/login'); return }
    setUser(JSON.parse(userStr))

    apiClient.get(`/assignments/${params.id}`)
      .then(r => {
        setAssignment(r.data)
        if (r.data.lesson.generations.length > 0) {
          setExpandedItems([r.data.lesson.generations[0].id])
        }
      })
      .catch((err: any) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('user')
          router.push('/student/login')
        }
      })
      .finally(() => setLoading(false))
  }, [params.id, router])

  // ─── Обработчики ─────────────────────────────────────────────────────────

  const toggleAccordion = (id: string) =>
    setExpandedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleFormDataChange = useCallback(
    (genId: string, data: Record<string, any>, fieldCount: number) => {
      setFormDataMap(prev => ({ ...prev, [genId]: data }))
      setFieldCountMap(prev => ({ ...prev, [genId]: fieldCount }))
    },
    [],
  )

  const isDeadlinePassed = () => assignment?.dueDate ? new Date() > new Date(assignment.dueDate) : false

  const buildPayload = () => {
    const combined = Object.keys(formDataMap).length > 0 ? formDataMap : undefined
    return {
      assignmentId: params.id,
      content: submissionText || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      formData: combined,
    }
  }

  const canSubmit = () => {
    if (isDeadlinePassed()) return false
    return submissionText.trim() !== '' || attachments.length > 0 || hasAnyFormData
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = buildPayload()
      const sub = assignment?.submissions?.[0]
      if (isEditing && sub) {
        await apiClient.patch(`/submissions/${sub.id}`, payload)
      } else {
        await apiClient.post('/submissions', payload)
      }
      const r = await apiClient.get(`/assignments/${params.id}`)
      setAssignment(r.data)
      setIsEditing(false)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не удалось отправить ответ')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartEdit = () => {
    const sub = assignment?.submissions?.[0]
    if (!sub) return
    setSubmissionText(sub.content || '')
    setAttachments(sub.attachments || [])
    setIsEditing(true)
    setError(null)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    if (!file.type.startsWith('image/')) { alert('Выберите изображение (JPG, PNG)'); return }
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiClient.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (res.data?.url) setAttachments(prev => [...prev, { url: res.data.url, name: file.name, type: 'image' }])
    } catch { alert('Не удалось загрузить изображение') }
    finally { setUploadingImage(false); e.target.value = '' }
  }

  const handleLogout = () => {
    localStorage.removeItem('prepodavai_authenticated')
    localStorage.removeItem('user')
    router.push('/student/login')
  }

  // ─── Рендер генерации ─────────────────────────────────────────────────────

  const renderGenerationContent = (gen: Generation, isExpanded: boolean) => {
    if (!isExpanded) return null

    // Презентации и изображения показываем статично (для них интерактив не нужен)
    if (gen.generationType === 'presentation') {
      return (
        <div className="p-4 text-center text-gray-500 text-sm">
          <MonitorPlay className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          Откройте презентацию в полном режиме для просмотра
        </div>
      )
    }

    if (gen.generationType === 'image' || gen.generationType === 'photosession') {
      const imgUrl = typeof gen.outputData === 'string' ? gen.outputData : gen.outputData?.imageUrl
      if (imgUrl) {
        return (
          <div className="relative h-80 w-full">
            <Image src={imgUrl} alt="Изображение" fill className="object-contain p-4" unoptimized />
          </div>
        )
      }
    }

    // Для всех остальных: пытаемся извлечь HTML и убрать ключ ответов
    const rawHtml = extractHtmlFromOutput(gen.outputData)
    const html = rawHtml ? stripAnswerKey(rawHtml) : null
    if (html) {
      const isSubmitted = assignment?.submissions && assignment.submissions.length > 0
      const sub = assignment?.submissions?.[0]
      const isGraded = sub?.grade !== null && sub?.grade !== undefined

      if (isGraded && sub?.formData?.[gen.id]) {
        // Режим просмотра после оценивания: показываем заполненный бланк
        return (
          <div className="border-t border-gray-100">
            <InteractiveHtmlViewer
              html={html}
              generationId={gen.id}
              readOnly
              prefillData={sub.formData[gen.id]}
            />
          </div>
        )
      }

      if (isSubmitted && !isEditing && sub?.formData?.[gen.id]) {
        // Ответ отправлен, ещё не оценен — показываем заполненный бланк
        return (
          <div className="border-t border-gray-100">
            <InteractiveHtmlViewer
              html={html}
              generationId={gen.id}
              readOnly
              prefillData={sub.formData[gen.id]}
            />
          </div>
        )
      }

      if (!isSubmitted || isEditing) {
        // Активный интерактивный режим — ученик заполняет
        return (
          <div className="border-t border-gray-100 p-4">
            <InteractiveHtmlViewer
              html={html}
              generationId={gen.id}
              onFormDataChange={handleFormDataChange}
            />
          </div>
        )
      }

      // Отправлено, но formData нет (старая отправка) — просто показываем HTML статично
      return (
        <div className="border-t border-gray-100 p-4">
          <InteractiveHtmlViewer
            html={html}
            generationId={gen.id}
            readOnly
            prefillData={{}}
          />
        </div>
      )
    }

    // Нет HTML — рендерим как текст (с удалением ключа ответов)
    const rawText = typeof gen.outputData === 'string'
      ? gen.outputData
      : (gen.outputData?.content || gen.outputData?.text || JSON.stringify(gen.outputData))
    const textContent = stripAnswerKey(rawText)

    return (
      <div className="border-t border-gray-100 p-6 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
        {textContent}
      </div>
    )
  }

  // ─── Блок отправки ответа ─────────────────────────────────────────────────

  const renderSubmissionForm = () => {
    const deadlinePassed = isDeadlinePassed()
    return (
      <div className="space-y-4">
        {deadlinePassed && (
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700">Срок сдачи истёк. Отправка недоступна.</p>
          </div>
        )}

        {/* Статус интерактивных полей */}
        {totalInteractiveFields > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
            <ClipboardList size={16} className="flex-shrink-0" />
            <span>
              Интерактивные ответы: <strong>{Object.values(formDataMap).reduce((s, d) => s + Object.keys(d).length, 0)}</strong> из <strong>{totalInteractiveFields}</strong> полей заполнено
            </span>
          </div>
        )}

        {/* Дополнительный комментарий */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
            {totalInteractiveFields > 0 ? 'Дополнительный комментарий (необязательно)' : 'Ваш ответ'}
          </label>
          <textarea
            value={submissionText}
            onChange={e => setSubmissionText(e.target.value)}
            disabled={deadlinePassed}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:bg-white transition min-h-[120px] text-base resize-y outline-none disabled:opacity-60"
            placeholder={totalInteractiveFields > 0 ? 'Напишите, если хотите добавить что-то...' : 'Введите ваш ответ здесь...'}
          />
        </div>

        {/* Прикреплённые изображения */}
        {attachments.length > 0 && (
          <div className="flex gap-3 overflow-x-auto py-1">
            {attachments.map((a, i) => (
              <div key={i} className="relative group flex-shrink-0">
                <img src={a.url} alt="Preview" className="h-24 w-24 object-cover rounded-xl border border-gray-200" />
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  disabled={submitting}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {!deadlinePassed && (
              <div className="relative">
                <input
                  type="file" accept="image/png,image/jpeg,image/jpg"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploadingImage || submitting}
                />
                <button
                  type="button" disabled={uploadingImage || submitting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 text-sm"
                >
                  {uploadingImage ? <Loader2 size={16} className="animate-spin text-orange-500" /> : <ImageIcon size={16} />}
                  {uploadingImage ? 'Загрузка...' : 'Прикрепить фото'}
                </button>
              </div>
            )}
            {isEditing && (
              <button onClick={() => { setIsEditing(false); setError(null) }} className="px-4 py-2.5 text-gray-600 font-medium rounded-xl hover:bg-gray-100 transition text-sm">
                Отмена
              </button>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit() || uploadingImage}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0 text-sm"
          >
            {submitting
              ? <><Loader2 size={17} className="animate-spin" /> Отправка...</>
              : <><Send size={17} /> {isEditing ? 'Сохранить изменения' : 'Отправить ответ'}</>
            }
          </button>
        </div>
      </div>
    )
  }

  // ─── Блок просмотра отправленного ответа ─────────────────────────────────

  const renderSubmittedAnswer = () => {
    const sub = assignment!.submissions[0]
    const isGraded = sub.grade !== null && sub.grade !== undefined
    const deadlinePassed = isDeadlinePassed()

    return (
      <div className="space-y-4">
        {/* Статус */}
        <div className={`flex items-center justify-between p-4 rounded-xl border ${
          isGraded ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'
        }`}>
          <div className="flex items-center gap-3">
            <CheckCircle className={`w-6 h-6 flex-shrink-0 ${isGraded ? 'text-green-500' : 'text-yellow-500'}`} />
            <div>
              <p className={`font-bold ${isGraded ? 'text-green-800' : 'text-yellow-800'}`}>
                {isGraded ? 'Работа проверена' : 'Ответ отправлен'}
              </p>
              <p className={`text-sm ${isGraded ? 'text-green-600' : 'text-yellow-600'}`}>
                {isGraded
                  ? <>Оценка: <span className="font-bold text-lg">{sub.grade}</span></>
                  : `Отправлено: ${new Date(sub.createdAt).toLocaleString('ru-RU')}`
                }
              </p>
            </div>
          </div>
          {/* Кнопка редактирования — только если не оценено и дедлайн не прошёл */}
          {!isGraded && !deadlinePassed && (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-yellow-200 text-yellow-700 font-semibold rounded-xl hover:bg-yellow-50 transition text-sm"
            >
              <Edit2 size={14} /> Редактировать
            </button>
          )}
        </div>

        {/* Комментарий учителя */}
        {isGraded && sub.feedback && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm font-semibold text-blue-800 mb-1">Комментарий учителя:</p>
            <p className="text-blue-700">{sub.feedback}</p>
          </div>
        )}

        {/* Текстовый ответ ученика */}
        {sub.content && (
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-semibold text-gray-500 mb-1">Ваш ответ:</p>
            <p className="text-gray-800 whitespace-pre-wrap">{sub.content}</p>
          </div>
        )}

        {/* Прикреплённые файлы */}
        {sub.attachments?.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-500">Прикреплённые файлы:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sub.attachments.map((f: any, i: number) => (
                <div key={i} className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                  <img src={f.url} alt={`Файл ${i + 1}`} className="w-full h-auto object-contain max-h-64" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Если formData есть, но HTML уже отображён в аккордеонах выше — ничего дополнительно не показываем */}
        {sub.formData && !Object.values(assignment!.lesson.generations).some(g => extractHtmlFromOutput(g.outputData)) && (
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <p className="text-sm font-semibold text-indigo-800 mb-2 flex items-center gap-2">
              <ClipboardList size={14} /> Ответы на интерактивные задания
            </p>
            <div className="space-y-1 text-sm text-indigo-700">
              {Object.entries(sub.formData as Record<string, any>).map(([genId, fields]) =>
                Object.entries(fields as Record<string, any>).map(([k, v]) => (
                  <div key={`${genId}-${k}`} className="flex gap-2">
                    <span className="text-indigo-400 font-mono text-xs mt-0.5">{k}:</span>
                    <span>{String(v)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Загрузка / Not found ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
          <p className="text-gray-500 font-medium">Загрузка задания...</p>
        </div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Задание не найдено</h2>
          <button onClick={() => router.push('/student/dashboard')} className="mt-4 text-orange-600 hover:underline font-medium">
            Вернуться к заданиям
          </button>
        </div>
      </div>
    )
  }

  const isSubmitted = assignment.submissions && assignment.submissions.length > 0

  // ─── Основной рендер ──────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <StudentSidebar user={user} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        {/* Шапка */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">{assignment.lesson.title}</h1>
              <p className="text-sm text-gray-500">{assignment.lesson.topic}</p>
            </div>
            {assignment.dueDate && <DeadlineBadge dueDate={assignment.dueDate} />}
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">

          {/* Материалы */}
          {assignment.lesson.generations.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Задание</h2>
              {assignment.lesson.generations.map(gen => {
                const isExpanded = expandedItems.includes(gen.id)
                return (
                  <div key={gen.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => toggleAccordion(gen.id)}
                      className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gray-50 rounded-xl">{getGenIcon(gen.generationType)}</div>
                        <h3 className="text-base font-bold text-gray-900">{getGenLabel(gen.generationType)}</h3>
                        {/* Индикатор интерактивности */}
                        {fieldCountMap[gen.id] > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-600 font-semibold px-2 py-0.5 rounded-full">
                            интерактивное
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {renderGenerationContent(gen, isExpanded)}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500">Материалы к заданию появятся здесь</p>
            </div>
          )}

          {/* Блок ответа */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Ваш ответ</h2>
            {isSubmitted && !isEditing
              ? renderSubmittedAnswer()
              : renderSubmissionForm()
            }
          </div>

        </main>
      </div>
    </div>
  )
}
