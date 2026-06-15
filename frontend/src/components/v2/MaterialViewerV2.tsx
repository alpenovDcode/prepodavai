'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, ChevronRight, FileText, Book, Clock, Pencil, X, Plus,
    Eye, KeyRound, Edit3, MoreHorizontal, Download, Send,
    Loader2, Save, Copy, Printer, Link2, Trash2, Wand2, PenLine,
    HelpCircle, Monitor, CalendarDays, Gamepad2, MessageCircle,
    BookOpen, ClipboardList, ImageIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { Card } from '@/components/ui/v2/Card'
import { cn } from '@/lib/utils/cn'

import AssignMaterialModal from '@/components/AssignMaterialModal'
import DownloadPdfModal from '@/components/workspace/DownloadPdfModal'
import MaterialViewer from '@/components/MaterialViewer'
import { LOGO_BASE64 } from '@/constants/branding'

interface Props {
    lessonId: string
    generationId: string
    isEditable?: boolean
}

interface Generation {
    id: string
    generationType: string
    status: string
    createdAt: string
    title?: string | null
    outputData?: any
    inputParams?: any
}

interface Lesson {
    id: string
    title: string
    topic?: string
    grade?: string
    duration?: number
    createdAt: string
    tags?: string[]
    generations?: Generation[]
}

const HTML_TYPES = new Set([
    'worksheet', 'quiz', 'exam-variant', 'exam_variant',
    'lesson_preparation', 'lesson-preparation',
    'lesson_plan', 'lesson-plan', 'plan',
    'vocabulary', 'content_adaptation', 'content-adaptation', 'content',
    'message', 'feedback', 'unpacking', 'video-analysis', 'video_analysis',
])

const TYPE_LABEL: Record<string, string> = {
    worksheet: 'Рабочий лист',
    quiz: 'Тест',
    'exam-variant': 'Вариант экзамена',
    exam_variant: 'Вариант экзамена',
    lesson_plan: 'План урока',
    'lesson-plan': 'План урока',
    plan: 'План урока',
    lesson_preparation: 'Вау-урок',
    'lesson-preparation': 'Вау-урок',
    vocabulary: 'Словарь',
    content_adaptation: 'Адаптация',
    'content-adaptation': 'Адаптация',
    message: 'Сообщение',
    feedback: 'Обратная связь',
    presentation: 'Презентация',
    image: 'Изображение',
    image_generation: 'Изображение',
    game_generation: 'Игра',
    unpacking: 'Распаковка',
    'video-analysis': 'Видеоанализ',
    video_analysis: 'Видеоанализ',
}

