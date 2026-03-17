'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Search, Plus, Edit2, Trash2, X, ShieldAlert, Key } from 'lucide-react'

const fetcher = ([url, page, limit, search]: [string, number, number, string]) => 
    apiClient.get(url, { params: { limit, offset: (page - 1) * limit, search } }).then(res => res.data)

export default function AdminUsersPage() {
    const [page, setPage] = useState(1)
    const [limit] = useState(10)
    const [searchQuery, setSearchQuery] = useState('')
    
    const { data, error, isLoading, mutate } = useSWR<any>(['/admin/users', page, limit, searchQuery], fetcher)
    const users = data?.users || []
    const total = data?.total || 0
    const totalPages = Math.ceil(total / limit)

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<any>(null)

    // Form states
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        phone: '',
        creditsBalance: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formError, setFormError] = useState('')

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setFormError('')
        setIsSubmitting(true)
        
        try {
            await apiClient.post('/admin/users', formData)
            setIsCreateModalOpen(false)
            setFormData({ username: '', password: '', firstName: '', lastName: '', phone: '', creditsBalance: '' })
            mutate() // Refresh data
        } catch (err: any) {
            setFormError(err.response?.data?.message || 'Ошибка создания пользователя')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string, username: string) => {
        if (confirm(`Вы действительно хотите удалить пользователя ${username}?`)) {
            try {
                await apiClient.delete(`/admin/users/${id}`)
                mutate()
            } catch (err: any) {
                alert(err.response?.data?.message || 'Ошибка удаления')
            }
        }
    }

    const openEditModal = (user: any) => {
        setSelectedUser(user)
        setFormData({
            username: user.username || '',
            password: '', // Password is not returned from API
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            phone: user.phone || '',
            creditsBalance: user.subscription?.creditsBalance?.toString() || '0'
        })
        setIsEditModalOpen(true)
    }

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setFormError('')
        setIsSubmitting(true)
        
        try {
            const dataToUpdate = { ...formData }
            if (!dataToUpdate.password) {
                delete (dataToUpdate as any).password // Don't send empty password
            }
            if (dataToUpdate.creditsBalance === '') {
                delete (dataToUpdate as any).creditsBalance
            }
            
            await apiClient.put(`/admin/users/${selectedUser.id}`, dataToUpdate)
            setIsEditModalOpen(false)
            mutate()
        } catch (err: any) {
            setFormError(err.response?.data?.message || 'Ошибка обновления пользователя')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Пользователи</h1>
                    <p className="text-gray-500">Управление пользователями платформы</p>
                </div>
                
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    < Plus className="w-5 h-5" />
                    <span>Добавить пользователя</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                        <Search className="w-5 h-5 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Поиск по имени, логину, тел или ID..."
                            className="flex-1 bg-transparent border-none outline-none text-sm focus:ring-0"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value)
                                setPage(1) // Reset to first page on search
                            }}
                        />
                    </div>
                </div>
                
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <span>Загрузка пользователей...</span>
                    </div>
                ) : users.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">Пользователи не найдены</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-500">
                            <thead className="bg-gray-50 text-xs text-gray-700 uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">ID / Логин / Пароль</th>
                                    <th className="px-6 py-4">Имя & Тел</th>
                                    <th className="px-6 py-4">Ключи доступа / Баланс</th>
                                    <th className="px-6 py-4">Последний вход</th>
                                    <th className="px-6 py-4 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {users.map((user: any) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition border-b border-gray-50 last:border-0">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-gray-900">{user.username || 'Без юзернейма'}</div>
                                            <div className="font-mono text-xs text-gray-400 mt-1" title={user.id}>ID: <span className="font-semibold text-gray-500">{user.id.substring(0, 8)}...</span></div>
                                            <div className="text-xs mt-1.5 font-medium">
                                                {user.hasPassword ? <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Пароль задан</span> : <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Пароля нет</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-900 font-semibold">{user.firstName} {user.lastName}</div>
                                            <div className="text-gray-400 text-xs mt-1">{user.phone || 'Нет телефона'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-2 justify-center">
                                                <div className="flex items-center gap-1.5" title="API Key">
                                                    <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
                                                        <Key className="w-3.5 h-3.5 text-blue-600" />
                                                    </div>
                                                    <span className="font-mono text-xs text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">{user.apiKey || 'Нет ключа'}</span>
                                                    {user.apiKey && (
                                                        <button 
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(user.apiKey);
                                                                alert('API ключ скопирован');
                                                            }}
                                                            className="text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase tracking-tight hover:underline underline-offset-2 transition-all"
                                                        >
                                                            Copy
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-xs font-bold pl-0.5 flex items-center gap-2">
                                                    <span className="text-gray-400 uppercase tracking-widest text-[9px]">Баланс: </span>
                                                    <span className="text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100 tabular-nums">{user.subscription?.creditsBalance ?? '—'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-gray-700 font-medium">
                                                {user.lastAccessAt ? new Date(user.lastAccessAt).toLocaleString() : <span className="text-gray-300 italic">Никогда</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-1.5 text-gray-400">
                                                <button onClick={() => openEditModal(user)} className="hover:text-blue-600 hover:bg-blue-50 p-2 rounded-xl transition-all" title="Редактировать">
                                                    <Edit2 className="w-4.5 h-4.5" />
                                                </button>
                                                <button onClick={() => handleDelete(user.id, user.username)} className="hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all" title="Удалить">
                                                    <Trash2 className="w-4.5 h-4.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {/* Pagination Controls */}
                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-gray-50 flex items-center justify-between bg-white">
                        <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                            Показано {users.length} из {total} пользователей
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button 
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-100"
                            >
                                Назад
                            </button>
                            
                            <div className="flex items-center gap-1 mx-2">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setPage(i + 1)}
                                        className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all ${
                                            page === i + 1 
                                            ? 'bg-blue-600 text-white shadow-md' 
                                            : 'text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>

                            <button 
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-100"
                            >
                                Вперед
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {(isCreateModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold">{isCreateModalOpen ? 'Создать пользователя' : 'Редактировать профиль'}</h2>
                            <button onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <form onSubmit={isCreateModalOpen ? handleCreateSubmit : handleEditSubmit} className="p-6 space-y-4">
                            {formError && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex gap-2 items-center">
                                    <ShieldAlert className="w-4 h-4" />
                                    {formError}
                                </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Username / Логин *</label>
                                    <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full border-gray-300 rounded-lg p-2 border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Пароль {isEditModalOpen && <span className="text-xs text-gray-400 font-normal">(пусто=не менять)</span>}
                                    </label>
                                    <input required={isCreateModalOpen} type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border-gray-300 rounded-lg p-2 border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                                    <input type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full border-gray-300 rounded-lg p-2 border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия</label>
                                    <input type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full border-gray-300 rounded-lg p-2 border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                                    <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+7 999 000 00 00" className="w-full border-gray-300 rounded-lg p-2 border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <label className="block text-sm font-medium text-indigo-700 mb-1 font-semibold">Баланс токенов</label>
                                    <input type="number" placeholder="100" value={formData.creditsBalance} onChange={e => setFormData({...formData, creditsBalance: e.target.value})} className="w-full border-indigo-200 bg-indigo-50/50 rounded-lg p-2 border focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                                </div>
                            </div>
                            
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditModalOpen(false); }} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                                    Отмена
                                </button>
                                <button disabled={isSubmitting} type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                                    {isSubmitting ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
