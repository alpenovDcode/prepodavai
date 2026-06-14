'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import {
    Settings2, CheckCheck, Trash2,
    BookOpen, GraduationCap, Trophy, MessageCircle, Circle,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { cn } from '@/lib/utils/cn'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

type FilterType = 'all' | 'unread' | 'assignment' | 'grade' | 'achievement' | 'message'
type Group = 'today' | 'yesterday' | 'week' | 'earlier'

interface NotifMeta {
    assignmentId?: string
    submissionId?: string
    teacherName?: string
    teacherInitials?: string
    teacherColor?: string
    subject?: string
    grade?: number | string
    xp?: number
    tag?: 'urgent' | 'new'
    dueDate?: string
}

interface Notification {
    id: string
    type: string
    title: string
    message: string
    isRead: boolean
    createdAt: string
    metadata?: NotifMeta | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const sec = (now.getTime() - d.getTime()) / 1000
    if (sec < 60) return 'только что'
    if (sec < 3600) return `${Math.round(sec / 60)} мин назад`
    if (sec < 86400) return `${Math.round(sec / 3600)} ч назад`
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) {
        return `вчера, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

const GROUP_LABELS: Record<Group, string> = {
    today: 'Сегодня',
    yesterday: 'Вчера',
    week: 'На этой неделе',
    earlier: 'Ранее',
}

function getGroup(iso: string): Group {
    const d = new Date(iso)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000)
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000)
    if (d >= todayStart) return 'today'
    if (d >= yesterdayStart) return 'yesterday'
    if (d >= weekStart) return 'week'
    return 'earlier'
}

function isToday(iso: string): boolean {
    return new Date(iso).toDateString() === new Date().toDateString()
}

const ICON_BG: Record<string, string> = {
    assignment:  'linear-gradient(135deg, #FEF3C7, #FBBF24)',
    grade:       'linear-gradient(135deg, #DBEAFE, #60A5FA)',
    achievement: 'linear-gradient(135deg, #FED7AA, #F97316)',
    message:     'linear-gradient(135deg, #E0E7FF, #818CF8)',
    reminder:    'linear-gradient(135deg, #FECDD3, #FB7185)',
    ai:          'linear-gradient(135deg, #D1FAE5, #34D399)',
    system:      'linear-gradient(135deg, #F1F5F9, #94A3B8)',
}

type TypeConfig = {
    icon: string
    iconBg: string
    filterClass: FilterType
    actionLabel?: string
    actionPath: (meta: NotifMeta | null | undefined) => string
    actionVariant?: 'primary' | 'secondary'
}

function getTypeConfig(type: string): TypeConfig {
    switch (type) {
        case 'assignment_created':
            return { icon: '📝', iconBg: ICON_BG.assignment, filterClass: 'assignment',
                actionLabel: 'Открыть', actionVariant: 'primary',
                actionPath: m => m?.assignmentId ? `/student/assignments/${m.assignmentId}` : '/student/assignments' }
        case 'deadline_reminder':
            return { icon: '⏰', iconBg: ICON_BG.reminder, filterClass: 'assignment',
                actionLabel: 'Открыть', actionVariant: 'primary',
                actionPath: m => m?.assignmentId ? `/student/assignments/${m.assignmentId}` : '/student/assignments' }
        case 'submission_graded':
            return { icon: '⭐', iconBg: ICON_BG.grade, filterClass: 'grade',
                actionLabel: 'Посмотреть', actionVariant: 'secondary',
                actionPath: m => m?.assignmentId ? `/student/assignments/${m.assignmentId}` : '/student/grades' }
        case 'achievement_unlocked':
            return { icon: '🏆', iconBg: ICON_BG.achievement, filterClass: 'achievement',
                actionLabel: 'Все награды', actionVariant: 'secondary',
                actionPath: () => '/student/achievements' }
        case 'teacher_message':
            return { icon: '💬', iconBg: ICON_BG.message, filterClass: 'message',
                actionLabel: 'Открыть', actionVariant: 'secondary',
                actionPath: () => '/student/messages' }
        case 'ai_response':
            return { icon: '🤖', iconBg: ICON_BG.ai, filterClass: 'message',
                actionLabel: 'Открыть чат', actionVariant: 'secondary',
                actionPath: () => '/student/ai-teacher' }
        default:
            return { icon: '📢', iconBg: ICON_BG.system, filterClass: 'message',
                actionPath: () => '/student/dashboard' }
    }
}

// ── AutoReadWrapper ───────────────────────────────────────────────────────────

function AutoReadWrapper({
    id, isUnread, onRead, children,
}: {
    id: string
    isUnread: boolean
    onRead: (id: string) => void
    children: React.ReactNode
}) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isUnread || !ref.current) return
        // Small delay so fast scrollers don't instantly mark everything read
        const timeout = setTimeout(() => {
            if (!ref.current) return
            const observer = new IntersectionObserver(
                ([entry]) => { if (entry.isIntersecting) { onRead(id); observer.disconnect() } },
                { threshold: 0.6 },
            )
            observer.observe(ref.current)
            return () => observer.disconnect()
        }, 1000)
        return () => clearTimeout(timeout)
    }, [id, isUnread, onRead])

    return <div ref={ref}>{children}</div>
}

// ── NotifCard ─────────────────────────────────────────────────────────────────

function NotifCard({
    notif, onRead, onNavigate,
}: {
    notif: Notification
    onRead: (id: string) => void
    onNavigate: (path: string, id: string) => void
}) {
    const cfg = getTypeConfig(notif.type)
    const meta = notif.metadata
    const isUnread = !notif.isRead

    const handleAction = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onNavigate(cfg.actionPath(meta), notif.id)
    }, [cfg, meta, notif.id, onNavigate])

    const handleClick = useCallback(() => {
        onNavigate(cfg.actionPath(meta), notif.id)
    }, [cfg, meta, notif.id, onNavigate])

    return (
        <AutoReadWrapper id={notif.id} isUnread={isUnread} onRead={onRead}>
            <div
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={e => e.key === 'Enter' && handleClick()}
                className={cn(
                    'relative grid gap-3.5 items-center rounded-lg border mb-2 cursor-pointer',
                    'transition-all duration-fast ease-out-expo',
                    'hover:border-ink-300 hover:shadow-sm hover:-translate-y-px',
                    isUnread
                        ? 'border-brand-200'
                        : 'bg-white border-ink-200',
                )}
                style={{
                    gridTemplateColumns: '44px 1fr auto',
                    padding: '14px 16px 14px 14px',
                    background: isUnread
                        ? 'linear-gradient(95deg, rgba(255,126,88,0.05) 0%, white 50%)'
                        : undefined,
                    opacity: isUnread ? 1 : 0.85,
                }}
            >
                {/* Unread accent bar */}
                {isUnread && (
                    <span
                        aria-hidden="true"
                        className="absolute rounded-r bg-brand-500"
                        style={{ left: -1, top: 8, bottom: 8, width: 3 }}
                    />
                )}

                {/* Icon */}
                <div
                    className="w-11 h-11 rounded-md flex items-center justify-center text-[22px] leading-none flex-shrink-0"
                    style={{ background: cfg.iconBg }}
                >
                    {cfg.icon}
                </div>

                {/* Body */}
                <div className="min-w-0">
                    {/* Title row */}
                    <div className={cn(
                        'text-[14px] leading-snug mb-0.5 flex flex-wrap items-center gap-2',
                        isUnread ? 'font-bold text-ink-900' : 'font-semibold text-ink-700',
                    )}>
                        {notif.type === 'submission_graded' && meta?.grade != null ? (
                            <>
                                Получена оценка{' '}
                                <b style={{ color: 'var(--success-700)' }}>{meta.grade}</b>
                            </>
                        ) : (
                            notif.title
                        )}

                        {meta?.tag === 'urgent' && (
                            <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full uppercase tracking-wide"
                                style={{ background: 'var(--danger-50)', color: 'var(--danger-700)' }}>
                                срочно
                            </span>
                        )}
                        {meta?.tag === 'new' && (
                            <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full uppercase tracking-wide"
                                style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
                                новое
                            </span>
                        )}
                        {meta?.xp && (
                            <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full uppercase tracking-wide"
                                style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
                                +{meta.xp} XP
                            </span>
                        )}
                        {meta?.subject && (
                            <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full uppercase tracking-wide"
                                style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}>
                                {meta.subject}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    <div className={cn('text-[13px] leading-relaxed', isUnread ? 'text-ink-600' : 'text-ink-500')}>
                        {notif.message}
                    </div>

                    {/* From */}
                    {meta?.teacherName && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                            <span
                                className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                style={{ background: meta.teacherColor || 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
                            >
                                {meta.teacherInitials ?? meta.teacherName.slice(0, 2)}
                            </span>
                            {meta.teacherName}{meta.subject ? ` · ${meta.subject}` : ''}
                        </div>
                    )}
                </div>

                {/* Right */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {isUnread && (
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: 'var(--brand-500)', boxShadow: '0 0 0 4px rgba(255,126,88,0.18)' }}
                            />
                        )}
                        <span className="text-[12px] text-ink-500 whitespace-nowrap">
                            {formatRelative(notif.createdAt)}
                        </span>
                    </div>
                    {cfg.actionLabel && (
                        <button
                            type="button"
                            onClick={handleAction}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[12px] font-bold border-none cursor-pointer',
                                'transition-colors duration-fast ease-out-expo',
                                cfg.actionVariant === 'primary'
                                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                            )}
                        >
                            {cfg.actionLabel}
                        </button>
                    )}
                </div>
            </div>
        </AutoReadWrapper>
    )
}

// ── Main Component ────────────────────────────────────────────────────────────

const LIST_URL  = '/notifications/student'
const COUNT_URL = '/notifications/student/unread-count'

export default function StudentNotificationsV2() {
    const router = useRouter()
    const menu = useStudentMobileMenu()
    const [filter, setFilter] = useState<FilterType>('all')

    const { data: raw, isLoading } = useSWR<Notification[]>(LIST_URL, fetcher, {
        refreshInterval: 30_000,
    })
    const notifications = useMemo(() => raw ?? [], [raw])

    const markRead = useCallback(async (id: string) => {
        const notif = notifications.find(n => n.id === id)
        if (!notif || notif.isRead) return
        try {
            await apiClient.patch(`/notifications/student/${id}/read`)
            globalMutate(LIST_URL)
            globalMutate(COUNT_URL)
        } catch { /* silent */ }
    }, [notifications])

    const handleNavigate = useCallback(async (path: string, id: string) => {
        await markRead(id)
        router.push(path)
    }, [markRead, router])

    const handleMarkAllRead = async () => {
        try {
            await apiClient.patch('/notifications/student/mark-all-read')
            globalMutate(LIST_URL)
            globalMutate(COUNT_URL)
            toast.success('Все уведомления прочитаны')
        } catch {
            toast.error('Не удалось обновить уведомления')
        }
    }

    const handleClearAll = async () => {
        if (!window.confirm('Удалить все уведомления? Это действие необратимо.')) return
        try {
            await apiClient.delete('/notifications/student/all')
            globalMutate(LIST_URL)
            globalMutate(COUNT_URL)
            toast.success('Уведомления удалены')
        } catch {
            toast.error('Не удалось удалить уведомления')
        }
    }

    // Summary counts
    const unreadCount = notifications.filter(n => !n.isRead).length
    const teacherCount = notifications.filter(n => n.type === 'teacher_message').length
    const newAssignmentCount = notifications.filter(n => n.type === 'assignment_created' && !n.isRead).length
    const deadlineTodayCount = notifications.filter(n => {
        if (n.type !== 'deadline_reminder') return false
        const due = n.metadata?.dueDate
        return due ? isToday(due) : isToday(n.createdAt)
    }).length

    const filterCounts: Record<FilterType, number> = {
        all:         notifications.length,
        unread:      unreadCount,
        assignment:  notifications.filter(n => ['assignment_created', 'deadline_reminder'].includes(n.type)).length,
        grade:       notifications.filter(n => n.type === 'submission_graded').length,
        achievement: notifications.filter(n => n.type === 'achievement_unlocked').length,
        message:     notifications.filter(n => ['teacher_message', 'ai_response'].includes(n.type)).length,
    }

    const filtered = useMemo(() => notifications.filter(n => {
        switch (filter) {
            case 'unread':      return !n.isRead
            case 'assignment':  return ['assignment_created', 'deadline_reminder'].includes(n.type)
            case 'grade':       return n.type === 'submission_graded'
            case 'achievement': return n.type === 'achievement_unlocked'
            case 'message':     return ['teacher_message', 'ai_response'].includes(n.type)
            default:            return true
        }
    }), [notifications, filter])

    const groups = useMemo(() => {
        const map: Record<Group, Notification[]> = { today: [], yesterday: [], week: [], earlier: [] }
        for (const n of filtered) map[getGroup(n.createdAt)].push(n)
        return (['today', 'yesterday', 'week', 'earlier'] as Group[])
            .filter(g => map[g].length > 0)
            .map(g => ({ key: g, label: GROUP_LABELS[g], items: map[g] }))
    }, [filtered])

    const SUM_CARDS = [
        { icon: '🔔', value: unreadCount,       label: 'непрочитанных',  bg: 'linear-gradient(135deg, #FED7AA, #FB923C)' },
        { icon: '💬', value: teacherCount,       label: 'от учителя',     bg: 'linear-gradient(135deg, #DBEAFE, #60A5FA)' },
        { icon: '📚', value: newAssignmentCount, label: 'новых задания',  bg: 'linear-gradient(135deg, #FEF3C7, #FBBF24)' },
        { icon: '⏰', value: deadlineTodayCount, label: 'дедлайн сегодня',bg: 'linear-gradient(135deg, #FECDD3, #FB7185)' },
    ] as const

    const FILTER_TABS: { id: FilterType; label: string; icon?: React.ReactNode }[] = [
        { id: 'all',         label: 'Все' },
        { id: 'unread',      label: 'Непрочитанные', icon: <Circle className="w-3.5 h-3.5" /> },
        { id: 'assignment',  label: 'Задания',        icon: <BookOpen className="w-3.5 h-3.5" /> },
        { id: 'grade',       label: 'Оценки',         icon: <GraduationCap className="w-3.5 h-3.5" /> },
        { id: 'achievement', label: 'Награды',         icon: <Trophy className="w-3.5 h-3.5" /> },
        { id: 'message',     label: 'От учителя',     icon: <MessageCircle className="w-3.5 h-3.5" /> },
    ]

    return (
        <>
            <Topbar
                title="Уведомления"
                subtitle="Всё важное в одном месте — без спама"
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
                hideNotifications
                actions={
                    <button
                        type="button"
                        onClick={() => toast('Настройки уведомлений скоро появятся', { icon: '⚙️' })}
                        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        Настроить
                    </button>
                }
            />

            <div className="max-w-[860px] w-full mx-auto p-8 max-md:p-4">

                {/* Summary cards */}
                <div
                    className="grid gap-3 mb-6"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
                >
                    {SUM_CARDS.map(sc => (
                        <div
                            key={sc.icon}
                            className="bg-white border border-ink-200 rounded-lg px-[18px] py-4 flex items-center gap-3.5"
                        >
                            <div
                                className="w-11 h-11 rounded-md flex items-center justify-center text-[22px] leading-none flex-shrink-0"
                                style={{ background: sc.bg }}
                            >
                                {sc.icon}
                            </div>
                            <div>
                                <div className="font-display font-extrabold text-[22px] text-ink-900 leading-none tnum">
                                    {sc.value}
                                </div>
                                <div className="text-[12px] text-ink-500 mt-1">{sc.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 flex-wrap mb-[18px]">
                    {/* Filter tabs */}
                    <div className="flex flex-wrap gap-1.5">
                        {FILTER_TABS.map(tab => {
                            const active = filter === tab.id
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setFilter(tab.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-semibold cursor-pointer',
                                        'transition-all duration-fast ease-out-expo',
                                        active
                                            ? 'border-brand-300 text-brand-800'
                                            : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300 hover:text-ink-900',
                                    )}
                                    style={active ? { background: 'var(--brand-50)' } : {}}
                                >
                                    {tab.icon && (
                                        <span className={active ? 'text-brand-600' : 'opacity-70'}>
                                            {tab.icon}
                                        </span>
                                    )}
                                    {tab.label}
                                    <span
                                        className={cn(
                                            'px-2 py-[1px] rounded-full text-[11px] font-bold',
                                            active ? 'text-brand-700' : 'bg-ink-100 text-ink-600',
                                        )}
                                        style={active ? { background: 'var(--brand-100)' } : {}}
                                    >
                                        {filterCounts[tab.id]}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Toolbar actions */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Прочитать всё
                        </button>
                        <button
                            type="button"
                            onClick={handleClearAll}
                            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Очистить
                        </button>
                    </div>
                </div>

                {/* Notifications list */}
                {isLoading ? (
                    <div className="text-center py-16 text-[14px] text-ink-500">Загрузка…</div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-lg border border-dashed border-ink-200">
                        <div className="w-[72px] h-[72px] mx-auto mb-3.5 bg-ink-100 rounded-lg flex items-center justify-center text-[36px]">
                            🎉
                        </div>
                        <h3 className="text-[18px] font-bold text-ink-800 mb-1.5">Нет уведомлений</h3>
                        <p className="text-[14px] text-ink-500">Всё проверено!</p>
                    </div>
                ) : (
                    groups.map(({ key, label, items }) => (
                        <div key={key}>
                            {/* Group title */}
                            <div className="flex items-center gap-2.5 mx-1 mt-6 mb-2.5 first:mt-0">
                                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500 whitespace-nowrap">
                                    {label}
                                </span>
                                <span className="flex-1 h-px bg-ink-200" aria-hidden="true" />
                            </div>

                            {items.map(n => (
                                <NotifCard
                                    key={n.id}
                                    notif={n}
                                    onRead={markRead}
                                    onNavigate={handleNavigate}
                                />
                            ))}
                        </div>
                    ))
                )}
            </div>
        </>
    )
}
