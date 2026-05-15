'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Users, GraduationCap, Sparkles, TrendingUp, AlertTriangle, Eye, Clock } from 'lucide-react'

interface DashboardStats {
    stats: {
        totalStudents: number
        tokensUsed: number
        avgScore: string
        coursesActive: number
    }
    courseEngagement: Array<{ name: string; engagement: number; color: string }>
    topStudents: Array<{ name: string; score: number; completion: number; status: string }>
}

interface OverviewData {
    pendingGrading: { total: number; byClass: Array<{ classId: string; className: string; pending: number }> }
    atRisk: {
        riskCount: number
        watchCount: number
        samples: Array<{ id: string; name: string; className: string; avgGrade: number | null; level: 'risk' | 'watch' }>
    }
    overdue: { count: number }
    upcoming: { deadlinesIn7Days: number }
}

export default function AnalyticsTab() {
    const [dashboard, setDashboard] = useState<DashboardStats | null>(null)
    const [overview, setOverview] = useState<OverviewData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetch = async () => {
            setLoading(true)
            try {
                const [dashRes, overRes] = await Promise.all([
                    apiClient.get<DashboardStats>('/analytics/dashboard'),
                    apiClient.get<OverviewData>('/analytics/teacher-overview'),
                ])
                setDashboard(dashRes.data)
                setOverview(overRes.data)
            } catch (e: any) {
                setError(e?.response?.data?.message || 'Не удалось загрузить аналитику')
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [])

    if (loading) {
        return (
            <div className="dashboard-card flex items-center justify-center py-20">
                <div className="text-gray-400 text-sm">Загружаем аналитику…</div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="dashboard-card text-center py-12">
                <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                <p className="text-red-600 font-semibold">{error}</p>
            </div>
        )
    }

    const stats = dashboard?.stats
    const cards = [
        { label: 'Учеников', value: stats?.totalStudents ?? 0, icon: Users, color: 'bg-blue-50 text-blue-600' },
        { label: 'Классов', value: stats?.coursesActive ?? 0, icon: GraduationCap, color: 'bg-purple-50 text-purple-600' },
        { label: 'Средний балл', value: `${stats?.avgScore ?? 0}%`, icon: TrendingUp, color: 'bg-green-50 text-green-600' },
        { label: 'Токенов потрачено', value: stats?.tokensUsed?.toLocaleString('ru-RU') ?? 0, icon: Sparkles, color: 'bg-pink-50 text-pink-600' },
    ]

    return (
        <div className="space-y-6">
            {/* Карточки сводки */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {cards.map((c) => {
                    const Icon = c.icon
                    return (
                        <div key={c.label} className="dashboard-card flex items-center gap-4 p-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.color}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-xs text-gray-500 font-medium truncate">{c.label}</div>
                                <div className="text-xl font-bold text-gray-900">{c.value}</div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Требует внимания */}
            {overview && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <AttentionCard
                        label="Ждут проверки"
                        value={overview.pendingGrading.total}
                        icon={<Clock className="w-5 h-5" />}
                        tone="amber"
                        sub={overview.pendingGrading.byClass.slice(0, 3).map(b => `${b.className}: ${b.pending}`).join(' · ') || 'Всё проверено'}
                    />
                    <AttentionCard
                        label="Дедлайны на 7 дней"
                        value={overview.upcoming.deadlinesIn7Days}
                        icon={<TrendingUp className="w-5 h-5" />}
                        tone="indigo"
                        sub={overview.overdue.count > 0 ? `Просрочено: ${overview.overdue.count}` : 'Без просрочек'}
                    />
                    <AttentionCard
                        label="Ученики под наблюдением"
                        value={overview.atRisk.riskCount + overview.atRisk.watchCount}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        tone="red"
                        sub={overview.atRisk.riskCount > 0
                            ? `${overview.atRisk.riskCount} критично · ${overview.atRisk.watchCount} следить`
                            : `${overview.atRisk.watchCount} следить`}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Вовлечённость по классам */}
                <div className="dashboard-card">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5 text-purple-600" />
                        Вовлечённость по классам
                    </h3>
                    {dashboard?.courseEngagement?.length ? (
                        <div className="space-y-3">
                            {dashboard.courseEngagement.map((c) => (
                                <div key={c.name}>
                                    <div className="flex justify-between text-xs font-medium mb-1">
                                        <span className="text-gray-700 truncate">{c.name}</span>
                                        <span className="text-gray-500">{c.engagement}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${c.color}`}
                                            style={{ width: `${c.engagement}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 text-center py-6">Пока нет данных — создайте классы и выдайте задания.</p>
                    )}
                </div>

                {/* Топ учеников */}
                <div className="dashboard-card">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        Топ-5 учеников
                    </h3>
                    {dashboard?.topStudents?.length ? (
                        <div className="space-y-2">
                            {dashboard.topStudents.map((s, idx) => (
                                <div key={`${s.name}-${idx}`} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700 flex-shrink-0">
                                            {idx + 1}
                                        </div>
                                        <span className="font-medium text-sm text-gray-900 truncate">{s.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-xs text-gray-500">сдача: {s.completion}%</span>
                                        <span className="text-sm font-bold text-gray-900">{s.score}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 text-center py-6">Топ появится после первых оценок.</p>
                    )}
                </div>
            </div>

            {/* Под наблюдением */}
            {overview && overview.atRisk.samples.length > 0 && (
                <div className="dashboard-card">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Eye className="w-5 h-5 text-amber-600" />
                        Кто требует внимания
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                    <th className="pb-3 pr-4">Ученик</th>
                                    <th className="pb-3 pr-4">Класс</th>
                                    <th className="pb-3 pr-4">Средний балл</th>
                                    <th className="pb-3">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {overview.atRisk.samples.map((s) => (
                                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                                        <td className="py-3 pr-4 font-medium text-gray-900">{s.name}</td>
                                        <td className="py-3 pr-4 text-gray-600">{s.className}</td>
                                        <td className="py-3 pr-4 text-gray-700">{s.avgGrade ?? '—'}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.level === 'risk' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {s.level === 'risk' ? 'Критично' : 'Следить'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

function AttentionCard({
    label,
    value,
    icon,
    tone,
    sub,
}: {
    label: string
    value: number
    icon: React.ReactNode
    tone: 'amber' | 'indigo' | 'red'
    sub: string
}) {
    const tones: Record<typeof tone, string> = {
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        red: 'bg-red-50 text-red-700 border-red-100',
    }
    return (
        <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</span>
                {icon}
            </div>
            <div className="text-3xl font-bold">{value}</div>
            <div className="text-xs mt-1 opacity-75 truncate">{sub}</div>
        </div>
    )
}
