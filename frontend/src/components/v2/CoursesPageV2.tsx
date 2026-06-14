'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Layers, FileText, HelpCircle, Presentation, ClipboardList, ImageIcon, Gamepad2,
    Plus, Compass, LayoutGrid, List, MoreHorizontal, Eye, Edit3, PenLine,
    Copy, Download, Send, Trash2, Book, Wand2, RefreshCw, Link2, QrCode,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

// ── Типы ──────────────────────────────────────────────────────────────────────

interface Generation {
    id: string
    type: string
    title: string | null
    status: string
    params: Record<string, any> | null
    createdAt: string
}

interface HistoryResponse {
    success: boolean
    items: Generation[]
    total: number
    counts: Record<string, number>
}

// ── Конфиг типов (цвета, иконки, метки) ─────────────────────────────────────

const TYPE_CONFIG: Record<string, {
    label: string
    pillLabel: string
    chipBg: string
    chipText: string
    hoverBorder: string
    Icon: React.ComponentType<{ className?: string }>
}> = {
    worksheet: {
        label: 'Рабочий лист',
        pillLabel: 'Рабочие листы',
        chipBg: 'bg-[var(--brand-50)]',
        chipText: 'text-[var(--brand-700)]',
        hoverBorder: 'hover:border-[var(--brand-300)]',
        Icon: FileText,
    },
    quiz: {
        label: 'Тест',
        pillLabel: 'Тесты',
        chipBg: 'bg-[#EFF6FF]',
        chipText: 'text-[#1D4ED8]',
        hoverBorder: 'hover:border-[#93C5FD]',
        Icon: HelpCircle,
    },
    presentation: {
        label: 'Презентация',
        pillLabel: 'Презентации',
        chipBg: 'bg-[#FFFBEB]',
        chipText: 'text-[#B45309]',
        hoverBorder: 'hover:border-[#FCD34D]',
        Icon: Presentation,
    },
    lessonPlan: {
        label: 'План урока',
        pillLabel: 'Планы уроков',
        chipBg: 'bg-[#EEF2FF]',
        chipText: 'text-[#4338CA]',
        hoverBorder: 'hover:border-[#A5B4FC]',
        Icon: ClipboardList,
    },
    image: {
        label: 'Изображение',
        pillLabel: 'Изображения',
        chipBg: 'bg-[#FDF4FF]',
        chipText: 'text-[#A21CAF]',
        hoverBorder: 'hover:border-[#E879F9]',
        Icon: ImageIcon,
    },
    game: {
        label: 'Игра',
        pillLabel: 'Игры',
        chipBg: 'bg-[#F0FDFA]',
        chipText: 'text-[#0F766E]',
        hoverBorder: 'hover:border-[#5EEAD4]',
        Icon: Gamepad2,
    },
    vocabulary: {
        label: 'Словарь',
        pillLabel: 'Словари',
        chipBg: 'bg-[#ECFDF5]',
        chipText: 'text-[#047857]',
        hoverBorder: 'hover:border-[#6EE7B7]',
        Icon: Book,
    },
}

const PILL_TYPES = ['worksheet', 'quiz', 'presentation', 'lessonPlan', 'image', 'game'] as const

const SUBJECTS = [
    'Математика', 'Физика', 'Химия', 'Биология',
    'История', 'Литература', 'Английский язык', 'География',
]

// ── Хелперы ──────────────────────────────────────────────────────────────────

function normalizeType(dbType: string): string {
    const map: Record<string, string> = {
        worksheet: 'worksheet',
        quiz: 'quiz',
        presentation: 'presentation',
        'lesson-plan': 'lessonPlan',
        lesson_plan: 'lessonPlan',
        lessonPlan: 'lessonPlan',
        image_generation: 'image',
        image: 'image',
        game_generation: 'game',
        game: 'game',
        vocabulary: 'vocabulary',
    }
    return map[dbType] || dbType
}

function getTitle(gen: Generation): string {
    if (gen.title) return gen.title
    const p = gen.params
    if (!p) return TYPE_CONFIG[normalizeType(gen.type)]?.label || gen.type
    if (typeof p.topic === 'string' && p.topic) return p.topic
    if (typeof p.title === 'string' && p.title) return p.title
    if (p.subject && p.grade) return `${p.subject}, ${p.grade} класс`
    return TYPE_CONFIG[normalizeType(gen.type)]?.label || gen.type
}

