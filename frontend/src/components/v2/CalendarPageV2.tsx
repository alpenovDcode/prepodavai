'use client'

import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ru } from 'date-fns/locale/ru'
import toast from 'react-hot-toast'
import { Plus, X, Save, Trash2, Video, MapPin, Link2 } from 'lucide-react'

import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { cn } from '@/lib/utils/cn'

import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

// react-big-calendar c drag-and-drop addon. dateFnsLocalizer — нативный
// адаптер дат через date-fns; ставим русскую локаль для месяцев/дней.
const locales = { ru }
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
    getDay,
    locales,
})
// DnD-аддон расширяет props (onEventDrop/onEventResize), но types в @types
// не объявляют их — приводим к any, чтобы не воевать с типами либы.
const DnDCalendar: any = withDragAndDrop(BigCalendar as any)

interface BackendEvent {
    id: string
    legacy?: boolean
    title: string
    startAt: string
    endAt: string
    allDay?: boolean
    notes?: string | null
    location?: string | null
    meetingUrl?: string | null
    studentId?: string | null
    student?: { id: string; name: string; avatar?: string | null } | null
    classId?: string | null
    class?: { id: string; name: string } | null
    lessonId?: string | null
    lesson?: { id: string; title: string; topic: string } | null
    subject?: string | null
    eventType?: string
    format?: string
    status?: string
    color?: string | null
}

