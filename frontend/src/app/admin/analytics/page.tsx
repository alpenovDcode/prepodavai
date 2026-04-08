'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { TrendingUp, Users, Zap, CreditCard, GitBranch } from 'lucide-react'

type Period = 'week' | 'month' | 'quarter'

const fetcher = ([url, period]: [string, string]) =>
    apiClient.get(url, { params: { period } }).then(r => r.data)

const PIE_COLORS = ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

const PERIOD_LABELS: Record<Period, string> = { week: '7 дней', month: '30 дней', quarter: '90 дней' }

const TYPE_LABELS: Record<string, string> = {
    lesson_plan: 'План урока', quiz: 'Тест', worksheet: 'Листок',
    presentation: 'Презентация', image_generation: 'Изображение',
    text_generation: 'Текст', game_generation: 'Игра',
    vocabulary: 'Словарь', transcription: 'Транскрипция',
    feedback: 'Обратная связь', video_analysis: 'Видео',
}

export default function AdminAnalyticsPage() {
    const [period, setPeriod] = useState<Period>('month')
    const { data, isLoading } = useSWR(['/admin/analytics', period], fetcher)

    const funnel = data?.conversionFunnel
    const funnelData = funnel ? [
        { name: 'Зарегистрировались', value: funnel.totalUsers, fill: '#6366f1' },
        { name: 'Делали генерации', value: funnel.usersWithGenerations, fill: '#3b82f6' },
        { name: 'Приглашали рефералов', value: funnel.usersWithReferrals, fill: '#06b6d4' },
        { name: 'Платная подписка', value: funnel.paidSubscriptions, fill: '#10b981' },
    ] : []

    const genByType = (data?.generationsByType || []).map((g: any) => ({
        name: TYPE_LABELS[g.type] || g.type,
        value: g.count,
    }))

    const sourceData = (data?.sourceBreakdown || []).map((s: any) => ({
        name: s.source === 'telegram' ? 'Telegram' : s.source === 'max' ? 'MAX' : s.source === 'web' ? 'Web' : s.source,
        value: s.count,
    }))

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>
                    <p className="text-gray-500">Динамика и ключевые метрики платформы</p>
                </div>
                <div className="flex bg-white rounded-xl border border-gray-100 shadow-sm p-1">
                    {(['week', 'month', 'quarter'] as Period[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            {PERIOD_LABELS[p]}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center min-h-96">
                    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Воронка конверсии */}
                    {funnel && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-gray-400" /> Воронка конверсии (всего)
                            </h2>
                            <div className="flex flex-col sm:flex-row gap-3">
                                {funnelData.map((item, i) => {
                                    const pct = funnelData[0].value > 0
                                        ? Math.round((item.value / funnelData[0].value) * 100)
                                        : 0
                                    return (
                                        <div key={item.name} className="flex-1 relative">
                                            <div className="text-xs text-gray-500 mb-1">{item.name}</div>
                                            <div className="text-2xl font-bold text-gray-900">{item.value.toLocaleString()}</div>
                                            {i > 0 && (
                                                <div className="text-xs font-medium mt-0.5" style={{ color: item.fill }}>
                                                    {pct}% от общего
                                                </div>
                                            )}
                                            <div className="h-1.5 bg-gray-100 rounded-full mt-2">
                                                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Регистрации по дням */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" /> Регистрации по дням
                        </h2>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={data?.registrations || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip formatter={(v: any) => [v, 'Регистраций']} labelFormatter={l => `Дата: ${l}`} />
                                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Генерации по дням */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-gray-400" /> Генерации по дням
                        </h2>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data?.generations || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip formatter={(v: any) => [v, 'Генераций']} labelFormatter={l => `Дата: ${l}`} />
                                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Токены: потрачено vs начислено */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-gray-400" /> Токены по дням
                        </h2>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data?.tokens || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip labelFormatter={l => `Дата: ${l}`} />
                                <Legend />
                                <Bar dataKey="spent" name="Потрачено" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="granted" name="Начислено" fill="#10b981" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Генерации по типам */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-gray-400" /> Типы генераций
                            </h2>
                            {genByType.length > 0 ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={genByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {genByType.map((_: any, i: number) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : <p className="text-gray-400 text-sm">Нет данных</p>}
                        </div>

                        {/* Источники */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-gray-400" /> Источники регистраций (всего)
                            </h2>
                            {sourceData.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <PieChart>
                                            <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                                {sourceData.map((_: any, i: number) => (
                                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="mt-2 space-y-1">
                                        {sourceData.map((s: any, i: number) => (
                                            <div key={s.name} className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                    <span className="text-gray-700">{s.name}</span>
                                                </div>
                                                <span className="font-semibold text-gray-900">{s.value.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : <p className="text-gray-400 text-sm">Нет данных</p>}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
