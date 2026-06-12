'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import {
    ArrowLeft, User, Zap, Users, GitBranch, BookOpen,
    CheckCircle, Clock, TrendingUp, Loader2,
    Mail, Phone, BookOpenCheck, GraduationCap, MessageSquare, Link2,
    UserPlus, UserCheck, UserCog, MapPin, Shield, AlertTriangle,
    Flame, Download, Send, Globe, ChevronRight
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell,
} from 'recharts'
import DateRangePicker, { daysFromRange } from '@/components/admin/DateRangePicker'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

// const PLANS removed (subscription section removed)

const PLAN_STYLES: Record<string, string> = {
    free: 'text-gray-600 bg-gray-100 border-gray-200',
    starter: 'text-blue-700 bg-blue-50 border-blue-200',
    pro: 'text-purple-700 bg-purple-50 border-purple-200',
    business: 'text-amber-700 bg-amber-50 border-amber-200',
}

const PLAN_LABELS: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
}

const GENERATION_TYPE_LABELS: Record<string, string> = {
    lesson_plan: 'План урока',
    quiz: 'Тест',
    worksheet: 'Рабочий лист',
    presentation: 'Презентация',
    image_generation: 'Изображение',
    text_generation: 'Текст',
    transcription: 'Транскрипция',
    game_generation: 'Игра',
    vocabulary: 'Словарь',
    feedback: 'Обратная связь',
    video_analysis: 'Видеоанализ',
}

const ONBOARDING_LABELS: Record<string, string> = {
    FIRST_GENERATION: 'Первая генерация',
    SECOND_TYPE_GENERATION: 'Второй тип генерации',
    SHARED_REFERRAL_LINK: 'Поделился ссылкой',
    FIRST_REFERRAL_ACTIVATED: 'Первый реферал',
    SECOND_REFERRAL_ACTIVATED: 'Второй реферал',
}

const STATUS_COLORS: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
}

