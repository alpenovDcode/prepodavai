'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import {
    ArrowLeft, User, Zap, Users, GitBranch, BookOpen,
    CreditCard, CheckCircle, Clock, TrendingUp, Loader2,
    Mail, Phone, BookOpenCheck, GraduationCap, MessageSquare, Link2,
    UserPlus, UserCheck, UserCog, MapPin, Shield, AlertTriangle,
    Flame, Download, Send, Globe, ChevronRight
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
    const { data: invitedData } = useSWR(`/admin/users/${id}/referrals`, fetcher)

    const { data: cjmData } = useSWR(`/admin/users/${id}/cjm`, fetcher)
    const cjm = cjmData

    const [selectedPlan, setSelectedPlan] = useState<string>('')
    const [planSaving, setPlanSaving] = useState(false)
    const [planMessage, setPlanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [newEndDate, setNewEndDate] = useState<string>('')
    const [dateSaving, setDateSaving] = useState(false)
    const [dateMessage, setDateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
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

    const handleEndDateChange = async () => {
        if (!newEndDate || !stats?.subscription?.id) return
        setDateSaving(true)
        setDateMessage(null)
        try {
            await apiClient.put(`/admin/subscriptions/${stats.subscription.id}`, { endDate: new Date(newEndDate).toISOString() })
            setDateMessage({ type: 'success', text: 'Дата подписки обновлена' })
            setNewEndDate('')
            mutate()
            setTimeout(() => setDateMessage(null), 3000)
        } catch (e: any) {
            setDateMessage({ type: 'error', text: e.response?.data?.message || 'Ошибка обновления даты' })
        } finally {
            setDateSaving(false)
        }
    }

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-96">
            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )
    if (error) return <div className="text-red-500 p-6">Ошибка загрузки данных пользователя</div>
    if (!stats) return null

    const { user, generations, classes, referrals, subscription, onboarding, credits, botUser } = stats

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

                            {/* Продление подписки */}
                            <div className="pt-3 border-t border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Продлить до</p>
                                <div className="flex items-center gap-2 mb-1">
                                    <input
                                        type="date"
                                        value={newEndDate}
                                        onChange={(e) => setNewEndDate(e.target.value)}
                                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                    />
                                    <button
                                        onClick={handleEndDateChange}
                                        disabled={dateSaving || !newEndDate}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-40 flex items-center gap-1.5"
                                    >
                                        {dateSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                        Сохранить
                                    </button>
                                </div>
                                {dateMessage && (
                                    <p className={`text-xs mt-1 font-medium ${dateMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {dateMessage.text}
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
                    {/* Заголовок + экспорт */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-500" /> CJM пользователя
                        </h2>
                        <button
                            onClick={handleExportCjm}
                            disabled={cjmExporting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-40"
                        >
                            {cjmExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            Экспорт CSV
                        </button>
                    </div>

                    {/* Этап + churn risk */}
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
                                    {cjm.churnSignals.map((s: string) => (
                                        <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-50 text-red-600 font-medium">
                                            <AlertTriangle className="w-3 h-3" /> {s}
                                        </span>
                                    ))}
                                </>
                            )
                        })()}
                    </div>

                    {/* Горизонтальный таймлайн */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Путь пользователя</h3>
                        <div className="flex items-start gap-2 flex-wrap">
                            {[
                                { label: 'Старт бота', date: cjm.journey.botStartedAt, color: 'bg-blue-500' },
                                { label: 'Регистрация', date: cjm.journey.platformRegisteredAt, color: 'bg-indigo-500' },
                                { label: 'Первая генерация', date: cjm.journey.firstGenerationAt, color: 'bg-emerald-500' },
                                { label: 'Первый платёж', date: cjm.journey.firstPaymentAt, color: 'bg-amber-500' },
                            ].filter(e => e.date).map((e, i, arr) => (
                                <div key={e.label} className="flex items-center gap-2">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-2.5 h-2.5 rounded-full ${e.color}`} />
                                        <p className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">{e.label}</p>
                                        <p className="text-[10px] font-medium text-gray-700 whitespace-nowrap">
                                            {new Date(e.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                        </p>
                                    </div>
                                    {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0 mb-4" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Аквизиция */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5" /> Привлечение
                            </h3>
                            <div className="space-y-2 text-sm">
                                {[
                                    ['Источник (web)', cjm.acquisition.source],
                                    ['UTM Source', cjm.acquisition.utmSource],
                                    ['UTM Medium', cjm.acquisition.utmMedium],
                                    ['UTM Campaign', cjm.acquisition.utmCampaign],
                                    ['UTM Content', cjm.acquisition.utmContent],
                                    ['UTM Term', cjm.acquisition.utmTerm],
                                    ['Landing Page', cjm.acquisition.utmLandingPage],
                                    ['UTM Link', cjm.acquisition.utmLinkName],
                                    ['Реферал', cjm.acquisition.referredByCode],
                                ].map(([k, v]) => v ? (
                                    <div key={k} className="flex justify-between gap-2">
                                        <span className="text-gray-400 flex-shrink-0">{k}</span>
                                        <span className="text-gray-800 font-medium text-right truncate max-w-[180px]">{v}</span>
                                    </div>
                                ) : null)}
                            </div>
                            {cjm.acquisition.botStartPayload && (
                                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                        <Send className="w-3 h-3" /> Бот-привлечение
                                    </p>
                                    {[
                                        ['Start payload', cjm.acquisition.botStartPayload],
                                        ['UTM Source (бот)', cjm.acquisition.botUtmSource],
                                        ['UTM Medium (бот)', cjm.acquisition.botUtmMedium],
                                        ['UTM Campaign (бот)', cjm.acquisition.botUtmCampaign],
                                    ].map(([k, v]) => v ? (
                                        <div key={k} className="flex justify-between gap-2">
                                            <span className="text-gray-400 flex-shrink-0">{k}</span>
                                            <span className="text-gray-800 font-medium text-right truncate max-w-[160px]">{v}</span>
                                        </div>
                                    ) : null)}
                                </div>
                            )}
                        </div>

                        {/* Тайминги + активность */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Тайминги</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        ['До первой генерации', cjm.timings.daysToFirstGen, 'дн.'],
                                        ['До первого платежа', cjm.timings.daysToFirstPayment, 'дн.'],
                                        ['Дней с регистрации', cjm.timings.daysSinceRegistration, 'дн.'],
                                        ['Дней без активности', cjm.timings.daysSinceLastActivity, 'дн.'],
                                    ].map(([label, val, unit]) => (
                                        <div key={label as string} className="bg-gray-50 rounded-xl p-3">
                                            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                                            <p className="text-xl font-bold text-gray-900">
                                                {val !== null && val !== undefined ? val : '—'}
                                                {val !== null && val !== undefined && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Откуда инициировано</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        ['Web', cjm.activity.generationsBySource.web, 'bg-blue-50 text-blue-700'],
                                        ['TG бот', cjm.activity.generationsBySource.telegram_bot, 'bg-sky-50 text-sky-700'],
                                        ['MAX бот', cjm.activity.generationsBySource.max_bot, 'bg-purple-50 text-purple-700'],
                                    ].map(([label, val, cls]) => (
                                        <div key={label as string} className={`rounded-xl p-3 text-center ${cls}`}>
                                            <p className="text-xl font-bold">{val ?? 0}</p>
                                            <p className="text-[11px] font-medium mt-0.5">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Доставка результатов</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        ['Web', cjm.activity.generationsByPlatform.web, 'bg-gray-50 text-gray-700'],
                                        ['Telegram', cjm.activity.generationsByPlatform.telegram, 'bg-blue-50 text-blue-700'],
                                        ['MAX', cjm.activity.generationsByPlatform.max, 'bg-purple-50 text-purple-700'],
                                    ].map(([label, val, cls]) => (
                                        <div key={label as string} className={`rounded-xl p-3 text-center ${cls}`}>
                                            <p className="text-xl font-bold">{val ?? 0}</p>
                                            <p className="text-[11px] font-medium mt-0.5">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* История бот-кредитов */}
                    {cjm.botCreditHistory && cjm.botCreditHistory.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-gray-100">
                                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                                    <Send className="w-4 h-4 text-gray-400" /> История бот-кредитов
                                    <span className="ml-auto text-xs text-gray-400">{cjm.botCreditHistory.length} записей</span>
                                </h3>
                            </div>
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Дата</th>
                                        <th className="px-4 py-2 text-left">Причина</th>
                                        <th className="px-4 py-2 text-left">Тип</th>
                                        <th className="px-4 py-2 text-right">Сумма</th>
                                        <th className="px-4 py-2 text-right">Баланс до → после</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {cjm.botCreditHistory.slice(0, 20).map((t: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                                                {new Date(t.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-2">
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
                                            <td className="px-4 py-2 text-gray-500">
                                                {t.generationType ? (GENERATION_TYPE_LABELS[t.generationType] || t.generationType) : '—'}
                                            </td>
                                            <td className={`px-4 py-2 text-right font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {t.amount >= 0 ? '+' : ''}{t.amount}
                                            </td>
                                            <td className="px-4 py-2 text-right text-gray-500 font-mono">
                                                {t.balanceBefore} → {t.balanceAfter}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
