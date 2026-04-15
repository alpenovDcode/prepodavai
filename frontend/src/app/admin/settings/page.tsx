'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Settings, Sparkles, AlertCircle, EyeOff, Lock, Eye, CheckCircle2 } from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(res => res.data.costs)

function ChangePasswordCard() {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrent, setShowCurrent] = useState(false)
    const [showNew, setShowNew] = useState(false)
    const [loading, setLoading] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const canSubmit =
        currentPassword.length > 0 &&
        newPassword.length >= 12 &&
        newPassword === confirmPassword &&
        newPassword !== currentPassword

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        setLoading(true)
        setMsg(null)
        try {
            const res = await apiClient.post('/admin/change-password', { currentPassword, newPassword })
            if (res.data.success) {
                setMsg({ type: 'success', text: 'Пароль успешно изменён' })
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
            } else {
                setMsg({ type: 'error', text: res.data.message || 'Не удалось сменить пароль' })
            }
        } catch (err: any) {
            const text = err?.response?.data?.error || err?.response?.data?.message || 'Ошибка при смене пароля'
            setMsg({ type: 'error', text })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
                <Lock className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-700">Смена пароля администратора</span>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Текущий пароль</label>
                    <div className="relative">
                        <input
                            type={showCurrent ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrent((v) => !v)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Новый пароль (мин. 12 символов)</label>
                    <div className="relative">
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={12}
                            maxLength={128}
                            className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Подтверждение</label>
                    <input
                        type={showNew ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={12}
                        maxLength={128}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        required
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                        <p className="text-xs text-red-500">Пароли не совпадают</p>
                    )}
                    {newPassword && currentPassword && newPassword === currentPassword && (
                        <p className="text-xs text-red-500">Новый пароль должен отличаться от текущего</p>
                    )}
                </div>

                {msg && (
                    <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                        msg.type === 'success'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                        {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {msg.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!canSubmit || loading}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                    {loading ? 'Сохранение...' : 'Сменить пароль'}
                </button>
            </form>
        </div>
    )
}

export default function AdminSettingsPage() {
    const { data: costs, error, isLoading, mutate } = useSWR<any[]>('/admin/costs', fetcher)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState<number>(0)
    const [isSaving, setIsSaving] = useState(false)

    const handleEdit = (operationType: string, currentCost: number) => {
        setEditingId(operationType)
        setEditValue(currentCost)
    }

    const handleSave = async (operationType: string) => {
        setIsSaving(true)
        try {
            await apiClient.put(`/admin/costs/${operationType}`, { creditCost: Number(editValue) })
            setEditingId(null)
            mutate()
        } catch (err) {
            alert('Ошибка при сохранении стоимости')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        setEditingId(null)
    }

    if (error) return <div className="text-red-500">Failed to load costs</div>

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Настройки Начислений</h1>
                <p className="text-gray-500">Управление стоимостью генерации AI в токенах</p>
            </div>

            <ChangePasswordCard />

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-800 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>Изменение стоимости генерации вступит в силу незамедлительно для всех пользователей платформы. Пожалуйста, будьте осторожны при изменении цен, чтобы не вызвать неожиданных списаний.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gray-50/50">
                    <Settings className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-700">Инструменты генерации</span>
                </div>

                <div className="divide-y divide-gray-100">
                    {isLoading ? (
                        <div className="p-8 text-center text-gray-500">Загрузка тарифов...</div>
                    ) : costs?.filter(cost => {
                        const allowedOperations = [
                          'text_generation',
                          'image_generation',
                          'photosession',
                          'presentation',
                          'transcription',
                          'worksheet',
                          'quiz',
                          'vocabulary',
                          'lesson_plan',
                          'feedback',
                          'content_adaptation',
                          'game_generation',
                          'video_analysis',
                          'exam_variant',
                          'lesson_preparation',
                          'unpacking',
                          'sales_advisor',
                          'assistant'
                        ];
                        
                        return allowedOperations.includes(cost.operationType);
                      }).map((cost) => (
                        <div key={cost.operationType} className="p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:bg-gray-50 transition">
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-900">{cost.operationName || cost.operationType}</h3>
                                <p className="text-sm text-gray-500 mt-1">{cost.description || 'Нет описания'}</p>
                                <div className="mt-2 text-xs font-mono text-gray-400">ID: {cost.operationType}</div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 mr-4">
                                    {/* Скрыть функционал */}
                                    <label className="cursor-pointer flex items-center gap-1.5 select-none" title="Скрытый функционал недоступен пользователям">
                                        <div
                                            onClick={async () => {
                                                try {
                                                    await apiClient.put(`/admin/costs/${cost.operationType}`, { isActive: !cost.isActive })
                                                    mutate()
                                                } catch {
                                                    alert('Ошибка при изменении видимости')
                                                }
                                            }}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${cost.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cost.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                                        </div>
                                        <span className={`text-xs font-medium ${cost.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {cost.isActive ? 'Вкл' : <span className="flex items-center gap-1"><EyeOff className="w-3 h-3" />Скрыт</span>}
                                        </span>
                                    </label>

                                    {/* Тех. работы */}
                                    <label className="text-xs text-gray-400 cursor-pointer flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={cost.isUnderMaintenance}
                                            onChange={async (e) => {
                                                try {
                                                    await apiClient.put(`/admin/costs/${cost.operationType}`, { isUnderMaintenance: e.target.checked })
                                                    mutate()
                                                } catch {
                                                    alert('Ошибка при переключении режима обслуживания')
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Тех. работы
                                    </label>
                                </div>

                                {editingId === cost.operationType ? (
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                value={editValue}
                                                onChange={(e) => setEditValue(Number(e.target.value))}
                                                className="w-24 pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                min="0"
                                            />
                                            <Sparkles className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                                        </div>
                                        <button 
                                            onClick={() => handleSave(cost.operationType)}
                                            disabled={isSaving}
                                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                                        >
                                            {isSaving ? 'Ок...' : 'Ок'}
                                        </button>
                                        <button 
                                            onClick={handleCancel}
                                            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm"
                                        >
                                            Отмена
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-1.5 text-lg font-bold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg">
                                            <Sparkles className="w-5 h-5 text-gray-500" />
                                            {cost.creditCost}
                                        </div>
                                        <button 
                                            onClick={() => handleEdit(cost.operationType, cost.creditCost)}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            Изменить
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
