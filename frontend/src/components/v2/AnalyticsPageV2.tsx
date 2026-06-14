'use client'

import useSWR from 'swr'
import { Users, BookOpen, ClipboardCheck, TrendingUp, Award, Activity } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { IconTile } from '@/components/ui/v2/IconTile'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface DashboardStats {
    totalStudents: number
    coursesActive: number
    submissionsThisWeek: number
    averageGrade: number | null
    classes?: { id: string; name: string; studentsCount: number; avgGrade: number | null }[]
}

interface WeeklyActivity { days: { label: string; value: number }[] }

export default function AnalyticsPageV2() {
    const menu = useMobileMenu()

    const { data: stats } = useSWR<DashboardStats>('/analytics/dashboard', fetcher)
    const { data: weekly } = useSWR<WeeklyActivity>('/analytics/weekly-activity', fetcher)

    return (
        <>
            <Topbar
                title="Аналитика"
                subtitle="Сводка по классам и активности"
                onMobileMenuToggle={menu.toggle}
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* KPI */}
                <div className="grid grid-cols-4 gap-4 mb-6 max-md:grid-cols-2">
                    <KpiTile icon={<Users className="w-4 h-4" />}          color="info"    label="Учеников"        value={stats?.totalStudents ?? 0} />
                    <KpiTile icon={<BookOpen className="w-4 h-4" />}       color="brand"   label="Активных курсов" value={stats?.coursesActive ?? 0} />
                    <KpiTile icon={<ClipboardCheck className="w-4 h-4" />} color="success" label="Сдано за неделю" value={stats?.submissionsThisWeek ?? 0} />
                    <KpiTile icon={<Award className="w-4 h-4" />}          color="warning" label="Средний балл"    value={stats?.averageGrade != null ? Number(stats.averageGrade).toFixed(1) : '—'} />
                </div>

                {/* Weekly activity chart */}
                <Card padding="lg" className="mb-6">
                    <div className="flex items-center gap-2 mb-5">
                        <IconTile size="sm" color="brand"><Activity className="w-4 h-4" /></IconTile>
                        <h2 className="font-display font-bold text-[16px] text-ink-900">Активность за неделю</h2>
                    </div>
                    <WeeklyChart days={weekly?.days} />
                </Card>

                {/* Classes table */}
                <Card padding="lg">
                    <div className="flex items-center gap-2 mb-5">
                        <IconTile size="sm" color="info"><TrendingUp className="w-4 h-4" /></IconTile>
                        <h2 className="font-display font-bold text-[16px] text-ink-900">По классам</h2>
                    </div>
                    {(stats?.classes ?? []).length === 0 ? (
                        <div className="text-center py-10 text-ink-500 text-[13px]">Нет данных по классам</div>
                    ) : (
                        <div className="divide-y divide-ink-100 -mx-2">
                            <div className="grid grid-cols-3 gap-3 text-[11px] uppercase font-bold tracking-wider text-ink-500 px-2 pb-3">
                                <div>Класс</div>
                                <div className="text-right">Учеников</div>
                                <div className="text-right">Средний балл</div>
                            </div>
                            {stats?.classes?.map(c => (
                                <div key={c.id} className="grid grid-cols-3 gap-3 px-2 py-3 hover:bg-ink-50 rounded transition-colors items-center">
                                    <div className="font-semibold text-[14px] text-ink-900">{c.name}</div>
                                    <div className="text-right tnum text-[14px] text-ink-700">{c.studentsCount}</div>
                                    <div className="text-right tnum text-[14px] text-ink-900 font-semibold">
                                        {c.avgGrade != null ? Number(c.avgGrade).toFixed(1) : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
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

function WeeklyChart({ days }: { days?: { label: string; value: number }[] }) {
    const data = days ?? Array.from({ length: 7 }).map((_, i) => ({ label: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i], value: 0 }))
    const max = Math.max(1, ...data.map(d => d.value))
    return (
        <div className="grid grid-cols-7 gap-3 items-end h-[200px]">
            {data.map((d, i) => {
                const h = Math.max(6, Math.round((d.value / max) * 100))
                return (
                    <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
                        <div className="font-semibold text-[11px] text-ink-500 tnum mb-0.5">{d.value}</div>
                        <div
                            className="w-full max-w-[36px] rounded-t-md bg-gradient-to-b from-brand-500 to-brand-300"
                            style={{ height: `${h}%` }}
                        />
                        <span className="text-[11px] text-ink-500">{d.label}</span>
                    </div>
                )
            })}
        </div>
    )
}
