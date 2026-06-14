'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { FileText, HelpCircle, BookOpen, Clock, CheckCircle, Sparkles, AlertCircle } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'
import { SearchBar } from '@/components/ui/v2/SearchBar'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface Assignment {
    id: string
    dueDate?: string
    lesson: { title: string; topic?: string; generations?: { generationType: string }[] }
    submissions?: { status: string; grade?: number | null }[]
}

type Filter = 'all' | 'pending' | 'submitted' | 'done'

export default function StudentAssignmentsListV2() {
    const router = useRouter()
    const menu = useStudentMobileMenu()
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState<Filter>('all')

    const { data, isLoading } = useSWR<Assignment[]>('/assignments/my', fetcher)
    const assignments = Array.isArray(data) ? data : []

    const buckets = useMemo(() => {
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

    const visible = useMemo(() => {
        const q = query.toLowerCase().trim()
        return buckets[filter].filter(a => !q || a.lesson?.title?.toLowerCase().includes(q))
    }, [buckets, filter, query])

    return (
        <>
            <Topbar
                title="Задания"
                subtitle={`${buckets.pending.length} к выполнению · ${buckets.done.length} завершено`}
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <div className="mb-4">
                    <SearchBar value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти задание…" className="w-full sm:w-[420px]" />
                </div>

                <Tabs
                    variant="pill"
                    items={[
                        { id: 'all',       label: 'Все',          count: buckets.all.length },
                        { id: 'pending',   label: 'К выполнению', count: buckets.pending.length },
                        { id: 'submitted', label: 'На проверке',  count: buckets.submitted.length },
                        { id: 'done',      label: 'Готово',       count: buckets.done.length },
                    ]}
                    active={filter}
                    onChange={(k) => setFilter(k as Filter)}
                    className="mb-6"
                />

                {isLoading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : visible.length === 0 ? (
                    <Card padding="lg" className="text-center">
                        <Sparkles className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">Здесь пока ничего нет</h3>
                        <p className="text-[13px] text-ink-500">Учитель скоро добавит задания.</p>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-2">
                        {visible.map(a => <AssignmentRow key={a.id} a={a} onOpen={() => router.push(`/student/assignments/${a.id}`)} />)}
                    </div>
                )}
            </div>
        </>
    )
}

function AssignmentRow({ a, onOpen }: { a: Assignment; onOpen: () => void }) {
    const last = a.submissions?.[a.submissions.length - 1]
    const status = !last ? 'pending' : last.status === 'graded' ? 'done' : 'submitted'
    const due = a.dueDate ? new Date(a.dueDate) : null
    const isOverdue = due && !last && due.getTime() < Date.now()
    const types = (a.lesson?.generations ?? []).map(g => g.generationType)
    const PrimaryIcon = types.includes('worksheet') ? FileText : types.includes('quiz') ? HelpCircle : BookOpen

    return (
        <Card interactive padding="md" onClick={onOpen} className="flex items-center gap-3 hover:border-brand-300 transition-all">
            <IconTile color={status === 'done' ? 'success' : status === 'submitted' ? 'info' : 'brand'} size="md">
                <PrimaryIcon className="w-[18px] h-[18px]" />
            </IconTile>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-ink-900 truncate">{a.lesson?.title || 'Задание'}</div>
                <div className="text-[12px] text-ink-500 truncate">
                    {a.lesson?.topic ? `${a.lesson.topic} · ` : ''}
                    {due ? (isOverdue ? 'просрочено' : `до ${due.toLocaleDateString('ru-RU')}`) : 'без срока'}
                </div>
            </div>
            {status === 'done' && last?.grade != null ? (
                <Badge variant="success">оценка {last.grade}</Badge>
            ) : status === 'submitted' ? (
                <Badge variant="info">на проверке</Badge>
            ) : isOverdue ? (
                <Badge variant="danger" icon={<AlertCircle className="w-3 h-3" />}>просрочено</Badge>
            ) : (
                <Badge variant="brand"><Clock className="w-3 h-3 mr-1 inline" />к выполнению</Badge>
            )}
        </Card>
    )
}
