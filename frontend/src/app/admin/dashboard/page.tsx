'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Users, Workflow, CreditCard, Activity } from 'lucide-react'

interface StatsData {
    users: { total: number; active: number }
    generations: { total: number; completed: number; pending: number }
    subscriptions: { total: number; active: number }
    credits: { total: number }
    transactions: { total: number }
}

const fetcher = (url: string) => apiClient.get(url).then(res => res.data.stats)

export default function AdminDashboard() {
    const { data: stats, error, isLoading } = useSWR<StatsData>('/admin/stats', fetcher)

    if (isLoading) return <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-gray-200 rounded w-3/4"></div></div></div>
    if (error) return <div className="text-red-500">Failed to load statistics</div>
    if (!stats) return null

    const statCards = [
        {
            title: 'Пользователи',
            value: stats.users.total,
            subValue: `${stats.users.active} активных (30 дней)`,
            icon: Users,
            color: 'bg-blue-50 text-blue-600'
        },
        {
            title: 'Генерации ИИ',
            value: stats.generations.total,
            subValue: `${stats.generations.completed} успешно завершено`,
            icon: Workflow,
            color: 'bg-indigo-50 text-indigo-600'
        },
        {
            title: 'Кредиты (Токены)',
            value: stats.credits.total.toLocaleString('ru-RU'),
            subValue: `${stats.transactions.total} транзакций списания`,
            icon: CreditCard,
            color: 'bg-emerald-50 text-emerald-600'
        },
        {
            title: 'Подписки',
            value: stats.subscriptions.active,
            subValue: `Из ${stats.subscriptions.total} всего созданных`,
            icon: Activity,
            color: 'bg-orange-50 text-orange-600'
        }
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                <p className="text-gray-500">Overview of your platform&apos;s statistics and performance.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, i) => {
                    const Icon = card.icon
                    return (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${card.color}`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-gray-500 font-medium text-sm mb-1">{card.title}</h3>
                            <p className="text-3xl font-bold text-gray-900 mb-1">{card.value}</p>
                            <p className="text-sm text-gray-500">{card.subValue}</p>
                        </div>
                    )
                })}
            </div>

            {/* Placeholder for future Recharts integration if needed */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm min-h-[400px] flex items-center justify-center text-gray-400">
                <p>Analytics Charts Placeholder</p>
            </div>
        </div>
    )
}
