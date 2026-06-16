'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  Compass, SlidersHorizontal, Sparkles, Zap, Search, Star,
  BarChart3, MessageSquareText, Check, ArrowRight, MessageCircle,
  RefreshCw, AlertCircle, CheckCircle, Loader2, Gamepad2, ExternalLink, XCircle,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'
import { DocumentRenderer } from '@/components/blocks/DocumentRenderer'
import { isJsonBlocksFormat, GenerationDocument as GenerationDocumentSchema } from '@/lib/blocks/schema'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

// ─── Types ───────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string
  createdAt: string
  grade: number | null
  student: { id: string; name: string; avatar: string | null; className: string | null } | null
  assignment: { id: string; title: string; topic: string | null; dueDate: string | null; className: string | null }
  isOverdue: boolean
}

interface SubmissionDetail {
  id: string
  status: string
  grade: number | null
  feedback: string | null
  content: string | null
  formData: Record<string, Record<string, string>> | null
  createdAt: string
  student: { id: string; name: string; avatar: string | null; className: string | null } | null
  assignment: {
    id: string; title: string; topic: string | null; dueDate: string | null; className: string | null
    generations: { id: string; type: string; outputData: any }[]
  }
}

interface TeacherDashboard {
  totalPending: number
  byClass: { classId: string; className: string; pending: number }[]
}

interface FeedbackTemplate {
  id: string; label: string; text: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  if (d >= 2) return `${d} дн`
  if (d === 1) return 'вчера'
  if (h >= 1) return `${h} ч`
  return '<1 ч'
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' в ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function overdueDays(dueDate: string) {
  const diff = Date.now() - new Date(dueDate).getTime()
  return Math.floor(diff / 86_400_000)
}

function useDebounce<T>(value: T, ms: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debouncedValue
}

// Extract question/answer pairs from submission
function extractAnswerBlocks(detail: SubmissionDetail) {
  const blocks: { question: string; answer: string; correct: boolean | null; hint: string }[] = []
  const formData = detail.formData
  const gens = detail.assignment.generations || []

  if (!formData || Object.keys(formData).length === 0) {
    if (detail.content) {
      blocks.push({ question: '', answer: detail.content, correct: null, hint: '' })
    }
    return blocks
  }

  for (const gen of gens) {
    const genFields = formData[gen.id]
    if (!genFields) continue
    const outputData = gen.outputData as any
    const questions: { text: string; key: string; answer?: string }[] = []

    // Extract questions from various generation types
    if (outputData?.questions && Array.isArray(outputData.questions)) {
      outputData.questions.forEach((q: any, i: number) => {
        const key = q.id || `q${i}`
        questions.push({
          key,
          text: typeof q === 'string' ? q : (q.question || q.text || q.q || `Вопрос ${i + 1}`),
          answer: q.answer || q.correctAnswer || q.correct || '',
        })
      })
    } else if (outputData?.content) {
      // Try to extract from HTML content or generic content
      const content = typeof outputData.content === 'string' ? outputData.content : ''
      const labelMatches = content.match(/>[^<]{3,100}<\/label>/g) || []
      Object.entries(genFields).forEach(([k, v], i) => {
        if (k === '_game') return
        questions.push({ key: k, text: labelMatches[i]?.replace(/<\/?[^>]+>/g, '') || k, answer: '' })
      })
    }

    if (questions.length === 0) {
      Object.entries(genFields).forEach(([k, v]) => {
        if (k === '_game') return
        questions.push({ key: k, text: k, answer: '' })
      })
    }

    for (const q of questions) {
      const studentAnswer = genFields[q.key]
      if (studentAnswer === undefined) continue
      const correctAnswer = q.answer || ''
      const isCorrect = correctAnswer
        ? studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
        : null
      blocks.push({
        question: q.text,
        answer: String(studentAnswer),
        correct: isCorrect,
        hint: isCorrect === false && correctAnswer ? `Правильный ответ: ${correctAnswer}` : '',
      })
    }
  }

  if (blocks.length === 0 && detail.content) {
    blocks.push({ question: '', answer: detail.content, correct: null, hint: '' })
  }

  return blocks
}

// Берём генерацию задания, на которую ученик реально отвечал в этом
// сабмишене: ищем первую с HTML-контентом, у которой в formData есть
// непустые ответы. Если таких нет — fallback на первую HTML-гену.
// Используем extractHtmlFromOutput — он умеет:
//   - доставать html из любого формата outputData (string/{content}/{html}/…)
//   - обрезать второй HTML-документ, если их два слиплось в outputData
//   - убирать битый логотип и распаковывать JSON-экранирование
function pickWorksheetGen(detail: SubmissionDetail): { id: string; type: string; html: string } | null {
    const gens = detail.assignment.generations || []
    const hasStudentData = (genId: string) => {
        const fields = detail.formData?.[genId]
        if (!fields) return false
        return Object.entries(fields).some(([k, v]) => k !== '_game' && v !== '' && v !== null && v !== undefined)
    }

    // 1) HTML + есть ответы ученика
    for (const gen of gens) {
        const html = extractHtmlFromOutput(gen.outputData)
        if (html && hasStudentData(gen.id)) {
            return { id: gen.id, type: gen.type, html }
        }
    }
    // 2) Fallback: просто первая HTML-гена
    for (const gen of gens) {
        const html = extractHtmlFromOutput(gen.outputData)
        if (html) {
            return { id: gen.id, type: gen.type, html }
        }
    }
    return null
}


