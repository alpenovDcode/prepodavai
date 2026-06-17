'use client'

import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ru } from 'date-fns/locale/ru'
import toast from 'react-hot-toast'
import { Plus, X, Save, Trash2, Video, MapPin, Calendar as CalendarIcon, Compass } from 'lucide-react'

import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

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
    id: string                  // master id ИЛИ "master__<isoOccurrence>" для одной копии серии
    masterId?: string           // для повтор-копий — id мастера
    isRecurringInstance?: boolean
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
    recurrenceRule?: { id: string; rrule: string } | null
    recurrenceRuleId?: string | null
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
    const tour = useTour()
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
    // Для повтор-копий по умолчанию scope=single (двигаем только ОДНУ дату).
    // Для одиночных — scope=all (фактически просто PATCH мастера).
    const onEventDrop = useCallback(async (args: any) => {
        const { event, start, end } = args as { event: UIEvent; start: Date; end: Date }
        if (event.resource.legacy) {
            toast.error('Legacy-урок нельзя двигать здесь — открой материал.')
            return
        }
        const scope = event.resource.isRecurringInstance ? 'single' : 'all'
        try {
            mutate(
                (prev) => (prev || []).map((e) =>
                    e.id === event.id ? { ...e, startAt: start.toISOString(), endAt: end.toISOString() } : e,
                ),
                false,
            )
            await apiClient.patch(`/calendar/events/${event.id}/move?scope=${scope}`, {
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

    // Подсчёт событий на сегодня — отображаем в hero-блоке.
    const todayEventsCount = useMemo(() => {
        const t0 = new Date(); t0.setHours(0, 0, 0, 0)
        const t1 = new Date(); t1.setHours(23, 59, 59, 999)
        return (data || []).filter((e) => {
            const s = new Date(e.startAt)
            return s >= t0 && s <= t1
        }).length
    }, [data])

    return (
        <>
            <Topbar
                title="Календарь"
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={(
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={tour.start} leftIcon={<Compass className="w-4 h-4" />} data-tour="tour-btn">
                            Тур
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Plus className="w-4 h-4" />}
                            data-tour="new-event"
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
                    </div>
                )}
            />

            {/* Стили для react-big-calendar под платформенный дизайн.
                Перекрашиваем стандартные серые элементы в brand/ink палитру:
                цветные кнопки тулбара, оранжевая линия now-indicator,
                яркий highlight сегодняшнего дня, скруглённые события. */}
            <CalendarThemeStyles />

            <div className="max-w-[1480px] w-full mx-auto p-6 max-md:p-3">
                {/* Hero-блок: цветная плашка с резюме дня */}
                <div
                    data-tour="hero"
                    className="rounded-xl p-5 mb-4 flex flex-wrap items-center gap-4 max-md:p-4 max-md:gap-3"
                    style={{
                        background: 'linear-gradient(135deg, #FFF1EB 0%, #FFE4D6 60%, #FFD0B5 100%)',
                        border: '1px solid #FED7AA',
                    }}
                >
                    <div className="w-12 h-12 rounded-lg bg-white/70 flex items-center justify-center text-brand-700 flex-shrink-0">
                        <CalendarIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-display font-bold text-[20px] text-ink-900 leading-tight">
                            {format(new Date(), 'EEEE, d MMMM', { locale: ru })}
                        </h1>
                        <p className="text-[13px] text-ink-700 mt-0.5">
                            {todayEventsCount === 0
                                ? 'Сегодня свободно — отличный момент договориться о новых занятиях.'
                                : `${todayEventsCount} ${pluralize(todayEventsCount, 'событие', 'события', 'событий')} сегодня · перетягивайте мышкой для переноса.`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 max-md:w-full">
                        <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                            onClick={() => {
                                const start = new Date()
                                start.setMinutes(0, 0, 0)
                                const end = new Date(start)
                                end.setHours(end.getHours() + 1)
                                setModal({ start, end })
                            }}
                        >
                            Добавить событие
                        </Button>
                    </div>
                </div>

                <Card padding="lg" className="overflow-hidden" data-tour="grid">
                    <div style={{ height: 'calc(100vh - 280px)', minHeight: 580 }}>
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

// Палитра событий. Дефолт — фирменный оранжевый платформы (не серый).
// Цвета как у Google Calendar: 10 семантических вариантов на выбор.
// Если у события явно задан color (hex) — используем его. Иначе подбираем
// по subject. В крайнем случае — brand.
const BRAND_PALETTE = { bg: '#FFF1EB', accent: '#FF7E58', fg: '#9A3412' }

function pickPalette(color: string | null | undefined, subject: string | null | undefined) {
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
        return { bg: hexWithAlpha(color, 0.18), accent: color, fg: darken(color) }
    }
    const s = (subject || '').toLowerCase()
    if (/математ|геометр|алгеб/.test(s))     return { bg: '#eef2ff', accent: '#6366f1', fg: '#312e81' }
    if (/русск|литер/.test(s))               return { bg: '#fff7ed', accent: '#fb923c', fg: '#9a3412' }
    if (/физик|хим|биол/.test(s))            return { bg: '#ecfdf5', accent: '#10b981', fg: '#065f46' }
    if (/англ|франц|нем/.test(s))            return { bg: '#eff6ff', accent: '#3b82f6', fg: '#1e3a8a' }
    if (/истор|общест|геогр/.test(s))        return { bg: '#fffbeb', accent: '#f59e0b', fg: '#92400e' }
    return BRAND_PALETTE
}

// Цветовая палитра для color picker в модалке — как у Google Calendar.
// Первый — brand (дефолт). При сохранении кладём hex в event.color,
// pickPalette подхватывает.
const COLOR_SWATCHES: { hex: string; label: string }[] = [
    { hex: '#FF7E58', label: 'Бренд' },
    { hex: '#EF4444', label: 'Красный' },
    { hex: '#F59E0B', label: 'Оранжевый' },
    { hex: '#FACC15', label: 'Жёлтый' },
    { hex: '#10B981', label: 'Зелёный' },
    { hex: '#06B6D4', label: 'Бирюзовый' },
    { hex: '#3B82F6', label: 'Синий' },
    { hex: '#6366F1', label: 'Индиго' },
    { hex: '#A855F7', label: 'Фиолетовый' },
    { hex: '#EC4899', label: 'Розовый' },
    { hex: '#64748B', label: 'Серый' },
]

function darken(hex: string): string {
    // Возвращаем тёмный вариант цвета для текста (затемнение на ~50%).
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const dr = Math.round(r * 0.4)
    const dg = Math.round(g * 0.4)
    const db = Math.round(b * 0.4)
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
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
    const isRecurring = !!initialEvent?.recurrenceRuleId || !!initialEvent?.isRecurringInstance
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
    const [color, setColor] = useState<string>(initialEvent?.color || '#FF7E58')
    const [recurrence, setRecurrence] = useState<string>(
        initialEvent?.recurrenceRule?.rrule || '',  // пресет или сырая RRULE
    )
    const [saving, setSaving] = useState(false)
    // Scope для редактирования повторов: 'single' = только эта копия,
    // 'all' = вся серия. Появляется как радио только если редактируем
    // повтор-копию. Для новых событий — нет.
    const [scope, setScope] = useState<'single' | 'all'>(
        initialEvent?.isRecurringInstance ? 'single' : 'all',
    )

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
            const payload: Record<string, any> = {
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
                color: color || null,
            }
            // Правило повторений отправляем только при создании или при
            // scope='all' (изменение мастера). Для scope='single' (отрыв
            // одной копии) правило не меняется — бэк скопирует мастер.
            if (!editing || scope === 'all') {
                payload.rrule = recurrence.trim() || ''
            }

            if (editing) {
                await apiClient.patch(
                    `/calendar/events/${initialEvent!.id}?scope=${scope}`,
                    payload,
                )
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
        const confirmMsg = isRecurring
            ? scope === 'single'
                ? 'Удалить ТОЛЬКО эту копию из серии?'
                : 'Удалить ВСЮ серию событий?'
            : 'Удалить событие?'
        if (!confirm(confirmMsg)) return
        setSaving(true)
        try {
            await apiClient.delete(
                `/calendar/events/${initialEvent!.id}?scope=${scope}`,
            )
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

                    {/* Повторение: пресеты + кастомное правило. Для отрыва
                        одной копии (scope='single') правило не редактируется. */}
                    {(scope === 'all' || !isRecurring) && (
                        <Field label="Повторение">
                            <RecurrencePicker
                                value={recurrence}
                                onChange={setRecurrence}
                                referenceDate={new Date(start)}
                            />
                        </Field>
                    )}

                    {/* Scope picker — появляется только при редактировании
                        копии серии. Решает: «изменить только эту» или «всю». */}
                    {editing && isRecurring && (
                        <Field label="Изменения применить к">
                            <div className="flex gap-2 flex-wrap">
                                <ScopeChip
                                    active={scope === 'single'}
                                    onClick={() => setScope('single')}
                                >
                                    Только эта копия
                                </ScopeChip>
                                <ScopeChip
                                    active={scope === 'all'}
                                    onClick={() => setScope('all')}
                                >
                                    Вся серия
                                </ScopeChip>
                            </div>
                        </Field>
                    )}

                    <Field label="Цвет">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {COLOR_SWATCHES.map((c) => {
                                const active = color === c.hex
                                return (
                                    <button
                                        key={c.hex}
                                        type="button"
                                        onClick={() => setColor(c.hex)}
                                        title={c.label}
                                        aria-label={c.label}
                                        className={cn(
                                            'w-7 h-7 rounded-full transition-transform',
                                            active ? 'scale-110 ring-2 ring-offset-2 ring-ink-400' : 'hover:scale-110',
                                        )}
                                        style={{ background: c.hex }}
                                    >
                                        {active && (
                                            <span className="text-white text-[12px] font-bold flex items-center justify-center w-full h-full">✓</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </Field>

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

// ─── RecurrencePicker ───────────────────────────────────────────────────
//
// Подбирает RRULE-строку (без DTSTART — её бэк подставит из startAt)
// по пресетам: «не повторять», «каждый день», «каждый <Вт>», «через раз
// от <Вт>», «каждый 2-й и 4-й <Чт>», «ежемесячно по числу N», «свой».
// referenceDate нужен для определения дня недели/числа месяца.

const DAY_RFC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const

function RecurrencePicker({
    value, onChange, referenceDate,
}: {
    value: string
    onChange: (next: string) => void
    referenceDate: Date
}) {
    const dow = referenceDate.getDay() // 0=Sunday … 6=Saturday
    const dowCode = DAY_RFC[dow]
    const dowLabel = DAY_RU[dow]
    const dom = referenceDate.getDate()

    // Какой Nth-of-month этот день? (1-й, 2-й… вторник месяца)
    const ordinalInMonth = Math.ceil(dom / 7)

    const presets: { id: string; label: string; rrule: string }[] = useMemo(() => ([
        { id: 'none', label: 'Не повторять', rrule: '' },
        { id: 'daily', label: 'Ежедневно', rrule: 'FREQ=DAILY' },
        { id: 'weekly', label: `Каждый ${dowLabel.toLowerCase()}`, rrule: `FREQ=WEEKLY;BYDAY=${dowCode}` },
        { id: 'biweekly', label: `Через неделю по ${dowLabel.toLowerCase()}`, rrule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dowCode}` },
        { id: 'weekdays', label: 'По будням (Пн–Пт)', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
        { id: 'tue_thu', label: 'Вт + Чт каждую неделю', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' },
        { id: 'second_fourth', label: `2-й и 4-й ${dowLabel.toLowerCase()} месяца`, rrule: `FREQ=MONTHLY;BYDAY=2${dowCode},4${dowCode}` },
        { id: 'monthly_dom', label: `Ежемесячно ${dom}-го числа`, rrule: `FREQ=MONTHLY;BYMONTHDAY=${dom}` },
        { id: 'monthly_nth', label: `Каждый ${ordinalInMonth}-й ${dowLabel.toLowerCase()} месяца`, rrule: `FREQ=MONTHLY;BYDAY=${ordinalInMonth}${dowCode}` },
        { id: 'custom', label: 'Свой (RRULE)', rrule: '__custom__' },
    ]), [dowCode, dowLabel, dom, ordinalInMonth])

    // Подбираем активный пресет по значению.
    const activeId = (() => {
        if (!value) return 'none'
        const hit = presets.find((p) => p.rrule === value && p.id !== 'custom')
        if (hit) return hit.id
        return 'custom'
    })()
    const [custom, setCustom] = useState(activeId === 'custom' ? value : '')

    const pick = (id: string) => {
        const p = presets.find((x) => x.id === id)
        if (!p) return
        if (id === 'custom') {
            onChange(custom || 'FREQ=WEEKLY')
        } else {
            onChange(p.rrule)
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <select
                value={activeId}
                onChange={(e) => pick(e.target.value)}
                className={inputCls}
            >
                {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                ))}
            </select>
            {activeId === 'custom' && (
                <input
                    value={custom}
                    onChange={(e) => { setCustom(e.target.value); onChange(e.target.value) }}
                    placeholder="FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260901T000000Z"
                    className={inputCls}
                />
            )}
            {value && (
                <div className="text-[11px] text-ink-500 leading-snug">
                    Правило применяется к этому событию и автоматически создаёт копии.
                    Перенос/удаление одной копии не двигает остальные.
                </div>
            )}
        </div>
    )
}

function ScopeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
                active
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-surface text-ink-700 border-ink-200 hover:border-brand-300',
            )}
        >
            {children}
        </button>
    )
}

function pluralize(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

// ─── Стили под платформенный дизайн ─────────────────────────────────────
//
// react-big-calendar отдаёт суровый «офисный» вид с серыми бордерами и
// чёрной кнопкой «Today». Перекрашиваем только нужные классы — палитра
// var(--brand-*) и var(--ink-*) уже определена в globals.css.

function CalendarThemeStyles() {
    return (
        <style jsx global>{`
            .rbc-calendar {
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                color: var(--ink-900);
            }
            /* Тулбар: цветные кнопки в стиле платформы */
            .rbc-toolbar {
                margin-bottom: 16px;
                gap: 8px;
                flex-wrap: wrap;
            }
            .rbc-toolbar .rbc-toolbar-label {
                font-weight: 700;
                font-size: 15px;
                color: var(--ink-900);
            }
            .rbc-toolbar .rbc-btn-group > button {
                padding: 6px 14px;
                font-size: 13px;
                font-weight: 600;
                background: white;
                color: var(--ink-700);
                border: 1px solid var(--ink-200);
                transition: all 0.15s;
            }
            .rbc-toolbar .rbc-btn-group > button:first-child {
                border-top-left-radius: 8px;
                border-bottom-left-radius: 8px;
            }
            .rbc-toolbar .rbc-btn-group > button:last-child {
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
            }
            .rbc-toolbar .rbc-btn-group > button:hover {
                background: var(--ink-50);
                color: var(--ink-900);
                border-color: var(--ink-300);
            }
            .rbc-toolbar .rbc-btn-group > button.rbc-active,
            .rbc-toolbar .rbc-btn-group > button.rbc-active:hover {
                background: var(--brand-500);
                color: white;
                border-color: var(--brand-500);
                box-shadow: 0 1px 2px rgba(255, 126, 88, 0.3);
            }

            /* Шапка с днями недели */
            .rbc-time-header {
                border-bottom: 1px solid var(--ink-200);
            }
            .rbc-time-header-cell .rbc-header {
                padding: 10px 6px;
                font-weight: 600;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--ink-500);
                border-bottom: none;
            }
            .rbc-time-header-cell .rbc-header.rbc-today {
                background: linear-gradient(180deg, var(--brand-50), transparent);
                color: var(--brand-700);
                font-weight: 700;
            }
            .rbc-month-view .rbc-header {
                padding: 8px;
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--ink-500);
                border-bottom: 1px solid var(--ink-200);
            }
            .rbc-month-view .rbc-header + .rbc-header,
            .rbc-month-row + .rbc-month-row,
            .rbc-day-bg + .rbc-day-bg,
            .rbc-time-content > * + * > * {
                border-color: var(--ink-100);
            }

            /* Сегодня — мягкий оранжевый фон */
            .rbc-today {
                background-color: rgba(255, 126, 88, 0.06) !important;
            }
            .rbc-day-slot.rbc-today,
            .rbc-month-view .rbc-day-bg.rbc-today {
                background-color: rgba(255, 126, 88, 0.07) !important;
            }

            /* Текущее время — brand-линия с точкой */
            .rbc-current-time-indicator {
                background: var(--brand-500);
                height: 2px;
                box-shadow: 0 0 0 2px rgba(255, 126, 88, 0.18);
            }
            .rbc-current-time-indicator::before {
                content: '';
                position: absolute;
                left: -4px;
                top: -4px;
                width: 10px;
                height: 10px;
                background: var(--brand-500);
                border-radius: 50%;
                box-shadow: 0 0 0 3px rgba(255, 126, 88, 0.2);
            }

            /* События: скруглённые с лёгкой тенью */
            .rbc-event,
            .rbc-day-slot .rbc-background-event {
                border-radius: 6px !important;
                box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
                padding: 3px 7px !important;
                transition: transform 0.1s, box-shadow 0.1s;
            }
            .rbc-event:hover {
                transform: translateY(-1px);
                box-shadow: 0 3px 8px rgba(15, 23, 42, 0.15);
            }
            .rbc-event.rbc-selected {
                box-shadow: 0 0 0 2px var(--brand-500), 0 3px 8px rgba(15, 23, 42, 0.15);
            }
            .rbc-event-label {
                font-size: 10px;
                font-weight: 500;
                opacity: 0.8;
            }
            .rbc-event-content {
                font-weight: 700;
                font-size: 12px;
                line-height: 1.3;
            }

            /* Время-гаттер */
            .rbc-time-gutter,
            .rbc-time-gutter .rbc-timeslot-group {
                font-size: 11px;
                color: var(--ink-500);
                font-weight: 500;
            }
            .rbc-time-gutter .rbc-time-slot {
                border-top: none;
            }
            .rbc-timeslot-group {
                border-color: var(--ink-100);
            }

            /* Slots в day-view (фон сетки) */
            .rbc-time-content {
                border-top: 1px solid var(--ink-200);
            }
            .rbc-time-content > .rbc-time-gutter {
                background: var(--ink-50);
            }
            .rbc-day-slot .rbc-time-slot {
                border-top-color: var(--ink-100);
            }

            /* Месячное представление: ячейки */
            .rbc-month-view {
                border: 1px solid var(--ink-200);
                border-radius: 8px;
                overflow: hidden;
            }
            .rbc-month-view .rbc-date-cell {
                padding: 6px 8px;
                font-size: 12px;
                color: var(--ink-700);
                font-weight: 600;
            }
            .rbc-month-view .rbc-date-cell.rbc-now {
                color: var(--brand-700);
            }
            .rbc-month-view .rbc-date-cell.rbc-off-range {
                color: var(--ink-300);
                font-weight: 400;
            }
            .rbc-show-more {
                color: var(--brand-700);
                font-weight: 600;
                font-size: 11px;
            }

            /* Agenda */
            .rbc-agenda-view table.rbc-agenda-table {
                border: 1px solid var(--ink-200);
                border-radius: 8px;
                overflow: hidden;
            }
            .rbc-agenda-view table.rbc-agenda-table thead > tr > th {
                background: var(--ink-50);
                color: var(--ink-700);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: 8px 12px;
                border-color: var(--ink-200);
            }
            .rbc-agenda-view table.rbc-agenda-table tbody > tr > td {
                padding: 10px 12px;
                font-size: 13px;
                border-color: var(--ink-100);
            }

            /* Выделение области (drag-select свободного слота) */
            .rbc-slot-selection {
                background: rgba(255, 126, 88, 0.18);
                color: var(--brand-700);
                font-weight: 600;
            }

            /* Off-range фон в месяце — мягкий, не «помойный» */
            .rbc-off-range-bg {
                background: var(--ink-50);
            }

            /* Время «прошлое» — слегка приглушённый фон */
            .rbc-day-slot .rbc-events-container {
                margin-right: 6px;
            }
        `}</style>
    )
}
