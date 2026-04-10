'use client'

import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Users, TrendingUp, CreditCard, Sparkles } from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const PLAN_STYLES: Record<string, { badge: string; bar: string; card: string }> = {
    free:     { badge: 'bg-gray-100 text-gray-700 border-gray-200',     bar: 'bg-gray-400',    card: 'border-gray-200 bg-gray-50' },
    starter:  { badge: 'bg-blue-50 text-blue-700 border-blue-200',      bar: 'bg-blue-500',    card: 'border-blue-100 bg-blue-50/30' },
    pro:      { badge: 'bg-purple-50 text-purple-700 border-purple-200', bar: 'bg-purple-500',  card: 'border-purple-100 bg-purple-50/30' },
    business: { badge: 'bg-amber-50 text-amber-700 border-amber-200',   bar: 'bg-amber-500',   card: 'border-amber-100 bg-amber-50/30' },
}

export default function AdminTariffsPage() {
    const { data, isLoading } = useSWR<any>('/admin/analytics/tariffs', fetcher)

    const plans: any[] = data?.plans || []
    const totalActive: number = data?.totalActive || 0
    const totalMrr: number = data?.totalMrr || 0
    const recentChanges: any[] = data?.recentChanges || []

    const paidUsers = plans.filter(p => p.plan.planKey !== 'free').reduce((s: number, p: any) => s + p.count, 0)
    const conversionRate = totalActive > 0 ? ((paidUsers / totalActive) * 100).toFixed(1) : '0'

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Аналитика тарифов</h1>
                <p className="text-gray-500 mt-1">Распределение пользователей по тарифным планам</p>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard icon={<Users className="w-5 h-5 text-blue-600" />} label="Всего активных" value={totalActive} bg="bg-blue-50" />
                        <KpiCard icon={<CreditCard className="w-5 h-5 text-green-600" />} label="MRR (потенц.)" value={`${totalMrr.toLocaleString('ru')} ₽`} bg="bg-green-50" />
                        <KpiCard icon={<TrendingUp className="w-5 h-5 text-purple-600" />} label="Платных юзеров" value={paidUsers} bg="bg-purple-50" />
                        <KpiCard icon={<Sparkles className="w-5 h-5 text-amber-600" />} label="Free→Paid конверсия" value={`${conversionRate}%`} bg="bg-amber-50" />
                    </div>

                    {/* Plans breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map((p: any) => {
                            const pk: string = p.plan.planKey
                            const style = PLAN_STYLES[pk] || PLAN_STYLES.free
                            const pct = totalActive > 0 ? Math.round((p.count / totalActive) * 100) : 0
                            return (
                                <div key={pk} className={`rounded-2xl border p-5 ${style.card}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>
                                                {p.plan.planName}
                                            </span>
                                            <span className="text-xs text-gray-500 font-medium">
                                                {p.plan.price > 0 ? `${Number(p.plan.price).toLocaleString('ru')} ₽/мес` : 'Бесплатно'}
                                            </span>
                                        </div>
                                        <span className="text-2xl font-black text-gray-900">{p.count}</span>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${style.bar}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <Stat label="Доля" value={`${pct}%`} />
                                        <Stat label="Новых/30д" value={p.newThisMonth} />
                                        <Stat label="MRR" value={`${Math.round(p.mrr).toLocaleString('ru')} ₽`} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Recent subscription changes */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-50">
                            <h2 className="font-bold text-gray-900">Последние изменения подписок</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3">Пользователь</th>
                                        <th className="px-6 py-3">Тариф</th>
                                        <th className="px-6 py-3">Баланс</th>
                                        <th className="px-6 py-3">Статус</th>
                                        <th className="px-6 py-3">Обновлён</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {recentChanges.map((s: any) => {
                                        const pk: string = s.plan?.planKey || 'free'
                                        const style = PLAN_STYLES[pk] || PLAN_STYLES.free
                                        return (
                                            <tr key={s.id} className="hover:bg-gray-50 transition">
                                                <td className="px-6 py-3 font-medium text-gray-900">
                                                    {s.user?.firstName || s.user?.username || '—'}
                                                    {s.user?.lastName ? ` ${s.user.lastName}` : ''}
                                                    <div className="text-xs text-gray-400 font-normal">@{s.user?.username}</div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.badge}`}>
                                                        {s.plan?.planName || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 tabular-nums text-gray-700 font-medium">
                                                    {s.creditsBalance + s.extraCredits}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-500'}`}>
                                                        {s.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-xs text-gray-400">
                                                    {new Date(s.updatedAt).toLocaleString('ru')}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

function KpiCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string | number; bg: string }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                {icon}
            </div>
            <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-xl font-black text-gray-900 leading-tight">{value}</p>
            </div>
        </div>
    )
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value}</p>
        </div>
    )
}
