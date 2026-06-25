'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ArrowLeft, ChevronDown, FileText, MonitorPlay, Gamepad2, HelpCircle,
    BookOpen, Clock, Cloud, Flame, Save, Send, Paperclip,
    Star, ImageIcon, Loader2, AlertCircle, CheckCircle, ExternalLink, X,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'
import { stripAnswerKey } from '@/lib/strip-answer-key'
import Image from 'next/image'
import { DocumentRenderer } from '@/components/blocks/DocumentRenderer'
import { isJsonBlocksFormat, GenerationDocument as GenerationDocumentSchema } from '@/lib/blocks/schema'

// ─── Типы ────────────────────────────────────────────────────────────────────

interface TeacherInfo {
    firstName?: string | null
    lastName?: string | null
    subject?: string | null
}

interface Generation {
    id: string
    generationType: string
    outputData: any
}

interface Submission {
    id: string
    status: string
    content?: string | null
    attachments?: any[]
    formData?: Record<string, any> | null
    grade?: number | null
    feedback?: string | null
    createdAt: string
}

interface Assignment {
    id: string
    status: string
    dueDate: string | null
    lesson: {
        id: string
        title: string
        topic: string
        user?: TeacherInfo
        generations: Generation[]
    }
    submissions: Submission[]
}

interface StudentProfile {
    streakDays?: number
    xp?: number
    name?: string
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function formatDeadline(dueDate: string) {
    const due = new Date(dueDate)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffH = Math.floor(diffMs / 3600000)
    const isPast = diffMs < 0
    const isUrgent = !isPast && diffH < 24

    const label = isPast
        ? `Просрочено (${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })})`
        : diffH < 1
            ? 'Осталось менее часа!'
            : diffH < 24
                ? `До завтра, ${due.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                : `До ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${due.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`

    return { label, isPast, isUrgent }
}

function getGenIcon(type: string) {
    switch (type) {
        case 'worksheet': return { icon: FileText, tileColor: 'brand' as const }
        case 'presentation': return { icon: MonitorPlay, tileColor: 'warning' as const }
        case 'game': case 'game_generation': return { icon: Gamepad2, tileColor: 'teal' as const }
        case 'quiz': return { icon: HelpCircle, tileColor: 'info' as const }
        default: return { icon: BookOpen, tileColor: 'neutral' as const }
    }
}

function getGenTitle(type: string, outputData: any): string {
    const out = typeof outputData === 'object' && outputData ? outputData : {}
    switch (type) {
        case 'worksheet': {
            const taskCount = countWorksheetTasks(outputData)
            return `Рабочий лист${taskCount ? ` · ${taskCount} заданий` : ''}`
        }
        case 'presentation': {
            const slides = Array.isArray(out?.slides) ? out.slides.length : (out?.slidesCount || 0)
            return `Презентация${slides ? ` · ${slides} слайдов` : ''}`
        }
        case 'game': case 'game_generation': {
            const topic = out?.topic || ''
            return `Игра${topic ? ` «${topic}»` : ''}`
        }
        case 'quiz': {
            const questions = Array.isArray(out?.questions) ? out.questions.length : 0
            return `Тест${questions ? ` · ${questions} вопросов` : ''}`
        }
        default: return 'Учебный материал'
    }
}

function getGenSubtitle(type: string, outputData: any): string {
    const out = typeof outputData === 'object' && outputData ? outputData : {}
    switch (type) {
        case 'worksheet': return '~25 минут · заполните прямо здесь'
        case 'presentation': return 'Посмотри перед выполнением задания'
        case 'game': case 'game_generation': return `Бонус: +50 XP за полное прохождение · опционально`
        case 'quiz': return 'Выберите правильные ответы'
        default: return ''
    }
}

function countWorksheetTasks(outputData: any): number {
    // Пытаемся посчитать кол-во вопросов из HTML-контента
    try {
        const html = extractHtmlFromOutput(outputData)
        if (!html) return 0
        const matches = html.match(/class="(ws-task|q-item|question-item)"/g)
        return matches ? matches.length : 0
    } catch {
        return 0
    }
}

function isOpenByDefault(type: string): boolean {
    return type === 'worksheet' || type === 'quiz'
}

function getStatusBadge(type: string, filled: boolean) {
    if (type === 'game' || type === 'game_generation') {
        return <Badge variant="info">бонус</Badge>
    }
    if (type === 'presentation') {
        return <Badge variant="success">к изучению</Badge>
    }
    if (filled) {
        return <Badge variant="success">заполнено</Badge>
    }
    return <Badge variant="warning">в процессе</Badge>
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export interface StudentAssignmentV2Props {
    assignmentId: string
}

export default function StudentAssignmentV2({ assignmentId }: StudentAssignmentV2Props) {
    const router = useRouter()
    const menu = useStudentMobileMenu()

    const { data: assignment, mutate: mutateAssignment } = useSWR<Assignment>(
        `/assignments/${assignmentId}`,
        fetcher,
    )
    const { data: profile } = useSWR<StudentProfile>('/students/me', fetcher)

    // Accordion open/collapsed state
    const [openSections, setOpenSections] = useState<Set<string>>(new Set())

    // Form data from interactive viewers: { [genId]: { fieldId: value } }
    const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, any>>>({})
    const [fieldCountMap, setFieldCountMap] = useState<Record<string, number>>({})

    // Draft data loaded from localStorage (for InteractiveHtmlViewer initialData)
    const [draftFormDataMap, setDraftFormDataMap] = useState<Record<string, Record<string, any>>>({})

    // Extra textarea + attachments
    const [submissionText, setSubmissionText] = useState('')
    const [attachments, setAttachments] = useState<Array<{ url: string; name: string; type: string }>>([])

    // UI state
    const [draftSaved, setDraftSaved] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Инициализация accordion и черновика
    useEffect(() => {
        if (!assignment) return
        const gens = assignment.lesson.generations
        // Открываем секции по умолчанию
        setOpenSections(new Set(gens.filter(g => isOpenByDefault(g.generationType)).map(g => g.id)))

        // Если есть сдача — загружаем formData из неё
        const sub = assignment.submissions?.[0]
        if (sub) {
            setSubmissionText(sub.content || '')
            setAttachments(sub.attachments || [])
            if (sub.formData) {
                setDraftFormDataMap(sub.formData)
                setFormDataMap(sub.formData)
            }
        } else {
            // Загружаем черновик из localStorage
            try {
                const draftStr = localStorage.getItem(`draft_${assignmentId}`)
                if (draftStr) {
                    const draft = JSON.parse(draftStr)
                    if (draft.submissionText) setSubmissionText(draft.submissionText)
                    if (draft.attachments?.length) setAttachments(draft.attachments)
                    if (draft.formDataMap) {
                        setDraftFormDataMap(draft.formDataMap)
                    }
                }
            } catch {}
        }
    }, [assignment?.id, assignmentId])

    // Прогресс
    const isFilledValue = (v: any) =>
        v === true || typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') || (!!v && typeof v === 'object' && !Array.isArray(v))

    const totalFields = Object.values(fieldCountMap).reduce((s, n) => s + n, 0)
    const filledFields = Object.values(formDataMap).reduce(
        (s, d) => s + Object.values(d).filter(isFilledValue).length, 0
    )
    const progressPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0

    // Автосейв
    useEffect(() => {
        if (!assignment) return
        const sub = assignment.submissions?.[0]
        if (sub?.grade != null) return // read-only

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(async () => {
            if (sub) {
                // Есть существующая сдача — PATCH
                try {
                    await apiClient.patch(`/submissions/${sub.id}`, {
                        content: submissionText || undefined,
                        attachments: attachments.length > 0 ? attachments : undefined,
                        formData: Object.keys(formDataMap).length > 0 ? formDataMap : undefined,
                    })
                    setDraftSaved(true)
                    setTimeout(() => setDraftSaved(false), 2000)
                } catch { /* тихий fail */ }
            } else {
                // Нет сдачи — localStorage
                try {
                    localStorage.setItem(`draft_${assignmentId}`, JSON.stringify({
                        submissionText,
                        attachments,
                        formDataMap,
                    }))
                    setDraftSaved(true)
                    setTimeout(() => setDraftSaved(false), 2000)
                } catch {}
            }
        }, 500)
        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
    }, [formDataMap, submissionText, attachments, assignment?.id, assignmentId])

    const handleFormDataChange = useCallback((genId: string, data: Record<string, any>, count: number) => {
        setFormDataMap(prev => ({ ...prev, [genId]: data }))
        setFieldCountMap(prev => ({ ...prev, [genId]: count }))
    }, [])

    // Listener результата игры. Шаблоны игр после endGame() шлют
    // window.parent.postMessage({ type: 'GAME_RESULT', score, total, ... }).
    // Сопоставляем источник iframe → gen.id, кладём в _game и засчитываем
    // как одно «заполненное поле» для прогресс-бара.
    useEffect(() => {
        if (!assignment) return
        const gens = assignment.lesson.generations
        const gameGens = gens.filter(g => g.generationType === 'game' || g.generationType === 'game_generation')
        if (gameGens.length === 0) return

        const onMessage = (e: MessageEvent) => {
            const data: any = e.data
            if (!data || typeof data !== 'object') return
            if (data.type !== 'GAME_RESULT') return
            // Находим, какой именно игре принадлежит iframe-источник —
            // ищем по совпадению e.source с contentWindow одного из iframe.
            for (const gen of gameGens) {
                const out: any = gen.outputData || {}
                const expectedUrl: string | undefined = out.url
                if (!expectedUrl) continue
                // Простая эвристика: считаем что есть только одна игра в
                // задании ИЛИ совпадает источник по contentWindow.
                const iframes = Array.from(document.querySelectorAll('iframe[title="Игра"]')) as HTMLIFrameElement[]
                const match = iframes.find(i => i.contentWindow === e.source)
                if (gameGens.length === 1 || (match && match.src === expectedUrl)) {
                    const next = {
                        ...(formDataMap[gen.id] || {}),
                        _game: {
                            score: Number(data.score) || 0,
                            total: Number(data.total) || 0,
                            moves: data.moves,
                            time: data.time,
                            outcome: data.outcome,
                            message: data.message,
                            gameType: data.gameType,
                            topic: data.topic,
                            finishedAt: new Date().toISOString(),
                        },
                    }
                    setFormDataMap(prev => ({ ...prev, [gen.id]: next }))
                    setFieldCountMap(prev => ({ ...prev, [gen.id]: 1 }))
                    break
                }
            }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [assignment, formDataMap])

    const toggleSection = (id: string) => {
        setOpenSections(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleForceSave = async () => {
        const sub = assignment?.submissions?.[0]
        if (!sub) {
            try {
                localStorage.setItem(`draft_${assignmentId}`, JSON.stringify({ submissionText, attachments, formDataMap }))
                setDraftSaved(true)
                setTimeout(() => setDraftSaved(false), 2000)
            } catch {}
            return
        }
        try {
            await apiClient.patch(`/submissions/${sub.id}`, {
                content: submissionText || undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
                formData: Object.keys(formDataMap).length > 0 ? formDataMap : undefined,
            })
            setDraftSaved(true)
            setTimeout(() => setDraftSaved(false), 2000)
        } catch {
            setError('Не удалось сохранить')
        }
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        setError(null)
        try {
            await apiClient.post('/submissions', {
                assignmentId,
                content: submissionText || undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
                formData: Object.keys(formDataMap).length > 0 ? formDataMap : undefined,
            })
            localStorage.removeItem(`draft_${assignmentId}`)
            setToast('Работа отправлена!')
            setTimeout(() => router.push('/student/dashboard'), 1200)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Не удалось отправить ответ')
        } finally {
            setSubmitting(false)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return
        const files = Array.from(e.target.files).slice(0, 5 - attachments.length)
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue
            setUploadingImage(true)
            try {
                const fd = new FormData()
                fd.append('file', file)
                const res = await apiClient.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                if (res.data?.url) {
                    setAttachments(prev => [...prev, { url: res.data.url, name: file.name, type: 'image' }])
                }
            } catch { /* ignore */ }
            setUploadingImage(false)
        }
        e.target.value = ''
    }

    // ─── Рендер генерации (тело аккордеона) ──────────────────────────────────

    const renderGenBody = (gen: Generation) => {
        const sub = assignment?.submissions?.[0]
        const isGraded = sub?.grade != null
        const isSubmitted = !!sub

        // Game — встраиваем inline в iframe. Если открывать в новой
        // вкладке (как было), postMessage от внутреннего бриджа не
        // долетает до родителя и результат не сохраняется. Inline-iframe
        // решает проблему: window.parent.postMessage срабатывает, мы
        // ловим GAME_RESULT и кладём в formDataMap[genId]._game.
        if (gen.generationType === 'game' || gen.generationType === 'game_generation') {
            const out = typeof gen.outputData === 'object' && gen.outputData ? gen.outputData : {}
            const gameUrl: string | undefined = out.url
            const gameResult = formDataMap[gen.id]?._game
            if (!gameUrl) {
                return <div className="p-5 text-[13px] text-ink-500">Игра недоступна</div>
            }
            return (
                <div className="p-5">
                    {gameResult && (
                        <div className="mb-3 p-3 rounded-lg bg-success-50 border border-success-500/20 text-[13px] text-success-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            <span>
                                Результат записан: <strong>{gameResult.score}/{gameResult.total}</strong>
                                {gameResult.message ? ` · ${gameResult.message}` : ''}
                            </span>
                        </div>
                    )}
                    <iframe
                        src={gameUrl}
                        title="Игра"
                        className="w-full bg-white border border-ink-200 rounded-md"
                        style={{ height: '70vh', minHeight: 520, border: 'none' }}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-forms"
                    />
                    <div className="mt-2 text-right">
                        <a
                            href={gameUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-700"
                        >
                            Открыть в новой вкладке <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            )
        }

        // Presentation
        if (gen.generationType === 'presentation') {
            let pres: any = gen.outputData
            if (typeof pres === 'string') {
                try { pres = JSON.parse(pres) } catch { pres = {} }
            } else if (pres && typeof pres === 'object' && typeof pres.content === 'string') {
                try { pres = { ...pres, ...JSON.parse(pres.content) } } catch {}
            }
            const pptxUrl: string | undefined = pres?.pptxUrl || pres?.exportUrl
            const pdfUrl: string | undefined = pres?.pdfUrl
            const htmlSlides: any[] = Array.isArray(pres?.slides)
                ? pres.slides.filter((s: any) => typeof s?.html === 'string')
                : []

            if (pptxUrl) {
                return (
                    <div>
                        <iframe
                            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptxUrl)}`}
                            className="w-full bg-white border-t border-ink-100"
                            style={{ height: '60vh', minHeight: 400, border: 'none' }}
                            title="Презентация"
                            allow="fullscreen"
                        />
                        <div className="px-5 py-3 border-t border-ink-100 text-right">
                            <a href={pptxUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning-700 hover:text-warning-700/80">
                                Скачать <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                )
            }
            if (pdfUrl) {
                return (
                    <iframe
                        src={pdfUrl}
                        className="w-full border-t border-ink-100"
                        style={{ height: '60vh', minHeight: 400, border: 'none' }}
                        title="Презентация"
                    />
                )
            }
            if (htmlSlides.length > 0) {
                return (
                    <div className="p-5 space-y-4">
                        {htmlSlides.map((s, i) => (
                            <div key={i} className="rounded-md overflow-hidden border border-ink-200">
                                <iframe
                                    srcDoc={s.html}
                                    className="w-full bg-white"
                                    style={{ height: 420, border: 'none' }}
                                    title={`Слайд ${i + 1}`}
                                    sandbox="allow-scripts allow-same-origin"
                                />
                            </div>
                        ))}
                    </div>
                )
            }
            return (
                <div className="p-5 text-center text-ink-500 text-[13px]">
                    <MonitorPlay className="w-9 h-9 mx-auto text-ink-300 mb-2" />
                    Презентация недоступна
                </div>
            )
        }

        // ── Загруженный материал учителя (PDF / JPG / PNG) ──
        // outputData содержит { fileUrl, mimeType, originalName }.
        // Ученик смотрит файл, ответ записывает в общий блок «Дополнительно
        // к ответам» ниже (textarea + фото) — он рендерится отдельно для всего
        // задания. AI этот тип НЕ проверяет — учитель оценивает вручную.
        if (gen.generationType === 'uploaded_file' || gen.generationType === 'uploadedFile') {
            const out: any = typeof gen.outputData === 'object' && gen.outputData ? gen.outputData : {}
            const fileUrl: string | undefined = out.fileUrl || out.url
            const mimeType: string | undefined = out.mimeType
            const originalName: string | undefined = out.originalName
            if (!fileUrl) {
                return <div className="p-5 text-[13px] text-ink-500">Файл недоступен</div>
            }
            const filePreview = mimeType === 'application/pdf' ? (
                <iframe
                    src={fileUrl}
                    title={originalName || 'Материал'}
                    className="w-full bg-white border border-ink-200 rounded-md"
                    style={{ height: '75vh', minHeight: 520, border: 'none' }}
                />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={fileUrl}
                    alt={originalName || 'Материал'}
                    className="max-w-full max-h-[75vh] h-auto object-contain rounded-md border border-ink-200 bg-white"
                />
            )
            return (
                <div className="p-5 flex flex-col gap-3">
                    {filePreview}
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
                        <span className="font-bold">Как сдать:</span>
                        <span>
                            Запиши решение в поле «Дополнительно к ответам» ниже или прикрепи фото своей работы.
                            Эту работу проверит учитель вручную — автопроверка ИИ для этого материала не запускается.
                        </span>
                    </div>
                    <div className="text-right">
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-700">
                            Открыть файл в новой вкладке <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            )
        }

        // ── JSON blocks-v1 формат ──
        // Новый pipeline: рендерим DocumentRenderer с управляемыми блоками.
        // Ответы ученика хранятся в том же `draftFormDataMap[gen.id]` (для
        // совместимости с отправкой), но как карта { blockId: value }.
        if (isJsonBlocksFormat(gen.outputData)) {
            const parsed = GenerationDocumentSchema.safeParse(gen.outputData.outputDoc)
            if (parsed.success) {
                const doc = parsed.data
                // Источник истины — live state `formDataMap` (обновляется при
                // каждом keystroke). `draftFormDataMap` — только начальная
                // подгрузка из localStorage. Если читать здесь draftFormDataMap,
                // input навсегда зависает в стартовом значении.
                const existingAnswers = (isSubmitted || isGraded)
                    ? (sub?.formData?.[gen.id] || {})
                    : (formDataMap[gen.id] || draftFormDataMap[gen.id] || {})
                const editable = !isSubmitted && !isGraded
                // Подсчёт интерактивных блоков для прогресс-бара
                // (формула "X из Y заполнено" в шапке задания).
                const interactiveCount = doc.blocks.filter(b =>
                    b.type === 'fill-blank' || b.type === 'multiple-choice' ||
                    b.type === 'short-answer' || b.type === 'matching'
                ).length
                return (
                    <div className="p-5">
                        <DocumentRenderer
                            doc={doc}
                            answers={existingAnswers}
                            onAnswerChange={editable ? (blockId, value) => {
                                const next = { ...existingAnswers, [blockId]: value }
                                handleFormDataChange(gen.id, next, interactiveCount)
                            } : undefined}
                            // Ученик никогда не видит ключ ответов.
                            showAnswers={false}
                        />
                    </div>
                )
            }
        }

        // HTML-based (worksheet, quiz, other)
        const rawHtml = extractHtmlFromOutput(gen.outputData)
        const html = rawHtml ? stripAnswerKey(rawHtml) : null

        if (html) {
            if (isGraded && sub?.formData?.[gen.id]) {
                return (
                    <div className="p-5">
                        <InteractiveHtmlViewer
                            html={html}
                            generationId={gen.id}
                            readOnly
                            prefillData={sub.formData[gen.id]}
                        />
                    </div>
                )
            }
            if (isSubmitted && sub?.formData?.[gen.id]) {
                return (
                    <div className="p-5">
                        <InteractiveHtmlViewer
                            html={html}
                            generationId={gen.id}
                            readOnly
                            prefillData={sub.formData[gen.id]}
                        />
                    </div>
                )
            }
            return (
                <div className="p-5">
                    <InteractiveHtmlViewer
                        html={html}
                        generationId={gen.id}
                        onFormDataChange={handleFormDataChange}
                        initialData={draftFormDataMap[gen.id]}
                        readOnly={isGraded}
                    />
                </div>
            )
        }

        // Текстовый fallback
        const out = gen.outputData
        let rawText: string | null = null
        if (typeof out === 'string') rawText = out
        else if (out && typeof out === 'object') rawText = out.content || out.text || out.markdown || null

        if (!rawText && out && typeof out === 'object' && (out.url || out.downloadUrl)) {
            const href: string = out.url || out.downloadUrl
            return (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                    <BookOpen className="w-9 h-9 text-ink-300" />
                    <a href={href} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded-lg hover:bg-brand-600 transition">
                        Открыть <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            )
        }

        return (
            <div className="p-5 text-ink-700 text-[13px] leading-relaxed whitespace-pre-wrap">
                {rawText ? stripAnswerKey(rawText) : 'Материал недоступен'}
            </div>
        )
    }

    // ─── Загрузка ─────────────────────────────────────────────────────────────

    if (!assignment) {
        return (
            <>
                <Topbar
                    title="Задание"
                    hideSearch
                    notificationsAudience="student"
                    onMobileMenuToggle={menu.toggle}
                    leading={
                        <button
                            onClick={() => router.push('/student/dashboard')}
                            className="w-8 h-8 flex items-center justify-center rounded border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 transition"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    }
                />
                <div className="flex items-center justify-center py-24 text-ink-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            </>
        )
    }

    const sub = assignment.submissions?.[0]
    const isGraded = sub?.grade != null
    const isSubmitted = !!sub
    const gens = assignment.lesson.generations
    const teacher = assignment.lesson.user
    const teacherName = teacher
        ? [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || 'Учитель'
        : 'Учитель'
    const subject = teacher?.subject || assignment.lesson.topic || ''
    const streakDays = profile?.streakDays ?? 0

    const deadline = assignment.dueDate ? formatDeadline(assignment.dueDate) : null
    // Раньше требовалось хоть одно непустое поле/текст/вложение. На практике
    // postMessage из sandboxed iframe в некоторых браузерах не пропускал
    // origin-чек, и кнопка ложно блокировалась при заполненных полях.
    // Решение — разрешать сдачу, если работа ещё не оценена. Бэк всё равно
    // приймет formData и текст как они есть.
    const canSubmit = !isGraded

    return (
        <>
            {/* ── Topbar ── */}
            <Topbar
                title="Задание"
                hideSearch
                notificationsAudience="student"
                onMobileMenuToggle={menu.toggle}
                leading={
                    <button
                        onClick={() => router.push('/student/dashboard')}
                        className="w-8 h-8 flex items-center justify-center rounded border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 transition"
                        aria-label="Назад"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                }
                actions={
                    streakDays > 0 ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-50 text-warning-700 rounded-full text-[12px] font-semibold">
                            <div className="w-5 h-5 flex items-center justify-center bg-warning-500 rounded-full">
                                <Flame className="w-3 h-3 text-white" />
                            </div>
                            {streakDays} {streakDays === 1 ? 'день' : streakDays < 5 ? 'дня' : 'дней'} подряд
                        </div>
                    ) : undefined
                }
            />

            {/* ── Контент ── */}
            <div className="max-w-[880px] mx-auto w-full px-6 py-6 pb-28 max-md:px-4">

                {/* ── Оценка (read-only banner) ── */}
                {isGraded && sub && (
                    <div className="mb-5 p-4 rounded-xl border border-success-500/30 bg-success-50 flex flex-wrap items-start gap-4">
                        <CheckCircle className="w-5 h-5 text-success-700 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="font-bold text-success-700">Работа проверена · Оценка: <span className="text-xl">{sub.grade}</span></p>
                            {sub.feedback && (
                                <p className="text-[13px] text-success-700/80 mt-1">{sub.feedback}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Hero ── */}
                <div className="bg-surface border border-ink-200 rounded-xl p-6 mb-5">
                    {/* crumb-row */}
                    <div className="flex items-center gap-1.5 text-[12px] text-ink-500 mb-3">
                        <button onClick={() => router.push('/student/assignments')} className="hover:text-ink-900 transition">Задания</button>
                        <ChevronDown className="w-3 h-3 -rotate-90" />
                        <span>{subject || assignment.lesson.topic}</span>
                    </div>

                    {/* title-row */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <h1 className="font-display font-extrabold text-[22px] leading-tight text-ink-900 tracking-tight">
                            {assignment.lesson.title}
                        </h1>
                        {deadline && (
                            <span className={[
                                'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold flex-shrink-0',
                                deadline.isPast
                                    ? 'bg-danger-50 text-danger-700'
                                    : deadline.isUrgent
                                        ? 'bg-warning-50 text-warning-700'
                                        : 'bg-ink-100 text-ink-600',
                            ].join(' ')}>
                                <Clock className="w-3 h-3" />
                                {deadline.label}
                            </span>
                        )}
                    </div>

                    {/* meta */}
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-500">
                        {subject && (
                            <span className="bg-ink-100 text-ink-700 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">{subject}</span>
                        )}
                        <span>от {teacherName}</span>
                        <span>·</span>
                        <span>{gens.length} {gens.length === 1 ? 'материал' : gens.length < 5 ? 'материала' : 'материалов'}</span>
                    </div>

                    {/* progress-wrap */}
                    <div className="mt-5 bg-ink-50 rounded-md px-4 py-3 flex items-center gap-3.5">
                        <span className="font-display font-extrabold text-[15px] text-ink-900 tabular-nums whitespace-nowrap">
                            {filledFields}/{totalFields || '?'}
                        </span>
                        <div className="flex-1 h-2 bg-ink-200 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                    width: `${progressPct}%`,
                                    background: 'linear-gradient(90deg, var(--brand-400), var(--brand-600))',
                                }}
                            />
                        </div>
                        <span className="text-[12px] text-ink-500">Заполнено</span>
                        {draftSaved && (
                            <span className="text-[12px] text-success-700 flex items-center gap-1 whitespace-nowrap">
                                <Cloud className="w-3.5 h-3.5" />
                                {isSubmitted ? 'Сохранено' : 'Черновик сохранён'}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Аккордеоны материалов ── */}
                {gens.map(gen => {
                    const isOpen = openSections.has(gen.id)
                    const { icon: GenIcon, tileColor } = getGenIcon(gen.generationType)
                    const isFilled = (fieldCountMap[gen.id] ?? 0) > 0 &&
                        Object.values(formDataMap[gen.id] ?? {}).filter(isFilledValue).length > 0

                    return (
                        <div
                            key={gen.id}
                            className="bg-surface border border-ink-200 rounded-lg mb-3.5 overflow-hidden"
                        >
                            {/* acc-head */}
                            <button
                                type="button"
                                onClick={() => toggleSection(gen.id)}
                                className={[
                                    'w-full flex items-center gap-3.5 px-5 py-[18px] text-left transition-colors hover:bg-ink-50',
                                    isOpen ? 'border-b border-ink-100' : '',
                                ].join(' ')}
                            >
                                <IconTile color={tileColor} size="lg">
                                    <GenIcon className="w-5 h-5" />
                                </IconTile>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-[14px] text-ink-900 leading-tight">
                                        {getGenTitle(gen.generationType, gen.outputData)}
                                    </div>
                                    <div className="text-[12px] text-ink-500 mt-0.5">
                                        {getGenSubtitle(gen.generationType, gen.outputData)}
                                    </div>
                                </div>
                                {getStatusBadge(gen.generationType, isFilled)}
                                <div className={[
                                    'w-7 h-7 flex items-center justify-center text-ink-400 transition-transform duration-200 flex-shrink-0',
                                    isOpen ? 'rotate-180' : '',
                                ].join(' ')}>
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </button>

                            {/* acc-body */}
                            {isOpen && (
                                <div>{renderGenBody(gen)}</div>
                            )}
                        </div>
                    )
                })}

                {/* ── Extra block ── */}
                {!isGraded && (
                    <div className="bg-surface border border-ink-200 rounded-lg p-5 mt-6">
                        <h3 className="text-[14px] font-bold text-ink-900 mb-3">Дополнительно к ответам</h3>
                        <textarea
                            value={submissionText}
                            onChange={e => setSubmissionText(e.target.value)}
                            placeholder="Если нужно — напиши решение, объяснение или вопрос учителю…"
                            className="w-full min-h-[80px] px-3.5 py-3 border border-ink-200 rounded-md font-[inherit] text-[14px] text-ink-900 resize-y focus:outline-none focus:border-brand-400 focus:shadow-[0_0_0_3px_rgba(255,126,88,0.12)] mb-3"
                            disabled={isGraded}
                        />

                        {/* Upload strip */}
                        {attachments.length < 5 && (
                            <div
                                className="flex items-center gap-2 px-3 py-2.5 bg-ink-50 border border-dashed border-ink-300 rounded-md mb-3 cursor-pointer hover:bg-brand-50 hover:border-brand-300 transition-all"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="w-8 h-8 bg-surface rounded flex items-center justify-center text-ink-500">
                                    <Paperclip className="w-4 h-4" />
                                </div>
                                <div className="flex-1 text-[12px] text-ink-600">
                                    <strong className="text-ink-900">Прикрепить фото</strong> · решения на бумаге, скриншоты (до 5 файлов)
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-ink-700 bg-surface border border-ink-200 rounded-md hover:bg-ink-50 transition"
                                    disabled={uploadingImage}
                                >
                                    {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                                    Выбрать
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>
                        )}

                        {/* Prewiew attachments */}
                        {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {attachments.map((a, i) => (
                                    <div key={i} className="relative group">
                                        <img src={a.url} alt="Preview" className="h-20 w-20 object-cover rounded-md border border-ink-200" />
                                        <button
                                            onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reward note */}
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[12px] text-warning-700"
                            style={{ background: 'linear-gradient(135deg,#FFFBEB,#FFFFFF)', border: '1px solid #FCD34D' }}>
                            <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>Сдай вовремя — получишь <strong className="text-warning-700">+30 XP</strong> и сохранишь стрик!</span>
                        </div>
                    </div>
                )}

                {/* Ошибка */}
                {error && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-danger-50 rounded-lg border border-danger-500/20">
                        <AlertCircle className="w-4 h-4 text-danger-500 flex-shrink-0" />
                        <p className="text-[13px] text-danger-700">{error}</p>
                    </div>
                )}

                {/* ── Submit bar (sticky) ── */}
                {!isGraded && (
                    <div
                        className="sticky bottom-4 mt-4 flex items-center gap-3 z-10 min-h-[56px]"
                        style={{
                            background: 'rgba(255,255,255,0.9)',
                            backdropFilter: 'blur(14px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                            border: '1px solid var(--ink-200)',
                            borderRadius: 'var(--r-full, 9999px)',
                            padding: '8px 8px 8px 20px',
                            boxShadow: '0 -4px 16px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.10)',
                        }}
                    >
                        <span className="flex-1 flex items-center gap-1.5 text-[13px] text-ink-600 min-w-0">
                            <Cloud className="w-3.5 h-3.5 text-success-700 flex-shrink-0" />
                            {draftSaved ? 'Сохранено · ' : 'Черновик · '}
                            <span className="font-bold text-ink-800 tabular-nums">{filledFields} / {totalFields || '?'}</span>
                        </span>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Save className="w-3.5 h-3.5" />}
                            onClick={handleForceSave}
                            disabled={submitting}
                        >
                            Сохранить
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            leftIcon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            onClick={handleSubmit}
                            disabled={submitting || !canSubmit}
                        >
                            {submitting ? 'Отправка…' : 'Отправить учителю'}
                        </Button>
                    </div>
                )}
            </div>

            {/* ── Toast ── */}
            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white text-[14px] font-semibold px-5 py-3 rounded-full shadow-xl flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success-500" />
                    {toast}
                </div>
            )}
        </>
    )
}