// ─── Grade color helpers ─────────────────────────────────────────────────────

const GRADE_COLORS: Record<number, { active: string; inactive: string }> = {
  2: { active: 'bg-danger-500 border-danger-700 text-white', inactive: 'border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300' },
  3: { active: 'bg-warning-500 border-warning-700 text-white', inactive: 'border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300' },
  4: { active: 'bg-success-500 border-success-700 text-white', inactive: 'border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300' },
  5: { active: 'bg-success-500 border-success-700 text-white', inactive: 'border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300' },
}

// ─── Toast helper ─────────────────────────────────────────────────────────────

let toastTimers: ReturnType<typeof setTimeout>[] = []

function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  const colors = type === 'success' ? 'bg-success-500' : type === 'error' ? 'bg-danger-500' : 'bg-brand-500'
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-full text-white text-sm font-semibold shadow-lg transition-all ${colors}`
  document.body.appendChild(el)
  const t = setTimeout(() => { el.remove() }, 2500)
  toastTimers.push(t)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GradingPageV2() {
  const menu = useMobileMenu()
  const tour = useTour()
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending')
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(() => searchParams?.get('search') ?? '')
  const [classFilter, setClassFilter] = useState(() => searchParams?.get('class') ?? '')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortFilter, setSortFilter] = useState<'urgent' | 'overdue' | 'new' | 'name' | 'class'>('urgent')
  // ?submission=<id> в URL — переход с карточки задания: сразу выбираем
  // нужную работу при первом рендере, дальше юзер кликает свободно.
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams?.get('submission') ?? null)
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [aiDrafts, setAiDrafts] = useState<Record<string, { feedback: string; grade: number | null }>>({})
  const [batchAiLoading, setBatchAiLoading] = useState(false)
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const debouncedSearch = useDebounce(search, 250)

  // Build queue URL — classFilter и typeFilter не шлём бэку:
  // 1) бэк ждёт UUID классу (classId), а фронт показывает имя класса (className)
  // 2) type фильтр на бэке вообще не реализован
  // Применяем оба фильтра на клиенте ниже.
  const queueUrl = `/submissions/queue?status=${activeTab === 'pending' ? 'pending' : 'done'}&sort=${sortFilter}` +
    (debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '')

  const pendingUrl = `/submissions/queue?status=pending&sort=urgent`
  const doneUrl = `/submissions/queue?status=done&sort=new`

  const { data: queueData, mutate: mutateQueue } = useSWR<{ items: QueueItem[]; total: number }>(queueUrl, fetcher, { refreshInterval: 30_000 })
  const { data: pendingData } = useSWR<{ items: QueueItem[]; total: number }>(pendingUrl, fetcher)
  const { data: doneData } = useSWR<{ items: QueueItem[]; total: number }>(doneUrl, fetcher)
  const { data: dash } = useSWR<TeacherDashboard>('/submissions/teacher-dashboard', fetcher)
  const { data: detail, isLoading: detailLoading } = useSWR<SubmissionDetail>(
    selectedId ? `/submissions/${selectedId}/detail` : null,
    fetcher
  )
  const { data: templatesData } = useSWR<{ templates: FeedbackTemplate[] }>('/submissions/feedback-templates', fetcher)

  const pendingCount = pendingData?.total ?? dash?.totalPending ?? 0
  const doneCount = doneData?.total ?? 0
  const overdueCount = pendingData?.items.filter(i => i.isOverdue).length ?? 0

  const rawItems = queueData?.items ?? []
  const items = rawItems.filter(i => {
    if (classFilter) {
      const cls = i.student?.className || i.assignment.className || ''
      if (cls !== classFilter) return false
    }
    if (typeFilter) {
      const title = (i.assignment.title || '').toLowerCase()
      const topic = (i.assignment.topic || '').toLowerCase()
      const hay = `${title} ${topic}`
      const matchesType: Record<string, (s: string) => boolean> = {
        worksheet:    s => s.includes('лист') || s.includes('worksheet'),
        test:         s => s.includes('тест') || s.includes('quiz'),
        presentation: s => s.includes('презентац'),
        game:         s => s.includes('игр'),
      }
      const fn = matchesType[typeFilter]
      if (fn && !fn(hay)) return false
    }
    return true
  })

  // Unique classes for filter
  const allItems = [...(pendingData?.items ?? []), ...(doneData?.items ?? [])]
  const uniqueClasses = Array.from(new Set(allItems.map(i => i.student?.className || i.assignment.className).filter(Boolean)))

  // When detail loads, sync grade/comment
  useEffect(() => {
    if (detail) {
      setSelectedGrade(detail.grade ?? null)
      setComment(detail.feedback ?? '')
      setAiText(null)
    }
  }, [detail?.id])

  // Auto-load AI suggestion when detail is loaded and no AI text yet
  useEffect(() => {
    if (!detail) return
    const cached = aiDrafts[detail.id]
    if (cached) {
      setAiText(cached.feedback)
      if (cached.grade !== null && !detail.grade) setSelectedGrade(cached.grade)
    } else if (!detail.grade && !aiText && !aiLoading) {
      handleAiSuggest()
    }
  }, [detail?.id])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if (!inInput && ['2', '3', '4', '5'].includes(e.key)) {
        setSelectedGrade(Number(e.key))
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSaveAndNext()
        return
      }
      if (e.key === 'Escape' && inInput) {
        ;(e.target as HTMLElement).blur()
        return
      }
      if (!inInput && e.key === 'j') {
        navigateQueue(1)
        return
      }
      if (!inInput && e.key === 'k') {
        navigateQueue(-1)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, selectedId, selectedGrade, comment])

  function navigateQueue(dir: 1 | -1) {
    if (!items.length) return
    const idx = selectedId ? items.findIndex(i => i.id === selectedId) : -1
    const next = idx + dir
    if (next >= 0 && next < items.length) setSelectedId(items[next].id)
  }

  async function handleAiSuggest() {
    if (!selectedId || aiLoading) return
    setAiLoading(true)
    try {
      const res = await apiClient.post(`/submissions/${selectedId}/ai-feedback`, {})
      const data = res.data as { feedback: string; grade: number | null }
      setAiText(data.feedback)
      if (data.grade && !selectedGrade) setSelectedGrade(data.grade)
      setAiDrafts(prev => ({ ...prev, [selectedId]: data }))
    } catch {
      showToast('Ошибка ИИ-предложения', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleCheckAll() {
    const pendingItems = pendingData?.items ?? []
    if (!pendingItems.length) {
      showToast('Нет работ для проверки', 'info')
      return
    }
    setBatchAiLoading(true)
    let processed = 0
    for (const item of pendingItems) {
      if (aiDrafts[item.id]) { processed++; continue }
      try {
        const res = await apiClient.post(`/submissions/${item.id}/ai-feedback`, {})
        setAiDrafts(prev => ({ ...prev, [item.id]: res.data as { feedback: string; grade: number | null } }))
        processed++
      } catch { /* пропускаем, продолжаем */ }
    }
    showToast(`ИИ разобрал ${processed} ${processed === 1 ? 'работу' : processed < 5 ? 'работы' : 'работ'}`, 'success')
    setBatchAiLoading(false)
  }

  async function handleBulkAiGrade() {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBatchAiLoading(true)
    let processed = 0
    for (const id of ids) {
      if (aiDrafts[id]) { processed++; continue }
      try {
        const res = await apiClient.post(`/submissions/${id}/ai-feedback`, {})
        setAiDrafts(prev => ({ ...prev, [id]: res.data as { feedback: string; grade: number | null } }))
        processed++
      } catch { /* пропускаем */ }
    }
    showToast(`ИИ оценил ${processed} работ`, 'success')
    setBatchAiLoading(false)
  }

  async function handleSave(andNext = false) {
    if (!selectedId || !selectedGrade) {
      showToast('Выберите оценку', 'error')
      return
    }
    setSaving(true)
    try {
      await apiClient.patch(`/submissions/${selectedId}/grade`, { grade: selectedGrade, feedback: comment || undefined })
      showToast('Сохранено ✓')

      // Optimistically move to done tab, select next
      if (andNext) {
        const idx = items.findIndex(i => i.id === selectedId)
        const next = items[idx + 1] || items[idx - 1] || null
        setSelectedId(next?.id ?? null)
      }
      await mutateQueue()
    } catch {
      showToast('Ошибка сохранения', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndNext = () => handleSave(true)

  const answerBlocks = detail ? extractAnswerBlocks(detail) : []
  const correctCount = answerBlocks.filter(b => b.correct === true).length
  const wrongCount = answerBlocks.filter(b => b.correct === false).length
  const totalCount = answerBlocks.length

  // Лист с заданиями + предзаполненные ответы ученика — для центрального
  // предпросмотра. Если нет HTML-генерации, падаем в старый список.
  const worksheetGen = detail ? pickWorksheetGen(detail) : null
  const studentAnswers = useMemo(() => {
    if (!worksheetGen || !detail) return {}
    return detail.formData?.[worksheetGen.id] ?? {}
  }, [worksheetGen, detail])

  // Новый JSON-blocks-v1 формат: ищем гену с outputData.format = 'json-blocks-v1'
  // и валидируем её doc. У такой гены ответы ученика лежат как
  // { [blockId]: value }. Если есть — рендерим DocumentRenderer вместо
  // InteractiveHtmlViewer.
  const jsonBlocksSubmission = useMemo(() => {
    if (!detail) return null
    for (const gen of detail.assignment.generations || []) {
      if (!isJsonBlocksFormat(gen.outputData)) continue
      const parsed = GenerationDocumentSchema.safeParse(gen.outputData.outputDoc)
      if (!parsed.success) continue
      const answers = detail.formData?.[gen.id] ?? {}
      return { genId: gen.id, doc: parsed.data, answers }
    }
    return null
  }, [detail])

  // Мини-игры: ученик играет в iframe → результат летит в formData[genId]._game.
  // Здесь собираем карточки-результаты для каждой игровой генерации задания.
  const gameResultCards = useMemo(() => {
    if (!detail) return [] as Array<{ genId: string; out: any; result: any }>
    const cards: Array<{ genId: string; out: any; result: any }> = []
    for (const gen of detail.assignment.generations || []) {
      const t = (gen.type || '').toLowerCase()
      if (t !== 'game_generation' && t !== 'game') continue
      const out = typeof gen.outputData === 'object' && gen.outputData ? gen.outputData : {}
      const result = (detail.formData as any)?.[gen.id]?._game ?? null
      cards.push({ genId: gen.id, out, result })
    }
    return cards
  }, [detail])

  const templates = templatesData?.templates ?? []

  return (
    <>
      <Topbar
        title="Проверка ДЗ"
        subtitle={`${pendingCount} работ ждут · ${overdueCount} просрочены · ≈1,5 мин среднее время`}
        onMobileMenuToggle={menu.toggle}
        hideSearch
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={tour.start}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-ink-200 text-ink-700 text-[12px] font-semibold hover:bg-ink-50 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" /> Тур
            </button>
            <button
              type="button"
              onClick={() => setRightOpen(v => !v)}
              className="xl:hidden h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-ink-200 text-ink-700 text-[12px] font-semibold hover:bg-ink-50 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Оценить
            </button>
            <button
              type="button"
              onClick={handleCheckAll}
              disabled={batchAiLoading || !pendingData?.items.length}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-ink-100 text-ink-700 text-[12px] font-semibold hover:bg-ink-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchAiLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              Проверить всё ИИ
            </button>
          </div>
        }
      />

      {/* 3-column workspace */}
      <div className="h-[calc(100vh-64px)] grid min-h-0 [grid-template-columns:minmax(280px,320px)_minmax(0,1fr)] xl:[grid-template-columns:minmax(280px,320px)_minmax(0,1fr)_minmax(300px,360px)]">
        {/* ── LEFT: Queue ── */}
        <div data-tour="queue" className="bg-white border-r border-ink-200 flex flex-col overflow-hidden min-w-0">
          {/* Queue head */}
          <div className="p-3.5 border-b border-ink-200 flex flex-col gap-2.5 sticky top-0 bg-white z-10">
            {/* Tabs */}
            <div data-tour="queue-tabs" className="flex bg-ink-100 p-0.5 rounded-full gap-0.5">
              {([['pending', 'Ждут', pendingCount], ['done', 'Проверено', doneCount]] as const).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 h-8 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all ${activeTab === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}
                >
                  {label}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${activeTab === id ? 'bg-[var(--brand-100)] text-[var(--brand-700)]' : 'bg-ink-200 text-ink-700'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div data-tour="queue-search" className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск ученика…"
                className="w-full h-9 pl-9 pr-3 border border-ink-200 rounded-full text-[13px] bg-white focus:outline-none focus:border-[var(--brand-300)] focus:shadow-[0_0_0_3px_rgba(255,126,88,0.12)] transition-all"
              />
            </div>

            {/* Filters row 1 */}
            <div data-tour="queue-filters" className="flex gap-1.5">
              <MiniSelect value={classFilter} onChange={setClassFilter}>
                <option value="">Все классы</option>
                {uniqueClasses.map(c => <option key={c} value={c!}>{c}</option>)}
              </MiniSelect>
              <MiniSelect value={typeFilter} onChange={setTypeFilter}>
                <option value="">Все типы</option>
                <option value="worksheet">Рабочие листы</option>
                <option value="test">Тесты</option>
                <option value="presentation">Презентации</option>
                <option value="game">Игры</option>
              </MiniSelect>
            </div>
            {/* Sort row */}
            <div className="flex">
              <MiniSelect value={sortFilter} onChange={v => setSortFilter(v as any)} className="flex-1">
                <option value="urgent">Сначала срочное</option>
                <option value="overdue">Сначала просроченное</option>
                <option value="new">Сначала новое</option>
                <option value="name">По фамилии А-Я</option>
                <option value="class">По классу</option>
              </MiniSelect>
            </div>
          </div>

          {/* Bulk bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--brand-50)] border-b border-[var(--brand-200)] text-[12px] text-[var(--brand-800)] font-semibold">
              <span>Выбрано: {selectedIds.size}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleBulkAiGrade}
                disabled={batchAiLoading}
                className="flex items-center gap-1 bg-white border border-[var(--brand-200)] px-2.5 py-1 rounded-full text-[12px] font-semibold text-[var(--brand-700)] hover:bg-[var(--brand-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchAiLoading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />}
                Оценить ИИ
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="w-6 h-6 flex items-center justify-center bg-white border border-[var(--brand-200)] rounded-full text-[var(--brand-700)] hover:bg-[var(--brand-50)] transition-colors font-bold"
              >
                ×
              </button>
            </div>
          )}

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto">
            {!queueData ? (
              <div className="flex flex-col gap-0">
                {[...Array(5)].map((_, i) => <SkeletonItem key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <CheckCircle className="w-10 h-10 text-success-500 mb-3" />
                <div className="font-bold text-ink-900 mb-1">Всё проверено!</div>
                <div className="text-[13px] text-ink-500">На сегодня нет работ, ждущих проверки.</div>
              </div>
            ) : (
              items.map(item => (
                <QueueItem
                  key={item.id}
                  item={item}
                  isActive={item.id === selectedId}
                  isSelected={selectedIds.has(item.id)}
                  onClick={() => { setSelectedId(item.id); setRightOpen(false) }}
                  onToggleSelect={() => {
                    setSelectedIds(prev => {
                      const s = new Set(prev)
                      s.has(item.id) ? s.delete(item.id) : s.add(item.id)
                      return s
                    })
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── CENTER: Document ── */}
        <div data-tour="document" className="bg-ink-50 overflow-y-auto flex flex-col min-w-0">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-ink-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-ink-400" />
              </div>
              <div className="font-display font-bold text-xl text-ink-700 mb-2">Выберите работу</div>
              <div className="text-[13px] text-ink-500 max-w-xs">Нажмите на ученика в очереди слева, чтобы открыть его работу</div>
            </div>
          ) : detailLoading ? (
            <div className="p-6">
              <div className="bg-white border border-ink-200 rounded-2xl p-7 animate-pulse">
                <div className="h-6 bg-ink-100 rounded-full w-2/3 mb-3" />
                <div className="h-4 bg-ink-100 rounded-full w-1/2 mb-8" />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="mb-6">
                    <div className="h-4 bg-ink-100 rounded-full w-1/3 mb-2" />
                    <div className="h-12 bg-ink-50 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ) : detail ? (
            <div className="p-6 flex flex-col gap-4">
              <div className="bg-white border border-ink-200 rounded-2xl p-7">
                {/* Doc header */}
                <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-ink-100 mb-5">
                  <div className="min-w-0">
                    <h2 className="font-display font-bold text-[20px] text-ink-900 leading-tight mb-1">
                      {detail.assignment.title}
                      {detail.assignment.topic ? ` · ${detail.assignment.topic}` : ''}
                    </h2>
                    <div className="text-[13px] text-ink-500">
                      {detail.student?.name} · {detail.student?.className || detail.assignment.className} · сдано {formatDateTime(detail.createdAt)}
                      {detail.assignment.dueDate && new Date(detail.createdAt) > new Date(detail.assignment.dueDate) && (
                        <> (на {overdueDays(detail.assignment.dueDate)} {overdueDays(detail.assignment.dueDate) === 1 ? 'день' : 'дня'} позже)</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-ink-100 rounded-full text-[11px] font-semibold text-ink-600">
                      <kbd className="bg-white border border-ink-200 rounded px-1 py-0.5 font-mono text-[10px] text-ink-700">1-5</kbd>
                      оценка
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-ink-100 rounded-full text-[11px] font-semibold text-ink-600">
                      <kbd className="bg-white border border-ink-200 rounded px-1 py-0.5 font-mono text-[10px] text-ink-700">⌘ ↵</kbd>
                      сохранить и далее
                    </span>
                    {detail.assignment.dueDate && new Date(detail.createdAt) > new Date(detail.assignment.dueDate) && (
                      <span className="px-2.5 py-1 bg-danger-50 text-danger-700 text-[11px] font-bold rounded-full">
                        ⏰ Просрочено
                      </span>
                    )}
                  </div>
                </div>

                {/* Мини-игры: показываем сводку прохождения каждой игры */}
                {gameResultCards.length > 0 && (
                  <div className="mb-5 space-y-3">
                    {gameResultCards.map(({ genId, out, result }) => (
                      <GameResultCard key={genId} out={out} result={result} />
                    ))}
                  </div>
                )}

                {/* Лист с заданиями + предзаполненные ответы ученика. Если у
                    задания нет HTML-генерации (старые формы), показываем
                    компактный список «вопрос-ответ». */}
                {jsonBlocksSubmission ? (
                  // JSON-blocks v1: рендерим DocumentRenderer с ответами ученика.
                  // Учителю показываем заполненные поля (как студент сдал),
                  // но БЕЗ showAnswers — ключ ответов отдельно через таб.
                  <div key={`${detail!.id}_${jsonBlocksSubmission.genId}`}>
                    <DocumentRenderer
                      doc={jsonBlocksSubmission.doc}
                      answers={jsonBlocksSubmission.answers}
                      showAnswers={false}
                    />
                  </div>
                ) : worksheetGen ? (
                  // key с id сабмишена форсит ремоунт InteractiveHtmlViewer
                  // при смене работы — иначе React переиспользует тот же
                  // iframe и предзаполнение не перезапускается на новых
                  // ответах ученика.
                  <div key={`${detail!.id}_${worksheetGen.id}`}>
                    <InteractiveHtmlViewer
                      html={worksheetGen.html}
                      generationId={worksheetGen.id}
                      readOnly
                      prefillData={studentAnswers}
                    />
                  </div>
                ) : answerBlocks.length === 0 ? (
                  <div className="text-[14px] text-ink-500 italic">Ответы не найдены</div>
                ) : answerBlocks.map((block, i) => (
                  <div key={i} className="mb-[18px]">
                    {block.question && (
                      <div className="text-[14px] font-semibold text-ink-900 mb-2">
                        {i + 1}. {block.question}
                      </div>
                    )}
                    <div className={`rounded-lg px-3.5 py-3 text-[14px] text-ink-800 leading-relaxed border-l-[3px] ${
                      block.correct === true
                        ? 'bg-success-50 border-success-500'
                        : block.correct === false
                          ? 'bg-danger-50 border-danger-500'
                          : 'bg-ink-50 border-info-500'
                    }`}>
                      {block.answer}
                    </div>
                    {(block.correct !== null || block.hint) && (
                      <div className={`mt-1.5 px-3 py-2 rounded-r-lg flex items-start gap-1.5 text-[12px] text-ink-700 border-l-2 ${
                        block.correct === false
                          ? 'bg-[rgba(239,68,68,0.06)] border-danger-500'
                          : 'bg-[rgba(99,102,241,0.06)] border-[#6366F1]'
                      }`}>
                        <span className={`inline-block text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                          block.correct === false ? 'bg-danger-500' : 'bg-[#6366F1]'
                        }`}>
                          {block.correct === false ? 'Ошибка' : 'ИИ'}
                        </span>
                        <span>
                          {block.hint || (block.correct === true ? 'Верно.' : 'Ответ отмечен как нейтральный.')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── RIGHT: Grade panel ── */}
        <div className={`
          bg-ink-50 border-l border-ink-200 flex flex-col gap-3 p-4 overflow-y-auto
          hidden xl:flex
          ${rightOpen ? '!flex fixed top-16 right-0 bottom-0 w-[min(380px,100vw)] z-30 shadow-[−8px_0_32px_rgba(0,0,0,0.12)]' : ''}
        `}>
          {/* Grade picker */}
          <div data-tour="grade-picker" className="bg-white border border-ink-200 rounded-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h3 className="text-[11px] uppercase font-bold text-ink-500 tracking-[0.06em] flex items-center gap-2 mb-3">
              <Star className="w-3 h-3 text-ink-400" /> Оценка
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {([2, 3, 4, 5] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  disabled={!selectedId}
                  onClick={() => setSelectedGrade(g)}
                  className={`aspect-square rounded-xl border-2 font-display text-[22px] font-extrabold relative transition-all hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed ${
                    selectedGrade === g ? GRADE_COLORS[g].active : GRADE_COLORS[g].inactive
                  }`}
                >
                  {g}
                  <span className={`absolute top-1 right-1.5 font-mono text-[9px] font-medium ${selectedGrade === g ? 'text-white/70' : 'text-ink-400'}`}>
                    {g}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Progress mini */}
          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h3 className="text-[11px] uppercase font-bold text-ink-500 tracking-[0.06em] flex items-center gap-2 mb-3">
              <BarChart3 className="w-3 h-3 text-ink-400" /> Прогресс по работе
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-success-50 text-success-700 rounded-xl p-2.5 text-center">
                <div className="font-display text-[20px] font-extrabold leading-none tabular-nums">{correctCount}</div>
                <div className="text-[11px] font-semibold text-ink-500 mt-1">верно</div>
              </div>
              <div className="bg-danger-50 text-danger-700 rounded-xl p-2.5 text-center">
                <div className="font-display text-[20px] font-extrabold leading-none tabular-nums">{wrongCount}</div>
                <div className="text-[11px] font-semibold text-ink-500 mt-1">ошибки</div>
              </div>
              <div className="bg-ink-100 text-ink-700 rounded-xl p-2.5 text-center">
                <div className="font-display text-[20px] font-extrabold leading-none tabular-nums">{totalCount || '—'}</div>
                <div className="text-[11px] font-semibold text-ink-500 mt-1">всего</div>
              </div>
            </div>
          </div>

          {/* AI suggest */}
          <div data-tour="ai-suggest" className="rounded-xl p-3.5" style={{ background: 'linear-gradient(165deg,#EEF2FF 0%,#FFFFFF 60%)', border: '1px solid #C7D2FE' }}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-[12px] font-bold" style={{ color: '#4338CA' }}>ИИ предлагает комментарий</span>
            </div>
            {aiLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-ink-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Генерирую…
              </div>
            ) : aiText ? (
              <>
                <div className="text-[13px] text-ink-700 leading-relaxed">{aiText}</div>
                <div className="flex gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setComment(aiText)}
                    className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 bg-[var(--brand-500)] text-white text-[12px] font-semibold rounded-lg hover:bg-[var(--brand-600)] transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Использовать
                  </button>
                  <button
                    type="button"
                    onClick={handleAiSuggest}
                    className="h-8 w-8 inline-flex items-center justify-center bg-ink-100 text-ink-700 rounded-lg hover:bg-ink-200 transition-colors"
                    title="Сгенерировать новый"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : selectedId ? (
              <button
                type="button"
                onClick={handleAiSuggest}
                className="text-[13px] text-[#4338CA] font-semibold hover:underline"
              >
                Запросить предложение ИИ
              </button>
            ) : (
              <div className="text-[13px] text-ink-400 italic">Выберите работу для генерации</div>
            )}
          </div>

          {/* Comment */}
          <div data-tour="comment" className="bg-white border border-ink-200 rounded-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h3 className="text-[11px] uppercase font-bold text-ink-500 tracking-[0.06em] flex items-center gap-2 mb-3">
              <MessageSquareText className="w-3 h-3 text-ink-400" /> Комментарий ученику
            </h3>
            <textarea
              ref={commentRef}
              rows={6}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Что хорошо, что улучшить…"
              disabled={!selectedId}
              className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-3 text-[13px] text-ink-800 leading-relaxed resize-y focus:outline-none focus:border-[var(--brand-400)] focus:shadow-[0_0_0_3px_rgba(255,126,88,0.12)] focus:bg-white transition-all disabled:opacity-50"
            />
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              {/* Static preset pills (use first 3 templates) */}
              {[
                { label: '👏 Молодец', variant: 'ok', idx: 0 },
                { label: '📈 Подтянуть', variant: 'warn', idx: 1 },
                { label: '📚 Повторить тему', variant: 'info', idx: 2 },
              ].map(({ label, variant, idx }) => {
                const tpl = templates[idx]
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!selectedId}
                    onClick={() => tpl && setComment(tpl.text)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold border transition-colors disabled:opacity-40 ${
                      variant === 'ok' ? 'text-success-700 border-[#BBF7D0] bg-success-50 hover:bg-[#BBF7D0]'
                      : variant === 'warn' ? 'text-warning-700 border-[#FDE68A] bg-warning-50 hover:bg-[#FDE68A]'
                      : 'text-info-700 border-[#BFDBFE] bg-info-50 hover:bg-[#BFDBFE]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div data-tour="actions" className="bg-white border border-ink-200 rounded-xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h3 className="text-[11px] uppercase font-bold text-ink-500 tracking-[0.06em] flex items-center gap-2 mb-3">
              <Zap className="w-3 h-3 text-ink-400" /> Действия
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!selectedId || saving}
                onClick={() => handleSave(false)}
                className="h-10 inline-flex items-center justify-center gap-1.5 bg-[var(--brand-500)] text-white font-semibold text-[14px] rounded-xl hover:bg-[var(--brand-600)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Сохранить оценку
              </button>
              <button
                type="button"
                disabled={!selectedId || saving}
                onClick={handleSaveAndNext}
                className="h-10 inline-flex items-center justify-center gap-1.5 bg-ink-100 text-ink-700 font-semibold text-[14px] rounded-xl hover:bg-ink-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowRight className="w-4 h-4" /> Сохранить и следующая
              </button>
              <button
                type="button"
                disabled={!selectedId}
                onClick={() => showToast('Скоро', 'info')}
                className="h-10 inline-flex items-center justify-center gap-1.5 text-ink-600 font-semibold text-[14px] rounded-xl hover:bg-ink-50 disabled:opacity-40 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Связаться с учеником
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel backdrop for mobile */}
      {rightOpen && (
        <div
          className="xl:hidden fixed inset-0 bg-black/20 z-20"
          onClick={() => setRightOpen(false)}
        />
      )}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QueueItem({
  item, isActive, isSelected, onClick, onToggleSelect,
}: {
  item: QueueItem
  isActive: boolean
  isSelected: boolean
  onClick: () => void
  onToggleSelect: () => void
}) {
  const name = item.student?.name ?? 'Неизвестно'
  const className = item.student?.className || item.assignment.className || ''
  const timeStr = relativeTime(item.createdAt)
  const badgeType = item.isOverdue ? 'overdue' : item.grade !== null ? 'done' : 'submitted'

  return (
    <div
      onClick={onClick}
      className={`relative px-3.5 py-3.5 border-b border-ink-100 flex gap-3 cursor-pointer transition-colors items-start min-w-0 ${
        isActive ? 'bg-[var(--brand-50)]' : 'hover:bg-ink-50'
      }`}
    >
      {isActive && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-[var(--brand-500)] rounded-r-[2px]" />
      )}
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
        style={{
          background: item.isOverdue
            ? 'linear-gradient(135deg,#FCA5A5,#DC2626)'
            : 'linear-gradient(135deg,var(--brand-300),var(--brand-500))',
        }}
      >
        {initials(name)}
      </div>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[13.5px] text-ink-900 leading-tight truncate">{name}</div>
        <div className="text-[12px] text-ink-600 my-1 truncate">
          {item.assignment.title}
          {item.assignment.topic ? ` · ${item.assignment.topic}` : ''}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold lowercase ${
            badgeType === 'overdue' ? 'bg-danger-50 text-danger-700'
            : badgeType === 'done' ? 'bg-success-50 text-success-700'
            : 'bg-ink-100 text-ink-600'
          }`}>
            {badgeType === 'overdue' ? 'просрочено' : badgeType === 'done' ? 'проверено' : 'сдано'}
          </span>
          {className && <span className="text-[11px] text-ink-500">{className}</span>}
          <span className="text-[11px] text-ink-400">{timeStr}</span>
        </div>
      </div>
    </div>
  )
}

