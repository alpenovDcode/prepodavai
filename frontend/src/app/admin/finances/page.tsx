'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { DollarSign, Activity, FileText } from 'lucide-react'

const fetcherSubscriptions = (url: string) => apiClient.get(url).then(res => res.data.subscriptions)
const fetcherTransactions = (url: string) => apiClient.get(url).then(res => res.data.transactions)

export default function AdminFinancesPage() {
    const [activeTab, setActiveTab] = useState<'subscriptions'|'transactions'>('subscriptions')
    const { data: subscriptions, isLoading: isLoadingSubs } = useSWR<any[]>('/admin/subscriptions', fetcherSubscriptions)
    const { data: transactions, isLoading: isLoadingTrans } = useSWR<any[]>('/admin/transactions', fetcherTransactions)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Финансы & Подписки</h1>
                <p className="text-gray-500">Управление токенами и историей балансов пользователей</p>
            </div>

            <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 p-1 w-fit">
                <button 
                    onClick={() => setActiveTab('subscriptions')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'subscriptions' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <Activity className="w-4 h-4" />
                    Активные Подписки
                </button>
                <button 
                    onClick={() => setActiveTab('transactions')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'transactions' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <FileText className="w-4 h-4" />
                    Транзакции
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {activeTab === 'subscriptions' && (
                    <div className="overflow-x-auto">
                        {isLoadingSubs ? (
                            <div className="p-8 text-center text-gray-500">Загрузка подписок...</div>
                        ) : !subscriptions || subscriptions.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Подписки не найдены</div>
                        ) : (
                            <table className="w-full text-left text-sm text-gray-500">
                                <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                                    <tr>
                                        <th className="px-6 py-4">ID / Пользователь</th>
                                        <th className="px-6 py-4">План</th>
                                        <th className="px-6 py-4">Статус</th>
                                        <th className="px-6 py-4">Баланс Токенов</th>
                                        <th className="px-6 py-4">Даты</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {subscriptions.map(sub => (
                                        <tr key={sub.id} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">{sub.user?.username || sub.user?.firstName || 'Неизвестный'}</div>
                                                <div className="font-mono text-xs text-gray-400 mt-1">{sub.id.substring(0, 8)}...</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">
                                                {sub.plan?.planName || 'Неизвестно'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded text-xs ${sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                                                    {sub.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                                    <span className="text-gray-900 font-bold text-lg">{sub.creditsBalance}</span>
                                                </div>
                                                <div className="text-xs text-gray-400">Использовано: {sub.creditsUsed}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                                <div>От: {sub.startDate ? new Date(sub.startDate).toLocaleDateString() : '-'}</div>
                                                <div>До: {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : '-'}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'transactions' && (
                    <div className="overflow-x-auto">
                        {isLoadingTrans ? (
                            <div className="p-8 text-center text-gray-500">Загрузка транзакций...</div>
                        ) : !transactions || transactions.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Транзакции не найдены</div>
                        ) : (
                            <table className="w-full text-left text-sm text-gray-500">
                                <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                                    <tr>
                                        <th className="px-6 py-4">ID / Дата</th>
                                        <th className="px-6 py-4">Тип</th>
                                        <th className="px-6 py-4">Пользователь</th>
                                        <th className="px-6 py-4">Сумма (Токены)</th>
                                        <th className="px-6 py-4">Баланс (До / После)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {transactions.map(tx => (
                                        <tr key={tx.id} className="hover:bg-gray-50 transition">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-gray-900 mb-1">{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '-'}</div>
                                                <div className="font-mono text-xs text-gray-400">{tx.id.substring(0, 8)}...</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-1 rounded text-xs ${tx.type === 'generation' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {tx.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                                                {tx.user?.username || tx.user?.firstName || 'Неизвестный'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                               <span className={`font-bold ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                                               </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-gray-400">{tx.balanceBefore}</span>
                                                <span className="mx-2 text-gray-300">→</span>
                                                <span className="text-gray-900 font-medium">{tx.balanceAfter}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
