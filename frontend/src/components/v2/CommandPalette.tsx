'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
    Search, FileText, HelpCircle, Presentation, BookOpen, Users, ClipboardCheck,
    BarChart3, Calendar, Settings, Gift, Wand2, Sparkles, ImageIcon, MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface PaletteItem {
    id: string
    label: string
    hint?: string
    icon: any
    path?: string
    action?: () => void
    keywords?: string
    group: 'Навигация' | 'ИИ-инструменты' | 'Действия'
}

const ITEMS_TEACHER: PaletteItem[] = [
    // Навигация
    { id: 'go-home',       label: 'Главная',      icon: BookOpen,        path: '/dashboard',                 keywords: 'dashboard home', group: 'Навигация' },
    { id: 'go-tools',      label: 'ИИ Генератор', icon: Wand2,           path: '/workspace',                 keywords: 'tools ai',       group: 'Навигация' },
    { id: 'go-calendar',   label: 'Календарь',    icon: Calendar,        path: '/dashboard/calendar',        keywords: 'schedule',       group: 'Навигация' },
    { id: 'go-materials',  label: 'Материалы',    icon: BookOpen,        path: '/dashboard/courses',         keywords: 'lessons courses',group: 'Навигация' },
    { id: 'go-students',   label: 'Ученики',      icon: Users,           path: '/dashboard/students',        keywords: 'pupils kids',    group: 'Навигация' },
    { id: 'go-grading',    label: 'Проверка ДЗ',  icon: ClipboardCheck,  path: '/dashboard/grading',         keywords: 'homework',       group: 'Навигация' },
    { id: 'go-analytics',  label: 'Аналитика',    icon: BarChart3,       path: '/dashboard/analytics',       keywords: 'stats reports',  group: 'Навигация' },
    { id: 'go-settings',   label: 'Настройки',    icon: Settings,        path: '/dashboard/settings',        keywords: 'profile',        group: 'Навигация' },
    { id: 'go-referrals',  label: 'Пригласить',   icon: Gift,            path: '/dashboard/referrals',       keywords: 'invite refer',   group: 'Навигация' },

    // Инструменты
    { id: 'tool-worksheet',    label: 'Создать рабочий лист',  icon: FileText,     path: '/workspace/worksheet',      keywords: 'pdf lesson',          group: 'ИИ-инструменты' },
    { id: 'tool-quiz',         label: 'Создать тест',          icon: HelpCircle,   path: '/workspace/quiz-generator', keywords: 'quiz test',           group: 'ИИ-инструменты' },
    { id: 'tool-pres',         label: 'Создать презентацию',   icon: Presentation, path: '/workspace/presentations',  keywords: 'slides',              group: 'ИИ-инструменты' },
    { id: 'tool-lesson-prep',  label: 'Вау-урок',              icon: Sparkles,     path: '/workspace/lesson-prep',    keywords: 'amazing wow',         group: 'ИИ-инструменты' },
    { id: 'tool-image',        label: 'Сгенерировать картинку', icon: ImageIcon,   path: '/workspace/image',          keywords: 'image picture',       group: 'ИИ-инструменты' },
    { id: 'tool-assistant',    label: 'AI-ассистент',          icon: MessageCircle, path: '/workspace/assistant',     keywords: 'chat',                group: 'ИИ-инструменты' },
]

interface CommandPaletteProps {
    open: boolean
    onClose: () => void
    /** Дополнительные команды (можно прокинуть из конкретной страницы). */
    extraItems?: PaletteItem[]
}

export function CommandPalette({ open, onClose, extraItems = [] }: CommandPaletteProps) {
    const router = useRouter()
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)

    const items = useMemo(() => [...ITEMS_TEACHER, ...extraItems], [extraItems])

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim()
        if (!q) return items
        return items.filter(it => {
            const hay = `${it.label} ${it.keywords ?? ''}`.toLowerCase()
            return hay.includes(q)
        })
    }, [items, query])

    const grouped = useMemo(() => {
        const g: Record<string, PaletteItem[]> = {}
        filtered.forEach(it => {
            g[it.group] = g[it.group] || []
            g[it.group].push(it)
        })
        return g
    }, [filtered])

    useEffect(() => { setActive(0) }, [query, open])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
            else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive(i => Math.min(filtered.length - 1, i + 1))
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive(i => Math.max(0, i - 1))
            }
            else if (e.key === 'Enter') {
                e.preventDefault()
                const it = filtered[active]
                if (it) selectItem(it)
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, filtered, active])

    const selectItem = (it: PaletteItem) => {
        onClose()
        setQuery('')
        if (it.path) router.push(it.path)
        else it.action?.()
    }

    if (!open || typeof window === 'undefined') return null

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-fade-in flex items-start justify-center pt-[15vh] px-4"
            onClick={onClose}
        >
            <div
                className="bg-surface rounded-xl border border-ink-200 shadow-2xl w-full max-w-[560px] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 border-b border-ink-100 h-14">
                    <Search className="w-5 h-5 text-ink-400 flex-shrink-0" />
                    <input
                        autoFocus
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Что хотите сделать? Например: «рабочий лист»…"
                        className="flex-1 outline-none border-0 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400"
                    />
                    <kbd className="font-mono text-[10px] text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded border border-ink-200">ESC</kbd>
                </div>

                <div className="max-h-[60vh] overflow-y-auto py-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-10 text-ink-500 text-[13px]">Ничего не найдено</div>
                    ) : (
                        Object.entries(grouped).map(([group, gItems]) => (
                            <div key={group} className="py-1">
                                <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                                    {group}
                                </div>
                                {gItems.map(it => {
                                    const Icon = it.icon
                                    const idx = filtered.indexOf(it)
                                    const isActive = idx === active
                                    return (
                                        <button
                                            key={it.id}
                                            type="button"
                                            onClick={() => selectItem(it)}
                                            onMouseEnter={() => setActive(idx)}
                                            className={cn(
                                                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                                isActive ? 'bg-brand-50' : 'hover:bg-ink-50',
                                            )}
                                        >
                                            <span className={cn(
                                                'w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0',
                                                isActive ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600',
                                            )}>
                                                <Icon className="w-4 h-4" />
                                            </span>
                                            <span className={cn(
                                                'flex-1 font-medium text-[14px]',
                                                isActive ? 'text-brand-700' : 'text-ink-900',
                                            )}>
                                                {it.label}
                                            </span>
                                            {it.hint && <span className="text-[11px] text-ink-500">{it.hint}</span>}
                                            {isActive && (
                                                <kbd className="font-mono text-[10px] text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded border border-ink-200">↵</kbd>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 border-t border-ink-100 bg-ink-50 text-[11px] text-ink-500 flex items-center justify-between">
                    <span>Стрелки — навигация, Enter — открыть</span>
                    <span className="inline-flex items-center gap-1">
                        <kbd className="font-mono bg-surface border border-ink-200 px-1.5 py-0.5 rounded">⌘</kbd>
                        <kbd className="font-mono bg-surface border border-ink-200 px-1.5 py-0.5 rounded">K</kbd>
                    </span>
                </div>
            </div>
        </div>,
        document.body,
    )
}
