'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { FileText, HelpCircle, BookOpen, Clock, CheckCircle, Flame, Star, Sparkles, AlertCircle } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface Assignment {
    id: string
    status?: string
    dueDate?: string
    lesson: {
        title: string
        topic?: string
        generations?: { generationType: string }[]
    }
    submissions?: { status: string; createdAt: string; grade?: number | null }[]
}

interface Profile {
    id: string
    name: string
    className?: string | null
    streakDays?: number
    xp?: number
}

type Filter = 'all' | 'pending' | 'submitted' | 'done'

export default function StudentDashboardV2() {
    const router = useRouter()
    const menu = useStudentMobileMenu()

    const [filter, setFilter] = useState<Filter>('all')

    // Реактивные данные: список заданий + профиль (содержит gamification).
    const { data: assignmentsData, isLoading: aLoading } = useSWR<Assignment[]>('/assignments/my', fetcher)
    const { data: profile, isLoading: pLoading } = useSWR<Profile>('/students/me', fetcher)
    const assignments = assignmentsData ?? []
    const loading = aLoading || pLoading

    // При mount отмечаем "был сегодня" — обновит streak. Невидим для UX.
    useEffect(() => {
        apiClient.post('/gamification/check-in')
            .then(() => {
                globalMutate('/students/me')
                globalMutate('/gamification/me')
            })
            .catch(() => {})
    }, [])

    const counts = useMemo(() => {
        const pending: Assignment[] = []
        const submitted: Assignment[] = []
        const done: Assignment[] = []
        for (const a of assignments) {
            const last = a.submissions?.[a.submissions.length - 1]
            if (!last) pending.push(a)
            else if (last.status === 'graded') done.push(a)
            else submitted.push(a)
        }
        return { all: assignments, pending, submitted, done }
    }, [assignments])

    const visible = counts[filter]
    const firstName = (profile?.name || 'Ученик').split(' ')[0]

    return (
        <>
            <Topbar
                title={<>Привет, {firstName} <span aria-hidden>👋</span></>}
                subtitle={profile?.className || 'Личный кабинет'}
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Streak + KPI */}
                <div className="grid grid-cols-3 gap-4 mb-6 max-md:grid-cols-1">
                    <KpiTile icon={<Flame className="w-4 h-4 text-amber-500" />} color="warning" label="Стрик" value={`${profile?.streakDays ?? 0} дн.`} />
                    <KpiTile icon={<Star className="w-4 h-4 text-amber-500" />} color="brand"   label="Опыт"  value={profile?.xp ?? 0} />
                    <KpiTile icon={<CheckCircle className="w-4 h-4" />}         color="success" label="Готово" value={counts.done.length} />
                </div>

                {/* Filter tabs */}
                <Tabs
                    variant="pill"
                    items={[
                        { id: 'all',       label: 'Все',          count: counts.all.length },
                        { id: 'pending',   label: 'К выполнению', count: counts.pending.length },
                        { id: 'submitted', label: 'На проверке',  count: counts.submitted.length },
                        { id: 'done',      label: 'Готово',       count: counts.done.length },
                    ]}
                    active={filter}
                    onChange={(k) => setFilter(k as Filter)}
                    className="mb-6"
                />

                {/* Assignments */}
                {loading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : visible.length === 0 ? (
                    <Card padding="lg" className="text-center">
                        <Sparkles className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">
                            {filter === 'all' ? 'У вас пока нет заданий' : 'В этой категории пусто'}
                        </h3>
                        <p className="text-[13px] text-ink-500">
                            Учитель скоро добавит новые задания.
                        </p>
                    </Card>
                ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                        {visible.map(a => <AssignmentCard key={a.id} a={a} onOpen={() => router.push(`/student/assignments/${a.id}`)} />)}
                    </div>
                )}
            </div>
        </>
    )
}

function KpiTile({ icon, color, label, value }: { icon: React.ReactNode; color: any; label: string; value: number | string }) {
    return (
        <Card padding="md">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                <IconTile size="sm" color={color}>{icon}</IconTile>
                <span className="truncate">{label}</span>
            </div>
            <div className="font-display font-extrabold text-[24px] text-ink-900 tnum leading-none">{value}</div>
        </Card>
    )
}

function AssignmentCard({ a, onOpen }: { a: Assignment; onOpen: () => void }) {
    const last = a.submissions?.[a.submissions.length - 1]
    const status = !last ? 'pending' : last.status === 'graded' ? 'done' : 'submitted'
    const due = a.dueDate ? new Date(a.dueDate) : null
    const isOverdue = due && !last && due.getTime() < Date.now()

    const types = (a.lesson?.generations ?? []).map(g => g.generationType)
    const PrimaryIcon = types.includes('worksheet') ? FileText
        : types.includes('quiz') ? HelpCircle
        : BookOpen

    return (
        <Card interactive padding="md" onClick={onOpen} className="flex flex-col gap-3 hover:border-brand-300 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start gap-3">
                <IconTile color={status === 'done' ? 'success' : status === 'submitted' ? 'info' : 'brand'} size="md">
                    <PrimaryIcon className="w-[18px] h-[18px]" />
                </IconTile>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-ink-900 leading-snug line-clamp-2">{a.lesson?.title || 'Задание'}</h3>
                    {a.lesson?.topic && <p className="text-[11px] text-ink-500 mt-0.5 truncate">{a.lesson.topic}</p>}
                </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-ink-100 text-[12px]">
                <span className="inline-flex items-center gap-1 text-ink-500">
                    {due ? (
                        <>
                            <Clock className="w-3 h-3" />
                            {isOverdue ? 'Просрочено' : `до ${due.toLocaleDateString('ru-RU')}`}
                        </>
                    ) : <span>без срока</span>}
                </span>
                {status === 'done' && last?.grade != null ? (
                    <Badge variant="success">оценка {last.grade}</Badge>
                ) : status === 'submitted' ? (
                    <Badge variant="info">на проверке</Badge>
                ) : isOverdue ? (
                    <Badge variant="danger" icon={<AlertCircle className="w-3 h-3" />}>просрочено</Badge>
                ) : (
                    <Badge variant="brand">к выполнению</Badge>
                )}
            </div>
        </Card>
    )
}
