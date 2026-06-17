'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
    Plus,
    Users,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Trophy,
    CheckCircle,
    Clock,
    Compass,
    Search,
    List,
    LayoutGrid,
    FilePlus2,
    FileText,
    MoreHorizontal,
    User,
    CalendarPlus,
    BarChart3,
    UserX,
    ChevronLeft,
    ChevronRight,
    Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { IconTile } from '@/components/ui/v2/IconTile'
import { useTour } from '@/lib/tour/useTour'

type RiskLevel = 'good' | 'watch' | 'risk' | 'unknown'

interface StudentRow {
    id: string
    name: string
    email: string | null
    avatar: string | null
    accessCode: string | null
    status: string
    createdAt: string
    classId: string
    class: { id: string; name: string }
    avgGrade: number | null
    totalAssigned: number
    totalSubmitted: number
    submissionRate: number
    onTimeRate: number | null
    lastActivityAt: string | null
    risk: RiskLevel
}

interface OverviewSummary {
    total: number
    classCount: number
    avgGrade: number | null
    avgGradeDelta: number | null
    onTimeRate: number | null
    onTimeRateDelta: number | null
    activeThisWeek: number
    atRiskCount: number
    newThisMonth: number
}

type StatusFilter = 'all' | 'risk' | 'watch' | 'good'
type ActivityFilter = 'all' | 'week' | '3days' | 'month'
type SortMode = 'name-asc' | 'name-desc' | 'grade-asc' | 'grade-desc' | 'activity' | 'created-new'
type ViewMode = 'table' | 'cards'

const PAGE_SIZE = 12

