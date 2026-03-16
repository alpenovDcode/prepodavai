'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Loader2 } from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then((res: any) => res.data)

export default function AnalyticsPage() {
    const [timeRange, setTimeRange] = useState('monthly')
    
    const { data, error, isLoading } = useSWR('/analytics/dashboard', fetcher)

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                <p>Ошибка при загрузке аналитики</p>
            </div>
        )
    }

    const s = data?.stats || { totalStudents: 0, avgScore: 0, tokensUsed: 0, coursesActive: 0 };
    const courseEngagement = data?.courseEngagement || [];
    const topStudents = data?.topStudents || [];

    const stats = [
        {
            label: 'Всего учеников',
            value: s.totalStudents,
            icon: 'fas fa-users',
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-600',
        },
        {
            label: 'Средняя успеваемость',
            value: `${s.avgScore}%`,
            icon: 'fas fa-check-circle',
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
        },
        {
            label: 'Потрачено токенов ИИ',
            value: (s.tokensUsed || 0).toLocaleString(),
            icon: 'fas fa-bolt',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
        },
        {
            label: 'Активные классы',
            value: s.coursesActive,
            icon: 'fas fa-book',
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-600',
        },
    ]

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Аналитика</h1>
                    <p className="text-gray-600 mt-1">Обзор успеваемости учеников и использования ИИ.</p>
                </div>
                <button className="px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center gap-2 shadow-sm hover:shadow-md">
                    <i className="fas fa-download"></i>
                    Экспорт отчета
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid md:grid-cols-4 gap-6 mb-8">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
                                <i className={`${stat.icon} ${stat.iconColor} text-xl`}></i>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Student Performance Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Выполнение работ</h2>
                        <select 
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            className="bg-gray-50 border-none text-sm font-medium text-gray-600 rounded-lg px-3 py-2 focus:ring-0 cursor-pointer hover:bg-gray-100 transition"
                        >
                            <option value="weekly">За все время</option>
                        </select>
                    </div>

                    {/* Simple Chart Placeholder */}
                    <div className="h-64 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
                        <div className="text-center">
                            <i className="fas fa-chart-area text-6xl text-slate-300 mb-4"></i>
                            <p className="text-gray-500 font-medium">Здесь будет график визуализации</p>
                            <p className="text-xs text-gray-400 mt-2">Модуль графиков на стадии разработки</p>
                        </div>
                    </div>
                </div>

                {/* Engagement Stats */}
                <div className="bg-white p-6 rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900 mb-6">Вовлеченность классов</h2>
                    {courseEngagement.length > 0 ? (
                        <div className="space-y-4">
                            {courseEngagement.map((course: any, idx: number) => (
                                <div key={idx}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-900">{course.name}</span>
                                        <span className="text-sm font-semibold text-gray-900">{course.engagement}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${course.color}`}
                                            style={{ width: `${course.engagement}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400">
                            <p className="text-sm">Пока нет данных о классах</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Students Table */}
            <div className="bg-white p-6 rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] border border-gray-100 mt-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Лучшие ученики</h2>
                <div className="overflow-x-auto">
                    {topStudents.length > 0 ? (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500">Имя ученика</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500">Средний Балл</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500">Завершение заданий</th>
                                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-500">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topStudents.map((student: any, idx: number) => (
                                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                                                    {student.name.split(' ').map((n: string) => n[0]).join('')}
                                                </div>
                                                <span className="font-semibold text-gray-900">{student.name}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-gray-900 font-bold">{student.score}%</td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-purple-500 rounded-full"
                                                        style={{ width: `${student.completion}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-sm font-semibold text-gray-600 w-10">{student.completion}%</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${student.status === 'Отлично'
                                                ? 'bg-green-100 text-green-700'
                                                : student.status === 'Хорошо' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                                                }`}>
                                                {student.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 text-gray-400">
                            <i className="fas fa-users-slash text-4xl mb-3 text-gray-300"></i>
                            <p className="font-medium">Нет данных об учениках</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
