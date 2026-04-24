'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

interface CalendarLesson {
    id: string
    title: string
    topic: string
    scheduledAt: string
    durationMinutes: number | null
    notes: string | null
    class: { id: string; name: string } | null
}

interface CalendarDeadline {
    assignmentId: string
    dueDate: string
    lesson: { id: string; title: string; topic: string }
    class: { id: string; name: string } | null
    student: { id: string; name: string } | null
    submittedCount: number
    gradedCount: number
}

interface CalendarData {
    lessons: CalendarLesson[]
    deadlines: CalendarDeadline[]
}

const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

/** Понедельник недели, в которой лежит d (локальная зона) */
function startOfWeekMonday(d: Date): Date {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    const dow = (copy.getDay() + 6) % 7 // 0 = Monday
    copy.setDate(copy.getDate() - dow)
    return copy
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate()
}

export default function CalendarPage() {
    const router = useRouter()
    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
    const [data, setData] = useState<CalendarData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const { gridStart, gridEnd, daysInGrid } = useMemo(() => {
        const gs = startOfWeekMonday(startOfMonth(currentMonth))
        const eom = endOfMonth(currentMonth)
        // Расширяем сетку до воскресенья последней недели; плюс минимум 6 рядов (42 дня) для стабильной высоты
        const tail = new Date(eom)
        const tailDow = (tail.getDay() + 6) % 7
        tail.setDate(tail.getDate() + (6 - tailDow))
        const days: Date[] = []
        const cursor = new Date(gs)
        while (cursor <= tail) {
            days.push(new Date(cursor))
            cursor.setDate(cursor.getDate() + 1)
        }
        while (days.length < 42) {
            const next = new Date(days[days.length - 1])
            next.setDate(next.getDate() + 1)
            days.push(next)
        }
        return { gridStart: gs, gridEnd: days[days.length - 1], daysInGrid: days }
    }, [currentMonth])

    useEffect(() => {
        const fetchCalendar = async () => {
            setLoading(true)
            setError(null)
            try {
                const from = new Date(gridStart)
                from.setHours(0, 0, 0, 0)
                const to = new Date(gridEnd)
                to.setHours(23, 59, 59, 999)
                const res = await apiClient.get('/lessons/calendar/events', {
                    params: { from: from.toISOString(), to: to.toISOString() },
                })
                setData(res.data)
            } catch (err: any) {
                console.error('Failed to load calendar', err)
                setError(err?.response?.data?.message || 'Не удалось загрузить события')
            } finally {
                setLoading(false)
            }
        }
        fetchCalendar()
    }, [gridStart, gridEnd])

    const lessonsByDay = useMemo(() => {
        const map = new Map<string, CalendarLesson[]>()
        for (const l of data?.lessons || []) {
            const d = new Date(l.scheduledAt)
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            const arr = map.get(key) || []
            arr.push(l)
            map.set(key, arr)
        }
        // сортируем по времени внутри дня
        for (const arr of map.values()) {
            arr.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        }
        return map
    }, [data?.lessons])

    const deadlinesByDay = useMemo(() => {
        const map = new Map<string, CalendarDeadline[]>()
        for (const dl of data?.deadlines || []) {
            const d = new Date(dl.dueDate)
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            const arr = map.get(key) || []
            arr.push(dl)
            map.set(key, arr)
        }
        return map
    }, [data?.deadlines])

    const today = useMemo(() => new Date(), [])

    const goPrev = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    const goNext = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    const goToday = () => setCurrentMonth(startOfMonth(new Date()))

    // Список «ближайшие 7 дней» для правой колонки
    const upcoming = useMemo(() => {
        const now = new Date()
        const until = new Date(now); until.setDate(until.getDate() + 7)
        const events: Array<
            | { kind: 'lesson'; date: Date; data: CalendarLesson }
            | { kind: 'deadline'; date: Date; data: CalendarDeadline }
        > = []
        for (const l of data?.lessons || []) {
            const d = new Date(l.scheduledAt)
            if (d >= now && d <= until) events.push({ kind: 'lesson', date: d, data: l })
        }
        for (const dl of data?.deadlines || []) {
            const d = new Date(dl.dueDate)
            if (d >= now && d <= until) events.push({ kind: 'deadline', date: d, data: dl })
        }
        events.sort((a, b) => a.date.getTime() - b.date.getTime())
        return events.slice(0, 10)
    }, [data])

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">Календарь</h1>
                    <p className="text-gray-500 text-sm">Запланированные уроки и дедлайны заданий</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={goPrev} className="w-10 h-10 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold">
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-semibold text-gray-900 min-w-[180px] text-center">
                        {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                    </div>
                    <button onClick={goNext} className="w-10 h-10 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold">
                        <i className="fas fa-chevron-right"></i>
                    </button>
                    <button onClick={goToday} className="px-3 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition text-sm">
                        Сегодня
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Month grid */}
                <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
                        {DAY_NAMES.map(d => (
                            <div key={d} className="text-center text-xs font-bold text-gray-500 uppercase py-2">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {daysInGrid.map((day, idx) => {
                            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
                            const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
                            const isToday = isSameDay(day, today)
                            const dayLessons = lessonsByDay.get(key) || []
                            const dayDeadlines = deadlinesByDay.get(key) || []

                            return (
                                <div
                                    key={idx}
                                    className={`min-h-[110px] p-1.5 border-b border-r border-gray-100 ${
                                        isCurrentMonth ? 'bg-white' : 'bg-gray-50/60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1 px-1">
                                        <span className={`text-xs font-semibold w-6 h-6 inline-flex items-center justify-center rounded-full ${
                                            isToday
                                                ? 'bg-primary-600 text-white'
                                                : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                                        }`}>
                                            {day.getDate()}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {dayLessons.slice(0, 2).map(l => (
                                            <button
                                                key={l.id}
                                                onClick={() => router.push(`/dashboard/courses/${l.id}`)}
                                                className="w-full text-left px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition"
                                                title={`${l.title}${l.class ? ` · ${l.class.name}` : ''}`}
                                            >
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                                                    <span>{new Date(l.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className="text-[11px] font-semibold text-gray-900 truncate">{l.title}</div>
                                            </button>
                                        ))}
                                        {dayDeadlines.slice(0, Math.max(0, 3 - Math.min(dayLessons.length, 2))).map(dl => (
                                            <button
                                                key={dl.assignmentId}
                                                onClick={() => router.push('/workspace/homework')}
                                                className="w-full text-left px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
                                                title={`Дедлайн: ${dl.lesson.title}`}
                                            >
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                                                    <i className="fas fa-hourglass-end text-[9px]"></i>
                                                    Дедлайн
                                                </div>
                                                <div className="text-[11px] font-semibold text-gray-900 truncate">{dl.lesson.title}</div>
                                            </button>
                                        ))}
                                        {(dayLessons.length + dayDeadlines.length) > 3 && (
                                            <div className="text-[10px] text-gray-500 font-semibold px-1">
                                                +{(dayLessons.length + dayDeadlines.length) - 3} ещё
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {loading && (
                        <div className="border-t border-gray-100 py-2 text-center text-xs text-gray-500">
                            <i className="fas fa-spinner fa-spin mr-1"></i> Обновление...
                        </div>
                    )}
                </div>

                {/* Upcoming sidebar */}
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <i className="fas fa-clock text-primary-600"></i>
                            Ближайшие 7 дней
                        </h3>
                        {upcoming.length === 0 ? (
                            <p className="text-xs text-gray-500">На ближайшую неделю событий нет.</p>
                        ) : (
                            <div className="space-y-2">
                                {upcoming.map((ev, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            if (ev.kind === 'lesson') router.push(`/dashboard/courses/${ev.data.id}`)
                                            else router.push('/workspace/homework')
                                        }}
                                        className={`w-full text-left p-3 rounded-xl border transition hover:shadow-sm ${
                                            ev.kind === 'lesson'
                                                ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
                                                : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-bold uppercase ${
                                                ev.kind === 'lesson' ? 'text-indigo-600' : 'text-amber-700'
                                            }`}>
                                                {ev.kind === 'lesson' ? 'Урок' : 'Дедлайн'}
                                            </span>
                                            <span className="text-[10px] font-semibold text-gray-500">
                                                {ev.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' })}
                                                {' · '}
                                                {ev.date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {ev.kind === 'lesson' ? ev.data.title : ev.data.lesson.title}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {ev.kind === 'lesson'
                                                ? (ev.data.class?.name || 'Без класса')
                                                : `${ev.data.class?.name || ev.data.student?.name || ''} · сдано ${ev.data.submittedCount}`}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Условные обозначения</h3>
                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded"></span>
                                <span className="text-gray-700">Запланированный урок</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded"></span>
                                <span className="text-gray-700">Дедлайн задания</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