const TYPE_CHIP_CONFIG: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    worksheet: { bg: 'bg-brand-50', text: 'text-brand-700', icon: <FileText className="w-3 h-3" /> },
    quiz: { bg: 'bg-info-50', text: 'text-info-700', icon: <HelpCircle className="w-3 h-3" /> },
    'exam-variant': { bg: 'bg-info-50', text: 'text-info-700', icon: <ClipboardList className="w-3 h-3" /> },
    exam_variant: { bg: 'bg-info-50', text: 'text-info-700', icon: <ClipboardList className="w-3 h-3" /> },
    presentation: { bg: 'bg-success-50', text: 'text-success-700', icon: <Monitor className="w-3 h-3" /> },
    lesson_plan: { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', icon: <CalendarDays className="w-3 h-3" /> },
    'lesson-plan': { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', icon: <CalendarDays className="w-3 h-3" /> },
    plan: { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', icon: <CalendarDays className="w-3 h-3" /> },
    lesson_preparation: { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', icon: <CalendarDays className="w-3 h-3" /> },
    'lesson-preparation': { bg: 'bg-[#EEF2FF]', text: 'text-[#4338CA]', icon: <CalendarDays className="w-3 h-3" /> },
    vocabulary: { bg: 'bg-brand-50', text: 'text-brand-700', icon: <BookOpen className="w-3 h-3" /> },
    image: { bg: 'bg-warning-50', text: 'text-warning-700', icon: <ImageIcon className="w-3 h-3" /> },
    image_generation: { bg: 'bg-warning-50', text: 'text-warning-700', icon: <ImageIcon className="w-3 h-3" /> },
    game_generation: { bg: 'bg-[#F5F3FF]', text: 'text-[#6D28D9]', icon: <Gamepad2 className="w-3 h-3" /> },
    message: { bg: 'bg-ink-100', text: 'text-ink-600', icon: <MessageCircle className="w-3 h-3" /> },
    feedback: { bg: 'bg-ink-100', text: 'text-ink-600', icon: <MessageCircle className="w-3 h-3" /> },
}

const TYPE_TOOL_ROUTE: Record<string, string> = {
    worksheet: '/workspace/worksheet',
    quiz: '/workspace/quiz-generator',
    lesson_plan: '/workspace/lesson-planner',
    'lesson-plan': '/workspace/lesson-planner',
    plan: '/workspace/lesson-planner',
    vocabulary: '/workspace/vocabulary',
    image: '/workspace/image',
    image_generation: '/workspace/image',
}

// Стили строго совпадают с дизайн-системой бэкенда (DesignSystemConfig.STYLES)
// и оригинальным MaterialViewer на проде. AI-генерации сделаны под эти классы.
const IFRAME_BASE_STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f9fafb; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
.container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
.header-logo { width: auto; height: 40px; }
h1 { font-size: 28px; font-weight: 700; color: #111827; }
h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #374151; }
h3 { font-size: 17px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #374151; }
p { margin-bottom: 16px; }
ul, ol { padding-left: 24px; margin-bottom: 20px; }
li { margin-bottom: 8px; }
input[type="text"], textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; font-family: inherit; font-size: inherit; background: white; }
input[type="text"]:focus, textarea:focus { outline: none; border-color: #4f46e5; }
.inline-input { display: inline-block; width: 150px; border: none; border-bottom: 1px solid #9ca3af; border-radius: 0; padding: 0 4px; background: transparent; }
.footer-logo { text-align: right; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
.footer-logo img { width: 120px; opacity: 0.5; }
table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 14px; }
th { background-color: #f9fafb; font-weight: 600; text-align: left; padding: 12px; border: 1px solid #d1d5db; }
td { padding: 12px; border: 1px solid #e5e7eb; vertical-align: top; }
.meta-info { margin-bottom: 30px; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
.callout { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
.teacher-answers-only { margin-top: 40px; padding-top: 20px; border-top: 2px dashed #d1d5db; }
.teacher-answers-only h2 { color: #dc2626; }
`

const MATHJAX_SCRIPT = `<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']],processEscapes:true},chtml:{fontCache:'global'},startup:{typeset:true}};</script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`

const READY_SCRIPT = `<script>window.addEventListener('load',function(){setTimeout(function(){window.parent.postMessage('IFRAME_READY','*')},window.MathJax?1200:300)})</script>`

function stripFences(text: string): string {
    let t = text.trim()
    if (t.startsWith('```')) t = t.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
    return t
}

function extractHtml(outputData: any): string | null {
    if (!outputData) return null
    let raw: any = outputData
    if (typeof raw === 'object') {
        raw = raw.content ?? raw.htmlResult ?? raw.html ?? raw.text ?? ''
    }
    if (typeof raw !== 'string') return null
    raw = stripFences(raw)
    if (!raw) return null
    const m = raw.match(/<\/html>/i)
    if (m && m.index !== undefined) {
        const end = m.index + m[0].length
        if (/<!DOCTYPE\s+html|<html[\s>]/i.test(raw.slice(end))) raw = raw.slice(0, end)
    }
    return raw
}

function buildSrcDoc(html: string, opts: { hideAnswers: boolean; editing: boolean }): string {
    let base = html
        .replace(/LOGO_PLACEHOLDER/g, LOGO_BASE64)
        .replace(/<script[^>]+src=["'][^"']*polyfill\.io[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')

    if (opts.editing) {
        base = base
            .replace(/<script[^>]*>\s*window\.MathJax[\s\S]*?<\/script>/gi, '')
            .replace(/<script[^>]+src=["'][^"']*mathjax[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
    }

    const hasMath = /mathjax/i.test(base)
    const styleBlock = `<style>${IFRAME_BASE_STYLES}${opts.hideAnswers ? '.teacher-answers-only{display:none!important;}' : ''}</style>`
    const headInjection = `${styleBlock}${opts.editing || hasMath ? '' : MATHJAX_SCRIPT}`
    const tailInjection = READY_SCRIPT

    const hasHead = /<head[\s>]/i.test(base)
    const hasBody = /<body[\s>]/i.test(base)
    let out = base
    if (hasHead) {
        out = out.replace(/<head([^>]*)>/i, `<head$1>${headInjection}`)
    } else if (hasBody) {
        out = out.replace(/<body([^>]*)>/i, `<head>${headInjection}</head><body$1`)
    } else {
        // Если AI HTML уже содержит свой .container — не оборачиваем повторно,
        // иначе получим вложенные .container и контент сожмётся в узкую колонку.
        const hasContainer = /class\s*=\s*["'][^"']*\bcontainer\b/i.test(out)
        const body = hasContainer ? out : `<div class="container">${out}</div>`
        return `<!DOCTYPE html><html><head>${headInjection}</head><body>${body}${tailInjection}</body></html>`
    }
    if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${tailInjection}</body>`)
    else out += tailInjection
    return out
}

function typeHasAnswers(t: string) {
    return ['worksheet', 'quiz', 'exam-variant', 'exam_variant', 'lesson_preparation', 'lesson-preparation'].includes(t)
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    } catch { return '' }
}

function getTaskCount(inputParams: any): number | null {
    if (!inputParams) return null
    const n = inputParams.numQuestions ?? inputParams.questionCount ?? inputParams.numTasks ?? inputParams.taskCount ?? inputParams.numWords ?? inputParams.numSlides
    return typeof n === 'number' && n > 0 ? n : null
}

function getTaskCountLabel(inputParams: any, genType: string): string | null {
    if (!inputParams) return null
    const num = inputParams.numQuestions ?? inputParams.questionCount ?? inputParams.numTasks ?? inputParams.taskCount
    if (num && num > 0) {
        const word = (genType === 'quiz' || genType === 'exam-variant' || genType === 'exam_variant') ? 'вопросов' : 'заданий'
        return `${num} ${word}`
    }
    const words = inputParams.numWords
    if (words && words > 0) return `${words} слов`
    const slides = inputParams.numSlides
    if (slides && slides > 0) return `${slides} слайдов`
    return null
}

export default function MaterialViewerV2({ lessonId, generationId, isEditable = true }: Props) {
    const router = useRouter()
    const menu = useMobileMenu()

    const [lesson, setLesson] = useState<Lesson | null>(null)
    const [generation, setGeneration] = useState<Generation | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [titleDraft, setTitleDraft] = useState('')
    const [renaming, setRenaming] = useState(false)
    const [savingTitle, setSavingTitle] = useState(false)

    const [tab, setTab] = useState<'preview' | 'answers' | 'edit'>('preview')
    const [savingHtml, setSavingHtml] = useState(false)

    const [showAssign, setShowAssign] = useState(false)
    const [showPdf, setShowPdf] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    const [tagInput, setTagInput] = useState('')
    const [addingTag, setAddingTag] = useState(false)
    const [tagsSaving, setTagsSaving] = useState(false)
    const [duplicating, setDuplicating] = useState(false)

    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [iframeLoading, setIframeLoading] = useState(true)

    // Fetch
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                setLoading(true)
                setError(null)
                let g: Generation | undefined

                // Skip lesson fetch in v2 navigation where lessonId === generationId
                if (lessonId !== generationId) {
                    try {
                        const res = await apiClient.get(`/lessons/${lessonId}`)
                        if (!cancelled) {
                            const l: Lesson = res.data
                            setLesson(l)
                            g = l.generations?.find(x => x.id === generationId)
                        }
                    } catch {
                        // Lesson not found — fine, will try direct fetch below
                    }
                }

                if (!g) {
                    try {
                        const direct = await apiClient.get(`/generate/${generationId}`)
                        const result = direct.data?.result ?? direct.data?.status?.result
                        if (result || direct.data?.generationType) {
                            g = {
                                id: generationId,
                                generationType: direct.data?.generationType || direct.data?.type || result?.type || '',
                                status: typeof direct.data?.status === 'string' ? direct.data.status : 'completed',
                                createdAt: direct.data?.createdAt || new Date().toISOString(),
                                title: direct.data?.title,
                                outputData: result,
                                inputParams: direct.data?.inputParams ?? null,
                            }
                        }
                    } catch { /* below */ }
                }

                if (cancelled) return
                if (!g) {
                    setError('Материал не найден')
                } else {
                    setGeneration(g)
                }
            } catch (e: any) {
                if (!cancelled) setError(e?.response?.data?.message || 'Не удалось загрузить материал')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [lessonId, generationId])

    // Close ⋯ menu on outside click
    useEffect(() => {
        if (!showMenu) return
        const onDown = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return
            setShowMenu(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [showMenu])

    const html = useMemo(() => extractHtml(generation?.outputData), [generation?.outputData])
    const isHtml = !!html
    const genType = generation?.generationType || ''
    const isHtmlType = isHtml && (HTML_TYPES.has(genType) || isHtml)
    const isImageType = genType === 'image' || genType === 'image_generation' || genType === 'photosession'
    const imageUrl = useMemo(() => {
        if (!isImageType) return null
        const od: any = generation?.outputData
        if (!od) return null
        if (typeof od === 'string') return od.startsWith('http') || od.startsWith('data:') ? od : null
        return od.imageUrl || od.imageUrls?.[0] || od.url || od.image || null
    }, [generation?.outputData, isImageType])
    const showAsLegacy = !!generation && !isHtmlType && !(isImageType && imageUrl)
    const displayTitle = (generation?.title?.trim() || lesson?.title || 'Материал').trim()

    const srcDoc = useMemo(() => {
        if (!html) return ''
        return buildSrcDoc(html, {
            hideAnswers: tab === 'preview',
            editing: tab === 'edit',
        })
    }, [html, tab])

    useEffect(() => {
        setIframeLoading(true)
        const onMsg = (e: MessageEvent) => {
            if (e.data === 'IFRAME_READY') setIframeLoading(false)
        }
        window.addEventListener('message', onMsg)
        const t = setTimeout(() => setIframeLoading(false), 4000)
        return () => { window.removeEventListener('message', onMsg); clearTimeout(t) }
    }, [srcDoc])

    useEffect(() => {
        const doc = iframeRef.current?.contentDocument
        if (!doc?.body) return
        const editing = tab === 'edit'
        doc.body.contentEditable = editing ? 'true' : 'false'
        if (editing) {
            doc.body.style.outline = '2px dashed #FF7E58'
            doc.body.style.outlineOffset = '-2px'
        } else {
            doc.body.style.outline = ''
        }
    }, [tab, srcDoc, iframeLoading])

    // ── actions ──
    const saveEdits = async () => {
        if (!generation || savingHtml) return
        const doc = iframeRef.current?.contentDocument
        const root = doc?.documentElement
        if (!root) { toast.error('Не удалось получить редактируемый HTML'); return }

        let fullHtml = `<!DOCTYPE html>${root.outerHTML}`
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
            .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')

        const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const text = (bodyMatch?.[1] || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
        if (!text) { toast.error('Пустой результат не сохранён'); return }

        setSavingHtml(true)
        try {
            await apiClient.patch(`/generate/${generation.id}`, { outputData: { content: fullHtml } })
            setGeneration(g => g ? { ...g, outputData: { ...(g.outputData || {}), content: fullHtml } } : g)
            toast.success('Сохранено')
            setTab('preview')
        } catch (err: any) {
            const resp = err?.response?.data
            toast.error((Array.isArray(resp?.message) ? resp.message.join('; ') : resp?.message) || 'Не удалось сохранить')
        } finally {
            setSavingHtml(false)
        }
    }

    const saveTitle = async () => {
        if (!generation || savingTitle) return
        const next = titleDraft.trim()
        if (!next) { toast.error('Название не может быть пустым'); return }
        setSavingTitle(true)
        try {
            await apiClient.patch(`/generate/${generation.id}`, { title: next })
            setGeneration(g => g ? { ...g, title: next } : g)
            setRenaming(false)
            toast.success('Название обновлено')
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Не удалось сохранить')
        } finally {
            setSavingTitle(false)
        }
    }

    const addTag = async (raw: string) => {
        const t = raw.trim().toLowerCase().slice(0, 40)
        if (!t || !lesson) return
        const current = lesson.tags || []
        if (current.includes(t)) { setTagInput(''); setAddingTag(false); return }
        if (current.length >= 20) { toast.error('Максимум 20 тегов'); return }
        await saveTags([...current, t])
        setTagInput('')
        setAddingTag(false)
    }

    const removeTag = async (t: string) => {
        if (!lesson) return
        await saveTags((lesson.tags || []).filter(x => x !== t))
    }

    const saveTags = async (tags: string[]) => {
        if (!lesson) return
        setTagsSaving(true)
        try {
            const res = await apiClient.patch<{ tags: string[] }>(`/lessons/${lesson.id}/tags`, { tags })
            setLesson(l => l ? { ...l, tags: res.data.tags } : l)
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Не удалось сохранить теги')
        } finally {
            setTagsSaving(false)
        }
    }

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success('Ссылка скопирована')
        } catch { toast.error('Не удалось скопировать') }
        setShowMenu(false)
    }

    const printMaterial = () => {
        setShowMenu(false)
        window.print()
    }

    const openInGenerator = () => {
        const route = TYPE_TOOL_ROUTE[genType]
        if (route) router.push(route)
        else toast('Открытие в редакторе пока недоступно для этого типа')
        setShowMenu(false)
    }

    const duplicateMaterial = async () => {
        if (!generation || duplicating) return
        setDuplicating(true)
        setShowMenu(false)
        try {
            const res = await apiClient.post<{ id: string }>(`/generate/${generation.id}/duplicate`)
            toast.success('Материал продублирован')
            router.push(`/dashboard/courses/${lessonId}/materials/${res.data.id}`)
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Не удалось дублировать')
        } finally {
            setDuplicating(false)
        }
    }

    const deleteMaterial = async () => {
        if (!generation) return
        if (!confirm('Удалить материал? Действие необратимо.')) return
        try {
            await apiClient.delete(`/generate/${generation.id}`)
            toast.success('Материал удалён')
            router.push('/dashboard/courses')
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Не удалось удалить')
        }
        setShowMenu(false)
    }

    // ── render ──
    if (loading) {
        return (
            <>
                <Topbar title="Загрузка…" onMobileMenuToggle={menu.toggle} hideSearch />
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                </div>
            </>
        )
    }

    if (error || !generation) {
        return (
            <>
                <Topbar title="Материал" onMobileMenuToggle={menu.toggle} hideSearch />
                <div className="max-w-xl mx-auto py-16 px-6 text-center">
                    <h2 className="font-display font-bold text-[20px] text-ink-900 mb-2">{error || 'Материал не найден'}</h2>
                    <Button variant="secondary" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.push('/dashboard/courses')}>
                        К материалам
                    </Button>
                </div>
            </>
        )
    }

    if (showAsLegacy) {
        return (
            <>
                <Topbar
                    title={displayTitle}
                    subtitle={TYPE_LABEL[genType] || genType}
                    onMobileMenuToggle={menu.toggle}
                    hideSearch
                    leading={
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard/courses')}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                            aria-label="Назад"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    }
                />
                <div className="h-[calc(100vh-64px)]">
                    <MaterialViewer lessonId={lessonId} generationId={generationId} isEditable={isEditable} />
                </div>
            </>
        )
    }

    const tags = lesson?.tags || []
    const inputParams = generation.inputParams || {}
    const subject: string | undefined = inputParams.subject || inputParams.discipline
    const grade: string | undefined = lesson?.grade || inputParams.grade || inputParams.level
    const chipConfig = TYPE_CHIP_CONFIG[genType] ?? { bg: 'bg-brand-50', text: 'text-brand-700', icon: <FileText className="w-3 h-3" /> }
    const taskCountLabel = getTaskCountLabel(inputParams, genType)
    const duration: number | undefined = lesson?.duration || (typeof inputParams.duration === 'number' ? inputParams.duration : undefined)

    return (
        <>
            {/* Print CSS: скрываем сайдбар и шапку при Ctrl+P */}
            <style>{`
                @media print {
                    aside, nav, [data-sidebar], .sidebar { display: none !important; }
                    header, [data-topbar] { display: none !important; }
                    .mat-tabs-row, .mat-action-bar { display: none !important; }
                    body { background: white !important; }
                    .print-hide { display: none !important; }
                    .print-frame { box-shadow: none !important; border: none !important; height: auto !important; min-height: auto !important; }
                    iframe.print-frame { height: 100vh !important; }
                }
            `}</style>

            <Topbar
                title={
                    <span className="inline-flex items-center gap-2 text-[13px] text-ink-500 font-medium">
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard/courses')}
                            className="text-ink-500 hover:text-ink-900 transition-colors"
                        >
                            Материалы
                        </button>
                        <ChevronRight className="w-3 h-3 text-ink-300" />
                        <span className="text-ink-900 font-bold text-[15px] truncate max-w-[420px]">{displayTitle}</span>
                    </span>
                }
                onMobileMenuToggle={menu.toggle}
                hideSearch
                leading={
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/courses')}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors print-hide"
                        aria-label="Назад"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                }
                actions={
                    <div className="flex items-center gap-1.5 print-hide">
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Download className="w-3.5 h-3.5" />}
                            onClick={() => setShowPdf(true)}
                            disabled={tab === 'edit'}
                        >
                            Скачать PDF
                        </Button>
                        <Button variant="primary" size="sm" leftIcon={<Send className="w-3.5 h-3.5" />} onClick={() => setShowAssign(true)}>
                            Выдать ученикам
                        </Button>
                        <div className="relative" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => setShowMenu(v => !v)}
                                aria-label="Меню действий"
                                className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 hover:text-ink-900 hover:border-ink-300 transition-colors"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-1.5 min-w-[230px] bg-surface border border-ink-200 rounded-md shadow-lg z-50 p-1.5">
                                    <MenuItem icon={<PenLine className="w-3.5 h-3.5" />} onClick={() => { setRenaming(true); setTitleDraft(displayTitle); setShowMenu(false) }}>Переименовать</MenuItem>
                                    <MenuItem icon={<Copy className="w-3.5 h-3.5" />} onClick={duplicateMaterial} disabled={duplicating}>Дублировать</MenuItem>
                                    <MenuItem icon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => { setTab('edit'); setShowMenu(false) }}>Редактировать в редакторе</MenuItem>
                                    <MenuItem icon={<Wand2 className="w-3.5 h-3.5" />} onClick={openInGenerator}>Открыть в Генераторе</MenuItem>
                                    <MenuItem icon={<Printer className="w-3.5 h-3.5" />} onClick={printMaterial}>Печать</MenuItem>
                                    <MenuItem icon={<Link2 className="w-3.5 h-3.5" />} onClick={copyLink}>Скопировать ссылку</MenuItem>
                                    <div className="h-px bg-ink-100 my-1 mx-0.5" />
                                    <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} danger onClick={deleteMaterial}>Удалить</MenuItem>
                                </div>
                            )}
                        </div>
                    </div>
                }
            />

            <div className="max-w-[1320px] mx-auto px-8 py-6 max-md:px-4">
                {/* Hero */}
                <Card padding="lg" className="mb-5 print-hide">
                    {/* Type chip */}
                    <div className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                        chipConfig.bg, chipConfig.text,
                    )}>
                        {chipConfig.icon}
                        {TYPE_LABEL[genType] || 'Материал'}
                    </div>

                    {/* Title with edit-pencil */}
                    <div className="mt-3 flex items-center gap-2.5 group">
                        {renaming ? (
                            <div className="flex-1 flex items-center gap-2">
                                <input
                                    autoFocus
                                    value={titleDraft}
                                    onChange={e => setTitleDraft(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveTitle()
                                        if (e.key === 'Escape') setRenaming(false)
                                    }}
                                    maxLength={200}
                                    className="flex-1 px-3 py-2 text-[22px] font-display font-bold text-ink-900 bg-ink-50 border border-ink-200 rounded-md focus:outline-none focus:border-brand-400"
                                />
                                <Button size="sm" variant="primary" loading={savingTitle} onClick={saveTitle}>Сохранить</Button>
                                <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Отмена</Button>
                            </div>
                        ) : (
                            <>
                                <h1 className="font-display text-[26px] font-extrabold tracking-tight leading-tight text-ink-900">
                                    {displayTitle}
                                </h1>
                                <button
                                    type="button"
                                    onClick={() => { setRenaming(true); setTitleDraft(displayTitle) }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 inline-flex items-center justify-center rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 hover:border-ink-200 border border-transparent"
                                    title="Переименовать"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Meta */}
                    <div className="mt-3.5 flex items-center gap-2 flex-wrap text-[13px] text-ink-500">
                        {subject && (
                            <span className="inline-flex items-center gap-1.5 text-ink-700 font-semibold">
                                <Book className="w-3.5 h-3.5" /> {subject}
                            </span>
                        )}
                        {grade && (<><span className="text-ink-300">·</span><span>{grade}</span></>)}
                        <span className="text-ink-300">·</span>
                        <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Создано {formatDate(generation.createdAt)}
                        </span>
                        {(taskCountLabel || duration) && (
                            <>
                                <span className="text-ink-300">·</span>
                                <span>
                                    {taskCountLabel}
                                    {taskCountLabel && duration ? ' · ' : ''}
                                    {duration ? `~${duration} минут` : ''}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Tags */}
                    <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
                        {tags.map(t => (
                            <span key={t} className="inline-flex items-center gap-1.5 bg-ink-100 text-ink-700 text-[12px] font-semibold px-2.5 py-1 rounded-full">
                                {t}
                                <button
                                    type="button"
                                    onClick={() => removeTag(t)}
                                    disabled={tagsSaving}
                                    className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full text-ink-500 hover:bg-ink-300 hover:text-ink-900 transition-colors"
                                    aria-label={`Убрать тег ${t}`}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                        {addingTag ? (
                            <form
                                onSubmit={e => { e.preventDefault(); addTag(tagInput) }}
                                className="inline-flex items-center gap-1.5"
                            >
                                <input
                                    autoFocus
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onBlur={() => { if (!tagInput.trim()) setAddingTag(false) }}
                                    onKeyDown={e => { if (e.key === 'Escape') { setAddingTag(false); setTagInput('') } }}
                                    placeholder="Тег"
                                    maxLength={40}
                                    className="px-2 py-0.5 text-[12px] bg-surface border border-brand-300 rounded-full text-ink-900 focus:outline-none focus:border-brand-500 w-[110px]"
                                />
                            </form>
                        ) : tags.length < 20 ? (
                            <button
                                type="button"
                                onClick={() => setAddingTag(true)}
                                className="inline-flex items-center gap-1 bg-transparent border border-dashed border-ink-300 text-ink-500 text-[12px] font-medium px-2.5 py-1 rounded-full hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Добавить тег
                            </button>
                        ) : null}
                    </div>
                </Card>

                {/* Tabs */}
                <div className="flex gap-1 mb-4 border-b border-ink-200 mat-tabs-row print-hide">
                    <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye className="w-4 h-4" />}>Превью</TabBtn>
                    {typeHasAnswers(genType) && (
                        <TabBtn active={tab === 'answers'} onClick={() => setTab('answers')} icon={<KeyRound className="w-4 h-4" />}>С ответами</TabBtn>
                    )}
                    {isEditable && (
                        <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')} icon={<Edit3 className="w-4 h-4" />}>Редактировать</TabBtn>
                    )}

                    {tab === 'edit' && (
                        <div className="ml-auto flex items-center gap-1.5 pb-2">
                            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={() => setTab('preview')} disabled={savingHtml}>
                                Отмена
                            </Button>
                            <Button variant="primary" size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} loading={savingHtml} onClick={saveEdits}>
                                Сохранить
                            </Button>
                        </div>
                    )}
                </div>

                {/* Preview frame */}
                {isImageType && imageUrl ? (
                    <div className="relative bg-white border border-ink-200 rounded-lg overflow-hidden shadow-sm flex items-center justify-center p-6 print-frame">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={imageUrl}
                            alt={displayTitle}
                            className="max-w-full max-h-[80vh] h-auto object-contain rounded-md"
                        />
                    </div>
                ) : srcDoc ? (
                    <div className="relative bg-white border border-ink-200 rounded-lg overflow-hidden shadow-sm print-frame">
                        {iframeLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
                                <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                                    <p className="text-[13px] text-ink-500">Готовим документ…</p>
                                </div>
                            </div>
                        )}
                        <iframe
                            ref={iframeRef}
                            srcDoc={srcDoc}
                            title="material-preview"
                            className="w-full bg-white border-0 print-frame"
                            style={{ minHeight: '600px', height: '80vh' }}
                            sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
                        />
                    </div>
                ) : (
                    <Card padding="lg" className="text-center">
                        <p className="text-ink-500 text-[14px]">Содержимое материала недоступно.</p>
                    </Card>
                )}
            </div>

            {/* Modals */}
            <AssignMaterialModal
                isOpen={showAssign}
                onClose={() => setShowAssign(false)}
                lessonId={lessonId}
                generationId={generation.id}
            />
            <DownloadPdfModal
                isOpen={showPdf}
                onClose={() => setShowPdf(false)}
                generationId={generation.id}
                filename={`${displayTitle.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'material'}.pdf`}
                hasAnswers={typeHasAnswers(genType)}
            />
        </>
    )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'relative inline-flex items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors',
                active ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900',
            )}
        >
            {icon}
            {children}
            {active && <span className="absolute -bottom-px left-3 right-3 h-0.5 rounded bg-brand-500" />}
        </button>
    )
}

function MenuItem({ icon, onClick, children, danger, disabled }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm text-[13.5px] font-medium text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                danger
                    ? 'text-danger-700 hover:bg-danger-50'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
            )}
        >
            {icon}
            {children}
        </button>
    )
}
