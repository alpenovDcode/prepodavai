'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import {
    ClipboardList, Clock, AlertTriangle, CalendarX, FileText, HelpCircle,
    Presentation, ArrowRight, ChevronRight, ImageIcon, Play, MessageCircle, Compass,
    BookOpenCheck,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { useUser } from '@/lib/hooks/useUser'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu, useCommandPalette } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Badge } from '@/components/ui/v2/Badge'
import { useTour } from '@/lib/tour/useTour'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface TeacherOverview {
    pendingGrading: {
        total: number
        byClass: { classId: string; className: string; pending: number }[]
    }
    schedule: {
        todayCount: number
        todayLessons: {
            id: string
            title: string
            scheduledAt: string
            durationMinutes: number | null
            className: string | null
        }[]
        nextLesson: {
            id: string
            title: string
            scheduledAt: string
            durationMinutes: number | null
            className: string | null
        } | null
    }
    atRisk: {
        riskCount: number
        watchCount: number
        samples: { id: string; name: string; className: string; avgGrade: number | null; level: 'risk' | 'watch' }[]
    }
    overdue: { count: number }
}

interface RecentGeneration {
    id: string
    type: string
    title: string
    classLabel?: string
    createdAt: string
    status?: 'ready' | 'pending' | 'failed'
}

const TOOLS: { id: string; title: string; eta: string; color: string; icon: any; href: string }[] = [
    { id: 'worksheet',    title: 'Рабочий лист',    eta: '~30 секунд', color: 'brand',   icon: FileText,     href: '/workspace?type=worksheet' },
    { id: 'quiz',         title: 'Генератор тестов', eta: '~30 секунд', color: 'info',    icon: HelpCircle,   href: '/workspace?type=quiz' },
    { id: 'presentation', title: 'Презентация',      eta: '~2 минуты',  color: 'success', icon: Presentation, href: '/workspace?type=presentation' },
    { id: 'lessonPlan',   title: 'План урока',       eta: '~1 минута',  color: 'warning', icon: ClipboardList, href: '/workspace?type=lessonPlan' },
]

