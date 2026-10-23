'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Save, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'

interface ToolStatus {
    opKey?: string
    enabled: boolean
    message: string
    updatedAt: string | null
}

const OP_KEY = 'tutor_exchange'
const OP_TITLE = 'Обмен учениками'
const OP_DESCRIPTION = 'Раздел передачи учеников между репетиторами. Пока выключен — пункт в сайдбаре пользователей скрыт.'
const DEFAULT_MESSAGE = 'Раздел «Обмен учениками» скоро откроется — мы обкатываем последние детали'

export default function AdminToolsPage() {
    const [status, setStatus] = useState<ToolStatus | null>(null)
    const [draftEnabled, setDraftEnabled] = useState(false)
    const [draftMessage, setDraftMessage] = useState(DEFAULT_MESSAGE)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<Date | null>(null)

    const load = async () => {
        setLoading(true)
        try {
            const resp = await apiClient.get<ToolStatus>(`/admin/tool-status?opKey=${OP_KEY}`)
            setStatus(resp.data)
            setDraftEnabled(resp.data.enabled)
            setDraftMessage(resp.data.message || DEFAULT_MESSAGE)
        } catch (err) {
            console.error('Failed to load tool status:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const save = async () => {
        if (draftEnabled && status && !status.enabled) {
            if (!confirm(`Включить «${OP_TITLE}» для всех пользователей?`)) return
        }
        setSaving(true)
        try {
            const resp = await apiClient.post<ToolStatus>('/admin/tool-status', {
                opKey: OP_KEY,
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
            <div className="mb-6 flex items-start gap-3">
                <Sparkles className="w-7 h-7 text-blue-500 mt-1" />
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Инструменты</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Глобальные переключатели опциональных разделов. Non-admin пользователи не видят
                        соответствующие пункты сайдбара и получают 503 на API выключенного инструмента.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-500">
                    Загрузка...
                </div>
            ) : (
                <>
                    <div className={`rounded-xl border p-4 mb-5 flex items-start gap-3 ${status?.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        {status?.enabled ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                            <p className={`font-semibold ${status?.enabled ? 'text-green-900' : 'text-gray-800'}`}>
                                {OP_TITLE}: {status?.enabled ? 'включена' : 'выключена'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">{OP_DESCRIPTION}</p>
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
                                className="mt-1 w-5 h-5 accent-blue-500"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900">Включить {OP_TITLE.toLowerCase()} для всех</span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Админ пропускается всегда, независимо от переключателя.
                                </span>
                            </span>
                        </label>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Сообщение при выключенном инструменте
                            </label>
                            <textarea
                                value={draftMessage}
                                onChange={(e) => setDraftMessage(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-y"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Показывается на страницах инструмента и в API-ответах 503.
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
                                    className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${draftEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-500 hover:bg-blue-600'}`}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Сохранение...' : 'Применить'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
