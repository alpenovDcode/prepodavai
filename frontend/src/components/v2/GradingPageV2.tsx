'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ClipboardList, ChevronRight, AlertTriangle, CalendarX, CheckCircle } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface TeacherDashboard {
    totalPending: number
    byClass: { classId: string; className: string; pending: number }[]
}

interface TeacherOverview {
    pendingGrading: { total: number; byClass: { classId: string; className: string; pending: number }[] }
    overdue: { count: number; items: any[] }
}

export default function GradingPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()
    const [tab, setTab] = useState<'pending' | 'overdue' | 'done'>('pending')

    const { data: dash } = useSWR<TeacherDashboard>('/submissions/teacher-dashboard', fetcher)
    const { data: overview } = useSWR<TeacherOverview>('/analytics/teacher-overview', fetcher, { refreshInterval: 60_000 })

    const pendingTotal = dash?.totalPending ?? overview?.pendingGrading?.total ?? 0
    const overdueTotal = overview?.overdue?.count ?? 0

    return (
        <>
            <Topbar
                title="Проверка ДЗ"
                subtitle={`${pendingTotal} ${pluralizeRu(pendingTotal, 'работа ждёт', 'работы ждут', 'работ ждут')} проверки`}
                onMobileMenuToggle={menu.toggle}
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'pending',  label: 'К проверке',  icon: <ClipboardList className="w-4 h-4" />, count: pendingTotal },
                        { id: 'overdue',  label: 'Просрочены',  icon: <CalendarX className="w-4 h-4" />,     count: overdueTotal },
                        { id: 'done',     label: 'Проверено',   icon: <CheckCircle className="w-4 h-4" /> },
                    ]}
                    active={tab}
                    onChange={(k) => setTab(k as any)}
                />

                <div className="mt-6">
                    {tab === 'pending' && (
                        <div className="flex flex-col gap-3">
                            {(dash?.byClass ?? []).length === 0 ? (
                                <EmptyState
                                    icon={<CheckCircle className="w-10 h-10 mx-auto text-success-500 mb-3" />}
                                    title="Всё проверено"
                                    desc="На сегодня нет работ, ждущих проверки. Молодец!"
                                />
                            ) : (
                                dash?.byClass?.map(c => (
                                    <Card
                                        key={c.classId}
                                        interactive
                                        padding="md"
                                        onClick={() => router.push(`/dashboard/students?classId=${c.classId}`)}
                                        className="flex items-center gap-3"
                                    >
                                        <IconTile color="warning" size="md"><ClipboardList className="w-[18px] h-[18px]" /></IconTile>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-ink-900">{c.className}</div>
                                            <div className="text-[12px] text-ink-500">
                                                {c.pending} {pluralizeRu(c.pending, 'работа', 'работы', 'работ')} в очереди
                                            </div>
                                        </div>
                                        <Badge variant="warning">{c.pending}</Badge>
                                        <ChevronRight className="w-4 h-4 text-ink-400" />
                                    </Card>
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'overdue' && (
                        <div className="flex flex-col gap-3">
                            {overdueTotal === 0 ? (
                                <EmptyState
                                    icon={<CheckCircle className="w-10 h-10 mx-auto text-success-500 mb-3" />}
                                    title="Нет просроченных"
                                    desc="Все дедлайны соблюдены."
                                />
                            ) : (
                                (overview?.overdue?.items ?? []).map((item: any, i: number) => (
                                    <Card key={i} padding="md" className="flex items-center gap-3">
                                        <IconTile color="danger" size="md"><AlertTriangle className="w-[18px] h-[18px]" /></IconTile>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm text-ink-900 truncate">{item.lesson?.title}</div>
                                            <div className="text-[12px] text-ink-500">
                                                {item.class?.name ?? item.student?.name} · дедлайн {new Date(item.dueDate).toLocaleDateString('ru-RU')}
                                            </div>
                                        </div>
                                        <Badge variant="danger">просрочено</Badge>
                                    </Card>
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'done' && (
                        <EmptyState
                            icon={<CheckCircle className="w-10 h-10 mx-auto text-ink-300 mb-3" />}
                            title="История проверок"
                            desc="Подробный лог проверок появится здесь."
                        />
                    )}
                </div>
            </div>
        </>
    )
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    return (
        <Card padding="lg" className="text-center">
            {icon}
            <h3 className="font-display font-bold text-ink-900 mb-1">{title}</h3>
            <p className="text-[13px] text-ink-500">{desc}</p>
        </Card>
    )
}

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
