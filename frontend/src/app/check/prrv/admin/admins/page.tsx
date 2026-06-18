'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Search, UserPlus, Trash2, ShieldCheck, ShieldAlert, X } from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(res => res.data)

export default function AdminAdminsPage() {
    const { data, isLoading, mutate } = useSWR<any>('/admin/admins', fetcher)
    const admins = data?.admins || []

    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [error, setError] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    const handleSearch = async () => {
        if (!searchInput.trim()) return
        setIsSearching(true)
        setError('')
        try {
            const res = await apiClient.get('/admin/users', {
                params: { search: searchInput.trim(), limit: 10, offset: 0 }
            })
            setSearchResults(res.data.users || [])
        } catch {
            setError('Ошибка поиска')
        } finally {
            setIsSearching(false)
        }
    }

    const handleAddAdmin = async (userId: string, username: string) => {
        setError('')
        try {
            await apiClient.post(`/admin/admins/${userId}`)
            setSuccessMsg(`${username} добавлен как администратор`)
            setIsAddModalOpen(false)
            setSearchInput('')
            setSearchResults([])
            mutate()
            setTimeout(() => setSuccessMsg(''), 4000)
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ошибка добавления')
        }
    }

    const handleRemoveAdmin = async (userId: string, username: string) => {
        if (!confirm(`Удалить права администратора у ${username}?`)) return
        setError('')
        try {
            await apiClient.delete(`/admin/admins/${userId}`)
            mutate()
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ошибка удаления')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Администраторы</h1>
                    <p className="text-gray-500">Управление доступом к панели администратора</p>
                </div>
                <button
                    onClick={() => { setIsAddModalOpen(true); setError(''); setSearchResults([]); setSearchInput('') }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <UserPlus className="w-5 h-5" />
                    <span>Добавить администратора</span>
                </button>
            </div>

            {successMsg && (
                <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    {successMsg}
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 flex items-center gap-2 text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    {error}
                </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                        Текущие администраторы — {admins.length}
                    </p>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                        <span>Загрузка...</span>
                    </div>
                ) : admins.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">Администраторы не найдены</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {admins.map((admin: any) => (
                            <li key={admin.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                                        <ShieldCheck className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900">{admin.username}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">
                                            {admin.firstName} {admin.lastName}
                                            {admin.email && <span className="ml-2 text-gray-300">·</span>}
                                            {admin.email && <span className="ml-2">{admin.email}</span>}
                                        </div>
                                        <div className="font-mono text-[10px] text-gray-300 mt-0.5">{admin.id}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {admin.lastAccessAt && (
                                        <span className="text-xs text-gray-400 hidden sm:block">
                                            Вход: {new Date(admin.lastAccessAt).toLocaleDateString()}
                                        </span>
                                    )}
                                    <button
                                        onClick={() => handleRemoveAdmin(admin.id, admin.username)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                        title="Удалить права администратора"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                <strong>Важно:</strong> Администраторы добавляются через переменную окружения{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">ADMIN_USER_IDS</code>.
                Изменения применяются немедленно и сохраняются в <code className="font-mono bg-amber-100 px-1 rounded">.env</code> файле.
            </div>

            {/* Add Admin Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold">Добавить администратора</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex gap-2 items-center border border-red-100">
                                    <ShieldAlert className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                    <Search className="w-4 h-4 text-gray-400 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Поиск по логину, имени или ID..."
                                        className="flex-1 bg-transparent border-none outline-none text-sm"
                                        value={searchInput}
                                        onChange={e => setSearchInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                    />
                                </div>
                                <button
                                    onClick={handleSearch}
                                    disabled={isSearching}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium"
                                >
                                    {isSearching ? '...' : 'Найти'}
                                </button>
                            </div>

                            {searchResults.length > 0 && (
                                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                                    {searchResults.map((user: any) => {
                                        const alreadyAdmin = admins.some((a: any) => a.id === user.id)
                                        return (
                                            <li key={user.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                                                <div>
                                                    <div className="font-medium text-gray-900 text-sm">{user.username}</div>
                                                    <div className="text-xs text-gray-400">{user.firstName} {user.lastName}</div>
                                                </div>
                                                {alreadyAdmin ? (
                                                    <span className="text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg font-medium">
                                                        Уже админ
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAddAdmin(user.id, user.username)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5" />
                                                        Назначить
                                                    </button>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}

                            {searchResults.length === 0 && searchInput && !isSearching && (
                                <p className="text-sm text-gray-400 text-center py-4">Пользователи не найдены</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