export default function StudentsPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const [students, setStudents] = useState<StudentRow[]>([])
    const [summary, setSummary] = useState<OverviewSummary | null>(null)
    const [loading, setLoading] = useState(true)

    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [classFilter, setClassFilter] = useState<string>('all')
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
    const [sortMode, setSortMode] = useState<SortMode>('name-asc')
    const [view, setView] = useState<ViewMode>('table')
    const [page, setPage] = useState(1)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const tour = useTour()

    const [classes, setClasses] = useState<Array<{id: string; name: string}>>([])
    // Add student modal
    const [showAddStudent, setShowAddStudent] = useState(false)
    const [studentName, setStudentName] = useState('')
    const [studentEmail, setStudentEmail] = useState('')
    const [studentPhone, setStudentPhone] = useState('')
    const [studentPassword, setStudentPassword] = useState('')
    const [studentClassId, setStudentClassId] = useState('')
    const [addingStudent, setAddingStudent] = useState(false)
    // Invite modal
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteClassId, setInviteClassId] = useState('')
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteCopied, setInviteCopied] = useState(false)
    // Confirm dialog
    const [confirmModal, setConfirmModal] = useState<{ msg: string; onConfirm: () => void } | null>(null)

    useEffect(() => {
        apiClient
            .get('/students/overview')
            .then((r: any) => {
                setStudents(r.data?.students || [])
                setSummary(r.data?.summary || null)
            })
            .catch(() => {
                toast.error('Не удалось загрузить учеников')
            })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        if (!openMenu) return
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement
            if (!t.closest('[data-row-menu]')) setOpenMenu(null)
        }
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [openMenu])

    const classOptions = useMemo(() => {
        const map = new Map<string, { id: string; name: string; count: number }>()
        for (const s of students) {
            const cur = map.get(s.class.id)
            if (cur) cur.count += 1
            else map.set(s.class.id, { id: s.class.id, name: s.class.name, count: 1 })
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [students])

    const statusCounts = useMemo(() => {
        const c = { risk: 0, watch: 0, good: 0 }
        for (const s of students) {
            if (s.risk === 'risk') c.risk += 1
            else if (s.risk === 'watch') c.watch += 1
            else if (s.risk === 'good') c.good += 1
        }
        return c
    }, [students])

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim()
        const now = Date.now()
        const dayMs = 24 * 60 * 60 * 1000
        return students
            .filter((s) => {
                if (q && !s.name.toLowerCase().includes(q) && !(s.email || '').toLowerCase().includes(q))
                    return false
                if (statusFilter !== 'all' && s.risk !== statusFilter) return false
                if (classFilter !== 'all' && s.classId !== classFilter) return false
                if (activityFilter !== 'all') {
                    const last = s.lastActivityAt ? new Date(s.lastActivityAt).getTime() : 0
                    const diff = now - last
                    if (activityFilter === 'week' && (!last || diff > 7 * dayMs)) return false
                    if (activityFilter === '3days' && (!last || diff < 3 * dayMs)) return false
                    if (activityFilter === 'month' && (!last || diff < 30 * dayMs)) return false
                }
                return true
            })
            .sort((a, b) => {
                switch (sortMode) {
                    case 'name-desc':
                        return b.name.localeCompare(a.name)
                    case 'grade-asc':
                        return (a.avgGrade ?? -1) - (b.avgGrade ?? -1)
                    case 'grade-desc':
                        return (b.avgGrade ?? -1) - (a.avgGrade ?? -1)
                    case 'activity': {
                        const la = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0
                        const lb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
                        return la - lb
                    }
                    case 'created-new':
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    default:
                        return a.name.localeCompare(b.name)
                }
            })
    }, [students, query, statusFilter, classFilter, activityFilter, sortMode])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(page, totalPages)
    const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

    useEffect(() => {
        setPage(1)
    }, [query, statusFilter, classFilter, activityFilter, sortMode, view])

    useEffect(() => {
        apiClient.get('/classes').then((r: any) => setClasses(r.data || [])).catch(() => {})
    }, [])

    const refetchStudents = useCallback(() => {
        setLoading(true)
        apiClient.get('/students/overview')
            .then((r: any) => {
                setStudents(r.data?.students || [])
                setSummary(r.data?.summary || null)
            })
            .catch(() => toast.error('Не удалось обновить список'))
            .finally(() => setLoading(false))
    }, [])

    const handleCreateStudent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!studentClassId) { toast.error('Выберите класс'); return }
        setAddingStudent(true)
        try {
            await apiClient.post('/students', {
                name: studentName,
                email: studentEmail || undefined,
                phone: studentPhone || undefined,
                password: studentPassword,
                classId: studentClassId,
            })
            toast.success('Ученик добавлен')
            setShowAddStudent(false)
            setStudentName(''); setStudentEmail(''); setStudentPhone('')
            setStudentPassword(''); setStudentClassId('')
            refetchStudents()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Ошибка при добавлении'
            if (err?.response?.status === 403) toast.error(`Лимит тарифа: ${msg}`)
            else toast.error(msg)
        } finally {
            setAddingStudent(false)
        }
    }

    const handleApproveStudent = async (id: string) => {
        try {
            await apiClient.post(`/students/${id}/approve`)
            setStudents(prev => prev.map(s => s.id === id ? { ...s, status: 'active' } : s))
            toast.success('Ученик принят')
        } catch { toast.error('Не удалось принять ученика') }
    }

    const handleRejectStudent = (id: string, name: string) => {
        setConfirmModal({
            msg: `Отклонить заявку «${name}»? Аккаунт будет удалён.`,
            onConfirm: async () => {
                try {
                    await apiClient.post(`/students/${id}/reject`)
                    setStudents(prev => prev.filter(s => s.id !== id))
                    toast.success('Заявка отклонена')
                } catch { toast.error('Не удалось отклонить') }
            },
        })
    }

    // Состояние модалки «Выдать задание». Открывается из меню строки ученика,
    // показывает список генераций (материалов) с поиском, по выбору создаёт
    // Assignment с прямой привязкой к этому ученику.
    const [assignFor, setAssignFor] = useState<{ id: string; name: string } | null>(null)

    const handleDeleteStudent = (id: string, name: string) => {
        setConfirmModal({
            msg: `Удалить ученика «${name}»? Это действие нельзя отменить.`,
            onConfirm: async () => {
                try {
                    await apiClient.delete(`/students/${id}`)
                    setStudents(prev => prev.filter(s => s.id !== id))
                    toast.success('Ученик удалён')
                } catch { toast.error('Не удалось удалить ученика') }
            },
        })
    }

    const handleCreateInvite = async () => {
        setInviteLoading(true)
        try {
            const res: any = await apiClient.post('/student-invites', { classId: inviteClassId || undefined })
            setInviteUrl(`${window.location.origin}/invite/${res.data.token}`)
        } catch { toast.error('Не удалось создать приглашение') }
        finally { setInviteLoading(false) }
    }

    const toggleSelectAll = () => {
        if (selected.size === paged.length) setSelected(new Set())
        else setSelected(new Set(paged.map((s) => s.id)))
    }

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <>
            <Topbar
                title="Ученики"
                subtitle={
                    summary
                        ? `${summary.total} ${pluralizeRu(summary.total, 'ученик', 'ученика', 'учеников')} · ${summary.classCount} ${pluralizeRu(summary.classCount, 'класс', 'класса', 'классов')}${summary.avgGrade !== null ? ` · средний балл ${formatGrade(summary.avgGrade)}` : ''}`
                        : undefined
                }
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={tour.start}
                            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                        >
                            <Compass className="w-3.5 h-3.5" />
                            Тур
                        </button>
                        <Button variant="secondary" size="sm" leftIcon={<Users className="w-4 h-4" />} onClick={() => router.push('/dashboard/classes')}>
                            Создать класс
                        </Button>
                        <Button variant="secondary" size="sm" leftIcon={<Link2 className="w-4 h-4" />} onClick={() => { setInviteUrl(null); setInviteClassId(''); setShowInviteModal(true) }}>
                            Пригласить
                        </Button>
                        <Button data-tour="add-student" variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowAddStudent(true)}>
                            Добавить ученика
                        </Button>
                    </div>
                }
                notificationsCount={summary?.atRiskCount}
            />

            {/* Sub-navigation */}
            <div className="border-b border-ink-200 bg-surface px-8 max-md:px-4">
                <div className="flex gap-0 max-w-[1320px] mx-auto">
                    {([
                        { label: 'Ученики', href: '/dashboard/students', active: true },
                        { label: 'Классы', href: '/dashboard/classes', active: false },
                        { label: 'Домашние задания', href: '/dashboard/assignments', active: false },
                        { label: 'Аналитика', href: '/dashboard/analytics', active: false },
                        { label: 'Дневник учителя', href: '/dashboard/diary', active: false },
                    ] as const).map(({ label, href, active }) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => router.push(href)}
                            className={cn(
                                'relative px-4 py-3 text-[14px] font-semibold transition-colors whitespace-nowrap',
                                active ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900',
                            )}
                        >
                            {label}
                            {active && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t bg-brand-500" />}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-[1320px] w-full mx-auto p-8 max-md:p-4">
                {loading ? (
                    <div className="text-center py-24 text-ink-500">Загрузка…</div>
                ) : (
                    <>
                        {summary && summary.atRiskCount > 0 && (
                            <div
                                data-tour="alert"
                                className="mb-5 flex items-center gap-4 flex-wrap px-5 py-4 rounded-lg border"
                                style={{
                                    background: 'linear-gradient(90deg, #FEF2F2 0%, #FFFFFF 80%)',
                                    borderColor: '#FECACA',
                                }}
                            >
                                <div
                                    className="w-11 h-11 rounded-md bg-white flex items-center justify-center flex-shrink-0"
                                    style={{ border: '1px solid #FCA5A5', color: 'var(--danger-500)' }}
                                >
                                    <AlertTriangle className="w-[22px] h-[22px]" />
                                </div>
                                <div className="flex-1 min-w-[220px]">
                                    <div className="font-bold text-ink-900 text-sm">
                                        {summary.atRiskCount}{' '}
                                        {pluralizeRu(summary.atRiskCount, 'ученик', 'ученика', 'учеников')} под наблюдением
                                    </div>
                                    <div className="text-[13px] text-ink-600 mt-0.5">
                                        Балл упал на 15% за 2 недели или пропустили 2+ дедлайна подряд
                                    </div>
                                </div>
                            </div>
                        )}

                        <div data-tour="stats" className="grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4 mb-6">
                            <Card className="flex flex-col gap-2">
                                <div className="text-[13px] font-medium text-ink-500 flex items-center gap-2">
                                    <IconTile color="brand" size="sm"><Users className="w-3.5 h-3.5" /></IconTile>
                                    Всего учеников
                                </div>
                                <div className="font-display text-[28px] font-extrabold text-ink-900 leading-none tnum">
                                    {summary?.total ?? 0}
                                </div>
                                {!!summary?.newThisMonth && (
                                    <div className="text-xs font-semibold inline-flex items-center gap-1 text-success-700">
                                        <TrendingUp className="w-3 h-3" />+{summary.newThisMonth} в этом месяце
                                    </div>
                                )}
                            </Card>

                            <Card className="flex flex-col gap-2">
                                <div className="text-[13px] font-medium text-ink-500 flex items-center gap-2">
                                    <IconTile color="success" size="sm"><Trophy className="w-3.5 h-3.5" /></IconTile>
                                    Средний балл
                                </div>
                                <div className="font-display text-[28px] font-extrabold text-ink-900 leading-none tnum">
                                    {summary?.avgGrade !== null && summary?.avgGrade !== undefined
                                        ? formatGrade(summary.avgGrade)
                                        : '—'}
                                </div>
                                {summary?.avgGradeDelta !== null && summary?.avgGradeDelta !== undefined ? (
                                    <div className={`text-xs font-semibold inline-flex items-center gap-1 ${summary.avgGradeDelta >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                                        {summary.avgGradeDelta >= 0
                                            ? <TrendingUp className="w-3 h-3" />
                                            : <TrendingDown className="w-3 h-3" />}
                                        {summary.avgGradeDelta >= 0 ? '+' : ''}{formatGrade(summary.avgGradeDelta)} за месяц
                                    </div>
                                ) : (
                                    <div className="text-xs text-ink-500">по всем работам</div>
                                )}
                            </Card>

                            <Card className="flex flex-col gap-2">
                                <div className="text-[13px] font-medium text-ink-500 flex items-center gap-2">
                                    <IconTile color="info" size="sm"><CheckCircle className="w-3.5 h-3.5" /></IconTile>
                                    Сдают ДЗ вовремя
                                </div>
                                <div className="font-display text-[28px] font-extrabold text-ink-900 leading-none tnum">
                                    {summary?.onTimeRate !== null && summary?.onTimeRate !== undefined
                                        ? `${summary.onTimeRate}%`
                                        : '—'}
                                </div>
                                {summary?.onTimeRateDelta !== null && summary?.onTimeRateDelta !== undefined ? (
                                    <div className={`text-xs font-semibold inline-flex items-center gap-1 ${summary.onTimeRateDelta >= 0 ? 'text-success-700' : 'text-danger-700'}`}>
                                        {summary.onTimeRateDelta >= 0
                                            ? <TrendingUp className="w-3 h-3" />
                                            : <TrendingDown className="w-3 h-3" />}
                                        {summary.onTimeRateDelta >= 0 ? '+' : ''}{summary.onTimeRateDelta}% за неделю
                                    </div>
                                ) : (
                                    <div className="text-xs text-ink-500">за всё время</div>
                                )}
                            </Card>

                            <Card className="flex flex-col gap-2">
                                <div className="text-[13px] font-medium text-ink-500 flex items-center gap-2">
                                    <IconTile color="warning" size="sm"><Clock className="w-3.5 h-3.5" /></IconTile>
                                    Активны на неделе
                                </div>
                                <div className="font-display text-[28px] font-extrabold text-ink-900 leading-none tnum">
                                    {summary?.activeThisWeek ?? 0}
                                    <span className="text-ink-400"> / {summary?.total ?? 0}</span>
                                </div>
                                <div className="text-xs text-ink-500">
                                    {summary && summary.total > 0
                                        ? `${Math.round((summary.activeThisWeek / summary.total) * 100)}% вовлечённость`
                                        : '—'}
                                </div>
                            </Card>
                        </div>

                        <div data-tour="search" className="relative mb-3.5">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Поиск по имени или email…"
                                className="w-full h-11 pl-11 pr-4 rounded-full bg-surface border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all"
                            />
                        </div>

                        <div data-tour="filters" className="flex items-center gap-2 mb-5 flex-wrap">
                            <FilterSelect
                                value={statusFilter}
                                onChange={(v) => setStatusFilter(v as StatusFilter)}
                                options={[
                                    { value: 'all', label: `Все ученики · ${summary?.total ?? 0}` },
                                    { value: 'risk', label: `🔴 На риске · ${statusCounts.risk}` },
                                    { value: 'watch', label: `🟡 Снижение · ${statusCounts.watch}` },
                                    { value: 'good', label: `🟢 В норме · ${statusCounts.good}` },
                                ]}
                            />
                            <FilterSelect
                                value={classFilter}
                                onChange={setClassFilter}
                                options={[
                                    { value: 'all', label: `Все классы · ${students.length}` },
                                    ...classOptions.map((c) => ({
                                        value: c.id,
                                        label: `${c.name} · ${c.count} ${pluralizeRu(c.count, 'ученик', 'ученика', 'учеников')}`,
                                    })),
                                ]}
                            />
                            <FilterSelect
                                value={activityFilter}
                                onChange={(v) => setActivityFilter(v as ActivityFilter)}
                                options={[
                                    { value: 'all', label: 'Активность: все' },
                                    { value: 'week', label: 'Активные на этой неделе' },
                                    { value: '3days', label: 'Не выходили 3+ дней' },
                                    { value: 'month', label: 'Не выходили месяц' },
                                ]}
                            />
                            <FilterSelect
                                value={sortMode}
                                onChange={(v) => setSortMode(v as SortMode)}
                                options={[
                                    { value: 'name-asc', label: 'Сортировка: имя А–Я' },
                                    { value: 'name-desc', label: 'Имя Я–А' },
                                    { value: 'grade-asc', label: 'Балл (низкий → высокий)' },
                                    { value: 'grade-desc', label: 'Балл (высокий → низкий)' },
                                    { value: 'activity', label: 'Активность (давно не был)' },
                                    { value: 'created-new', label: 'Новые сначала' },
                                ]}
                            />

                            <div data-tour="view-toggle" className="ml-auto inline-flex bg-ink-100 rounded-full p-1">
                                <button
                                    type="button"
                                    onClick={() => setView('table')}
                                    className={`h-7 px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all ${
                                        view === 'table'
                                            ? 'bg-white text-ink-900 shadow-sm'
                                            : 'text-ink-600 hover:text-ink-900'
                                    }`}
                                >
                                    <List className="w-3.5 h-3.5" /> Таблица
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setView('cards')}
                                    className={`h-7 px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all ${
                                        view === 'cards'
                                            ? 'bg-white text-ink-900 shadow-sm'
                                            : 'text-ink-600 hover:text-ink-900'
                                    }`}
                                >
                                    <LayoutGrid className="w-3.5 h-3.5" /> Карточки
                                </button>
                            </div>
                        </div>

                        <div data-tour="content">
                        {filtered.length === 0 ? (
                            <Card padding="lg" className="text-center">
                                <Users className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                                <h3 className="font-display font-bold text-ink-900 mb-1">
                                    {students.length === 0 ? 'Учеников пока нет' : 'Никого не нашли'}
                                </h3>
                                <p className="text-[13px] text-ink-500 mb-4">
                                    {students.length === 0
                                        ? 'Добавьте первого ученика, чтобы начать.'
                                        : 'Попробуйте смягчить фильтры или поиск.'}
                                </p>
                                {students.length === 0 && (
                                    <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
                                        Добавить
                                    </Button>
                                )}
                            </Card>
                        ) : view === 'table' ? (
                            <Card padding="none" className="overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[900px] border-collapse">
                                        <thead className="bg-surface-soft border-b border-ink-200">
                                            <tr>
                                                <th className="w-10 px-4 py-3 text-left">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 accent-brand-500"
                                                        checked={
                                                            paged.length > 0 && selected.size === paged.length
                                                        }
                                                        onChange={toggleSelectAll}
                                                    />
                                                </th>
                                                <Th>Ученик</Th>
                                                <Th>Класс</Th>
                                                <Th numeric>Средний балл</Th>
                                                <Th numeric>Сдано ДЗ</Th>
                                                <Th>Статус</Th>
                                                <Th>Активность</Th>
                                                <th className="w-[140px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paged.map((s) => (
                                                <tr
                                                    key={s.id}
                                                    className="border-b border-ink-100 last:border-b-0 hover:bg-surface-soft transition-colors cursor-pointer"
                                                    onClick={() => router.push(`/dashboard/students/${s.id}`)}
                                                >
                                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 accent-brand-500"
                                                            checked={selected.has(s.id)}
                                                            onChange={() => toggleSelect(s.id)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <RiskAvatar name={s.name} risk={s.risk} />
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-ink-900 text-sm truncate">
                                                                    {s.name}
                                                                </div>
                                                                {s.email && (
                                                                    <div className="text-xs text-ink-500 truncate">
                                                                        {s.email}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-ink-100 text-ink-700">
                                                            {s.class.name}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <GradeCell grade={s.avgGrade} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right tnum">
                                                        <span
                                                            className={`font-semibold ${
                                                                s.totalAssigned > 0 && s.submissionRate < 0.5
                                                                    ? 'text-danger-700'
                                                                    : 'text-ink-900'
                                                            }`}
                                                        >
                                                            {s.totalSubmitted} / {s.totalAssigned}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <RiskBadge risk={s.risk} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-xs text-ink-500">
                                                        {formatRelativeTime(s.lastActivityAt)}
                                                    </td>
                                                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                        {s.status === 'pending' ? (
                                                            <div className="flex gap-1.5 justify-end">
                                                                <button type="button" onClick={() => handleApproveStudent(s.id)}
                                                                    className="px-3 py-1.5 text-xs font-bold bg-success-600 text-white rounded-md hover:bg-success-700 transition-colors">
                                                                    Принять
                                                                </button>
                                                                <button type="button" onClick={() => handleRejectStudent(s.id, s.name)}
                                                                    className="px-3 py-1.5 text-xs font-bold border border-danger-500 text-danger-700 rounded-md hover:bg-danger-50 transition-colors">
                                                                    Отклонить
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <RowActions
                                                                isOpen={openMenu === s.id}
                                                                onToggle={() =>
                                                                    setOpenMenu(openMenu === s.id ? null : s.id)
                                                                }
                                                                onView={() =>
                                                                    router.push(`/dashboard/students/${s.id}`)
                                                                }
                                                                onDelete={() => handleDeleteStudent(s.id, s.name)}
                                                                onAssign={() =>
                                                                    setAssignFor({ id: s.id, name: s.name })
                                                                }
                                                            />
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {totalPages > 1 && (
                                    <div className="px-4 py-3.5 border-t border-ink-100 flex items-center justify-between flex-wrap gap-3">
                                        <div className="text-[13px] text-ink-500">
                                            Показано{' '}
                                            <strong className="text-ink-900">{paged.length}</strong> из{' '}
                                            <strong className="text-ink-900">{filtered.length}</strong>
                                        </div>
                                        <Pagination
                                            page={safePage}
                                            totalPages={totalPages}
                                            onChange={setPage}
                                        />
                                    </div>
                                )}
                            </Card>
                        ) : (
                            <>
                                <div className="grid gap-3.5 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                                    {paged.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => router.push(`/dashboard/students/${s.id}`)}
                                            className="text-left bg-surface border border-ink-200 rounded-lg p-4 cursor-pointer hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <RiskAvatar name={s.name} risk={s.risk} large />
                                                <div className="min-w-0">
                                                    <div className="font-bold text-ink-900 text-[15px] truncate">
                                                        {s.name}
                                                    </div>
                                                    {s.email && (
                                                        <div className="text-xs text-ink-500 truncate">
                                                            {s.email}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <RiskBadge risk={s.risk} className="self-start" />
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-ink-500">Класс</span>
                                                <span className="text-ink-900 font-semibold">{s.class.name}</span>
                                            </div>
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-ink-500">Средний балл</span>
                                                <span className={`font-semibold tnum ${gradeColor(s.avgGrade)}`}>
                                                    {s.avgGrade !== null ? formatGrade(s.avgGrade) : '—'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-ink-500">Сдано ДЗ</span>
                                                <span className="font-semibold text-ink-900 tnum">
                                                    {s.totalSubmitted} / {s.totalAssigned}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-ink-500">Активность</span>
                                                <span className="font-semibold text-ink-900">
                                                    {formatRelativeTime(s.lastActivityAt)}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {totalPages > 1 && (
                                    <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                                        <div className="text-[13px] text-ink-500">
                                            Показано{' '}
                                            <strong className="text-ink-900">{paged.length}</strong> из{' '}
                                            <strong className="text-ink-900">{filtered.length}</strong>
                                        </div>
                                        <Pagination
                                            page={safePage}
                                            totalPages={totalPages}
                                            onChange={setPage}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                        </div>
                    </>
                )}
            </div>

            {selected.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-4 bg-ink-900 text-white rounded-full px-6 py-3 shadow-2xl">
                    <span className="text-sm font-semibold whitespace-nowrap">
                        Выбрано {selected.size}
                    </span>
                    <button
                        type="button"
                        onClick={() => toast('Массовые действия скоро')}
                        className="text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
                    >
                        Действия
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 transition-colors text-lg leading-none"
                        aria-label="Снять выделение"
                    >
                        ×
                    </button>
                </div>
            )}

            {showAddStudent && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowAddStudent(false)}>
                    <div className="bg-surface rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-ink-900 mb-5">Добавить ученика</h2>
                        <form onSubmit={handleCreateStudent} className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Имя и фамилия</label>
                                <input type="text" required value={studentName} onChange={e => setStudentName(e.target.value)}
                                    placeholder="Иван Иванов"
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Email</label>
                                <input type="email" required value={studentEmail} onChange={e => setStudentEmail(e.target.value)}
                                    placeholder="ivan@example.com"
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Телефон <span className="font-normal text-ink-400">(необязательно)</span></label>
                                <input type="tel" value={studentPhone} onChange={e => setStudentPhone(e.target.value)}
                                    placeholder="+7 999 123-45-67"
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Пароль</label>
                                <input type="password" required minLength={6} value={studentPassword} onChange={e => setStudentPassword(e.target.value)}
                                    placeholder="Минимум 6 символов"
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Класс</label>
                                <select required value={studentClassId} onChange={e => setStudentClassId(e.target.value)}
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 bg-surface">
                                    <option value="">Выберите класс</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setShowAddStudent(false)}
                                    className="flex-1 h-10 rounded-md border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-colors">
                                    Отмена
                                </button>
                                <button type="submit" disabled={addingStudent}
                                    className="flex-1 h-10 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-colors disabled:opacity-60">
                                    {addingStudent ? 'Добавляем…' : 'Добавить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showInviteModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-surface rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-ink-900 mb-1">Пригласить ученика</h3>
                        <p className="text-[13px] text-ink-500 mb-4">Создайте ссылку-приглашение. Ученик зарегистрируется по ней и будет закреплён за вами.</p>
                        {!inviteUrl ? (
                            <>
                                <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-wider">Класс <span className="font-normal text-ink-400">(необязательно)</span></label>
                                <select value={inviteClassId} onChange={e => setInviteClassId(e.target.value)}
                                    className="w-full h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-900 mb-4 bg-surface focus:outline-none focus:border-brand-400">
                                    <option value="">Без привязки к классу</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowInviteModal(false)}
                                        className="flex-1 h-10 rounded-md border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-colors">
                                        Отмена
                                    </button>
                                    <button type="button" onClick={handleCreateInvite} disabled={inviteLoading}
                                        className="flex-1 h-10 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-colors disabled:opacity-60">
                                        {inviteLoading ? 'Создаём…' : 'Создать ссылку'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex gap-2 mb-4">
                                    <input readOnly value={inviteUrl}
                                        className="flex-1 h-10 px-3 rounded-md border border-ink-200 text-sm text-ink-700 font-mono bg-surface-soft" />
                                    <button type="button"
                                        onClick={() => { navigator.clipboard.writeText(inviteUrl); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000) }}
                                        className="px-4 h-10 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
                                        {inviteCopied ? 'Скопировано!' : 'Копировать'}
                                    </button>
                                </div>
                                <button type="button" onClick={() => setShowInviteModal(false)}
                                    className="w-full h-10 rounded-md border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-colors">
                                    Закрыть
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {confirmModal && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
                    <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="w-11 h-11 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-5 h-5 text-danger-700" />
                        </div>
                        <p className="text-sm text-ink-700 text-center mb-5 leading-relaxed">{confirmModal.msg}</p>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setConfirmModal(null)}
                                className="flex-1 h-10 rounded-md border border-ink-200 text-sm font-semibold text-ink-700 hover:bg-ink-50 transition-colors">
                                Отмена
                            </button>
                            <button type="button" onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                                className="flex-1 h-10 rounded-md bg-danger-500 hover:bg-danger-700 text-white text-sm font-bold transition-colors">
                                Подтвердить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {assignFor && (
                <AssignToStudentModal
                    studentId={assignFor.id}
                    studentName={assignFor.name}
                    onClose={() => setAssignFor(null)}
                />
            )}
        </>
    )
}

function Th({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
    return (
        <th
            className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-500 whitespace-nowrap ${numeric ? 'text-right' : 'text-left'}`}
        >
            {children}
        </th>
    )
}

function FilterSelect({
    value,
    onChange,
    options,
}: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
}) {
    return (
        <div className="relative inline-flex items-center">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 pl-3.5 pr-9 appearance-none rounded-full bg-surface border border-ink-200 text-[13.5px] font-semibold text-ink-700 cursor-pointer hover:bg-ink-50 hover:border-ink-300 hover:text-ink-900 focus:outline-none focus:border-brand-300 focus:ring-[3px] focus:ring-brand-400/15 transition-all"
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            <span
                className="absolute right-3.5 top-1/2 w-2 h-2 pointer-events-none"
                style={{
                    transform: 'translateY(-65%) rotate(45deg)',
                    borderRight: '1.5px solid var(--ink-500)',
                    borderBottom: '1.5px solid var(--ink-500)',
                }}
            />
        </div>
    )
}

function RiskAvatar({ name, risk, large }: { name: string; risk: RiskLevel; large?: boolean }) {
    const initials = nameToInitials(name)
    const size = large ? 'w-11 h-11 text-[15px]' : 'w-9 h-9 text-[13px]'
    const gradient =
        risk === 'risk'
            ? 'linear-gradient(135deg, #FCA5A5, #DC2626)'
            : risk === 'watch'
              ? 'linear-gradient(135deg, #FDE68A, #D97706)'
              : 'linear-gradient(135deg, var(--brand-300), var(--brand-500))'
    return (
        <span
            className={`inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 ${size}`}
            style={{ background: gradient }}
            aria-hidden
        >
            {initials}
        </span>
    )
}

function GradeCell({ grade }: { grade: number | null }) {
    if (grade === null) return <span className="text-ink-400">—</span>
    const pct = Math.max(4, Math.min(100, (grade / 5) * 100))
    const barColor =
        grade < 3.5
            ? 'var(--danger-500)'
            : grade < 4
              ? 'var(--warning-500)'
              : 'var(--success-500)'
    return (
        <span className="inline-flex items-center gap-2 tnum">
            <span className="w-16 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                <i
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, background: barColor }}
                />
            </span>
            <strong className="text-ink-900">{formatGrade(grade)}</strong>
        </span>
    )
}

function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
    const map: Record<RiskLevel, { label: string; bg: string; color: string; dot: string }> = {
        good:    { label: 'В норме',     bg: 'var(--success-50)', color: 'var(--success-700)', dot: 'var(--success-500)' },
        watch:   { label: 'Снижение',    bg: 'var(--warning-50)', color: 'var(--warning-700)', dot: 'var(--warning-500)' },
        risk:    { label: 'Риск',        bg: 'var(--danger-50)',  color: 'var(--danger-700)',  dot: 'var(--danger-500)'  },
        unknown: { label: 'Нет данных',  bg: 'var(--ink-100)',    color: 'var(--ink-600)',     dot: 'var(--ink-400)'     },
    }
    const conf = map[risk]
    return (
        <span
            className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${className || ''}`}
            style={{ background: conf.bg, color: conf.color }}
        >
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: conf.dot }} />
            {conf.label}
        </span>
    )
}

function RowActions({
    isOpen,
    onToggle,
    onView,
    onDelete,
    onAssign,
}: {
    isOpen: boolean
    onToggle: () => void
    onView: () => void
    onDelete: () => void
    onAssign: () => void
}) {
    const router = useRouter()
    const btnRef = useRef<HTMLButtonElement>(null)
    // Меню рендерится через portal в document.body, чтобы не клипилось
    // overflow-hidden родительской `Card`/таблицы. Позиция вычисляется
    // от bounding-rect кнопки и обновляется на ресайз/скролл.
    const [coords, setCoords] = useState<{ top: number; right: number; openUp: boolean } | null>(null)

    useLayoutEffect(() => {
        if (!isOpen || !btnRef.current) return
        const compute = () => {
            const rect = btnRef.current!.getBoundingClientRect()
            const MENU_HEIGHT = 280
            // Если до низа окна меньше места, чем нужно — открываем вверх.
            const openUp = window.innerHeight - rect.bottom < MENU_HEIGHT && rect.top > MENU_HEIGHT
            setCoords({
                top: openUp ? rect.top - 4 : rect.bottom + 4,
                right: window.innerWidth - rect.right,
                openUp,
            })
        }
        compute()
        window.addEventListener('scroll', compute, true)
        window.addEventListener('resize', compute)
        return () => {
            window.removeEventListener('scroll', compute, true)
            window.removeEventListener('resize', compute)
        }
    }, [isOpen])

    return (
        <div className="flex gap-1 justify-end items-center" data-row-menu>
            <button
                ref={btnRef}
                type="button"
                title="Меню"
                onClick={(e) => {
                    e.stopPropagation()
                    onToggle()
                }}
                className="w-8 h-8 rounded-sm flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
            >
                <MoreHorizontal className="w-[15px] h-[15px]" />
            </button>
            {isOpen && coords && typeof document !== 'undefined' && createPortal(
                <div
                    data-row-menu
                    className="fixed bg-surface border border-ink-200 rounded-md p-1.5 min-w-[220px] z-[100]"
                    style={{
                        top: coords.openUp ? undefined : coords.top,
                        bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
                        right: coords.right,
                        boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <MenuItem
                        icon={<User className="w-3.5 h-3.5" />}
                        label="Открыть профиль"
                        onClick={() => { onView(); onToggle() }}
                    />
                    <MenuItem
                        icon={<CalendarPlus className="w-3.5 h-3.5" />}
                        label="Запланировать урок"
                        onClick={() => { router.push('/dashboard/calendar'); onToggle() }}
                    />
                    <MenuItem
                        icon={<FilePlus2 className="w-3.5 h-3.5" />}
                        label="Выдать задание"
                        onClick={() => { onAssign(); onToggle() }}
                    />
                    <MenuItem
                        icon={<BarChart3 className="w-3.5 h-3.5" />}
                        label="Статистика"
                        onClick={() => { onView(); onToggle() }}
                    />
                    <div className="h-px bg-ink-100 my-1 mx-0.5" />
                    <MenuItem
                        danger
                        icon={<UserX className="w-3.5 h-3.5" />}
                        label="Удалить ученика"
                        onClick={() => { onDelete(); onToggle() }}
                    />
                </div>,
                document.body,
            )}
        </div>
    )
}

function MenuItem({
    icon,
    label,
    onClick,
    danger,
}: {
    icon: React.ReactNode
    label: string
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-sm text-[13px] font-medium text-left transition-colors ${
                danger
                    ? 'text-danger-700 hover:bg-danger-50'
                    : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
            }`}
        >
            {icon}
            {label}
        </button>
    )
}