function getSubject(gen: Generation): string {
    const p = gen.params
    if (!p) return ''
    return typeof p.subject === 'string' ? p.subject : ''
}

function getTags(gen: Generation): string[] {
    const p = gen.params
    if (!p) return []
    const tags: string[] = []
    if (typeof p.topic === 'string' && p.topic) tags.push(p.topic)
    if (p.grade) tags.push(`${p.grade} класс`)
    if (p.numQuestions) tags.push(`${p.numQuestions} вопросов`)
    if (p.numWords) tags.push(`${p.numWords} слов`)
    if (p.numSlides) tags.push(`${p.numSlides} слайдов`)
    return tags.slice(0, 3)
}

function relativeDate(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (days === 0) return 'сегодня'
    if (days === 1) return 'вчера'
    if (days === 2) return '2 дня назад'
    if (days === 3) return '3 дня назад'
    if (days <= 6) return `${days} дней назад`
    if (days === 7) return 'неделю назад'
    if (days <= 13) return `${days} дней назад`
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// ── Компонент фильтр-пилюли ──────────────────────────────────────────────────

function FilterPill({
    active, count, children, onClick,
}: {
    active: boolean
    count: number
    children: React.ReactNode
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-2 h-[38px] px-4 rounded-full font-semibold text-[14px] border transition-all duration-150 whitespace-nowrap',
                active
                    ? 'bg-[var(--brand-50)] border-[var(--brand-300)] text-[var(--brand-800)] shadow-sm'
                    : 'bg-surface border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 hover:text-ink-900',
            )}
        >
            {children}
            <span className={cn(
                'px-[9px] py-[2px] rounded-full text-[12px] font-bold tabular-nums',
                active ? 'bg-[var(--brand-100)] text-[var(--brand-700)]' : 'bg-ink-100 text-ink-600',
            )}>
                {count}
            </span>
        </button>
    )
}

// ── Контекстное меню карточки ─────────────────────────────────────────────────

function CardMenu({
    genId, type, onDelete,
}: {
    genId: string
    type: string
    onDelete: () => void
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const stop = (e: React.MouseEvent) => e.stopPropagation()

    const action = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation()
        setOpen(false)
        fn()
    }

    return (
        <div ref={ref} className="relative" onClick={stop}>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
                className="w-[30px] h-[30px] rounded-md border-none bg-transparent text-ink-400 cursor-pointer inline-flex items-center justify-center transition-all duration-150 hover:bg-ink-100 hover:text-ink-900"
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 bg-surface border border-ink-200 rounded-lg shadow-[0_12px_32px_rgba(15,23,42,0.12)] py-1.5 min-w-[200px] z-[100]">
                    <MenuItem icon={<Eye />} onClick={action(() => router.push(`/dashboard/courses/${genId}/materials/${genId}`))}>Открыть</MenuItem>
                    <MenuItem icon={<Edit3 />} onClick={action(() => router.push(`/dashboard/courses/${genId}/materials/${genId}`))}>Редактировать</MenuItem>
                    <MenuItem icon={<PenLine />} onClick={action(() => toast('Переименование — скоро будет'))}>Переименовать</MenuItem>
                    <MenuItem icon={<Copy />} onClick={action(() => toast('Дублирование — скоро будет'))}>Дублировать</MenuItem>
                    {type === 'presentation' ? (
                        <>
                            <MenuItem icon={<Download />} onClick={action(() => toast('Скачать PPTX — скоро'))}>Скачать PPTX</MenuItem>
                            <MenuItem icon={<Download />} onClick={action(() => window.open(`/api/generate/${genId}/pdf`, '_blank'))}>Скачать PDF</MenuItem>
                        </>
                    ) : type === 'image' ? (
                        <>
                            <MenuItem icon={<RefreshCw />} onClick={action(() => toast('Регенерация — скоро'))}>Сгенерировать ещё</MenuItem>
                            <MenuItem icon={<Download />} onClick={action(() => window.open(`/api/generate/${genId}/image`, '_blank'))}>Скачать PNG</MenuItem>
                        </>
                    ) : type === 'game' ? (
                        <>
                            <MenuItem icon={<Link2 />} onClick={action(() => toast('Ссылка скопирована'))}>Скопировать ссылку</MenuItem>
                            <MenuItem icon={<QrCode />} onClick={action(() => toast('QR — скоро'))}>Показать QR</MenuItem>
                        </>
                    ) : (
                        <>
                            <MenuItem icon={<Download />} onClick={action(() => window.open(`/api/generate/${genId}/pdf`, '_blank'))}>Скачать PDF</MenuItem>
                            <MenuItem icon={<Send />} onClick={action(() => toast('Выдача заданий — скоро'))}>Выдать ученикам</MenuItem>
                        </>
                    )}
                    <div className="h-px bg-ink-100 my-1 mx-0.5" />
                    <MenuItem
                        icon={<Trash2 />}
                        danger
                        onClick={action(() => {
                            if (confirm('Удалить этот материал? Это действие нельзя отменить.')) onDelete()
                        })}
                    >
                        Удалить
                    </MenuItem>
                </div>
            )}
        </div>
    )
}