function MiniSelect({
  value, onChange, children, className = '',
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none w-full h-[30px] pl-2.5 pr-7 bg-white border border-ink-200 rounded-full text-[12px] font-semibold text-ink-700 cursor-pointer hover:bg-ink-50 hover:border-ink-300 focus:outline-none focus:border-[var(--brand-300)] focus:shadow-[0_0_0_3px_rgba(255,126,88,0.10)] transition-all"
      >
        {children}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-[65%] w-[6px] h-[6px] border-r-[1.5px] border-b-[1.5px] border-ink-500 rotate-45 pointer-events-none" />
    </div>
  )
}

// ─── Game result card ────────────────────────────────────────────────────────

const GAME_TYPE_LABEL: Record<string, string> = {
  millionaire: 'Миллионер',
  flashcards: 'Флеш-карты',
  memory: 'Memory',
  crossword: 'Кроссворд',
  truefalse: 'Правда или ложь',
}

function GameResultCard({ out, result }: { out: any; result: any }) {
  const label = GAME_TYPE_LABEL[(out?.type || '').toLowerCase()] || 'Мини-игра'
  const url = out?.url as string | undefined
  const topic = out?.topic as string | undefined
  const isWin = result?.outcome === 'win'
  const isLose = result?.outcome === 'lose'
  return (
    <div className="border border-ink-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-brand-50/60 border-b border-brand-100">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">
          <Gamepad2 className="w-3 h-3" /> {label}
        </span>
        {topic && (
          <span className="text-sm text-ink-700">
            <span className="text-ink-500">Тема:</span> <span className="font-semibold">{topic}</span>
          </span>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Открыть игру <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="p-4">
        {result ? (
          <div className={`rounded-xl p-4 border ${isWin ? 'bg-success-50 border-success-200' : isLose ? 'bg-danger-50 border-danger-200' : 'bg-ink-50 border-ink-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              {isWin ? <CheckCircle className="w-4 h-4 text-success-600" />
                : isLose ? <XCircle className="w-4 h-4 text-danger-600" />
                : <CheckCircle className="w-4 h-4 text-ink-500" />}
              <span className={`font-bold text-[14px] ${isWin ? 'text-success-700' : isLose ? 'text-danger-700' : 'text-ink-800'}`}>
                {isWin ? 'Победа' : isLose ? 'Поражение' : 'Игра пройдена'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[13px]">
              {typeof result.score === 'number' && (
                <Stat label="Счёт" value={`${result.score}${typeof result.total === 'number' ? ` / ${result.total}` : ''}`} />
              )}
              {typeof result.moves === 'number' && <Stat label="Ходы" value={result.moves} />}
              {result.time && <Stat label="Время" value={result.time} />}
              {typeof result.winAmount === 'number' && (
                <Stat label="Выигрыш" value={`${result.winAmount.toLocaleString('ru-RU')} ₽`} />
              )}
            </div>
            {result.message && <p className="text-[12px] text-ink-600 italic mt-3">«{result.message}»</p>}
          </div>
        ) : (
          <div className="text-[13px] text-ink-500 italic">Ученик не завершил игру — результата нет.</div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 border border-ink-100">
      <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-semibold mb-0.5">{label}</div>
      <div className="font-bold text-ink-900">{value}</div>
    </div>
  )
}

function SkeletonItem() {
  return (
    <div className="px-3.5 py-3.5 border-b border-ink-100 flex gap-3 items-start animate-pulse">
      <div className="w-9 h-9 rounded-full bg-ink-100 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-3.5 bg-ink-100 rounded-full w-2/3 mb-2" />
        <div className="h-3 bg-ink-100 rounded-full w-full mb-2" />
        <div className="h-3 bg-ink-100 rounded-full w-1/3" />
      </div>
    </div>
  )
}
