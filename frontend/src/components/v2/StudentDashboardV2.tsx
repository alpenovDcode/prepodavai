'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import {
    FileText, HelpCircle, Gamepad2, Presentation, ClipboardList,
    Flame, Trophy, Clock, Calendar, Check, AlertTriangle, Hourglass,
    CheckCircle2, Compass, Sparkles,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { Tabs } from '@/components/ui/v2/Tabs'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

type AssignmentStatus = 'pending' | 'submitted' | 'graded' | 'overdue'
type TabFilter = 'all' | 'pending' | 'submitted' | 'graded'

interface RawAssignment {
    id: string
    status: string
    dueDate?: string | null
    createdAt: string
    lesson: {
        title: string
        topic?: string | null
        generations?: { generationType: string }[]
    }
    class?: { name: string } | null
    submissions?: { status: string; createdAt: string; grade?: number | null }[]
}

interface Assignment extends RawAssignment {
    computedStatus: AssignmentStatus
    isUrgent: boolean
}

interface StudentProfile {
    id: string
    name: string
    className?: string | null
    streakDays?: number
    xp?: number
    achievements?: { key: string; title: string }[]
}

// ─── Type helpers ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    worksheet: 'Рабочий лист',
    test: 'Тест',
    quiz: 'Тест',
    game: 'Игра',
    presentation: 'Презентация',
    vocabulary: 'Словарь',
    lesson_plan: 'Материал',
    text_adaptation: 'Текст',
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    worksheet: FileText,
    test: HelpCircle,
    quiz: HelpCircle,
    game: Gamepad2,
    presentation: Presentation,
    vocabulary: ClipboardList,
    lesson_plan: ClipboardList,
    text_adaptation: FileText,
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
    worksheet:     { bg: 'bg-brand-50',   text: 'text-brand-700' },
    test:          { bg: 'bg-[#EFF6FF]',  text: 'text-blue-700' },
    quiz:          { bg: 'bg-[#EFF6FF]',  text: 'text-blue-700' },
    game:          { bg: 'bg-[#F0FDFA]',  text: 'text-teal-700' },
    presentation:  { bg: 'bg-warning-50', text: 'text-warning-700' },
    vocabulary:    { bg: 'bg-[#EEF2FF]',  text: 'text-indigo-700' },
    lesson_plan:   { bg: 'bg-[#EEF2FF]',  text: 'text-indigo-700' },
    text_adaptation: { bg: 'bg-brand-50', text: 'text-brand-700' },
}

function getPrimaryType(gens?: { generationType: string }[]): string {
    if (!gens || gens.length === 0) return 'worksheet'
    const priority = ['worksheet', 'quiz', 'test', 'game', 'presentation', 'vocabulary', 'lesson_plan', 'text_adaptation']
    for (const p of priority) {
        if (gens.some(g => g.generationType === p)) return p
    }
    return gens[0]?.generationType ?? 'worksheet'
}

function getEndOfWeek(): Date {
    const d = new Date()
    const day = d.getDay()
    const daysUntilSunday = day === 0 ? 0 : 7 - day
    d.setDate(d.getDate() + daysUntilSunday)
    d.setHours(23, 59, 59, 999)
    return d
}