function MenuItem({ icon, children, onClick, danger }: {
    icon: React.ReactNode
    children: React.ReactNode
    onClick: (e: React.MouseEvent) => void
    danger?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2.5 w-full px-2.5 py-2 border-none bg-transparent rounded-md text-[13px] font-medium cursor-pointer text-left transition-colors duration-100',
                danger
                    ? 'text-[var(--danger-700)] hover:bg-[var(--danger-50)]'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
            )}
        >
            <span className="w-3.5 h-3.5 flex-shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
            {children}
        </button>
    )
}

// ── Карточка материала ────────────────────────────────────────────────────────

function MatCard({ gen, onDelete }: { gen: Generation; onDelete: () => void }) {
    const router = useRouter()
    const ft = normalizeType(gen.type)
    const cfg = TYPE_CONFIG[ft] || TYPE_CONFIG['worksheet']
    const title = getTitle(gen)
    const subject = getSubject(gen)
    const tags = getTags(gen)

    return (
        <div
            onClick={() => router.push(`/dashboard/courses/${gen.id}/materials/${gen.id}`)}
            className={cn(
                'bg-surface border border-ink-200 rounded-lg p-[18px_18px_14px] cursor-pointer',
                'transition-all duration-200 flex flex-col gap-3.5 relative',
                'hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5',
                cfg.hoverBorder,
            )}
        >
            {/* Head: type-chip + menu */}
            <div className="flex justify-between items-start">
                <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.04em]',
                    cfg.chipBg, cfg.chipText,
                )}>
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                </span>
                <CardMenu genId={gen.id} type={ft} onDelete={onDelete} />
            </div>

            {/* Title */}
            <h3 className="font-display text-[16px] font-bold leading-snug text-ink-900 line-clamp-2 m-0">
                {title}
            </h3>

            {/* Tags */}
            {tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                    {tags.map(tag => (
                        <span key={tag} className="bg-ink-50 text-ink-600 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]">
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Meta */}
            <div className="flex items-center gap-2 text-[12px] text-ink-500 mt-auto pt-3 border-t border-ink-100">
                {subject && (
                    <>
                        <span className="font-semibold text-ink-700 flex items-center gap-1">
                            <Book className="w-3 h-3" />
                            {subject}
                        </span>
                        <span>·</span>
                    </>
                )}
                <span>{relativeDate(gen.createdAt)}</span>
            </div>
        </div>
    )
}

// ── Строка материала (list view) ──────────────────────────────────────────────

function MatListRow({ gen, onDelete }: { gen: Generation; onDelete: () => void }) {
    const router = useRouter()
    const ft = normalizeType(gen.type)
    const cfg = TYPE_CONFIG[ft] || TYPE_CONFIG['worksheet']
    const title = getTitle(gen)
    const subject = getSubject(gen)
    const tags = getTags(gen)

    return (
        <div
            onClick={() => router.push(`/dashboard/courses/${gen.id}/materials/${gen.id}`)}
            className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-ink-50 transition-colors group"
        >
            <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.04em] flex-shrink-0',
                cfg.chipBg, cfg.chipText,
            )}>
                <cfg.Icon className="w-2.5 h-2.5" />
                {cfg.label}
            </span>
            <h3 className="font-semibold text-[14px] text-ink-900 flex-1 min-w-0 truncate">
                {title}
            </h3>
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                {tags.slice(0, 2).map(tag => (
                    <span key={tag} className="bg-ink-50 text-ink-500 text-[11px] font-medium px-2 py-0.5 rounded">
                        {tag}
                    </span>
                ))}
            </div>
            {subject && (
                <span className="hidden lg:inline text-[12px] text-ink-500 font-medium flex-shrink-0 w-28 truncate">
                    {subject}
                </span>
            )}
            <span className="text-[12px] text-ink-400 flex-shrink-0 w-24 text-right">
                {relativeDate(gen.createdAt)}
            </span>
            <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                <CardMenu genId={gen.id} type={ft} onDelete={onDelete} />
            </div>
        </div>
    )
}

