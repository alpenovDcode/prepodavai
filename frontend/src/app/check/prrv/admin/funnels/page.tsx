'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import {
    Plus, Filter, Trash2, Edit3, Eye, EyeOff, ChevronRight, Layers,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface FunnelRow {
    id: string
    name: string
    description: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string
    _count?: { steps: number }
}

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

export default function AdminFunnelsListPage() {
    const { data, isLoading } = useSWR<FunnelRow[]>('/admin/funnels', fetcher, { refreshInterval: 60_000 })
    const [creating, setCreating] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')

    const create = async () => {
        if (!newName.trim()) {
            toast.error('Имя обязательно')
            return
        }
        try {
            const res = await apiClient.post('/admin/funnels', {
                name: newName.trim(),
                description: newDesc.trim() || undefined,
                steps: [
                    { order: 0, label: 'Точка входа', eventType: 'page_view', isCohortAnchor: true },
                ],
            })
            toast.success('Воронка создана')
            mutate('/admin/funnels')
            setCreating(false)
            setNewName('')
            setNewDesc('')
            // Сразу открываем редактор
            window.location.href = `/admin/funnels/${res.data.id}`
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось создать')
        }
    }

    const remove = async (id: string, name: string) => {
        if (!confirm(`Удалить воронку «${name}»? Действие необратимо.`)) return
        try {
            await apiClient.delete(`/admin/funnels/${id}`)
            toast.success('Удалено')
            mutate('/admin/funnels')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось удалить')
        }
    }

    const toggleActive = async (row: FunnelRow) => {
        try {
            await apiClient.put(`/admin/funnels/${row.id}`, { isActive: !row.isActive })
            mutate('/admin/funnels')
        } catch (e: any) {
            toast.error('Не удалось обновить')
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Filter className="w-6 h-6 text-primary-600" />
                        Воронки
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Конструктор воронок + детальная аналитика конверсий, когорт и источников.
                        Видно только администраторам.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreating(v => !v)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Создать воронку
                </button>
            </div>

            {creating && (
                <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <h2 className="font-bold text-gray-900 mb-3">Новая воронка</h2>
                    <div className="grid gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Название *</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="Веб-воронка регистрации"
                                className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Описание</label>
                            <input
                                type="text"
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                placeholder="Краткое описание для команды"
                                className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setCreating(false)} className="h-9 px-3 rounded-md text-sm font-semibold text-gray-600 hover:bg-gray-100">
                                Отмена
                            </button>
                            <button onClick={create} className="h-9 px-4 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold">
                                Создать и перейти к редактору
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="py-16 text-center text-gray-400">Загрузка…</div>
            ) : !data?.length ? (
                <div className="py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <Layers className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                    <h3 className="font-bold text-gray-900 mb-1">Воронок пока нет</h3>
                    <p className="text-sm text-gray-500">
                        Дефолтные «Веб» и «ИИ-бот» должны создаться автоматически при первом старте бэка.<br />
                        Если их нет — кнопка «Создать» сверху.
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="text-left px-5 py-3">Название</th>
                                <th className="text-left px-3 py-3">Шагов</th>
                                <th className="text-left px-3 py-3">Статус</th>
                                <th className="text-left px-3 py-3">Обновлено</th>
                                <th className="text-right px-5 py-3">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-3">
                                        <Link href={`/check/prrv/admin/funnels/${row.id}`} className="font-semibold text-gray-900 hover:text-primary-600">
                                            {row.name}
                                        </Link>
                                        {row.description && (
                                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{row.description}</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-gray-700 tnum">{row._count?.steps ?? '—'}</td>
                                    <td className="px-3 py-3">
                                        <button
                                            type="button"
                                            onClick={() => toggleActive(row)}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                row.isActive
                                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                            }`}
                                        >
                                            {row.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                            {row.isActive ? 'активна' : 'отключена'}
                                        </button>
                                    </td>
                                    <td className="px-3 py-3 text-xs text-gray-500">
                                        {new Date(row.updatedAt).toLocaleString('ru-RU')}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <Link
                                                href={`/check/prrv/admin/funnels/${row.id}`}
                                                className="inline-flex items-center gap-1 h-8 px-2.5 rounded text-xs font-semibold text-primary-600 hover:bg-primary-50"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                Открыть
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => remove(row.id, row.name)}
                                                className="inline-flex items-center justify-center w-8 h-8 rounded text-red-500 hover:bg-red-50"
                                                title="Удалить"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
