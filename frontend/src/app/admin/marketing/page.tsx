'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import {
    Megaphone, Gift, GitBranch, Send, ChevronDown,
    Trophy, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'

const fetcher = ([url, limit, offset]: [string, number, number]) =>
    apiClient.get(url, { params: { limit, offset } }).then(r => r.data)

type Tab = 'broadcast' | 'credits' | 'referrals'

// ====== BROADCAST ======
function BroadcastTab() {
    const [message, setMessage] = useState('')
    const [platforms, setPlatforms] = useState<{ telegram: boolean; max: boolean }>({ telegram: true, max: true })
    const [filterSource, setFilterSource] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<any>(null)

    const handleSend = async () => {
        if (!message.trim()) return
        if (!platforms.telegram && !platforms.max) { alert('Выберите хотя бы одну платформу'); return }
        if (!confirm(`Отправить сообщение всем пользователям${filterSource ? ` (источник: ${filterSource})` : ''}?`)) return

        setIsLoading(true)
        setResult(null)
        try {
            const selectedPlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k)
            const res = await apiClient.post('/admin/broadcast', {
                message,
                platforms: selectedPlatforms,
                filter: filterSource ? { source: filterSource } : undefined,
            })
            setResult(res.data)
        } catch (e: any) {
            setResult({ error: e.response?.data?.message || 'Ошибка отправки' })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-5 max-w-2xl">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 text-amber-800 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>Рассылка отправляется только пользователям с привязанным Telegram или MAX аккаунтом.</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Сообщение</label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Введите текст рассылки..."
                    rows={5}
                    className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{message.length} символов</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Платформы</label>
                    <div className="space-y-2">
                        {(['telegram', 'max'] as const).map(p => (
                            <label key={p} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={platforms[p]} onChange={e => setPlatforms(prev => ({ ...prev, [p]: e.target.checked }))}
                                    className="rounded border-gray-300 text-blue-600" />
                                <span className="text-sm text-gray-700 capitalize">{p}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Фильтр по источнику</label>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="">Все пользователи</option>
                        <option value="telegram">Telegram</option>
                        <option value="max">MAX</option>
                        <option value="web">Web</option>
                    </select>
                </div>
            </div>

            <button
                onClick={handleSend}
                disabled={isLoading || !message.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isLoading ? 'Отправка...' : 'Отправить рассылку'}
            </button>

            {result && (
                <div className={`p-4 rounded-xl border text-sm ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    {result.error ? result.error : (
                        <div className="space-y-1">
                            <p className="font-semibold">{result.message}</p>
                            <p>Telegram: <strong>{result.sentTelegram}</strong>, MAX: <strong>{result.sentMax}</strong></p>
                            {result.errors?.length > 0 && (
                                <p className="text-xs text-red-600 mt-1">Ошибок: {result.errors.length}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ====== BULK CREDITS ======
function BulkCreditsTab() {
    const [amount, setAmount] = useState(100)
    const [description, setDescription] = useState('')
    const [filterSource, setFilterSource] = useState('')
    const [filterPlanKey, setFilterPlanKey] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<any>(null)

    const handleGrant = async () => {
        if (!amount || amount <= 0) { alert('Укажите количество токенов'); return }
        if (!description.trim()) { alert('Укажите описание'); return }
        if (!confirm(`Начислить ${amount} токенов всем подходящим пользователям?`)) return

        setIsLoading(true)
        setResult(null)
        try {
            const res = await apiClient.post('/admin/credits/bulk-grant', {
                amount,
                description,
                filter: {
                    ...(filterSource ? { source: filterSource } : {}),
                    ...(filterPlanKey ? { planKey: filterPlanKey } : {}),
                },
            })
            setResult(res.data)
        } catch (e: any) {
            setResult({ error: e.response?.data?.message || 'Ошибка начисления' })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-5 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Количество токенов</label>
                    <input type="number" min={1} value={amount} onChange={e => setAmount(Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Фильтр по источнику</label>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="">Все пользователи</option>
                        <option value="telegram">Telegram</option>
                        <option value="max">MAX</option>
                        <option value="web">Web</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Фильтр по плану</label>
                    <select value={filterPlanKey} onChange={e => setFilterPlanKey(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        <option value="">Все планы</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="business">Business</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание причины *</label>
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="Например: Акция, бонус за активность..."
                        className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
            </div>

            <button
                onClick={handleGrant}
                disabled={isLoading || !amount || !description.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-medium text-sm"
            >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                {isLoading ? 'Начисление...' : `Начислить ${amount} токенов`}
            </button>

            {result && (
                <div className={`p-4 rounded-xl border text-sm ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    {result.error || result.message}
                </div>
            )}
        </div>
    )
}

// ====== REFERRALS ======
function ReferralsTab() {
    const [page, setPage] = useState(1)
    const limit = 20
    const { data, isLoading } = useSWR<any>(['/admin/referrals', limit, (page - 1) * limit], fetcher)
    const referrals = data?.referrals || []
    const total = data?.total || 0
    const totalPages = Math.ceil(total / limit)
    const topReferrers = data?.topReferrers || []

    const statusColors: Record<string, string> = {
        registered: 'bg-gray-100 text-gray-600',
        activated: 'bg-blue-100 text-blue-700',
        converted: 'bg-emerald-100 text-emerald-700',
    }

    return (
        <div className="space-y-6">
            {/* Топ рефереров */}
            {topReferrers.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" /> Топ рефереров
                    </h3>
                    <div className="space-y-2">
                        {topReferrers.map((r: any, i: number) => (
                            <div key={r.referrerUserId} className="flex items-center gap-3">
                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-500'}`}>
                                    {i + 1}
                                </span>
                                <span className="flex-1 text-sm text-gray-800">
                                    {r.user?.firstName || r.user?.username || r.referrerUserId.slice(0, 8)}
                                    {r.user?.username && <span className="text-gray-400 ml-1">@{r.user.username}</span>}
                                </span>
                                <span className="font-bold text-gray-900">{r.count} реф.</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Таблица рефералов */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Все рефералы</h3>
                    <span className="text-xs text-gray-400">Всего: {total}</span>
                </div>
                {isLoading ? (
                    <div className="p-8 flex justify-center">
                        <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left">Пригласил</th>
                                    <th className="px-4 py-3 text-left">Тип</th>
                                    <th className="px-4 py-3 text-left">Статус</th>
                                    <th className="px-4 py-3 text-left">Вознаграждение</th>
                                    <th className="px-4 py-3 text-left">Дата</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {referrals.map((r: any) => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-900">
                                            {r.referralCode?.user?.firstName || r.referralCode?.user?.username || r.referrerUserId.slice(0, 8)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{r.referralType}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[r.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.rewardGranted
                                                ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                : <span className="text-gray-300 text-xs">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t flex items-center justify-between">
                        <span className="text-xs text-gray-400">{referrals.length} из {total}</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">Назад</button>
                            <span className="px-3 py-1.5 text-xs text-gray-600">{page}/{totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">Вперёд</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ====== MAIN ======
export default function AdminMarketingPage() {
    const [tab, setTab] = useState<Tab>('broadcast')

    const tabs: { id: Tab; label: string; icon: typeof Megaphone }[] = [
        { id: 'broadcast', label: 'Рассылка', icon: Megaphone },
        { id: 'credits', label: 'Начислить токены', icon: Gift },
        { id: 'referrals', label: 'Рефералы', icon: GitBranch },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Маркетинг</h1>
                <p className="text-gray-500">Рассылки, начисление токенов и реферальная аналитика</p>
            </div>

            <div className="flex bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit gap-1">
                {tabs.map(t => {
                    const Icon = t.icon
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === 'broadcast' && <BroadcastTab />}
            {tab === 'credits' && <BulkCreditsTab />}
            {tab === 'referrals' && <ReferralsTab />}
        </div>
    )
}
