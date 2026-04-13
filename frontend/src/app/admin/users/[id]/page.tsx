'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import {
    ArrowLeft, User, Zap, Users, GitBranch, BookOpen,
    CreditCard, CheckCircle, Clock, TrendingUp, Loader2,
    Mail, Phone, BookOpenCheck, GraduationCap, MessageSquare, Link2
} from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const PLANS = [
    { key: 'free', label: 'Бесплатный' },
    { key: 'starter', label: 'Стартер' },
    { key: 'pro', label: 'Про' },
    { key: 'business', label: 'Бизнес' },
]

const PLAN_STYLES: Record<string, string> = {
    free: 'text-gray-600 bg-gray-100 border-gray-200',
    starter: 'text-blue-700 bg-blue-50 border-blue-200',
    pro: 'text-purple-700 bg-purple-50 border-purple-200',
    business: 'text-amber-700 bg-amber-50 border-amber-200',
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
    const { data, isLoading, error, mutate } = useSWR(`/admin/users/${id}/stats`, fetcher)
    const stats = data?.stats

    const [selectedPlan, setSelectedPlan] = useState<string>('')
    const [planSaving, setPlanSaving] = useState(false)
    const [planMessage, setPlanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const currentPlanKey = stats?.subscription?.planKey ?? ''

    const handlePlanChange = async () => {
        if (!selectedPlan || selectedPlan === currentPlanKey) return
        setPlanSaving(true)
        setPlanMessage(null)
        try {
            await apiClient.put(`/admin/users/${id}`, { planKey: selectedPlan })
            setPlanMessage({ type: 'success', text: 'Тариф успешно изменён' })
            mutate()
            setTimeout(() => setPlanMessage(null), 3000)
        } catch (e: any) {
            setPlanMessage({ type: 'error', text: e.response?.data?.message || 'Ошибка изменения тарифа' })
        } finally {
            setPlanSaving(false)
        }
    }

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-96">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )
    if (error) return <div className="text-red-500 p-6">Ошибка загрузки данных пользователя</div>
    if (!stats) return null

    const { user, generations, classes, referrals, subscription, onboarding, credits } = stats

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
                        {!user.email && !user.phone && !user.subject && !user.grades && !user.bio && (
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
                {/* Подписка */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-gray-400" /> Подписка и токены
                    </h2>
                    {subscription ? (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Статус</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {subscription.status}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Баланс</span>
                                <span className="font-bold text-indigo-600">{subscription.creditsBalance} токенов</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Потрачено (всего)</span>
                                <span className="font-semibold text-orange-600">{credits.spent}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Начислено (всего)</span>
                                <span className="font-semibold text-emerald-600">+{credits.granted}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-500">Подписка до</span>
                                <span className="text-sm text-gray-700">
                                    {subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('ru-RU') : '—'}
                                </span>
                            </div>

                            {/* Смена тарифа */}
                            <div className="pt-3 border-t border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Сменить тариф</p>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PLAN_STYLES[currentPlanKey] || PLAN_STYLES.free}`}>
                                        {subscription.plan}
                                    </span>
                                    <span className="text-gray-400 text-xs">→</span>
                                    <select
                                        value={selectedPlan || currentPlanKey}
                                        onChange={(e) => setSelectedPlan(e.target.value)}
                                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                    >
                                        {PLANS.map(p => (
                                            <option key={p.key} value={p.key}>{p.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handlePlanChange}
                                        disabled={planSaving || (selectedPlan || currentPlanKey) === currentPlanKey}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 flex items-center gap-1.5"
                                    >
                                        {planSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                        Сохранить
                                    </button>
                                </div>
                                {planMessage && (
                                    <p className={`text-xs mt-1 font-medium ${planMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {planMessage.text}
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-400 text-sm">Нет активной подписки</p>
                    )}
                </div>

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
