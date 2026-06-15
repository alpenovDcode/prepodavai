'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, Clock, Users, BookOpen, ChevronRight, Search } from 'lucide-react'

import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { cn } from '@/lib/utils/cn'

interface Assignment {
    id: string
    status: string
    dueDate: string | null
    createdAt: string
    lesson: { title: string; topic: string | null }
    class: { name: string } | null
    student: { name: string } | null
    _count: { submissions: number }
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

type StatusFilter = 'all' | 'open' | 'done' | 'overdue'

function isOverdue(a: Assignment): boolean {
    if (!a.dueDate) return false
    if (a.status === 'graded' || a.status === 'submitted') return false
    return new Date(a.dueDate) < new Date()
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    } catch { return '' }
}

export default function AssignmentsListPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const { data, isLoading } = useSWR<Assignment[]>('/assignments', fetcher)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    const filtered = useMemo(() => {
        const list = data ?? []
        const q = search.trim().toLowerCase()
        return list.filter((a) => {
            if (statusFilter === 'open' && a.status !== 'assigned') return false
            if (statusFilter === 'done' && a.status !== 'graded') return false
            if (statusFilter === 'overdue' && !isOverdue(a)) return false
            if (q) {
                const hay = [
                    a.lesson?.title, a.lesson?.topic, a.class?.name, a.student?.name,
                ].filter(Boolean).join(' ').toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [data, search, statusFilter])

    const counts = useMemo(() => {
        const list = data ?? []
        return {
            all: list.length,
            open: list.filter((a) => a.status === 'assigned').length,
            done: list.filter((a) => a.status === 'graded').length,
            overdue: list.filter(isOverdue).length,
        }
    }, [data])

    return (
        <>
            <Topbar
                title="Домашние задания"
                subtitle={`Всего: ${counts.all} · Активные: ${counts.open} · Завершённые: ${counts.done}`}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                leading={
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/students')}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                        aria-label="Назад"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                }
            />

            <div className="max-w-[1320px] mx-auto px-8 py-6 max-md:px-4">
                {/* Поиск + статус-фильтры */}
                <div className="flex gap-3 mb-4 flex-wrap items-center">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Поиск по названию, теме, классу или ученику"
                            className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-ink-200 bg-surface text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-300 focus:ring-[3px] focus:ring-brand-400/10 transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {([
                            ['all', `Все · ${counts.all}`],
                            ['open', `Активные · ${counts.open}`],
                            ['done', `Завершённые · ${counts.done}`],
                            ['overdue', `Просрочено · ${counts.overdue}`],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(key)}
                                className={cn(
                                    'px-3 h-9 rounded-full text-[13px] font-semibold transition-colors',
                                    statusFilter === key
                                        ? 'bg-brand-500 text-white'
                                        : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <Card padding="lg" className="text-center text-[14px] text-ink-500">Загрузка…</Card>
                ) : filtered.length === 0 ? (
                    <Card padding="lg" className="text-center text-[14px] text-ink-500">
                        {search || statusFilter !== 'all' ? 'Ничего не найдено по фильтрам' : 'У вас пока нет заданий.'}
                    </Card>
                ) : (
                    <div className="grid gap-2.5">
                        {filtered.map((a) => {
                            const overdue = isOverdue(a)
                            return (
                                <Card
                                    key={a.id}
                                    padding="md"
                                    interactive
                                    className="hover:shadow-md transition-shadow cursor-pointer"
                                    onClick={() => router.push(`/dashboard/assignments/${a.id}`)}
                                    title="Открыть карточку задания"
                                >
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-ink-900 text-[15px] mb-0.5 truncate">{a.lesson?.title || 'Без названия'}</h3>
                                            {a.lesson?.topic && (
                                                <p className="text-[13px] text-ink-500 mb-2.5 truncate">{a.lesson.topic}</p>
                                            )}
                                            <div className="flex items-center gap-3 flex-wrap text-[12.5px]">
                                                {a.class?.name ? (
                                                    <span className="inline-flex items-center gap-1.5 text-ink-700 font-semibold">
                                                        <Users className="w-3.5 h-3.5 text-ink-400" /> {a.class.name}
                                                    </span>
                                                ) : a.student?.name ? (
                                                    <span className="inline-flex items-center gap-1.5 text-ink-700 font-semibold">
                                                        <Users className="w-3.5 h-3.5 text-ink-400" /> {a.student.name}
                                                    </span>
                                                ) : null}
                                                <span className="text-ink-300">·</span>
                                                <span className="inline-flex items-center gap-1.5 text-ink-500">
                                                    <BookOpen className="w-3.5 h-3.5" /> Работ сдано: {a._count.submissions}
                                                </span>
                                                <span className="text-ink-300">·</span>
                                                <span className={cn(
                                                    'inline-flex items-center gap-1.5',
                                                    overdue ? 'text-danger-700 font-semibold' : 'text-ink-500',
                                                )}>
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {a.dueDate ? `Срок: ${formatDate(a.dueDate)}${overdue ? ' · истёк' : ''}` : 'Срок не задан'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <span className={cn(
                                                'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                                                a.status === 'graded'
                                                    ? 'bg-success-50 text-success-700'
                                                    : 'bg-brand-50 text-brand-700',
                                            )}>
                                                {a.status === 'graded' ? 'Завершено' : 'Выдано'}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-ink-400" />
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}
