'use client'

import * as React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Plus, ChevronLeft, ChevronRight, CalendarIcon, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { cn } from '@/lib/utils/cn'

interface CalendarLesson {
    id: string
    title: string
    topic?: string
    scheduledAt: string
    durationMinutes: number | null
    subject?: string | null
    classId?: string | null
    className?: string | null
    location?: string | null
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function startOfWeek(d: Date) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    const dow = x.getDay()
    const shift = dow === 0 ? 6 : dow - 1
    x.setDate(x.getDate() - shift)
    return x
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function CalendarPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))

    const weekEnd = useMemo(() => {
        const x = new Date(weekStart)
        x.setDate(x.getDate() + 7)
        return x
    }, [weekStart])

    const { data, isLoading } = useSWR<{ lessons?: any[]; deadlines?: any[] }>(
        `/lessons/calendar/events?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
        fetcher,
    )
    const lessons: CalendarLesson[] = useMemo(() => {
        const arr = (data?.lessons ?? []).map((l: any) => ({
            id: l.id,
            title: l.title,
            topic: l.topic,
            scheduledAt: l.scheduledAt,
            durationMinutes: l.durationMinutes,
            subject: l.subject ?? null,
            classId: l.class?.id,
            className: l.class?.name,
        }))
        return arr
    }, [data?.lessons])

    const days = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(weekStart)
            d.setDate(d.getDate() + i)
            return d
        })
    }, [weekStart])

    const today = new Date()
    const monthLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`

    const lessonsByDay = useMemo(() => {
        const map = new Map<string, CalendarLesson[]>()
        for (const l of lessons) {
            const d = new Date(l.scheduledAt)
            const key = d.toDateString()
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(l)
        }
        for (const arr of map.values()) {
            arr.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        }
        return map
    }, [lessons])

    return (
        <>
            <Topbar
                title="Календарь"
                subtitle={monthLabel}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/workspace/lesson-prep')}>
                        Новый урок
                    </Button>
                }
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <Card padding="lg">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => shiftWeek(setWeekStart, -1)} aria-label="Назад">
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                                Сегодня
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => shiftWeek(setWeekStart, 1)} aria-label="Вперёд">
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="text-[13px] text-ink-500 font-semibold tnum">
                            {formatRange(days[0], days[6])}
                        </div>
                    </div>

                    {/* Week grid */}
                    <div className="grid grid-cols-7 gap-2 max-md:grid-cols-1">
                        {days.map((d, i) => {
                            const dayLessons = lessonsByDay.get(d.toDateString()) || []
                            const isToday = isSameDay(d, today)
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        'rounded-md border min-h-[180px] p-3 flex flex-col gap-2',
                                        isToday ? 'bg-brand-50 border-brand-200' : 'bg-surface border-ink-200',
                                    )}
                                >
                                    <div className="flex items-baseline justify-between">
                                        <div className="text-[11px] uppercase font-bold tracking-wider text-ink-500">{WEEKDAYS[i]}</div>
                                        <div className={cn(
                                            'font-display font-bold text-[18px] tnum leading-none',
                                            isToday ? 'text-brand-700' : 'text-ink-900',
                                        )}>
                                            {d.getDate()}
                                        </div>
                                    </div>
                                    {dayLessons.length === 0 && !isLoading && (
                                        <div className="text-[11px] text-ink-400 italic">—</div>
                                    )}
                                    {dayLessons.map(l => (
                                        <LessonChip key={l.id} lesson={l} />
                                    ))}
                                </div>
                            )
                        })}
                    </div>
                </Card>

                {/* Empty state when no lessons all week */}
                {!isLoading && lessons.length === 0 && (
                    <Card padding="lg" className="mt-4 text-center">
                        <CalendarIcon className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">На этой неделе уроков нет</h3>
                        <p className="text-[13px] text-ink-500 mb-4">Добавьте первый урок через ИИ-Генератор.</p>
                        <Button variant="primary" leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => router.push('/workspace')}>
                            К инструментам
                        </Button>
                    </Card>
                )}
            </div>
        </>
    )
}

function shiftWeek(set: React.Dispatch<React.SetStateAction<Date>>, dir: -1 | 1) {
    set(prev => {
        const x = new Date(prev)
        x.setDate(x.getDate() + 7 * dir)
        return x
    })
}

function LessonChip({ lesson }: { lesson: CalendarLesson }) {
    const time = new Date(lesson.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    const subjectColor = subjectColorClass(lesson.subject)
    return (
        <div className={cn(
            'rounded-sm px-2 py-1.5 border-l-[3px] cursor-pointer hover:-translate-y-px transition-transform',
            subjectColor.bg,
            subjectColor.border,
        )}>
            <div className={cn('text-[10px] font-semibold tnum', subjectColor.text)}>{time}</div>
            <div className="text-[12px] font-semibold text-ink-900 leading-tight truncate">{lesson.title}</div>
            {lesson.className && (
                <div className="text-[10px] text-ink-500 truncate">{lesson.className}</div>
            )}
        </div>
    )
}

function subjectColorClass(subject?: string | null) {
    const s = (subject || '').toLowerCase()
    if (/математ|геометр|алгеб/.test(s))     return { bg: 'bg-indigo-50',   border: 'border-l-indigo-500', text: 'text-indigo-700' }
    if (/русск|литер/.test(s))               return { bg: 'bg-brand-50',    border: 'border-l-brand-500',  text: 'text-brand-700' }
    if (/физик|хим|биол/.test(s))            return { bg: 'bg-success-50',  border: 'border-l-success-500',text: 'text-success-700' }
    if (/англ|франц|нем/.test(s))            return { bg: 'bg-info-50',     border: 'border-l-info-500',   text: 'text-info-700' }
    if (/истор|общест|геогр/.test(s))        return { bg: 'bg-warning-50',  border: 'border-l-warning-500',text: 'text-warning-700' }
    return { bg: 'bg-ink-100', border: 'border-l-ink-400', text: 'text-ink-600' }
}

function formatRange(from: Date, to: Date) {
    const f = `${from.getDate()} ${MONTHS[from.getMonth()].toLowerCase()}`
    const t = `${to.getDate()} ${MONTHS[to.getMonth()].toLowerCase()}`
    return `${f} — ${t}`
}