function formatToday() {
    const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
    const d = new Date()
    return `${days[d.getDay()].charAt(0).toUpperCase()}${days[d.getDay()].slice(1)}, ${d.getDate()} ${months[d.getMonth()]}`
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function relativeTimeRu(iso: string): string {
    const d = new Date(iso)
    const diff = (d.getTime() - Date.now()) / 1000
    const abs = Math.abs(diff)
    if (abs < 60) return diff < 0 ? 'только что' : 'сейчас'
    if (abs < 3600) {
        const m = Math.round(abs / 60)
        return diff < 0 ? `${m} мин назад` : `через ${m} мин`
    }
    if (abs < 86400) {
        const h = Math.round(abs / 3600)
        return diff < 0 ? `${h} ч назад` : `через ${h} ч`
    }
    const days = Math.round(abs / 86400)
    return diff < 0 ? `${days} д назад` : `через ${days} д`
}

export default function DashboardHomeV2() {
    const router = useRouter()
    const { fullName } = useUser()
    const firstName = fullName.split(' ')[0]
    const menu = useMobileMenu()
    const palette = useCommandPalette()
    const tour = useTour()

    const { data: overview } = useSWR<TeacherOverview>('/analytics/teacher-overview', fetcher, {
        refreshInterval: 60_000,
    })

    const { data: recentGens } = useSWR<{ generations?: RecentGeneration[] }>('/generate/history?limit=4', fetcher)
    const { data: weeklyActivity } = useSWR<{ days?: { label: string; value: number }[] }>('/analytics/weekly-activity', fetcher)

    // События сегодня из календаря — диапазон от 00:00 до 23:59:59.
    // Слегка перекрываем с overview.schedule.todayLessons (там legacy
    // Lesson.scheduledAt), но /calendar/events возвращает уже всё в
    // объединённом виде (CalendarEvent + legacy лессоны).
    const todayRange = useMemo(() => {
        const f = new Date(); f.setHours(0, 0, 0, 0)
        const t = new Date(); t.setHours(23, 59, 59, 999)
        return { from: f.toISOString(), to: t.toISOString() }
    }, [])
    const { data: todayEvents } = useSWR<CalendarEventDTO[]>(
        `/calendar/events?from=${encodeURIComponent(todayRange.from)}&to=${encodeURIComponent(todayRange.to)}`,
        fetcher,
        { refreshInterval: 60_000 },
    )

    const subtitleParts = useMemo(() => {
        const parts = [formatToday()]
        if (overview?.schedule?.todayCount) {
            parts.push(`${overview.schedule.todayCount} ${pluralizeRu(overview.schedule.todayCount, 'урок', 'урока', 'уроков')} сегодня`)
        }
        return parts.join(' · ')
    }, [overview?.schedule?.todayCount])

    return (
        <>
            <Topbar
                title={<>Добро пожаловать, {firstName} <span aria-hidden>👋</span></>}
                subtitle={subtitleParts}
                onMobileMenuToggle={menu.toggle}
                onSearch={palette.open}
                actions={(
                    <Button variant="ghost" size="sm" leftIcon={<Compass className="w-4 h-4" />} onClick={tour.start}>Тур</Button>
                )}
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Баннер «уроки без записи в дневнике» */}
                <DiaryPendingBanner />

                {/* Bento — что важно сегодня */}
                <Section
                    tourId="today"
                    title="Что важно сегодня"
                    subtitle="Чтобы день прошёл спокойно"
                >
                    <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
                        <KpiCard
                            className="col-span-3 max-lg:col-span-6 max-md:col-span-1"
                            icon={<ClipboardList className="w-[18px] h-[18px]" />}
                            iconColor="warning"
                            label="Работ ждут проверки"
                            value={overview?.pendingGrading?.total ?? 0}
                            sub={topGradingClasses(overview)}
                            onClick={() => router.push('/dashboard/grading')}
                        />
                        <KpiCard
                            className="col-span-3 max-lg:col-span-6 max-md:col-span-1"
                            icon={<Clock className="w-[18px] h-[18px]" />}
                            iconColor="info"
                            label="Следующий урок"
                            value={overview?.schedule?.nextLesson?.scheduledAt ? formatTime(overview.schedule.nextLesson.scheduledAt) : '—'}
                            valueSize="md"
                            sub={nextLessonSub(overview)}
                            onClick={() => router.push('/dashboard/calendar')}
                        />
                        <KpiCard
                            className="col-span-3 max-lg:col-span-6 max-md:col-span-1"
                            icon={<AlertTriangle className="w-[18px] h-[18px]" />}
                            iconColor="danger"
                            label="Под наблюдением"
                            value={(overview?.atRisk?.riskCount ?? 0) + (overview?.atRisk?.watchCount ?? 0)}
                            customSub={
                                overview?.atRisk?.samples?.length
                                    ? <AvatarStack people={overview.atRisk.samples.slice(0, 3).map(s => initialsFrom(s.name))} extra={Math.max(0, (overview.atRisk.riskCount + overview.atRisk.watchCount) - 2)} />
                                    : null
                            }
                            onClick={() => router.push('/dashboard/students')}
                        />
                        <KpiCard
                            className="col-span-3 max-lg:col-span-6 max-md:col-span-1"
                            icon={<CalendarX className="w-[18px] h-[18px]" />}
                            iconColor="danger"
                            label="Просрочено"
                            value={overview?.overdue?.count ?? 0}
                            sub="заданий, дедлайн прошёл"
                            onClick={() => router.push('/dashboard/grading?tab=overdue')}
                        />
                    </div>
                </Section>

                {/* Часто используете */}
                <Section
                    tourId="favorites"
                    title="Часто используете"
                    subtitle="Запустить инструмент в один клик"
                    action={
                        <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => router.push('/workspace')}>
                            Все инструменты
                        </Button>
                    }
                >
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                        {TOOLS.map(t => (
                            <Card
                                key={t.id}
                                interactive
                                padding="md"
                                className="flex items-center gap-3 cursor-pointer hover:border-brand-300 hover:-translate-y-0.5 transition-all"
                                onClick={() => router.push(t.href)}
                            >
                                <IconTile color={t.color as any} size="md"><t.icon className="w-[18px] h-[18px]" /></IconTile>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-ink-900 truncate">{t.title}</div>
                                    <div className="text-[11px] text-ink-500">{t.eta}</div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0" />
                            </Card>
                        ))}
                    </div>
                </Section>

                {/* Расписание + последние материалы */}
                <Section>
                    <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-1">
                        <Card padding="lg" className="col-span-6 max-lg:col-span-1" data-tour="schedule">
                            <SectionHead
                                title="Расписание сегодня"
                                action={(
                                    <a
                                        className="text-sm font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
                                        onClick={() => router.push('/dashboard/calendar')}
                                    >
                                        Открыть календарь →
                                    </a>
                                )}
                                small
                            />
                            <div className="flex flex-col gap-3">
                                {todayEvents && todayEvents.length > 0 ? (
                                    todayEvents.map((e) => <CalendarEventRow key={e.id} ev={e} />)
                                ) : (
                                    <div className="py-8 text-center">
                                        <div className="text-sm text-ink-700 font-semibold mb-1">Сегодня свободно</div>
                                        <div className="text-[12px] text-ink-500">
                                            Можно поставить новое занятие — нажмите «Открыть календарь».
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>

                        <Card padding="lg" className="col-span-6 max-lg:col-span-1" data-tour="recent-materials">
                            <SectionHead
                                title="Последние материалы"
                                action={<a className="text-sm font-semibold text-brand-600 cursor-pointer" onClick={() => router.push('/dashboard/courses')}>Вся история →</a>}
                                small
                            />
                            <div className="flex flex-col gap-2">
                                {recentGens?.generations?.length ? (
                                    recentGens.generations.map(g => <RecentGenRow key={g.id} gen={g} />)
                                ) : (
                                    <div className="text-sm text-ink-500 py-8 text-center">Пока ничего не сгенерировано</div>
                                )}
                            </div>
                        </Card>
                    </div>
                </Section>

                {/* Активность за неделю + подсказка */}
                <Section>
                    <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-1">
                        <Card padding="lg" className="col-span-8 max-lg:col-span-1" data-tour="activity">
                            <SectionHead
                                title="Активность за неделю"
                                subtitle="Генерации и проверки ДЗ"
                                action={
                                    <div className="flex gap-1.5">
                                        <Button variant="secondary" size="sm">Неделя</Button>
                                        <Button variant="ghost" size="sm">Месяц</Button>
                                    </div>
                                }
                                small
                            />
                            <ActivityChart days={weeklyActivity?.days} />
                        </Card>

                        <TipsCard className="col-span-4 max-lg:col-span-1" onStartTour={tour.start} hasTour={tour.hasConfig} />
                    </div>
                </Section>
            </div>
        </>
    )
}

/* ---------- helpers ---------- */

function Section({ title, subtitle, action, children, tourId }: { title?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; tourId?: string }) {
    return (
        <section className="mb-8" data-tour={tourId}>
            {(title || action) && (
                <SectionHead title={title} subtitle={subtitle} action={action} />
            )}
            {children}
        </section>
    )
}

function SectionHead({ title, subtitle, action, small }: { title?: string; subtitle?: string; action?: React.ReactNode; small?: boolean }) {
    return (
        <div className={`flex items-end justify-between gap-3 ${small ? 'mb-4' : 'mb-5'}`}>
            <div className="min-w-0">
                {title && (
                    <h2 className={`font-display font-bold text-ink-900 tracking-tight ${small ? 'text-[16px]' : 'text-[18px]'}`}>{title}</h2>
                )}
                {subtitle && <div className="text-[13px] text-ink-500 mt-0.5">{subtitle}</div>}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
        </div>
    )
}

function KpiCard({
    icon, iconColor, label, value, valueSize = 'lg', sub, customSub, onClick, className,
}: {
    icon: React.ReactNode
    iconColor: 'warning' | 'info' | 'danger' | 'success' | 'brand'
    label: string
    value: string | number
    valueSize?: 'md' | 'lg'
    sub?: string | null
    customSub?: React.ReactNode
    onClick?: () => void
    className?: string
}) {
    return (
        <Card interactive padding="lg" onClick={onClick} className={className}>
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-700">
                    <IconTile size="sm" color={iconColor}>{icon}</IconTile>
                    {label}
                </div>
                <div className={`font-display font-extrabold text-ink-900 tnum leading-none ${valueSize === 'lg' ? 'text-[28px]' : 'text-[22px]'}`}>
                    {value}
                </div>
                {customSub || (sub && <div className="text-[12px] text-ink-500">{sub}</div>)}
            </div>
        </Card>
    )
}

function AvatarStack({ people, extra }: { people: string[]; extra: number }) {
    return (
        <div className="flex items-center -space-x-2 mt-0.5">
            {people.map((initials, i) => (
                <span key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white">
                    {initials}
                </span>
            ))}
            {extra > 0 && (
                <span className="w-7 h-7 rounded-full bg-ink-100 text-ink-600 font-bold text-[10px] flex items-center justify-center border-2 border-white">
                    +{extra}
                </span>
            )}
        </div>
    )
}

// Запись о сегодняшнем событии из /calendar/events — цветной полоской
// слева по предмету, badge'ом «идёт сейчас / скоро / завершён», как в
// LessonRow ниже, но универсальная (без зависимости от формата legacy).
interface CalendarEventDTO {
    id: string
    title: string
    startAt: string
    endAt: string
    subject?: string | null
    color?: string | null
    student?: { id: string; name: string } | null
    class?: { id: string; name: string } | null
    format?: string
    status?: string
    legacy?: boolean
}

function CalendarEventRow({ ev }: { ev: CalendarEventDTO }) {
    const start = new Date(ev.startAt)
    const end = new Date(ev.endAt)
    const now = Date.now()
    const isPast = now > end.getTime()
    const isCurrent = now >= start.getTime() && now <= end.getTime()
    const isSoon = !isCurrent && start.getTime() - now > 0 && start.getTime() - now < 90 * 60_000
    const durMin = Math.round((end.getTime() - start.getTime()) / 60000)

    const palette = subjectPalette(ev.color, ev.subject)
    const bg = isCurrent
        ? 'bg-brand-50 border border-brand-200'
        : isSoon
            ? 'bg-warning-50 border border-warning-200'
            : isPast
                ? 'bg-ink-50'
                : ''

    return (
        <div className={`flex gap-3 p-3 rounded-md relative ${bg} transition-colors`}>
            <div className="text-right flex-shrink-0 w-[54px]">
                <div className="font-bold text-sm text-ink-900 tnum">{formatTime(ev.startAt)}</div>
                <div className="text-[11px] text-ink-500 tnum">{durMin} мин</div>
            </div>
            <div className="w-[3px] rounded-sm flex-shrink-0" style={{ background: palette.accent }} />
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 text-sm truncate flex items-center gap-1.5">
                    {ev.title}
                </div>
                <div className="text-[12px] text-ink-500 mt-0.5 truncate">
                    {[ev.student?.name, ev.class?.name, ev.subject].filter(Boolean).join(' · ')}
                </div>
            </div>
            {isCurrent && <Badge variant="brand">идёт</Badge>}
            {isSoon && <Badge variant="warning">скоро · {relativeTimeRu(ev.startAt)}</Badge>}
            {isPast && <Badge variant="success">завершён</Badge>}
        </div>
    )
}

function subjectPalette(color: string | null | undefined, subject: string | null | undefined) {
    if (color && /^#[0-9a-f]{6}$/i.test(color)) return { accent: color }
    const s = (subject || '').toLowerCase()
    if (/математ|геометр|алгеб/.test(s))     return { accent: '#6366f1' }
    if (/русск|литер/.test(s))               return { accent: '#fb923c' }
    if (/физик|хим|биол/.test(s))            return { accent: '#10b981' }
    if (/англ|франц|нем/.test(s))            return { accent: '#3b82f6' }
    if (/истор|общест|геогр/.test(s))        return { accent: '#f59e0b' }
    return { accent: '#9ca3af' }
}

function LessonRow({ lesson }: { lesson: TeacherOverview['schedule']['todayLessons'][number] }) {
    const start = new Date(lesson.scheduledAt)
    const now = Date.now()
    const startedMs = now - start.getTime()
    const durMs = (lesson.durationMinutes ?? 45) * 60_000
    const isPast = startedMs > durMs
    const isCurrent = startedMs > 0 && !isPast
    const isSoon = startedMs < 0 && Math.abs(startedMs) < 90 * 60_000

    const bg = isCurrent || isSoon ? 'bg-brand-50 border border-brand-200' : isPast ? 'bg-ink-50' : ''
    const stripeColor = isCurrent || isSoon ? 'bg-brand-500' : isPast ? 'bg-ink-300' : 'bg-ink-200'

    return (
        <div className={`flex gap-4 p-3.5 rounded-md relative ${bg}`}>
            <div className="text-right flex-shrink-0 w-[54px]">
                <div className="font-bold text-sm text-ink-900 tnum">{formatTime(lesson.scheduledAt)}</div>
                {lesson.durationMinutes && <div className="text-[11px] text-ink-500 tnum">{lesson.durationMinutes} мин</div>}
            </div>
            <div className={`w-[3px] rounded-sm flex-shrink-0 ${stripeColor}`} />
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 text-sm truncate">{lesson.title}</div>
                {lesson.className && (
                    <div className="text-[12px] text-ink-500 mt-0.5 truncate">{lesson.className}</div>
                )}
            </div>
            {isPast && <Badge variant="success">завершён</Badge>}
            {(isCurrent || isSoon) && <Badge variant="brand">скоро · {relativeTimeRu(lesson.scheduledAt)}</Badge>}
            {!isPast && !isCurrent && !isSoon && <Button variant="secondary" size="sm">Материалы</Button>}
        </div>
    )
}

function RecentGenRow({ gen }: { gen: RecentGeneration }) {
    const map: Record<string, { icon: any; color: 'brand' | 'info' | 'success' | 'warning' | 'danger' }> = {
        worksheet:           { icon: FileText,     color: 'brand' },
        quiz:                { icon: HelpCircle,   color: 'info' },
        presentation:        { icon: Presentation, color: 'success' },
        image:               { icon: ImageIcon,    color: 'warning' },
        image_generation:    { icon: ImageIcon,    color: 'warning' },
        lesson_plan:         { icon: ClipboardList, color: 'warning' },
        'lesson-plan':       { icon: ClipboardList, color: 'warning' },
        lesson_preparation:  { icon: ClipboardList, color: 'warning' },
        vocabulary:          { icon: FileText,     color: 'success' },
        content_adaptation:  { icon: FileText,     color: 'info' },
        'content-adaptation':{ icon: FileText,     color: 'info' },
    }
    const m = map[gen.type] || { icon: FileText, color: 'brand' as const }
    const title = gen.title || prettyTypeLabel(gen.type)
    return (
        <div className="flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover:bg-ink-50 transition-colors">
            <IconTile color={m.color} size="sm"><m.icon className="w-[16px] h-[16px]" /></IconTile>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] text-ink-900 truncate">{title}</div>
                <div className="text-[11px] text-ink-500 truncate">
                    {gen.classLabel ? `${gen.classLabel} · ` : ''}{relativeTimeRu(gen.createdAt)}
                </div>
            </div>
            <Badge variant={gen.status === 'failed' ? 'danger' : gen.status === 'pending' ? 'warning' : 'success'}>
                {gen.status === 'failed' ? 'ошибка' : gen.status === 'pending' ? 'обработка' : 'готово'}
            </Badge>
        </div>
    )
}

function ActivityChart({ days }: { days?: { label: string; value: number }[] }) {
    const data = days ?? [
        { label: 'Пн', value: 0 }, { label: 'Вт', value: 0 }, { label: 'Ср', value: 0 },
        { label: 'Чт', value: 0 }, { label: 'Пт', value: 0 }, { label: 'Сб', value: 0 }, { label: 'Вс', value: 0 },
    ]
    const max = Math.max(1, ...data.map(d => d.value))
    return (
        <div className="grid grid-cols-7 gap-3 items-end h-[160px]">
            {data.map((d, i) => {
                const h = Math.max(8, Math.round((d.value / max) * 100))
                return (
                    <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
                        <div
                            className="w-full max-w-[32px] rounded-t-md bg-gradient-to-b from-brand-500 to-brand-300"
                            style={{ height: `${h}%` }}
                            title={`${d.value}`}
                        />
                        <span className="text-[11px] text-ink-500">{d.label}</span>
                    </div>
                )
            })}
        </div>
    )
}

function TipsCard({ className, onStartTour, hasTour }: { className?: string; onStartTour?: () => void; hasTour?: boolean }) {
    return (
        <div
            className={`relative overflow-hidden rounded-xl p-6 border ${className || ''}`}
            style={{
                background: 'linear-gradient(145deg, #fff7ed, #ffedd5)',
                borderColor: '#fed7aa',
            }}
        >
            <div
                aria-hidden
                className="absolute -top-[30px] -right-[30px] w-[140px] h-[140px] pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(255,126,88,0.18), transparent 70%)' }}
            />
            <div className="relative">
                <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border text-[11px] font-bold tracking-wide uppercase mb-3"
                    style={{ borderColor: '#fed7aa', color: '#ea580c' }}
                >
                    <Compass className="w-3 h-3" />
                    Подсказка
                </div>
                <h3 className="font-display font-bold text-[18px]" style={{ color: '#7c2d12' }}>Запутались в интерфейсе?</h3>
                <p className="text-[13.5px] leading-relaxed mt-2 mb-5" style={{ color: '#9a3412' }}>
                    Покажу за минуту, где что находится. Можно перезапустить в любой момент.
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Play className="w-3.5 h-3.5" />}
                        className="flex-1"
                        onClick={onStartTour}
                        disabled={!hasTour}
                    >
                        Запустить тур
                    </Button>
                    <a
                        href="https://t.me/prepodavai_help_bot"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button variant="secondary" size="sm"><MessageCircle className="w-4 h-4" /></Button>
                    </a>
                </div>
            </div>
        </div>
    )
}