function Pagination({
    page,
    totalPages,
    onChange,
}: {
    page: number
    totalPages: number
    onChange: (p: number) => void
}) {
    const pages = buildPageList(page, totalPages)
    return (
        <div className="flex gap-1 items-center">
            <PageButton disabled={page === 1} onClick={() => onChange(page - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
            </PageButton>
            {pages.map((p, i) =>
                p === '…' ? (
                    <span key={`d-${i}`} className="px-1.5 text-ink-400">
                        …
                    </span>
                ) : (
                    <PageButton key={p} active={p === page} onClick={() => onChange(p)}>
                        {p}
                    </PageButton>
                ),
            )}
            <PageButton disabled={page === totalPages} onClick={() => onChange(page + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
            </PageButton>
        </div>
    )
}

function PageButton({
    children,
    active,
    disabled,
    onClick,
}: {
    children: React.ReactNode
    active?: boolean
    disabled?: boolean
    onClick?: () => void
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`h-8 min-w-[32px] px-2 rounded-sm border text-[13px] font-semibold inline-flex items-center justify-center transition-all ${
                active
                    ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'border-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
            {children}
        </button>
    )
}

function buildPageList(current: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const set = new Set<number>([1, total, current - 1, current, current + 1])
    const list = Array.from(set)
        .filter((p) => p >= 1 && p <= total)
        .sort((a, b) => a - b)
    const out: (number | '…')[] = []
    for (let i = 0; i < list.length; i++) {
        if (i > 0 && list[i] - list[i - 1] > 1) out.push('…')
        out.push(list[i])
    }
    return out
}

function nameToInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return (parts[0]?.slice(0, 2) || '?').toUpperCase()
}

function formatGrade(g: number): string {
    return g.toFixed(1).replace('.', ',')
}

function gradeColor(g: number | null): string {
    if (g === null) return 'text-ink-400'
    if (g < 3.5) return 'text-danger-700'
    if (g < 4) return 'text-warning-700'
    return 'text-success-700'
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return 'нет данных'
    const d = new Date(iso).getTime()
    const now = Date.now()
    const diff = now - d
    const min = 60 * 1000
    const hour = 60 * min
    const day = 24 * hour
    if (diff < hour) return `${Math.max(1, Math.floor(diff / min))} мин назад`
    if (diff < day) {
        const h = Math.floor(diff / hour)
        return `${h} ч назад`
    }
    const days = Math.floor(diff / day)
    if (days === 0) return 'сегодня'
    if (days === 1) return 'вчера'
    if (days < 30) return `${days} ${pluralizeRu(days, 'день', 'дня', 'дней')} назад`
    const months = Math.floor(days / 30)
    return `${months} ${pluralizeRu(months, 'месяц', 'месяца', 'месяцев')} назад`
}

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}

// ─── AssignToStudentModal ───────────────────────────────────────────────
//
// Модалка «Выдать задание»: пикер из истории генераций (раздел «Материалы»).
// Фильтр по типу + поиск + дата дедлайна. POST /assignments с lessonId
// материала и студентом — за один клик.
interface GenerationItem {
    id: string
    type: string
    title?: string | null
    params?: any            // slim-mode из бэка
    lessonId?: string | null
    createdAt: string
}

function AssignToStudentModal({
    studentId, studentName, onClose,
}: { studentId: string; studentName: string; onClose: () => void }) {
    const [items, setItems] = useState<GenerationItem[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [pickedId, setPickedId] = useState<string | null>(null)
    const [dueDate, setDueDate] = useState<string>('')   // "yyyy-MM-ddTHH:mm" локальное
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await apiClient.get('/generate/history?limit=50&slim=1')
                if (cancelled) return
                const list = (res.data?.generations || []) as GenerationItem[]
                // Скрываем только незавершённые/упавшие генерации — у них нет
                // нормального outputData. lessonId фильтровать НЕ надо: бэк
                // сам создаёт default lesson при генерации, но для старых
                // записей оно могло не выставиться — на этапе assign
                // подскажем учителю.
                setItems(list.filter((g) => !!g.title || !!g.params?.topic))
            } catch {
                toast.error('Не удалось загрузить материалы')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [])

    const filtered = items.filter((g) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        return (g.title || '').toLowerCase().includes(q)
            || (g.type || '').toLowerCase().includes(q)
            || (g.params?.topic || '').toLowerCase().includes(q)
            || (g.params?.subject || '').toLowerCase().includes(q)
    })

    const picked = items.find((g) => g.id === pickedId) || null

    const submit = async () => {
        if (!picked) { toast.error('Выберите материал'); return }
        setSubmitting(true)
        try {
            let lessonId = picked.lessonId
            // У старых генераций lessonId мог не сохраниться — линкуем
            // на лету, бэк сам создаст/привяжет default lesson.
            if (!lessonId) {
                try {
                    const linkRes = await apiClient.post(`/generate/${picked.id}/link-lesson`, {})
                    lessonId = linkRes.data?.lessonId || linkRes.data?.id
                } catch {}
            }
            if (!lessonId) {
                toast.error('Не удалось определить урок для этого материала')
                return
            }
            const payload: Record<string, any> = {
                lessonId,
                generationId: picked.id,
                studentId,
            }
            if (dueDate) payload.dueDate = new Date(dueDate).toISOString()
            await apiClient.post('/assignments', payload)
            toast.success(`Задание выдано ученику «${studentName}»`)
            onClose()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось выдать')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
            <div
                className="bg-surface rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-ink-100 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-display font-bold text-[18px] text-ink-900">Выдать задание</h2>
                        <div className="text-[12px] text-ink-500 mt-0.5">Ученик: <strong className="text-ink-900">{studentName}</strong></div>
                    </div>
                    <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-900 text-2xl leading-none">×</button>
                </div>

                <div className="p-4 border-b border-ink-100">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск по названию или теме…"
                        className="w-full h-10 px-3 rounded-md border border-ink-200 bg-surface text-[14px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15"
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-3 min-h-[200px] max-h-[420px]">
                    {loading ? (
                        <div className="text-center py-12 text-ink-500 text-[13px]">Загружаем материалы…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-8 h-8 mx-auto text-ink-300 mb-2" />
                            <div className="text-[13px] text-ink-700 font-semibold">
                                {items.length === 0 ? 'Сначала создайте материал' : 'Ничего не найдено'}
                            </div>
                            <div className="text-[11px] text-ink-500 mt-1">
                                {items.length === 0 ? 'Перейдите в «ИИ Генератор», сгенерируйте материал — он появится здесь.' : 'Попробуйте другой запрос.'}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map((g) => {
                                const active = g.id === pickedId
                                const label = g.title || g.params?.topic || prettyType(g.type) || 'Материал'
                                const meta = [prettyType(g.type), g.params?.grade, g.params?.subject].filter(Boolean).join(' · ')
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setPickedId(g.id)}
                                        className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors ${
                                            active
                                                ? 'border-brand-300 bg-brand-50'
                                                : 'border-ink-100 hover:border-ink-200 hover:bg-ink-50'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${active ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-600'}`}>
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-[13px] text-ink-900 truncate">{label}</div>
                                            <div className="text-[11px] text-ink-500 truncate">{meta || 'без метаданных'}</div>
                                        </div>
                                        {active && <div className="text-brand-700 text-[18px] leading-none">✓</div>}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-ink-100 flex items-center gap-3 flex-wrap">
                    <div className="flex flex-col flex-1 min-w-[200px]">
                        <label className="text-[11px] font-semibold text-ink-600 uppercase tracking-wide mb-1">Дедлайн (необязательно)</label>
                        <input
                            type="datetime-local"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="h-10 px-3 rounded-md border border-ink-200 bg-surface text-[14px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15"
                        />
                    </div>
                    <div className="flex gap-2 ml-auto">
                        <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Отмена</Button>
                        <Button variant="primary" size="sm" onClick={submit} loading={submitting} disabled={!picked}>
                            Выдать
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function prettyType(t: string): string {
    const map: Record<string, string> = {
        worksheet: 'Рабочий лист',
        quiz: 'Тест',
        test: 'Тест',
        presentation: 'Презентация',
        vocabulary: 'Словарь',
        lesson_plan: 'План урока',
        'lesson-plan': 'План урока',
        lesson_preparation: 'Вау-урок',
        content_adaptation: 'Учебный материал',
        'content-adaptation': 'Учебный материал',
        image: 'Изображение',
        image_generation: 'Изображение',
        game: 'Игра',
        game_generation: 'Игра',
    }
    return map[t] || t
}
