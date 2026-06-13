'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Save, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

interface MaintenanceStatus {
    enabled: boolean
    message: string
    updatedAt: string | null
}

const DEFAULT_MESSAGE = 'Сервис временно не доступен. Ведутся технические работы'

export default function AdminMaintenancePage() {
    const [status, setStatus] = useState<MaintenanceStatus | null>(null)
    const [draftEnabled, setDraftEnabled] = useState(false)
    const [draftMessage, setDraftMessage] = useState(DEFAULT_MESSAGE)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<Date | null>(null)

    const load = async () => {
        setLoading(true)
        try {
            const resp = await apiClient.get<MaintenanceStatus>('/admin/maintenance')
            setStatus(resp.data)
            setDraftEnabled(resp.data.enabled)
            setDraftMessage(resp.data.message || DEFAULT_MESSAGE)
        } catch (err) {
            console.error('Failed to load maintenance status:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const save = async () => {
        if (draftEnabled && status && !status.enabled) {
            if (!confirm('Включить технические работы? Все пользователи, кроме админов, увидят заглушку.')) return
        }
        setSaving(true)
        try {
            const resp = await apiClient.post<MaintenanceStatus>('/admin/maintenance', {
                enabled: draftEnabled,
                message: draftMessage,
            })
            setStatus(resp.data)
            setSavedAt(new Date())
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось сохранить'
            alert(Array.isArray(msg) ? msg.join('; ') : msg)
        } finally {
            setSaving(false)
        }
    }

    const isDirty = !!status && (draftEnabled !== status.enabled || draftMessage !== status.message)

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Технические работы</h1>
                <p className="text-sm text-gray-500 mt-1">
                    При включении этого режима все пользователи (кроме админов) увидят заглушку и не смогут пользоваться сервисом.
                    Бэкенд возвращает 503 на любые non-admin запросы — нагрузка падает мгновенно.
                </p>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-500">
                    Загрузка...
                </div>
            ) : (
                <>
                    <div className={`rounded-xl border p-4 mb-5 flex items-start gap-3 ${status?.enabled ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                        {status?.enabled ? (
                            <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                        ) : (
                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                            <p className={`font-semibold ${status?.enabled ? 'text-orange-900' : 'text-green-900'}`}>
                                Сейчас: {status?.enabled ? 'технические работы ВКЛЮЧЕНЫ' : 'сервис работает в обычном режиме'}
                            </p>
                            {status?.updatedAt && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Последнее изменение: {new Date(status.updatedAt).toLocaleString('ru-RU')}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={draftEnabled}
                                onChange={(e) => setDraftEnabled(e.target.checked)}
                                className="mt-1 w-5 h-5 accent-orange-500"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900">Включить технические работы</span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Все non-admin запросы будут отклоняться с ошибкой 503. Сами админы пользуются сервисом как обычно.
                                </span>
                            </span>
                        </label>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Сообщение для пользователей
                            </label>
                            <textarea
                                value={draftMessage}
                                onChange={(e) => setDraftMessage(e.target.value)}
                                rows={4}
                                maxLength={1000}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 resize-y"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Поддерживаются переносы строк. Будет показано во всю ширину заглушки.
                            </p>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <div className="text-xs text-gray-400">
                                {savedAt && `Сохранено: ${savedAt.toLocaleTimeString('ru-RU')}`}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={load}
                                    disabled={saving || loading}
                                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                                >
                                    Сбросить
                                </button>
                                <button
                                    onClick={save}
                                    disabled={saving || !isDirty}
                                    className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${draftEnabled ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Сохранение...' : 'Применить'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 text-xs text-gray-500 leading-relaxed">
                        <p className="font-semibold text-gray-700 mb-1">Что считается «админом»</p>
                        <p>
                            Доступ свободно сохраняется только у пользователей, чьи ID есть в <code className="bg-gray-100 px-1.5 py-0.5 rounded">ADMIN_USER_IDS</code> на бэкенде.
                            Это тот же список, что управляет доступом к админ-панели — никаких отдельных переключателей не нужно.
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