/* ---------- small utils ---------- */

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

function topGradingClasses(o?: TeacherOverview): string | null {
    if (!o?.pendingGrading?.byClass?.length) return null
    const top = [...o.pendingGrading.byClass].sort((a, b) => b.pending - a.pending).slice(0, 2)
    return top.map(c => `${c.pending} в «${c.className}»`).join(', ')
}

function nextLessonSub(o?: TeacherOverview): string | null {
    const l = o?.schedule?.nextLesson
    if (!l) return null
    return `${l.title}${l.className ? ` · ${l.className}` : ''} · ${relativeTimeRu(l.scheduledAt)}`
}

function prettyTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        worksheet: 'Рабочий лист',
        quiz: 'Тест',
        presentation: 'Презентация',
        image: 'Изображение',
        image_generation: 'Изображение',
        lesson_plan: 'План урока',
        'lesson-plan': 'План урока',
        lesson_preparation: 'Вау-урок',
        vocabulary: 'Словарь',
        content_adaptation: 'Адаптация текста',
        'content-adaptation': 'Адаптация текста',
        feedback: 'Фидбек',
        message: 'Сообщение',
        game_generation: 'Игра',
        photosession: 'Фотосессия',
    }
    return labels[type] || type
}

function initialsFrom(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

// ─── Баннер «уроки без записи в дневнике» ───────────────────────────────
// Тянет /calendar/diary-pending, показывает компактный баннер с числом
// и кнопкой «Заполнить». Прячется когда всё заполнено (==0).
interface DiaryPendingItem {
    id: string
    title: string
    startAt: string
    student?: { id: string; name: string } | null
    subject?: string | null
}

function DiaryPendingBanner() {
    const router = useRouter()
    const { data } = useSWR<DiaryPendingItem[]>('/calendar/diary-pending', fetcher, {
        refreshInterval: 5 * 60_000,
    })
    if (!data || data.length === 0) return null

    const top = data.slice(0, 3)
    const more = data.length - top.length

    return (
        <div
            data-tour="diary-pending"
            className="mb-5 p-4 rounded-xl border flex items-start gap-3 flex-wrap"
            style={{
                background: 'linear-gradient(135deg, #FFF7ED, #FFFBEB)',
                borderColor: '#FCD34D',
            }}
        >
            <div className="w-10 h-10 rounded-lg bg-warning-500/15 flex items-center justify-center flex-shrink-0">
                <BookOpenCheck className="w-5 h-5 text-warning-700" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-[14px] text-ink-900">
                    {data.length} {pluralizeRu(data.length, 'урок', 'урока', 'уроков')} без записи в дневнике
                </div>
                <div className="text-[12.5px] text-ink-700 mt-0.5 truncate">
                    {top.map((e, i) => (
                        <span key={e.id}>
                            {i > 0 && ' · '}
                            <span className="font-semibold">{e.student?.name || '—'}</span>
                            {e.subject ? `, ${e.subject}` : ''}
                        </span>
                    ))}
                    {more > 0 && <span className="text-ink-500"> · и ещё {more}</span>}
                </div>
            </div>
            <Button
                variant="primary"
                size="sm"
                onClick={() => router.push('/dashboard/diary')}
            >
                Заполнить
            </Button>
        </div>
    )
}