function pluralize(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

function formatDeadline(due: Date): string {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const diffMs = due.getTime() - now.getTime()
    const diffH = Math.floor(diffMs / 3600000)
    const diffD = Math.floor(diffMs / 86400000)

    if (diffH < 24) {
        return `До завтра, ${due.getHours().toString().padStart(2, '0')}:${due.getMinutes().toString().padStart(2, '0')}`
    }
    const days = ['воскресенья', 'понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы']
    if (diffD <= 6) return `До ${days[due.getDay()]}`
    return `До ${due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GreetStat({ icon, value, label }: { icon?: React.ReactNode; value: string | number; label: string }) {
    return (
        <div className="bg-white border border-ink-200 rounded-xl px-[18px] py-[14px] min-w-[110px] text-center">
            <div className="font-display text-[22px] font-extrabold text-ink-900 tracking-tight leading-none tnum inline-flex items-center gap-1.5 justify-center">
                {icon}
                {value}
            </div>
            <div className="text-[11px] text-ink-500 font-semibold uppercase tracking-wide mt-1.5">{label}</div>
        </div>
    )
}

function GroupTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase text-ink-500 tracking-[0.06em] mt-5 mb-3 first:mt-0">
            {icon}
            {children}
            <span className="flex-1 h-px bg-ink-100" />
        </div>
    )
}

function DeadlineChip({ due, status }: { due: Date | null; status: AssignmentStatus }) {
    if (status === 'graded') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-success-50 text-success-700">
                <Check className="w-3 h-3" /> Завершено
            </span>
        )
    }
    if (status === 'submitted') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-ink-100 text-ink-600">
                <Hourglass className="w-3 h-3" /> На проверке
            </span>
        )
    }
    if (status === 'overdue') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-danger-50 text-danger-700">
                <AlertTriangle className="w-3 h-3" /> Просрочено
            </span>
        )
    }
    if (!due) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-ink-100 text-ink-600">
                Без срока
            </span>
        )
    }
    const isUrgent = due.getTime() - Date.now() < 24 * 3600 * 1000
    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold',
            isUrgent ? 'bg-warning-50 text-warning-700' : 'bg-ink-100 text-ink-600',
        )}>
            <Clock className="w-3 h-3" />
            {formatDeadline(due)}
        </span>
    )
}

function TaskCard({ a, onOpen }: { a: Assignment; onOpen: () => void }) {
    const type = getPrimaryType(a.lesson?.generations)
    const Icon = TYPE_ICONS[type] ?? FileText
    const colors = TYPE_COLORS[type] ?? { bg: 'bg-brand-50', text: 'text-brand-700' }
    const typeLabel = TYPE_LABELS[type] ?? 'Задание'
    const due = a.dueDate ? new Date(a.dueDate) : null
    const sub = a.submissions?.[0]
    const subject = a.class?.name?.split('—').pop()?.trim() ?? a.lesson?.topic ?? ''

    const isUrgent = a.isUrgent
    const isOverdue = a.computedStatus === 'overdue'
    const isDone = a.computedStatus === 'graded'

    const actionLabel = isDone ? 'Посмотреть' : a.computedStatus === 'submitted' ? 'Открыть' : isOverdue ? 'Сдать' : 'Начать'
    const actionVariant: 'primary' | 'secondary' | 'ghost' = isDone ? 'ghost' : isOverdue ? 'secondary' : a.computedStatus === 'submitted' ? 'secondary' : 'primary'

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={e => e.key === 'Enter' && onOpen()}
            className={cn(
                'bg-white border rounded-xl p-[18px] mb-2.5 grid gap-4 items-center cursor-pointer',
                'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
                'grid-cols-[48px_1fr_auto]',
                isUrgent && 'border-warning-300 hover:border-warning-400',
                isOverdue && 'border-[#FECACA]',
                isDone && 'opacity-85 border-ink-200',
                !isUrgent && !isOverdue && !isDone && 'border-ink-200 hover:border-brand-300',
            )}
            style={isOverdue ? { background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 30%)' } : undefined}
        >
            {/* Icon */}
            <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg)}>
                <Icon className={cn('w-[22px] h-[22px]', colors.text)} />
            </div>

            {/* Body */}
            <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-ink-900 leading-snug mb-1">
                    {typeLabel} · {a.lesson?.title ?? 'Задание'}
                </h3>
                <div className="flex items-center gap-2 flex-wrap text-[12px] text-ink-500">
                    {subject && (
                        <span className="bg-ink-100 text-ink-700 px-2 py-0.5 rounded-full font-semibold text-[11px]">
                            {subject}
                        </span>
                    )}
                    {isDone && sub?.grade != null && (
                        <span className="text-success-700 font-bold">+{sub.grade * 10} XP</span>
                    )}
                    {a.computedStatus === 'submitted' && (
                        <span>оценка появится позже</span>
                    )}
                    {isOverdue && (
                        <span className="text-danger-700 font-semibold">просрочено</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <DeadlineChip due={due} status={a.computedStatus} />
                <Button
                    variant={actionVariant}
                    size="sm"
                    onClick={e => { e.stopPropagation(); onOpen() }}
                    className={isOverdue && !isDone ? 'text-danger-700' : undefined}
                >
                    {actionLabel}
                </Button>
            </div>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentDashboardV2() {
    const router = useRouter()
    const menu = useStudentMobileMenu()
    const tour = useTour()
    const [filter, setFilter] = useState<TabFilter>('all')

    const { data: profile } = useSWR<StudentProfile>('/students/me', fetcher)
    const { data: rawAssignments, isLoading } = useSWR<RawAssignment[]>('/assignments/my', fetcher)

    useEffect(() => {
        apiClient.post('/gamification/check-in')
            .then(() => { globalMutate('/students/me') })
            .catch(() => {})
    }, [])

    const assignments = useMemo<Assignment[]>(() => {
        if (!rawAssignments) return []
        const now = Date.now()
        return rawAssignments.map(a => {
            const sub = a.submissions?.[0]
            const due = a.dueDate ? new Date(a.dueDate) : null
            let computedStatus: AssignmentStatus
            if (!sub) {
                computedStatus = due && due.getTime() < now ? 'overdue' : 'pending'
            } else if (sub.status === 'graded' || sub.grade != null) {
                computedStatus = 'graded'
            } else {
                computedStatus = 'submitted'
            }
            const isUrgent = computedStatus === 'pending' && !!due && due.getTime() - now < 24 * 3600 * 1000
            return { ...a, computedStatus, isUrgent }
        })
    }, [rawAssignments])

    // Tab counts
    const counts = useMemo(() => ({
        all: assignments.length,
        pending: assignments.filter(a => a.computedStatus === 'pending' || a.computedStatus === 'overdue').length,
        submitted: assignments.filter(a => a.computedStatus === 'submitted').length,
        graded: assignments.filter(a => a.computedStatus === 'graded').length,
    }), [assignments])

    // Greet stats
    const streakDays = profile?.streakDays ?? 0
    const achievementsCount = profile?.achievements?.length ?? 0
    const avgGrade = useMemo(() => {
        const graded = assignments.filter(a => (a.submissions?.[0]?.grade ?? null) != null)
        if (!graded.length) return null
        const sum = graded.reduce((s, a) => s + (a.submissions![0].grade as number), 0)
        return (sum / graded.length).toFixed(1).replace('.', ',')
    }, [assignments])

    // Week description
    const endOfWeek = useMemo(() => getEndOfWeek(), [])
    const weekCount = useMemo(() =>
        assignments.filter(a =>
            a.computedStatus !== 'graded' &&
            (!a.dueDate || new Date(a.dueDate) <= endOfWeek)
        ).length,
        [assignments, endOfWeek]
    )
    const urgentAssignment = useMemo(() =>
        assignments
            .filter(a => a.computedStatus === 'pending' && a.dueDate)
            .sort((x, y) => new Date(x.dueDate!).getTime() - new Date(y.dueDate!).getTime())[0] ?? null,
        [assignments]
    )

    const firstName = (profile?.name ?? 'Ученик').split(' ')[0]

    // Groups for "all" tab
    const groups = useMemo(() => {
        const urgent = assignments.filter(a => a.isUrgent)
        const week = assignments.filter(a =>
            a.computedStatus === 'pending' && !a.isUrgent &&
            a.dueDate && new Date(a.dueDate) <= endOfWeek
        )
        const later = assignments.filter(a =>
            a.computedStatus === 'pending' && !a.isUrgent &&
            (!a.dueDate || new Date(a.dueDate) > endOfWeek)
        )
        const submitted = assignments.filter(a => a.computedStatus === 'submitted')
        const allGraded = assignments.filter(a => a.computedStatus === 'graded')
        const overdue = assignments.filter(a => a.computedStatus === 'overdue')
        return { urgent, week, later, submitted, graded: allGraded.slice(0, 5), gradedTotal: allGraded.length, overdue }
    }, [assignments, endOfWeek])

    // Filtered list for non-"all" tabs
    const filteredList = useMemo(() => {
        switch (filter) {
            case 'pending':   return assignments.filter(a => a.computedStatus === 'pending' || a.computedStatus === 'overdue')
            case 'submitted': return assignments.filter(a => a.computedStatus === 'submitted')
            case 'graded':    return assignments.filter(a => a.computedStatus === 'graded')
            default:          return []
        }
    }, [assignments, filter])

    const isEmpty = filter === 'all'
        ? assignments.length === 0
        : filteredList.length === 0

    const openAssignment = (id: string) => router.push(`/student/assignments/${id}`)

    return (
        <>
            <Topbar
                title="Мои задания"
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Compass className="w-3.5 h-3.5" />}
                            onClick={tour.start}
                        >
                            Тур
                        </Button>
                        <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 font-semibold text-[12px] rounded-full px-3 h-9 whitespace-nowrap">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {streakDays} дней подряд
                        </div>
                    </div>
                }
            />

            <div className="max-w-[900px] w-full mx-auto p-8 max-md:p-4">

                {/* ── Greet block ── */}
                <div
                    data-tour="greet"
                    className="rounded-xl border border-brand-200 px-7 py-[26px] mb-6 grid grid-cols-[1fr_auto] gap-6 items-center max-md:grid-cols-1"
                    style={{ background: 'linear-gradient(135deg, var(--brand-50) 0%, #ffffff 70%)' }}
                >
                    <div>
                        <h1 className="font-display text-[26px] font-extrabold tracking-[-0.02em] text-ink-900 mb-1">
                            Привет, <span className="text-brand-600">{firstName}</span> 👋
                        </h1>
                        <p className="text-[14px] text-ink-600">
                            {weekCount > 0 ? (
                                <>
                                    У тебя{' '}
                                    <strong className="text-ink-900">
                                        {weekCount} {pluralize(weekCount, 'задание', 'задания', 'заданий')}
                                    </strong>{' '}
                                    на этой неделе.
                                    {urgentAssignment && (
                                        <> Самое срочное — {urgentAssignment.lesson?.title}.</>
                                    )}
                                </>
                            ) : (
                                'Пока заданий нет. Учителя добавят их сюда.'
                            )}
                        </p>
                    </div>
                    <div className="flex gap-4 max-md:flex-wrap">
                        <GreetStat
                            icon={<Flame className="w-[18px] h-[18px] text-amber-500" />}
                            value={streakDays}
                            label="стрик"
                        />
                        <GreetStat
                            icon={<Trophy className="w-[18px] h-[18px] text-amber-500" />}
                            value={achievementsCount}
                            label="ачивок"
                        />
                        <GreetStat value={avgGrade ?? '—'} label="средний балл" />
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div data-tour="tabs">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'all',       label: 'Все',          count: counts.all },
                        { id: 'pending',   label: 'К выполнению', count: counts.pending },
                        { id: 'submitted', label: 'На проверке',  count: counts.submitted },
                        { id: 'graded',    label: 'Завершено',    count: counts.graded },
                    ]}
                    active={filter}
                    onChange={k => setFilter(k as TabFilter)}
                    className="mb-5"
                />
                </div>

                {/* ── Content ── */}
                <div data-tour="task-groups">
                {isLoading ? (
                    <div className="text-center py-16 text-ink-500 text-[14px]">Загрузка…</div>
                ) : isEmpty ? (
                    <div className="text-center py-16">
                        <Sparkles className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <p className="text-[15px] font-semibold text-ink-900 mb-1">
                            {filter === 'all' ? 'Пока заданий нет' : 'В этой категории пусто'}
                        </p>
                        <p className="text-[13px] text-ink-500">Учителя добавят их сюда.</p>
                    </div>
                ) : filter === 'all' ? (
                    <>
                        {groups.urgent.length > 0 && (
                            <>
                                <GroupTitle icon={<Flame className="w-3.5 h-3.5 text-warning-500" />}>
                                    Срочно · до завтра
                                </GroupTitle>
                                {groups.urgent.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                            </>
                        )}

                        {groups.week.length > 0 && (
                            <>
                                <GroupTitle icon={<Calendar className="w-3.5 h-3.5 text-[var(--info-500,#3B82F6)]" />}>
                                    На этой неделе
                                </GroupTitle>
                                {groups.week.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                            </>
                        )}

                        {groups.later.length > 0 && (
                            <>
                                <GroupTitle icon={<Calendar className="w-3.5 h-3.5 text-ink-400" />}>
                                    Позже
                                </GroupTitle>
                                {groups.later.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                            </>
                        )}

                        {groups.submitted.length > 0 && (
                            <>
                                <GroupTitle icon={<Hourglass className="w-3.5 h-3.5 text-[var(--info-500,#3B82F6)]" />}>
                                    Ждут проверки
                                </GroupTitle>
                                {groups.submitted.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                            </>
                        )}

                        {groups.graded.length > 0 && (
                            <>
                                <GroupTitle icon={<CheckCircle2 className="w-3.5 h-3.5 text-success-500" />}>
                                    Завершено
                                </GroupTitle>
                                {groups.graded.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                                {groups.gradedTotal > 5 && (
                                    <button
                                        type="button"
                                        onClick={() => setFilter('graded')}
                                        className="w-full text-center text-[13px] text-brand-600 font-semibold hover:text-brand-700 py-2 mb-2"
                                    >
                                        Показать все ({groups.gradedTotal})
                                    </button>
                                )}
                            </>
                        )}

                        {groups.overdue.length > 0 && (
                            <>
                                <GroupTitle icon={<AlertTriangle className="w-3.5 h-3.5 text-danger-500" />}>
                                    Просрочено
                                </GroupTitle>
                                {groups.overdue.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)}
                            </>
                        )}
                    </>
                ) : (
                    // Filtered tab: flat list
                    filteredList.map(a => <TaskCard key={a.id} a={a} onOpen={() => openAssignment(a.id)} />)
                )}
                </div>
            </div>
        </>
    )
}