export default function UserStatsPage({ params }: { params: { id: string } }) {
    const { id } = params
    const { data, isLoading, error } = useSWR(`/admin/users/${id}/stats`, fetcher)
    const stats = data?.stats
    const { data: invitedData } = useSWR(`/admin/users/${id}/referrals`, fetcher)

    const [cjmDays, setCjmDays] = useState('30d')
    const { data: cjmData } = useSWR(`/admin/users/${id}/cjm?days=${daysFromRange(cjmDays)}`, fetcher)
    const cjm = cjmData

    // const [selectedPlan, setSelectedPlan] = useState<string>('')
    // const [planSaving, setPlanSaving] = useState(false)
    // const [planMessage, setPlanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    // const [newEndDate, setNewEndDate] = useState<string>('')
    // const [dateSaving, setDateSaving] = useState(false)
    // const [dateMessage, setDateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [cjmExporting, setCjmExporting] = useState(false)

    const handleExportCjm = async () => {
        setCjmExporting(true)
        try {
            const res = await apiClient.get(`/admin/users/${id}/cjm/export`, { responseType: 'blob' })
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
            const a = document.createElement('a')
            a.href = url
            a.download = `cjm_${id}.csv`
            a.click()
            URL.revokeObjectURL(url)
        } finally {
            setCjmExporting(false)
        }
    }

    // const currentPlanKey = stats?.subscription?.planKey ?? ''

    // const handlePlanChange = async () => {
    //     if (!selectedPlan || selectedPlan === currentPlanKey) return
    //     setPlanSaving(true)
    //     setPlanMessage(null)
    //     try {
    //         await apiClient.put(`/admin/users/${id}`, { planKey: selectedPlan })
    //         setPlanMessage({ type: 'success', text: 'Тариф успешно изменён' })
    //         mutate()
    //         setTimeout(() => setPlanMessage(null), 3000)
    //     } catch (e: any) {
    //         setPlanMessage({ type: 'error', text: e.response?.data?.message || 'Ошибка изменения тарифа' })
    //     } finally {
    //         setPlanSaving(false)
    //     }
    // }

    // const handleEndDateChange = async () => {
    //     if (!newEndDate || !stats?.subscription?.id) return
    //     setDateSaving(true)
    //     setDateMessage(null)
    //     try {
    //         await apiClient.put(`/admin/subscriptions/${stats.subscription.id}`, { endDate: new Date(newEndDate).toISOString() })
    //         setDateMessage({ type: 'success', text: 'Дата подписки обновлена' })
    //         setNewEndDate('')
    //         mutate()
    //         setTimeout(() => setDateMessage(null), 3000)
    //     } catch (e: any) {
    //         setDateMessage({ type: 'error', text: e.response?.data?.message || 'Ошибка обновления даты' })
    //     } finally {
    //         setDateSaving(false)
    //     }
    // }

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-96">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )
    if (error) return <div className="text-red-500 p-6">Ошибка загрузки данных пользователя</div>
    if (!stats) return null

    const { user, generations, classes, referrals, onboarding, botUser } = stats

    const allOnboardingSteps = Object.keys(ONBOARDING_LABELS)
    const completedSet = new Set(onboarding.completedSteps)

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/admin/users" className="p-2 hover:bg-gray-100 rounded-xl transition">
                    <ArrowLeft className="w-5 h-5 text-gray-500" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        {user.firstName} {user.lastName || ''}
                        {user.username && <span className="text-gray-400 font-normal ml-2">@{user.username}</span>}
                    </h1>
                    <p className="text-sm text-gray-500 font-mono">{user.id}</p>
                </div>
            </div>

            {/* KPI карточки */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Генерации', value: generations.total, icon: Zap, color: 'bg-indigo-50 text-indigo-600' },
                    { label: 'Классов', value: classes.count, icon: BookOpen, color: 'bg-blue-50 text-blue-600' },
                    { label: 'Учеников', value: classes.studentsTotal, icon: Users, color: 'bg-cyan-50 text-cyan-600' },
                    { label: 'Рефералов', value: referrals.invited, icon: GitBranch, color: 'bg-violet-50 text-violet-600' },
                ].map((card) => {
                    const Icon = card.icon
                    return (
                        <div key={card.label} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color}`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                            <p className="text-sm text-gray-500">{card.label}</p>
                        </div>
                    )
                })}
            </div>

            {/* Профиль и платформы */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Профиль */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" /> Профиль
                    </h2>
                    <div className="space-y-3">
                        {user.email && (
                            <div className="flex items-center gap-3">
                                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700">{user.email}</span>
                            </div>
                        )}
                        {user.phone && (
                            <div className="flex items-center gap-3">
                                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700">{user.phone}</span>
                                {user.phoneVerified && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Подтверждён</span>
                                )}
                            </div>
                        )}
                        {user.subject && (
                            <div className="flex items-center gap-3">
                                <BookOpenCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700">{user.subject}</span>
                            </div>
                        )}
                        {user.grades && (
                            <div className="flex items-center gap-3">
                                <GraduationCap className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700">{user.grades}</span>
                            </div>
                        )}
                        {user.bio && (
                            <div className="flex items-start gap-3 pt-1">
                                <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-gray-600 leading-relaxed">{user.bio}</p>
                            </div>
                        )}
                        {botUser?.firstName && (
                            <div className="flex items-center gap-3">
                                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700">
                                    {botUser.firstName}{botUser.lastName ? ' ' + botUser.lastName : ''}
                                    {botUser.username && <span className="text-gray-400 ml-1">@{botUser.username}</span>}
                                    <span className="text-xs text-gray-400 ml-2">({botUser.source === 'max_bot' ? 'MAX' : 'Telegram'})</span>
                                </span>
                            </div>
                        )}
                        {!user.email && !user.phone && !user.subject && !user.grades && !user.bio && !botUser?.firstName && (
                            <p className="text-sm text-gray-400">Профиль не заполнен</p>
                        )}
                    </div>
                </div>

                {/* Привязанные платформы */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-gray-400" /> Привязанные платформы
                    </h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-500 text-sm font-bold">TG</div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Telegram</p>
                                    {user.telegramId
                                        ? <p className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> ID: {user.telegramId}</p>
                                        : <p className="text-xs text-gray-400">Не привязан</p>}
                                </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.telegramId ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                                {user.telegramId ? 'Привязан' : '—'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-500 text-sm font-bold">MX</div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">MAX</p>
                                    {user.maxId
                                        ? <p className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> ID: {user.maxId}</p>
                                        : <p className="text-xs text-gray-400">Не привязан</p>}
                                </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.maxId ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                                {user.maxId ? 'Привязан' : '—'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-gray-400">Источник:</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                user.source === 'telegram' ? 'bg-blue-100 text-blue-700' :
                                user.source === 'max' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>{user.source || 'web'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscription Section removed */}

                {/* Онбординг */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-gray-400" /> Онбординг квест
                        <span className="ml-auto text-xs text-gray-400">{completedSet.size}/{allOnboardingSteps.length}</span>
                    </h2>
                    <div className="space-y-2">
                        {allOnboardingSteps.map(step => {
                            const done = completedSet.has(step)
                            return (
                                <div key={step} className={`flex items-center gap-3 p-2 rounded-lg ${done ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                                    {done
                                        ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                        : <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                    }
                                    <span className={`text-sm ${done ? 'text-emerald-700 font-medium' : 'text-gray-400'}`}>
                                        {ONBOARDING_LABELS[step]}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Рефералы */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-gray-400" /> Реферальная активность
                    </h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Приглашено</span>
                            <span className="font-bold text-gray-900">{referrals.invited}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Конвертировано (платные)</span>
                            <span className="font-bold text-emerald-600">{referrals.converted}</span>
                        </div>
                        {referrals.invited > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Конверсия</span>
                                <span className="font-medium text-gray-700">
                                    {Math.round((referrals.converted / referrals.invited) * 100)}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Генерации по типам */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-gray-400" /> Генерации по типам
                    </h2>
                    {generations.byType.length === 0 ? (
                        <p className="text-gray-400 text-sm">Нет генераций</p>
                    ) : (
                        <div className="space-y-2">
                            {generations.byType
                                .sort((a: any, b: any) => b.count - a.count)
                                .map((g: any) => {
                                    const pct = Math.round((g.count / generations.total) * 100)
                                    return (
                                        <div key={g.type}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-gray-700">{GENERATION_TYPE_LABELS[g.type] || g.type}</span>
                                                <span className="font-medium text-gray-900">{g.count}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full">
                                                <div
                                                    className="h-1.5 bg-indigo-500 rounded-full"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                        </div>
                    )}
                </div>
            </div>

            {/* Приглашённые пользователи (рефералы) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-gray-400" /> Приглашённые пользователем
                    </h2>
                    {invitedData?.summary && (
                        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                Всего: {invitedData.summary.total}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                Зарегистрировались: {invitedData.summary.registered}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                Активированы: {invitedData.summary.activated}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                                Конвертированы: {invitedData.summary.converted}
                            </span>
                        </div>
                    )}
                </div>

                {!invitedData ? (
                    <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Загружаем приглашённых...
                    </div>
                ) : invitedData.items.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">Пользователь пока никого не приглашал</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left">Кого пригласил</th>
                                <th className="px-4 py-3 text-left">Тип</th>
                                <th className="px-4 py-3 text-left">Статус</th>
                                <th className="px-4 py-3 text-left">Код</th>
                                <th className="px-4 py-3 text-left">Регистрация</th>
                                <th className="px-4 py-3 text-left">Активирован</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {invitedData.items.map((r: any) => {
                                const isTeacher = r.referredType === 'teacher'
                                const statusStyle =
                                    r.status === 'converted' ? 'bg-green-100 text-green-700' :
                                    r.status === 'activated' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                const statusLabel =
                                    r.status === 'converted' ? 'Конверсия' :
                                    r.status === 'activated' ? 'Активирован' :
                                    'Зарегистрирован'
                                return (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {isTeacher
                                                    ? <UserCog className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                                    : <UserCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                                                <div className="min-w-0">
                                                    {isTeacher && r.invited.exists ? (
                                                        <Link
                                                            href={`/admin/users/${r.referredUserId}`}
                                                            className="font-medium text-indigo-600 hover:underline truncate block"
                                                        >
                                                            {r.invited.name}
                                                        </Link>
                                                    ) : (
                                                        <span className={`font-medium truncate block ${r.invited.exists ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                                                            {r.invited.name}
                                                        </span>
                                                    )}
                                                    {r.invited.exists && (r.invited.email || r.invited.className) && (
                                                        <div className="text-xs text-gray-500 truncate">
                                                            {r.invited.email || r.invited.className}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                isTeacher ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                                            }`}>
                                                {isTeacher ? 'Учитель' : 'Ученик'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.code
                                                ? <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{r.code}</code>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {new Date(r.createdAt).toLocaleString('ru-RU', {
                                                day: '2-digit', month: '2-digit', year: '2-digit',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {r.activatedAt
                                                ? new Date(r.activatedAt).toLocaleString('ru-RU', {
                                                    day: '2-digit', month: '2-digit', year: '2-digit',
                                                })
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* CJM */}
            {cjm && (
                <div className="space-y-4">
                    {/* Заголовок + DateRangePicker + экспорт */}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-500" /> CJM пользователя
                        </h2>
                        <div className="flex items-center gap-3">
                            <DateRangePicker value={cjmDays} onChange={setCjmDays} />
                            <button
                                onClick={handleExportCjm}
                                disabled={cjmExporting}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-40"
                            >
                                {cjmExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Экспорт CSV
                            </button>
                        </div>
                    </div>

                    {/* Секция 1: Путь пользователя (таймлайн) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Путь пользователя</h3>
                        <div className="flex items-start gap-1 flex-wrap">
                            {(() => {
                                const events = [
                                    { label: 'Старт бота', date: cjm.journey.botStartedAt, color: 'bg-blue-500' },
                                    { label: 'Регистрация', date: cjm.journey.platformRegisteredAt, color: 'bg-indigo-500' },
                                    { label: 'Первый класс', date: cjm.depth?.firstClassAt, color: 'bg-violet-500' },
                                    { label: 'Первый ученик', date: cjm.depth?.firstStudentAt, color: 'bg-fuchsia-500' },
                                    { label: 'Первый урок', date: cjm.depth?.firstLessonAt, color: 'bg-cyan-500' },
                                    { label: 'Первая генерация', date: cjm.journey.firstGenerationAt, color: 'bg-emerald-500' },
                                    { label: 'Первое ДЗ', date: cjm.depth?.firstAssignmentAt, color: 'bg-teal-500' },
                                    { label: 'Первый платёж', date: cjm.journey.firstPaymentAt, color: 'bg-amber-500' },
                                    { label: 'Последняя активность', date: cjm.activity.lastActiveAt, color: 'bg-rose-400' },
                                ].filter(e => e.date)
                                return events.map((e, i, arr) => {
                                    const prevDate = i > 0 ? new Date(arr[i - 1].date) : null
                                    const thisDate = new Date(e.date)
                                    const diffDays = prevDate ? Math.round((thisDate.getTime() - prevDate.getTime()) / 86400000) : null
                                    return (
                                        <div key={e.label} className="flex items-center gap-1">
                                            <div className="flex flex-col items-center min-w-[72px]">
                                                <div className={`w-2.5 h-2.5 rounded-full ${e.color}`} />
                                                <p className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{e.label}</p>
                                                <p className="text-[10px] font-medium text-gray-700 whitespace-nowrap">
                                                    {thisDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                </p>
                                                {diffDays !== null && (
                                                    <p className="text-[9px] text-gray-400">+{diffDays}д</p>
                                                )}
                                            </div>
                                            {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0 mb-5" />}
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>

                    {/* Секция 2: Текущий статус */}
                    <div className="flex flex-wrap gap-3">
                        {(() => {
                            const stageLabels: Record<string, string> = {
                                registered_only: 'Только зарегистрирован',
                                generating_free: 'Генерирует (free)',
                                subscribed_active: 'Активная подписка',
                                subscribed_expired: 'Подписка истекла',
                                churned: 'Отток',
                            }
                            const stageColors: Record<string, string> = {
                                registered_only: 'bg-gray-100 text-gray-700',
                                generating_free: 'bg-blue-100 text-blue-700',
                                subscribed_active: 'bg-emerald-100 text-emerald-700',
                                subscribed_expired: 'bg-amber-100 text-amber-700',
                                churned: 'bg-red-100 text-red-700',
                            }
                            const riskColors: Record<string, string> = {
                                low: 'bg-emerald-100 text-emerald-700',
                                medium: 'bg-amber-100 text-amber-700',
                                high: 'bg-red-100 text-red-700',
                            }
                            const riskIcons: Record<string, JSX.Element> = {
                                low: <Shield className="w-3 h-3" />,
                                medium: <AlertTriangle className="w-3 h-3" />,
                                high: <Flame className="w-3 h-3" />,
                            }
                            return (
                                <>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${stageColors[cjm.currentStage] || 'bg-gray-100 text-gray-700'}`}>
                                        {stageLabels[cjm.currentStage] || cjm.currentStage}
                                    </span>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${riskColors[cjm.churnRisk]}`}>
                                        {riskIcons[cjm.churnRisk]} Churn-риск: {cjm.churnRisk === 'low' ? 'низкий' : cjm.churnRisk === 'medium' ? 'средний' : 'высокий'}
                                    </span>
                                    {(cjm.churnSignals as string[]).map((s) => (
                                        <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-50 text-red-600 font-medium">
                                            <AlertTriangle className="w-3 h-3" /> {s}
                                        </span>
                                    ))}
                                </>
                            )
                        })()}
                    </div>

                    {/* Секция 3: Аквизиция */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5" /> Веб-атрибуция
                            </h3>
                            <div className="space-y-2 text-sm">
                                {([
                                    ['Источник', cjm.acquisition.source],
                                    ['UTM Source', cjm.acquisition.utmSource],
                                    ['UTM Medium', cjm.acquisition.utmMedium],
                                    ['UTM Campaign', cjm.acquisition.utmCampaign],
                                    ['UTM Content', cjm.acquisition.utmContent],
                                    ['UTM Term', cjm.acquisition.utmTerm],
                                    ['Landing Page', cjm.acquisition.utmLandingPage],
                                    ['UTM Link', cjm.acquisition.utmLinkName],
                                ] as [string, string | null][]).map(([k, v]) => v ? (
                                    <div key={k} className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">{k}</span>
                                        <span className="text-gray-800 font-medium text-right truncate max-w-[160px] text-xs">{v}</span>
                                    </div>
                                ) : null)}
                                {!cjm.acquisition.source && !cjm.acquisition.utmSource && (
                                    <p className="text-xs text-gray-400">Нет данных</p>
                                )}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Send className="w-3.5 h-3.5" /> Бот-атрибуция
                            </h3>
                            <div className="space-y-2 text-sm">
                                {([
                                    ['Start payload', cjm.acquisition.botStartPayload],
                                    ['UTM Source', cjm.acquisition.botUtmSource],
                                    ['UTM Medium', cjm.acquisition.botUtmMedium],
                                    ['UTM Campaign', cjm.acquisition.botUtmCampaign],
                                ] as [string, string | null][]).map(([k, v]) => v ? (
                                    <div key={k} className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">{k}</span>
                                        <span className="text-gray-800 font-medium text-right truncate max-w-[160px] text-xs">{v}</span>
                                    </div>
                                ) : null)}
                                {!cjm.acquisition.botStartPayload && !cjm.acquisition.botUtmSource && (
                                    <p className="text-xs text-gray-400">Нет данных</p>
                                )}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <GitBranch className="w-3.5 h-3.5" /> Реферал
                            </h3>
                            <div className="space-y-2 text-sm mb-3">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold">Кто пригласил</p>
                                {cjm.acquisition.referredByCode ? (
                                    <div className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">Код реферала</span>
                                        <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{cjm.acquisition.referredByCode}</code>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400">Без реферала</p>
                                )}
                            </div>
                            <div className="pt-3 border-t border-gray-100 space-y-2 mb-3">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Его рефералы</p>
                                {([
                                    ['Приглашено', invitedData?.summary?.total ?? referrals.invited],
                                    ['Зарег.', invitedData?.summary?.registered ?? '—'],
                                    ['Активированы', invitedData?.summary?.activated ?? '—'],
                                    ['Конвертированы', invitedData?.summary?.converted ?? referrals.converted],
                                ] as [string, number | string][]).map(([label, val]) => (
                                    <div key={label} className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">{label}</span>
                                        <span className="text-gray-800 font-medium text-xs">{val}</span>
                                    </div>
                                ))}
                                {(invitedData?.summary?.total ?? referrals.invited) > 0 && (
                                    <div className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">Конверсия</span>
                                        <span className="text-emerald-600 font-bold text-xs">
                                            {Math.round(((invitedData?.summary?.converted ?? referrals.converted) / (invitedData?.summary?.total ?? referrals.invited)) * 100)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="pt-3 border-t border-gray-100 space-y-2">
                                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Тайминги</p>
                                {([
                                    ['До первой генерации', cjm.timings.daysToFirstGen],
                                    ['До первого платежа', cjm.timings.daysToFirstPayment],
                                    ['С регистрации', cjm.timings.daysSinceRegistration],
                                    ['Без активности', cjm.timings.daysSinceLastActivity],
                                ] as [string, number | null][]).map(([label, val]) => (
                                    <div key={label} className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0 text-xs">{label}</span>
                                        <span className="text-gray-800 font-medium text-xs">{val !== null && val !== undefined ? `${val} дн.` : '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Секция 4: Онбординг */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Онбординг</h3>
                        <div className="flex gap-3 flex-wrap mb-4">
                            {Object.keys(ONBOARDING_LABELS).map(step => {
                                const found = (cjm.onboardingSteps as any[] | undefined)?.find((s: any) => s.step === step)
                                const done = !!found
                                const regDate = cjm.journey?.platformRegisteredAt ? new Date(cjm.journey.platformRegisteredAt) : null
                                const deltadays = (found?.completedAt && regDate)
                                    ? Math.round((new Date(found.completedAt).getTime() - regDate.getTime()) / 86400000)
                                    : null
                                return (
                                    <div key={step} className={`flex flex-col items-center gap-1 p-3 rounded-xl border ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
                                        {done
                                            ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                                            : <Clock className="w-5 h-5 text-gray-300" />}
                                        <p className={`text-[11px] font-medium text-center max-w-[90px] leading-tight ${done ? 'text-emerald-700' : 'text-gray-400'}`}>
                                            {ONBOARDING_LABELS[step]}
                                        </p>
                                        {done && found.completedAt && (
                                            <p className="text-[9px] text-emerald-500">
                                                {new Date(found.completedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                            </p>
                                        )}
                                        {done && deltadays !== null && deltadays >= 0 && (
                                            <p className="text-[9px] text-emerald-400">+{deltadays} дн.</p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        {/* Feature Adoption Grid */}
                        <div className="flex flex-wrap gap-2">
                            {([
                                ['Генерации', cjm.activity.totalGenerations > 0],
                                ['Уроки', (cjm.depth?.lessons ?? 0) > 0],
                                ['Классы', (cjm.depth?.classes ?? 0) > 0],
                                ['Ученики', (cjm.depth?.students ?? 0) > 0],
                                ['ДЗ', (cjm.depth?.assignments ?? 0) > 0],
                                ['Телефон', !!user.phone],
                                ['Telegram', !!user.telegramId],
                                ['MAX', !!user.maxId],
                            ] as [string, boolean][]).map(([label, adopted]) => (
                                <span key={label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${adopted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                    {adopted ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Секция 5: Вовлечённость */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Вовлечённость — окно {cjm.days} дн.</h3>

                        {/* KPI карточки */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                            {([
                                ['Генераций', cjm.engagement?.window.total ?? 0, 'text-indigo-600'],
                                ['Активных дней', cjm.engagement?.window.activeDays ?? 0, 'text-blue-600'],
                                ['Avg/день', cjm.engagement?.window.avgPerActiveDay ?? 0, 'text-cyan-600'],
                                ['Streak сейчас', cjm.engagement?.currentStreak ?? 0, 'text-emerald-600'],
                                ['Streak макс', cjm.engagement?.maxStreak ?? 0, 'text-teal-600'],
                                ['Успешно %', (cjm.engagement?.window.successRate ?? 0) + '%', 'text-green-600'],
                                ['Ошибок', cjm.engagement?.window.failed ?? 0, 'text-rose-500'],
                                ['Avg токенов', cjm.engagement?.window.avgTokens ?? 0, 'text-orange-500'],
                            ] as [string, string | number, string][]).map(([label, val, color]) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className={`text-xl font-bold ${color}`}>{val}</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Heatmap 91 день (GitHub-style) */}
                        {cjm.engagement?.heatmap && cjm.engagement.heatmap.length > 0 && (() => {
                            const heatmapMap = new Map<string, number>()
                            for (const row of cjm.engagement.heatmap as any[]) {
                                heatmapMap.set(row.date, row.count)
                            }
                            const maxCount = Math.max(...Array.from(heatmapMap.values()), 1)
                            // Build 13 weeks x 7 days grid
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const cells: { date: string; count: number }[][] = []
                            for (let col = 12; col >= 0; col--) {
                                const week: { date: string; count: number }[] = []
                                for (let row = 6; row >= 0; row--) {
                                    const d = new Date(today)
                                    d.setDate(d.getDate() - col * 7 - row)
                                    const ds = d.toISOString().slice(0, 10)
                                    week.unshift({ date: ds, count: heatmapMap.get(ds) ?? 0 })
                                }
                                cells.push(week)
                            }
                            const getColor = (count: number) => {
                                if (count === 0) return 'bg-gray-100'
                                const ratio = count / maxCount
                                if (ratio < 0.25) return 'bg-emerald-200'
                                if (ratio < 0.5) return 'bg-emerald-400'
                                if (ratio < 0.75) return 'bg-emerald-600'
                                return 'bg-emerald-800'
                            }
                            return (
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">Активность за 91 день</p>
                                    <div className="overflow-x-auto">
                                        <div className="flex gap-0.5 mb-0.5">
                                            {cells.map((week, wi) => {
                                                const firstDay = week[0]
                                                const isFirstOfMonth = firstDay && parseInt(firstDay.date.slice(8, 10)) <= 7
                                                const label = isFirstOfMonth
                                                    ? new Date(firstDay.date).toLocaleDateString('ru-RU', { month: 'short' })
                                                    : ''
                                                return <div key={wi} className="w-3 text-[8px] text-gray-400 text-center leading-none truncate">{label}</div>
                                            })}
                                        </div>
                                        <div className="flex gap-0.5">
                                            {cells.map((week, wi) => (
                                                <div key={wi} className="flex flex-col gap-0.5">
                                                    {week.map((cell) => (
                                                        <div
                                                            key={cell.date}
                                                            title={`${cell.date}: ${cell.count}`}
                                                            className={`w-3 h-3 rounded-sm ${getColor(cell.count)}`}
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Генерации по неделям + типы контента */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Генерации по неделям — посл. 12 нед. <span className="text-gray-300">(all-time)</span></p>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={(cjm.engagement?.weeklyActivity as any[] | undefined)?.slice(-12).map((r: any) => ({ week: r.week?.slice(5), count: r.count })) ?? []} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Bar dataKey="count" name="Генераций" fill="#6366f1" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Типы контента (окно {cjm.days} дн.)</p>
                                <div className="space-y-2">
                                    {(cjm.engagement?.byType as any[] | undefined)?.slice(0, 6).map((t: any) => (
                                        <div key={t.type}>
                                            <div className="flex justify-between text-xs mb-0.5">
                                                <span className="text-gray-700">{GENERATION_TYPE_LABELS[t.type] || t.type}</span>
                                                <span className="text-gray-500 font-medium">{t.count} ({t.pct}%) avg {t.avgTokens}tok</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full">
                                                <div className="h-1.5 bg-indigo-400 rounded-full" style={{ width: `${t.pct}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                    {(!cjm.engagement?.byType || (cjm.engagement.byType as any[]).length === 0) && (
                                        <p className="text-xs text-gray-400">Нет данных</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Паттерн по часам + по дням недели */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Паттерн по часам <span className="text-gray-300">(all-time)</span></p>
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={(cjm.engagement?.hourPattern as any[] | undefined) ?? []} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                                        <YAxis tick={{ fontSize: 9 }} />
                                        <Tooltip />
                                        <Bar dataKey="count" name="Генераций" radius={[2, 2, 0, 0]}>
                                            {(cjm.engagement?.hourPattern as any[] | undefined)?.map((entry: any) => {
                                                const h = entry.hour
                                                const fill = h >= 6 && h < 12 ? '#f59e0b' : h >= 12 && h < 18 ? '#3b82f6' : h >= 18 && h < 23 ? '#8b5cf6' : '#6b7280'
                                                return <Cell key={h} fill={fill} />
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Паттерн по дням недели <span className="text-gray-300">(all-time)</span></p>
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={(cjm.engagement?.dowPattern as any[] | undefined)?.map((r: any) => ({ ...r, name: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][r.dow] })) ?? []} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Bar dataKey="count" name="Генераций" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Платформа по месяцам */}
                        {(cjm.engagement?.platformOverTime as any[] | undefined)?.length ? (
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Платформа по месяцам <span className="text-gray-300">(all-time)</span></p>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={cjm.engagement.platformOverTime as any[]} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="web" name="Web" stackId="a" fill="#6366f1" />
                                        <Bar dataKey="telegram_bot" name="TG бот" stackId="a" fill="#38bdf8" />
                                        <Bar dataKey="max_bot" name="MAX бот" stackId="a" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : null}
                    </div>

                    {/* Секция 6: Монетизация */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Монетизация</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {([
                                ['LTV', cjm.revenue?.ltv ? `${cjm.revenue.ltv} ₽` : '—', 'text-emerald-600'],
                                ['Платежей', cjm.revenue?.paymentCount ?? 0, 'text-indigo-600'],
                                ['Средний чек', cjm.revenue?.avgPayment ? `${cjm.revenue.avgPayment} ₽` : '—', 'text-blue-600'],
                                ['Прогноз дней', cjm.revenue?.forecastDaysLeft ?? '—', 'text-amber-600'],
                            ] as [string, string | number, string][]).map(([label, val, color]) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className={`text-xl font-bold ${color}`}>{val}</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                        {(cjm.revenue?.allPayments as any[] | undefined)?.length ? (
                            <div className="overflow-x-auto">
                                <p className="text-xs text-gray-400 mb-2">Все платежи</p>
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Дата</th>
                                            <th className="px-3 py-2 text-left">Тариф</th>
                                            <th className="px-3 py-2 text-right">Сумма</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(cjm.revenue.allPayments as any[]).map((p: any, i: number) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{new Date(p.date).toLocaleDateString('ru-RU')}</td>
                                                <td className="px-3 py-2 text-gray-700">{p.planKey}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-emerald-600">{p.amount} ₽</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                        {(cjm.revenue?.planHistory as any[] | undefined)?.length ? (
                            <div>
                                <p className="text-xs text-gray-400 mb-2">История тарифов</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(cjm.revenue.planHistory as any[]).map((p: any, i: number) => (
                                        <div key={i} className="flex items-center gap-1.5">
                                            <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${PLAN_STYLES[p.planKey] || PLAN_STYLES.free}`}>
                                                {PLAN_LABELS[p.planKey] || p.planKey}
                                                {p.count > 1 && <span className="ml-1 text-[10px] opacity-70">×{p.count}</span>}
                                            </div>
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(p.firstAt).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                                            </span>
                                            {i < (cjm.revenue.planHistory as any[]).length - 1 && (
                                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {(cjm.revenue?.creditBurnRate as any[] | undefined)?.length ? (
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Burn rate кредитов по месяцам</p>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={cjm.revenue.creditBurnRate as any[]} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Bar dataKey="spent" name="Потрачено" fill="#f87171" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="granted" name="Начислено" fill="#34d399" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : null}
                    </div>

                    {/* Секция 7: Ретеншн */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ретеншн</h3>
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="bg-gray-50 rounded-xl px-5 py-3 text-center">
                                <p className="text-2xl font-bold text-indigo-600">{cjm.retention?.retentionScore ?? 0}%</p>
                                <p className="text-xs text-gray-500">Retention score (52 нед.)</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl px-5 py-3 text-center">
                                <p className="text-2xl font-bold text-rose-500">{cjm.retention?.longestGap ?? 0}</p>
                                <p className="text-xs text-gray-500">Макс. перерыв (дн.)</p>
                            </div>
                        </div>
                        {/* 52-недельный retention grid */}
                        {(cjm.retention?.weeklyGrid as any[] | undefined)?.length ? (() => {
                            const grid = cjm.retention.weeklyGrid as { week: string; hasActivity: boolean }[]
                            // 4 rows x 13 cols
                            const cols: { week: string; hasActivity: boolean }[][] = []
                            for (let i = 0; i < grid.length; i += 4) {
                                cols.push(grid.slice(i, i + 4))
                            }
                            return (
                                <div>
                                    <p className="text-xs text-gray-400 mb-1">52-недельный retention grid</p>
                                    <div className="overflow-x-auto">
                                        <div className="flex gap-0.5 mb-0.5">
                                            {cols.map((col, ci) => {
                                                const firstCell = col[0]
                                                const isFirstOfMonth = firstCell && parseInt(firstCell.week.slice(8, 10)) <= 7
                                                const label = isFirstOfMonth
                                                    ? new Date(firstCell.week).toLocaleDateString('ru-RU', { month: 'short' })
                                                    : ''
                                                return <div key={ci} className="w-3 text-[8px] text-gray-400 text-center leading-none truncate flex-shrink-0">{label}</div>
                                            })}
                                        </div>
                                        <div className="flex gap-0.5">
                                            {cols.map((col, ci) => (
                                                <div key={ci} className="flex flex-col gap-0.5">
                                                    {col.map((cell) => (
                                                        <div
                                                            key={cell.week}
                                                            title={cell.week}
                                                            className={`w-3 h-3 rounded-sm flex-shrink-0 ${cell.hasActivity ? 'bg-emerald-500' : 'bg-gray-100'}`}
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        })() : null}
                        {/* Перерывы > 7 дней */}
                        {(cjm.retention?.gaps as any[] | undefined)?.length ? (
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Перерывы в активности ({'>'}7 дней)</p>
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left">С</th>
                                            <th className="px-3 py-2 text-left">По</th>
                                            <th className="px-3 py-2 text-right">Дней</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(cjm.retention.gaps as any[]).map((g: any, i: number) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500">{g.from}</td>
                                                <td className="px-3 py-2 text-gray-500">{g.to}</td>
                                                <td className="px-3 py-2 text-right font-bold text-rose-500">{g.days}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>

                    {/* Секция 8: Глубина использования */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Глубина использования</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {([
                                ['Уроков', cjm.depth?.lessons ?? 0, 'text-indigo-600'],
                                ['Классов', cjm.depth?.classes ?? 0, 'text-blue-600'],
                                ['Учеников', cjm.depth?.students ?? 0, 'text-cyan-600'],
                                ['ДЗ', cjm.depth?.assignments ?? 0, 'text-teal-600'],
                            ] as [string, number, string][]).map(([label, val, color]) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-4 text-center">
                                    <p className={`text-3xl font-bold ${color}`}>{val}</p>
                                    <p className="text-xs text-gray-500 mt-1">{label}</p>
                                </div>
                            ))}
                        </div>
                        {/* In-lesson vs standalone */}
                        {(() => {
                            const inLesson = cjm.depth?.inLesson ?? 0
                            const standalone = cjm.depth?.standalone ?? 0
                            const total = inLesson + standalone
                            if (total === 0) return null
                            const pct = Math.round((inLesson / total) * 100)
                            return (
                                <div>
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>В уроке: {inLesson}</span>
                                        <span>Standalone: {standalone}</span>
                                    </div>
                                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-2.5 bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Генерации в уроке: {pct}%</p>
                                </div>
                            )
                        })()}
                        {/* Топ тем */}
                        {(cjm.depth?.topTopics as any[] | undefined)?.length ? (
                            <div>
                                <p className="text-xs text-gray-400 mb-2">Топ тем уроков</p>
                                <div className="space-y-1.5">
                                    {(() => {
                                        const maxCount = Math.max(...(cjm.depth.topTopics as any[]).map((t: any) => t.count), 1)
                                        return (cjm.depth.topTopics as any[]).map((t: any, i: number) => {
                                            const pct = Math.round((t.count / maxCount) * 100)
                                            return (
                                                <div key={i}>
                                                    <div className="flex justify-between text-xs mb-0.5">
                                                        <span className="text-gray-700 truncate max-w-[200px]">{t.topic || '—'}</span>
                                                        <span className="font-medium text-gray-500 ml-2 flex-shrink-0">{t.count}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-gray-100 rounded-full">
                                                        <div className="h-1.5 bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Секция 9: Бот-детали */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Бот</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {([
                                ['Статус', cjm.journey.botRegistrationStatus ?? '—', 'text-gray-700'],
                                ['Платформа', cjm.journey.botPlatform === 'max_bot' ? 'MAX' : cjm.journey.botPlatform === 'telegram_bot' ? 'Telegram' : (cjm.journey.botPlatform ?? '—'), 'text-purple-600'],
                                ['Кредитов (бот)', cjm.journey.botCredits ?? '—', 'text-blue-600'],
                                ['Генераций (бот)', cjm.journey.botTotalGenerations ?? '—', 'text-indigo-600'],
                                ['В этом месяце', cjm.journey.botGenerationsThisMonth ?? '—', 'text-cyan-600'],
                                ['Посл. генерация', cjm.journey.botLastGenerationAt ? new Date(cjm.journey.botLastGenerationAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—', 'text-teal-600'],
                            ] as [string, string | number, string][]).map(([label, val, color]) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className={`text-xl font-bold ${color}`}>{val}</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                        {/* История бот-кредитов */}
                        {cjm.botCreditHistory && (cjm.botCreditHistory as any[]).length > 0 && (
                            <div className="overflow-x-auto">
                                <p className="text-xs text-gray-400 mb-2">История бот-кредитов ({(cjm.botCreditHistory as any[]).length} записей)</p>
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Дата</th>
                                            <th className="px-3 py-2 text-left">Причина</th>
                                            <th className="px-3 py-2 text-left">Тип</th>
                                            <th className="px-3 py-2 text-right">Сумма</th>
                                            <th className="px-3 py-2 text-right">до → после</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(cjm.botCreditHistory as any[]).slice(0, 20).map((t: any, i: number) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                                                    {new Date(t.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                        t.reason === 'initial_grant' ? 'bg-emerald-100 text-emerald-700' :
                                                        t.reason === 'generation_deduct' ? 'bg-red-100 text-red-700' :
                                                        t.reason === 'generation_refund' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {t.reason === 'initial_grant' ? 'Начальный' :
                                                         t.reason === 'generation_deduct' ? 'Генерация' :
                                                         t.reason === 'generation_refund' ? 'Возврат' :
                                                         t.reason === 'admin_set' ? 'Админ' : t.reason}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-500">
                                                    {t.generationType ? (GENERATION_TYPE_LABELS[t.generationType] || t.generationType) : '—'}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {t.amount >= 0 ? '+' : ''}{t.amount}
                                                </td>
                                                <td className="px-3 py-2 text-right text-gray-500 font-mono">
                                                    {t.balanceBefore} → {t.balanceAfter}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>
            )}

            {/* Последние генерации */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" /> Последние 10 генераций
                    </h2>
                </div>
                {generations.recent.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">Нет генераций</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left">Тип</th>
                                <th className="px-4 py-3 text-left">Статус</th>
                                <th className="px-4 py-3 text-left">Стоимость</th>
                                <th className="px-4 py-3 text-left">Дата</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {generations.recent.map((g: any) => (
                                <tr key={g.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-900">
                                        {GENERATION_TYPE_LABELS[g.generationType] || g.generationType}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {g.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-indigo-600">
                                        {g.creditCost ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">
                                        {new Date(g.createdAt).toLocaleString('ru-RU')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