interface UIEvent {
    id: string
    title: string
    start: Date
    end: Date
    allDay: boolean
    resource: BackendEvent
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

const MESSAGES = {
    allDay: 'Весь день',
    previous: 'Назад',
    next: 'Вперёд',
    today: 'Сегодня',
    month: 'Месяц',
    week: 'Неделя',
    day: 'День',
    agenda: 'Список',
    date: 'Дата',
    time: 'Время',
    event: 'Событие',
    noEventsInRange: 'Нет событий в этом диапазоне.',
    showMore: (n: number) => `+ ещё ${n}`,
}

export default function CalendarPageV2() {
    const menu = useMobileMenu()
    const [view, setView] = useState<View>('week')
    const [date, setDate] = useState<Date>(new Date())
    const [modal, setModal] = useState<{ event?: BackendEvent; start?: Date; end?: Date } | null>(null)

    // Окно для запроса — ОЧЕНЬ широкое (месяц до + месяц после видимой даты),
    // чтобы при пагинации/смене вьюхи лишние сетевые ходы не дёргались.
    const { from, to } = useMemo(() => {
        const f = new Date(date); f.setMonth(f.getMonth() - 1); f.setHours(0, 0, 0, 0)
        const t = new Date(date); t.setMonth(t.getMonth() + 2); t.setHours(23, 59, 59, 999)
        return { from: f.toISOString(), to: t.toISOString() }
    }, [date])

    const { data, mutate, isLoading } = useSWR<BackendEvent[]>(
        `/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        fetcher,
    )

    const events: UIEvent[] = useMemo(() => {
        return (data || []).map((e) => ({
            id: e.id,
            title: e.title,
            start: new Date(e.startAt),
            end: new Date(e.endAt),
            allDay: !!e.allDay,
            resource: e,
        }))
    }, [data])

    const eventStyleGetter = useCallback((event: UIEvent) => {
        const { color, subject, status, format: fmt, legacy } = event.resource
        const palette = pickPalette(color, subject)
        const isCancelled = status === 'cancelled'
        const isDone = status === 'completed'
        return {
            style: {
                backgroundColor: palette.bg,
                borderLeft: `3px solid ${palette.accent}`,
                color: palette.fg,
                border: 'none',
                borderRadius: 4,
                padding: '2px 6px',
                opacity: isCancelled ? 0.45 : isDone ? 0.75 : 1,
                textDecoration: isCancelled ? 'line-through' : undefined,
                outline: legacy ? '1px dashed #9ca3af' : undefined,
                outlineOffset: legacy ? -2 : undefined,
                fontSize: 12,
                fontWeight: 600,
            },
        }
    }, [])

    const onSelectEvent = useCallback((event: UIEvent) => {
        if (event.resource.legacy) {
            toast('Это урок из «Материалов». Открой его там, чтобы редактировать.', { icon: 'ℹ️' })
            return
        }
        setModal({ event: event.resource })
    }, [])

    const onSelectSlot = useCallback((slot: { start: Date; end: Date }) => {
        setModal({ start: slot.start, end: slot.end })
    }, [])

    // Drag-and-drop: меняем startAt/endAt оптимистично, откатываемся при ошибке.
    const onEventDrop = useCallback(async (args: any) => {
        const { event, start, end } = args as { event: UIEvent; start: Date; end: Date }
        if (event.resource.legacy) {
            toast.error('Legacy-урок нельзя двигать здесь — открой материал.')
            return
        }
        try {
            mutate(
                (prev) => (prev || []).map((e) =>
                    e.id === event.id ? { ...e, startAt: start.toISOString(), endAt: end.toISOString() } : e,
                ),
                false,
            )
            await apiClient.patch(`/calendar/events/${event.id}/move`, {
                startAt: start.toISOString(),
                endAt: end.toISOString(),
            })
            mutate()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось перенести')
            mutate()
        }
    }, [mutate])

    const onEventResize = onEventDrop

    return (
        <>
            <Topbar
                title="Календарь"
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => {
                            const start = new Date()
                            start.setMinutes(0, 0, 0)
                            const end = new Date(start)
                            end.setHours(end.getHours() + 1)
                            setModal({ start, end })
                        }}
                    >
                        Новое событие
                    </Button>
                }
            />

            <div className="max-w-[1480px] w-full mx-auto p-6 max-md:p-3">
                <Card padding="lg" className="overflow-hidden">
                    <div style={{ height: 'calc(100vh - 200px)', minHeight: 600 }}>
                        <DnDCalendar
                            localizer={localizer}
                            culture="ru"
                            messages={MESSAGES}
                            events={events}
                            view={view}
                            onView={setView}
                            date={date}
                            onNavigate={setDate}
                            views={['month', 'week', 'day', 'agenda']}
                            startAccessor="start"
                            endAccessor="end"
                            selectable
                            popup
                            step={15}
                            timeslots={4}
                            min={new Date(1970, 0, 1, 7, 0)}
                            max={new Date(1970, 0, 1, 23, 0)}
                            onSelectEvent={onSelectEvent as any}
                            onSelectSlot={onSelectSlot as any}
                            onEventDrop={onEventDrop as any}
                            onEventResize={onEventResize as any}
                            resizable
                            eventPropGetter={eventStyleGetter as any}
                            formats={{
                                dayFormat: (d: Date) => format(d, 'EEEEEE, d', { locale: ru }),
                                weekdayFormat: (d: Date) => format(d, 'EEEEEE', { locale: ru }),
                                timeGutterFormat: (d: Date) => format(d, 'HH:mm'),
                                eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
                                    `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`,
                                agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
                                    `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`,
                                dayHeaderFormat: (d: Date) => format(d, 'EEEE, d MMMM', { locale: ru }),
                                dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
                                    `${format(start, 'd MMM', { locale: ru })} — ${format(end, 'd MMM yyyy', { locale: ru })}`,
                            }}
                        />
                    </div>
                    {isLoading && (
                        <div className="text-[12px] text-ink-400 mt-3">Загружаем события…</div>
                    )}
                </Card>
            </div>

            {modal && (
                <EventModal
                    initialEvent={modal.event}
                    initialStart={modal.start}
                    initialEnd={modal.end}
                    onClose={() => setModal(null)}
                    onSaved={() => { mutate(); setModal(null) }}
                />
            )}
        </>
    )
}

// ─── Палитра ────────────────────────────────────────────────────────────

function pickPalette(color: string | null | undefined, subject: string | null | undefined) {
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
        return { bg: hexWithAlpha(color, 0.15), accent: color, fg: '#111827' }
    }
    const s = (subject || '').toLowerCase()
    if (/математ|геометр|алгеб/.test(s))     return { bg: '#eef2ff', accent: '#6366f1', fg: '#312e81' }
    if (/русск|литер/.test(s))               return { bg: '#fff7ed', accent: '#fb923c', fg: '#9a3412' }
    if (/физик|хим|биол/.test(s))            return { bg: '#ecfdf5', accent: '#10b981', fg: '#065f46' }
    if (/англ|франц|нем/.test(s))            return { bg: '#eff6ff', accent: '#3b82f6', fg: '#1e3a8a' }
    if (/истор|общест|геогр/.test(s))        return { bg: '#fffbeb', accent: '#f59e0b', fg: '#92400e' }
    return { bg: '#f3f4f6', accent: '#9ca3af', fg: '#374151' }
}

function hexWithAlpha(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── Модалка создания/редактирования ────────────────────────────────────

interface Student { id: string; name: string }
interface Klass { id: string; name: string }

function EventModal({
    initialEvent, initialStart, initialEnd, onClose, onSaved,
}: {
    initialEvent?: BackendEvent
    initialStart?: Date
    initialEnd?: Date
    onClose: () => void
    onSaved: () => void
}) {
    const editing = !!initialEvent
    const [title, setTitle] = useState(initialEvent?.title || '')
    const [start, setStart] = useState(toLocalInput(initialEvent ? new Date(initialEvent.startAt) : initialStart || new Date()))
    const [end, setEnd] = useState(toLocalInput(initialEvent ? new Date(initialEvent.endAt) : initialEnd || new Date(Date.now() + 60 * 60 * 1000)))
    const [eventType, setEventType] = useState(initialEvent?.eventType || 'lesson')
    const [format, setFormat] = useState(initialEvent?.format || 'online')
    const [status, setStatus] = useState(initialEvent?.status || 'planned')
    const [studentId, setStudentId] = useState(initialEvent?.studentId || '')
    const [classId, setClassId] = useState(initialEvent?.classId || '')
    const [subject, setSubject] = useState(initialEvent?.subject || '')
    const [location, setLocation] = useState(initialEvent?.location || '')
    const [meetingUrl, setMeetingUrl] = useState(initialEvent?.meetingUrl || '')
    const [notes, setNotes] = useState(initialEvent?.notes || '')
    const [saving, setSaving] = useState(false)

    const { data: studentsData } = useSWR<{ items?: Student[] } | Student[]>('/students', fetcher)
    const { data: classesData } = useSWR<{ items?: Klass[] } | Klass[]>('/classes', fetcher)
    const students: Student[] = Array.isArray(studentsData) ? studentsData : (studentsData?.items || [])
    const classes: Klass[] = Array.isArray(classesData) ? classesData : (classesData?.items || [])

    const save = async () => {
        if (!title.trim()) { toast.error('Укажи название'); return }
        const startD = new Date(start)
        const endD = new Date(end)
        if (endD <= startD) { toast.error('Окончание должно быть позже начала'); return }
        setSaving(true)
        try {
            const payload = {
                title: title.trim(),
                startAt: startD.toISOString(),
                endAt: endD.toISOString(),
                eventType, format, status,
                studentId: studentId || null,
                classId: classId || null,
                subject: subject || null,
                location: location || null,
                meetingUrl: meetingUrl || null,
                notes: notes || null,
            }
            if (editing) {
                await apiClient.patch(`/calendar/events/${initialEvent!.id}`, payload)
            } else {
                await apiClient.post('/calendar/events', payload)
            }
            toast.success(editing ? 'Сохранено' : 'Создано')
            onSaved()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!editing) return
        if (!confirm('Удалить событие?')) return
        setSaving(true)
        try {
            await apiClient.delete(`/calendar/events/${initialEvent!.id}`)
            toast.success('Удалено')
            onSaved()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось удалить')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
            <div
                className="bg-surface rounded-xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
                    <h2 className="font-display font-bold text-[18px] text-ink-900">
                        {editing ? 'Событие' : 'Новое событие'}
                    </h2>
                    <button type="button" onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center text-ink-500 hover:bg-ink-100 rounded-md">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <Field label="Название">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Урок с Аней — алгебра"
                            className={inputCls}
                            autoFocus
                        />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Начало">
                            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="Окончание">
                            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
                        </Field>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Тип">
                            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputCls}>
                                <option value="lesson">Урок</option>
                                <option value="meeting">Встреча</option>
                                <option value="break">Перерыв</option>
                                <option value="personal">Личное</option>
                            </select>
                        </Field>
                        <Field label="Формат">
                            <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputCls}>
                                <option value="online">Онлайн</option>
                                <option value="offline">Офлайн</option>
                                <option value="hybrid">Гибрид</option>
                            </select>
                        </Field>
                        <Field label="Статус">
                            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                                <option value="planned">Запланирован</option>
                                <option value="completed">Прошёл</option>
                                <option value="cancelled">Отменён</option>
                            </select>
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Ученик">
                            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputCls}>
                                <option value="">— не выбран —</option>
                                {students.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Класс/группа">
                            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>
                                <option value="">— не выбран —</option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <Field label="Предмет">
                        <input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Математика"
                            className={inputCls}
                        />
                    </Field>

                    {format !== 'online' && (
                        <Field label={<><MapPin className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Место</>}>
                            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ул. Ленина 1" className={inputCls} />
                        </Field>
                    )}
                    {format !== 'offline' && (
                        <Field label={<><Video className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />Ссылка на встречу</>}>
                            <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet…" className={inputCls} />
                        </Field>
                    )}

                    <Field label="Заметки">
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Тема, домашнее задание, контекст…"
                            className={cn(inputCls, 'resize-y min-h-[70px]')}
                        />
                    </Field>
                </div>

                <div className="px-5 py-4 border-t border-ink-100 flex items-center gap-2">
                    {editing && (
                        <Button variant="ghost" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={remove} disabled={saving}>
                            Удалить
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Отмена</Button>
                    <Button variant="primary" size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} onClick={save} loading={saving}>
                        {editing ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-ink-600 uppercase tracking-wide">{label}</label>
            {children}
        </div>
    )
}

const inputCls = 'h-10 px-3 rounded-md border border-ink-200 text-[14px] text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 transition-colors w-full'

function toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