// ── Главный компонент ─────────────────────────────────────────────────────────

export default function CoursesPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()
    const tour = useTour()

    const [items, setItems] = useState<Generation[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)

    const [activeType, setActiveType] = useState<string>('all')
    const [subject, setSubject] = useState('')
    const [period, setPeriod] = useState('all')
    const [sort, setSort] = useState('newest')
    const [query, setQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 250)
        return () => clearTimeout(t)
    }, [query])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, string> = { limit: '200' }
            if (activeType !== 'all') params.type = activeType
            if (period !== 'all') params.period = period
            if (debouncedQuery) params.search = debouncedQuery
            if (sort !== 'newest') params.sort = sort

            const qs = new URLSearchParams(params).toString()
            const res = await apiClient.get<HistoryResponse>(`/generate/history?${qs}`)
            if (res.data?.success) {
                setItems(res.data.items || [])
                setCounts(res.data.counts || {})
            }
        } catch {
            toast.error('Не удалось загрузить материалы')
        } finally {
            setLoading(false)
        }
    }, [activeType, period, debouncedQuery, sort])

    useEffect(() => { load() }, [load])

    const totalCount = useMemo(() => Object.values(counts).reduce((s, n) => s + n, 0), [counts])

    // Client-side subject filter
    const filtered = useMemo(() => {
        if (!subject) return items
        return items.filter(g => getSubject(g).toLowerCase() === subject.toLowerCase())
    }, [items, subject])

    const handleDelete = useCallback(async (id: string) => {
        try {
            await apiClient.delete(`/generate/${id}`)
            setItems(prev => prev.filter(g => g.id !== id))
            toast.success('Материал удалён')
        } catch {
            toast.error('Не удалось удалить материал')
        }
    }, [])

    const resetFilters = () => {
        setActiveType('all')
        setSubject('')
        setPeriod('all')
        setSort('newest')
        setQuery('')
    }

    return (
        <>
            <Topbar
                title="Материалы"
                subtitle="Все, что вы создали в ИИ Генераторе. Найти, открыть, отредактировать."
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Compass className="w-4 h-4" />}
                            onClick={tour.start}
                        >
                            Тур
                        </Button>
                        <Button
                            data-tour="create-btn"
                            variant="primary"
                            size="sm"
                            leftIcon={<Plus className="w-4 h-4" />}
                            onClick={() => router.push('/workspace')}
                        >
                            Создать новый
                        </Button>
                    </div>
                }
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Search bar */}
                <div data-tour="search" className="mb-4 relative">
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Найти по названию или теме…"
                        className={cn(
                            'w-full sm:w-[420px] h-[38px] pl-10 pr-12 rounded-full text-[14px]',
                            'bg-surface border border-ink-200 text-ink-900 placeholder:text-ink-500',
                            'focus:outline-none focus:border-[var(--brand-300)] focus:ring-[3px] focus:ring-[rgba(255,126,88,0.12)]',
                            'transition-all duration-150',
                        )}
                    />
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-500 bg-surface border border-ink-200 px-1.5 py-0.5 rounded pointer-events-none">
                        ⌘K
                    </span>
                </div>

                {/* Filter pills (type) */}
                <div data-tour="filters" className="flex items-center gap-2 mb-4 flex-wrap">
                    <FilterPill active={activeType === 'all'} count={totalCount} onClick={() => setActiveType('all')}>
                        <Layers className="w-[15px] h-[15px] opacity-70" />
                        Все материалы
                    </FilterPill>
                    {PILL_TYPES.map(type => {
                        const cfg = TYPE_CONFIG[type]
                        return (
                            <FilterPill
                                key={type}
                                active={activeType === type}
                                count={counts[type] || 0}
                                onClick={() => setActiveType(activeType === type ? 'all' : type)}
                            >
                                <cfg.Icon className="w-[15px] h-[15px] opacity-70" />
                                {cfg.pillLabel}
                            </FilterPill>
                        )
                    })}
                </div>

                {/* Meta-filters + view toggle */}
                <div data-tour="meta-filters" className="flex items-center gap-2 mb-6 flex-wrap">
                    {/* Subject */}
                    <div className="relative inline-flex items-center">
                        <select
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            className="appearance-none h-[38px] pl-4 pr-9 bg-surface border border-ink-200 rounded-full text-[14px] font-semibold text-ink-700 cursor-pointer focus:outline-none focus:border-[var(--brand-300)] hover:bg-ink-50 hover:border-ink-300 transition-all duration-150"
                        >
                            <option value="">Все предметы</option>
                            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-[65%] w-2 h-2 pointer-events-none" viewBox="0 0 8 8" fill="none">
                            <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* Period */}
                    <div className="relative inline-flex items-center">
                        <select
                            value={period}
                            onChange={e => setPeriod(e.target.value)}
                            className="appearance-none h-[38px] pl-4 pr-9 bg-surface border border-ink-200 rounded-full text-[14px] font-semibold text-ink-700 cursor-pointer focus:outline-none focus:border-[var(--brand-300)] hover:bg-ink-50 hover:border-ink-300 transition-all duration-150"
                        >
                            <option value="all">За всё время</option>
                            <option value="today">Сегодня</option>
                            <option value="week">На этой неделе</option>
                            <option value="month">За последний месяц</option>
                            <option value="halfyear">За полгода</option>
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-[65%] w-2 h-2 pointer-events-none" viewBox="0 0 8 8" fill="none">
                            <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* Sort */}
                    <div className="relative inline-flex items-center">
                        <select
                            value={sort}
                            onChange={e => setSort(e.target.value)}
                            className="appearance-none h-[38px] pl-4 pr-9 bg-surface border border-ink-200 rounded-full text-[14px] font-semibold text-ink-700 cursor-pointer focus:outline-none focus:border-[var(--brand-300)] hover:bg-ink-50 hover:border-ink-300 transition-all duration-150"
                        >
                            <option value="newest">Сначала новые</option>
                            <option value="oldest">Сначала старые</option>
                            <option value="az">По названию А-Я</option>
                            <option value="za">По названию Я-А</option>
                            <option value="subject">По предмету</option>
                        </select>
                        <svg className="absolute right-3.5 top-1/2 -translate-y-[65%] w-2 h-2 pointer-events-none" viewBox="0 0 8 8" fill="none">
                            <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>

                    {/* View toggle */}
                    <div data-tour="view-toggle" className="ml-auto inline-flex bg-ink-100 rounded-full p-1">
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            className={cn(
                                'h-[30px] px-3.5 border-none rounded-full inline-flex items-center gap-1.5 font-semibold text-[13px] cursor-pointer transition-all duration-150',
                                viewMode === 'cards'
                                    ? 'bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                                    : 'bg-transparent text-ink-600 hover:text-ink-900',
                            )}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" /> Карточки
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={cn(
                                'h-[30px] px-3.5 border-none rounded-full inline-flex items-center gap-1.5 font-semibold text-[13px] cursor-pointer transition-all duration-150',
                                viewMode === 'list'
                                    ? 'bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                                    : 'bg-transparent text-ink-600 hover:text-ink-900',
                            )}
                        >
                            <List className="w-3.5 h-3.5" /> Список
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div data-tour="content">
                {loading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 bg-surface border border-dashed border-ink-200 rounded-lg">
                        <div className="w-[72px] h-[72px] mx-auto mb-4 bg-ink-100 rounded-lg flex items-center justify-center text-ink-400">
                            <Wand2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-[18px] font-bold text-ink-800 mb-1.5">
                            {totalCount === 0 ? 'Здесь будут ваши материалы' : 'Ничего не найдено'}
                        </h3>
                        <p className="text-[14px] text-ink-500 max-w-[360px] mx-auto mb-4">
                            {totalCount === 0
                                ? 'Создайте первый материал в ИИ Генераторе.'
                                : 'Попробуйте изменить фильтры или сбросить поиск.'}
                        </p>
                        {totalCount === 0 ? (
                            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/workspace')}>
                                Создать первый материал
                            </Button>
                        ) : (
                            <Button variant="ghost" onClick={resetFilters}>
                                Сбросить фильтры
                            </Button>
                        )}
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="flex flex-col divide-y divide-ink-100 border border-ink-200 rounded-xl overflow-hidden bg-surface">
                        {filtered.map(gen => (
                            <MatListRow key={gen.id} gen={gen} onDelete={() => handleDelete(gen.id)} />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                        {filtered.map(gen => (
                            <MatCard key={gen.id} gen={gen} onDelete={() => handleDelete(gen.id)} />
                        ))}
                    </div>
                )}
                </div>
            </div>
        </>
    )
}
