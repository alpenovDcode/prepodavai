'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    ReferenceLine,
} from 'recharts'

interface Student {
    id: string
    name: string
    email?: string
    avatar?: string
    class: { name: string }
    assignments: Assignment[]
    createdAt: string
}

interface Assignment {
    id: string
    status: string
    dueDate?: string
    lesson: { title: string; topic: string }
    submissions: { id: string; status: string; grade?: number; createdAt: string }[]
    createdAt: string
}

interface AnalyticsResponse {
    student: { id: string; name: string; avatar: string | null; className: string }
    summary: {
        avgGrade: number | null
        totalAssigned: number
        totalSubmitted: number
        totalGraded: number
        overdueCount: number
        submissionRate: number
        onTimeRate: number | null
        lastActivityAt: string | null
    }
    trend: { submissionId: string; grade: number; date: string; lessonTitle: string }[]
    risk: { level: 'good' | 'watch' | 'risk' | 'unknown'; reasons: string[] }
}

const RISK_BADGE: Record<AnalyticsResponse['risk']['level'], { label: string; classes: string }> = {
    good: { label: 'Стабильно', classes: 'bg-green-50 text-green-700 border-green-200' },
    watch: { label: 'Под наблюдением', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    risk: { label: 'Отстаёт', classes: 'bg-red-50 text-red-700 border-red-200' },
    unknown: { label: 'Мало данных', classes: 'bg-gray-50 text-gray-600 border-gray-200' },
}

export default function StudentProfilePage({ params }: { params: { id: string } }) {
    const [student, setStudent] = useState<Student | null>(null)
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    // Password change state
    const [newPassword, setNewPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    useEffect(() => {
        const fetch = async () => {
            try {
                const [s, a] = await Promise.all([
                    apiClient.get(`/students/${params.id}`),
                    apiClient.get(`/students/${params.id}/analytics`),
                ])
                setStudent(s.data)
                setAnalytics(a.data)
            } catch (error) {
                console.error('Failed to fetch student:', error)
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [params.id])

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword.length < 6) {
            setPasswordMsg({ type: 'err', text: 'Минимум 6 символов' })
            return
        }
        setSavingPassword(true)
        setPasswordMsg(null)
        try {
            await apiClient.put(`/students/${params.id}`, { password: newPassword })
            setPasswordMsg({ type: 'ok', text: 'Пароль успешно изменён' })
            setNewPassword('')
        } catch {
            setPasswordMsg({ type: 'err', text: 'Ошибка при сохранении пароля' })
        } finally {
            setSavingPassword(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!student) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900">Ученик не найден</h3>
                <button onClick={() => router.back()} className="text-primary-600 font-medium hover:text-primary-700 mt-4">
                    &larr; Вернуться назад
                </button>
            </div>
        )
    }

    const summary = analytics?.summary
    const trend = analytics?.trend || []
    const risk = analytics?.risk
    const riskBadge = risk ? RISK_BADGE[risk.level] : null

    const trendData = trend.map((t, i) => ({
        idx: i + 1,
        grade: t.grade,
        date: new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        lesson: t.lessonTitle,
    }))

    const submissionPct = summary
        ? Math.round((summary.submissionRate || 0) * 100)
        : 0
    const onTimePct = summary?.onTimeRate !== null && summary?.onTimeRate !== undefined
        ? Math.round(summary.onTimeRate * 100)
        : null

    return (
        <div className="max-w-5xl mx-auto p-6">
            {/* Back */}
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-2">
                <i className="fas fa-arrow-left"></i> Назад к списку
            </button>

            {/* Header */}
            <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-3xl flex-shrink-0">
                    {student.avatar || student.name.charAt(0)}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
                        {riskBadge && (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${riskBadge.classes}`}>
                                <i className={`fas ${risk!.level === 'good' ? 'fa-check-circle' : risk!.level === 'risk' ? 'fa-exclamation-circle' : 'fa-eye'}`}></i>
                                {riskBadge.label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-gray-600 flex-wrap">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                            {student.class.name}
                        </span>
                        {student.email && (
                            <span className="flex items-center gap-1.5 text-sm">
                                <i className="fas fa-envelope text-gray-400"></i>
                                {student.email}
                            </span>
                        )}
                        {summary?.lastActivityAt && (
                            <span className="flex items-center gap-1.5 text-sm text-gray-500">
                                <i className="fas fa-clock text-gray-400"></i>
                                Последняя активность: {new Date(summary.lastActivityAt).toLocaleDateString('ru-RU')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Risk reasons banner */}
            {risk && risk.level !== 'unknown' && risk.reasons.length > 0 && (
                <div className={`mb-6 p-4 rounded-xl border ${riskBadge!.classes}`}>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Почему этот статус</p>
                    <ul className="text-sm space-y-0.5">
                        {risk.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                    </ul>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <StatCard label="Всего заданий" value={summary?.totalAssigned ?? 0} />
                <StatCard
                    label="Сдано"
                    value={`${summary?.totalSubmitted ?? 0} / ${summary?.totalAssigned ?? 0}`}
                    sub={`${submissionPct}%`}
                    color="text-green-600"
                />
                <StatCard
                    label="Средний балл"
                    value={summary?.avgGrade ?? '—'}
                    color={summary?.avgGrade
                        ? summary.avgGrade >= 4 ? 'text-green-600' : summary.avgGrade >= 3 ? 'text-yellow-600' : 'text-red-500'
                        : 'text-gray-400'}
                />
                <StatCard
                    label="Вовремя"
                    value={onTimePct !== null ? `${onTimePct}%` : '—'}
                    color={onTimePct !== null && onTimePct < 60 ? 'text-red-500' : 'text-gray-900'}
                />
                <StatCard
                    label="Просрочено"
                    value={summary?.overdueCount ?? 0}
                    color={(summary?.overdueCount ?? 0) > 0 ? 'text-red-500' : 'text-gray-900'}
                />
            </div>

            {/* Trend chart */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Динамика оценок</h2>
                    <span className="text-xs text-gray-500">Последние {trendData.length} работ</span>
                </div>
                {trendData.length === 0 ? (
                    <div className="text-center text-gray-500 py-12 text-sm">
                        Нет проверенных работ для построения графика.
                    </div>
                ) : (
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                                    formatter={(value: any) => [value, 'Оценка']}
                                    labelFormatter={(label: any, payload: any) => {
                                        const item = payload?.[0]?.payload
                                        return item ? `${item.lesson} · ${label}` : label
                                    }}
                                />
                                <ReferenceLine y={3} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Порог', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
                                <Line
                                    type="monotone"
                                    dataKey="grade"
                                    stroke="#6366f1"
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: '#6366f1' }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Password block */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Пароль для входа</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Ученик входит по адресу <span className="font-medium text-gray-700">{student.email}</span> и этому паролю.
                    Задайте новый пароль и сообщите его ученику.
                </p>
                <form onSubmit={handleChangePassword} className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Новый пароль</label>
                        <input
                            type="text"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Введите новый пароль (мин. 6 символов)"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition text-gray-900"
                            minLength={6}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={savingPassword}
                        className="px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition disabled:opacity-50 whitespace-nowrap"
                    >
                        {savingPassword ? 'Сохранение...' : 'Сохранить пароль'}
                    </button>
                </form>
                {passwordMsg && (
                    <p className={`mt-3 text-sm font-medium ${passwordMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordMsg.type === 'ok' ? '✓ ' : '✗ '}{passwordMsg.text}
                    </p>
                )}
            </div>

            {/* Assignments */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">История заданий</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    {student.assignments?.map((assignment) => {
                        const sub = assignment.submissions?.[0]
                        const isLate = sub && assignment.dueDate && new Date(sub.createdAt) > new Date(assignment.dueDate)
                        return (
                            <div key={assignment.id} className="p-6 hover:bg-gray-50 transition">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-1">{assignment.lesson.title}</h4>
                                        <p className="text-sm text-gray-500">{assignment.lesson.topic}</p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        {assignment.dueDate && (
                                            <div className="text-sm text-gray-500">
                                                Срок: {new Date(assignment.dueDate).toLocaleDateString('ru-RU')}
                                            </div>
                                        )}
                                        {sub?.grade != null && (
                                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                                sub.grade >= 4 ? 'bg-green-100 text-green-700' : sub.grade >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {sub.grade}
                                            </span>
                                        )}
                                        {isLate && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                                                Поздняя сдача
                                            </span>
                                        )}
                                        {assignment.submissions?.length > 0 ? (
                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Сдано</span>
                                        ) : (
                                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">Назначено</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {(!student.assignments || student.assignments.length === 0) && (
                        <div className="p-8 text-center text-gray-500">
                            Ученику пока не выдано ни одного задания.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function StatCard({
    label,
    value,
    sub,
    color = 'text-gray-900',
}: {
    label: string
    value: string | number
    sub?: string
    color?: string
}) {
    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="text-gray-500 text-xs font-medium mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
    )
}
