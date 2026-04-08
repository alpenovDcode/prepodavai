'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { Users, Workflow, CreditCard, Activity, BarChart2, BookOpen, GitBranch, Download } from 'lucide-react'
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface StatsData {
    users: { total: number; active: number }
    generations: { total: number; completed: number; pending: number }
    subscriptions: { total: number; active: number }
    credits: { total: number }
    transactions: { total: number }
}

const fetchStats = (url: string) => apiClient.get(url).then(res => res.data.stats)
const fetchAnalytics = ([url, period]: [string, string]) =>
    apiClient.get(url, { params: { period } }).then(r => r.data)

const TYPE_LABELS: Record<string, string> = {
    lesson_plan: 'План урока', quiz: 'Тест', worksheet: 'Листок',
    presentation: 'Презентация', image_generation: 'Изображение',
    text_generation: 'Текст', game_generation: 'Игра',
    vocabulary: 'Словарь', transcription: 'Транскрипция',
}

export default function AdminDashboard() {
    const { data: stats, isLoading: statsLoading } = useSWR<StatsData>('/admin/stats', fetchStats)
    const { data: analytics, isLoading: analyticsLoading } = useSWR(
        ['/admin/analytics', 'month'],
        fetchAnalytics
    )

    const handleExportCSV = async () => {
        try {
            const res = await apiClient.get('/admin/export/users')
            const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
        } catch {
            alert('Ошибка экспорта')
        }
    }

    const statCards = stats ? [
        { title: 'Пользователи', value: stats.users.total, sub: `${stats.users.active} активных (30д)`, icon: Users, color: 'bg-blue-50 text-blue-600', href: '/admin/users' },
        { title: 'Генерации ИИ', value: stats.generations.total, sub: `${stats.generations.completed} завершено`, icon: Workflow, color: 'bg-indigo-50 text-indigo-600', href: '/admin/analytics' },
        { title: 'Токены в системе', value: stats.credits.total.toLocaleString('ru-RU'), sub: `${stats.transactions.total} транзакций`, icon: CreditCard, color: 'bg-emerald-50 text-emerald-600', href: '/admin/finances' },
        { title: 'Активных подписок', value: stats.subscriptions.active, sub: `Из ${stats.subscriptions.total} всего`, icon: Activity, color: 'bg-orange-50 text-orange-600', href: '/admin/finances' },
    ] : []

    const topGenTypes = (analytics?.generationsByType || [])
        .slice(0, 6)
        .map((g: any) => ({ name: TYPE_LABELS[g.type] || g.type, count: g.count }))

    const funnel = analytics?.conversionFunnel
    const funnelData = funnel ? [
        { name: 'Зарег.', value: funnel.totalUsers },
        { name: 'Генерации', value: funnel.usersWithGenerations },
        { name: 'Рефералы', value: funnel.usersWithReferrals },
        { name: 'Платные', value: funnel.paidSubscriptions },
    ] : []

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
                    <p className="text-gray-500">Обзор платформы</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 shadow-sm text-sm font-medium transition"
                >
                    <Download className="w-4 h-4" />
                    Экспорт CSV
                </button>
            </div>

            {/* KPI карточки */}
            {statsLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm animate-pulse">
                            <div className="h-10 w-10 bg-gray-100 rounded-xl mb-4" />
                            <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
                            <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
                            <div className="h-3 bg-gray-100 rounded w-3/4" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {statCards.map((card, i) => {
                        const Icon = card.icon
                        return (
                            <Link key={i} href={card.href} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow block">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${card.color}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-gray-500 font-medium text-sm mb-1">{card.title}</h3>
                                <p className="text-3xl font-bold text-gray-900 mb-1">{card.value}</p>
                                <p className="text-sm text-gray-500">{card.sub}</p>
                            </Link>
                        )
                    })}
                </div>
            )}

            {/* Быстрые ссылки */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Аналитика', href: '/admin/analytics', icon: BarChart2, color: 'text-indigo-600 bg-indigo-50' },
                    { label: 'Классы', href: '/admin/classes', icon: BookOpen, color: 'text-blue-600 bg-blue-50' },
                    { label: 'Маркетинг', href: '/admin/marketing', icon: GitBranch, color: 'text-violet-600 bg-violet-50' },
                    { label: 'Логи', href: '/admin/logs', icon: Activity, color: 'text-gray-600 bg-gray-100' },
                ].map(link => {
                    const Icon = link.icon
                    return (
                        <Link key={link.href} href={link.href}
                            className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${link.color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold text-gray-800">{link.label}</span>
                        </Link>
                    )
                })}
            </div>

            {analyticsLoading ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-64 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Регистрации (30 дней) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="font-semibold text-gray-900 mb-1">Регистрации за 30 дней</h2>
                        <p className="text-xs text-gray-400 mb-4">Новые пользователи по дням</p>
                        <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={analytics?.registrations || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip formatter={(v: any) => [v, 'Регистраций']} labelFormatter={l => `Дата: ${l}`} />
                                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Генерации по дням */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-1">Генерации за 30 дней</h2>
                            <p className="text-xs text-gray-400 mb-4">Количество запросов к AI</p>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={analytics?.generations || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                    <Tooltip formatter={(v: any) => [v, 'Генераций']} />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Топ типов генераций */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-1">Популярные инструменты (30д)</h2>
                            <p className="text-xs text-gray-400 mb-4">По количеству генераций</p>
                            {topGenTypes.length > 0 ? (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={topGenTypes} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                                        <Tooltip formatter={(v: any) => [v, 'Генераций']} />
                                        <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : <p className="text-gray-400 text-sm">Нет данных</p>}
                        </div>

                        {/* Токены */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-1">Токены за 30 дней</h2>
                            <p className="text-xs text-gray-400 mb-4">Потрачено vs начислено</p>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={analytics?.tokens || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="spent" name="Потрачено" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="granted" name="Начислено" fill="#10b981" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Воронка */}
                        {funnel && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h2 className="font-semibold text-gray-900 mb-1">Воронка конверсии</h2>
                                <p className="text-xs text-gray-400 mb-4">Всего за всё время</p>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={funnelData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                                        <Tooltip formatter={(v: any) => [v, 'Пользователей']} />
                                        <Bar dataKey="value" fill="#6366f1" radius={[0, 3, 3, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
