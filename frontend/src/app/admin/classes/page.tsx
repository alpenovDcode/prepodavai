'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Search, BookOpen, Users, ChevronDown, ChevronRight, X } from 'lucide-react'

const fetcher = ([url, limit, offset, search]: [string, number, number, string]) =>
    apiClient.get(url, { params: { limit, offset, search } }).then(r => r.data)

const fetcherUrl = (url: string) => apiClient.get(url).then(r => r.data)

function ClassStudentsModal({ classId, onClose }: { classId: string; onClose: () => void }) {
    const { data, isLoading } = useSWR(`/admin/classes/${classId}/students`, fetcherUrl)
    const cls = data?.class

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">{cls?.name || 'Класс'}</h2>
                        <p className="text-sm text-gray-500">
                            Учитель: {cls?.teacher?.firstName} {cls?.teacher?.username ? `@${cls.teacher.username}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="overflow-y-auto flex-1">
                    {isLoading ? (
                        <div className="p-8 text-center">
                            <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto" />
                        </div>
                    ) : !cls?.students?.length ? (
                        <div className="p-8 text-center text-gray-400">Нет учеников</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left">Имя</th>
                                    <th className="px-4 py-3 text-left">Email</th>
                                    <th className="px-4 py-3 text-center">Заданий</th>
                                    <th className="px-4 py-3 text-center">Сдано</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {cls.students.map((s: any) => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                                        <td className="px-4 py-3 text-gray-500">{s.email || '—'}</td>
                                        <td className="px-4 py-3 text-center text-gray-700">{s._count?.assignments ?? 0}</td>
                                        <td className="px-4 py-3 text-center text-emerald-600 font-medium">{s._count?.submissions ?? 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function AdminClassesPage() {
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
    const limit = 20

    const { data, isLoading } = useSWR<any>(
        ['/admin/classes', limit, (page - 1) * limit, search],
        fetcher
    )
    const classes = data?.classes || []
    const total = data?.total || 0
    const totalPages = Math.ceil(total / limit)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Классы</h1>
                <p className="text-gray-500">Обзор классов и учеников на платформе</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900">{total}</p>
                        <p className="text-sm text-gray-500">Всего классов</p>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
                    <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center">
                        <Users className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900">
                            {classes.reduce((sum: number, c: any) => sum + (c._count?.students || 0), 0)}
                        </p>
                        <p className="text-sm text-gray-500">Учеников на странице</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-blue-500">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Поиск по названию или учителю..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }}
                            className="flex-1 bg-transparent border-none outline-none text-sm"
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 flex justify-center">
                        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                ) : classes.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">Классы не найдены</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                    <th className="px-5 py-3 text-left">Название класса</th>
                                    <th className="px-5 py-3 text-left">Учитель</th>
                                    <th className="px-5 py-3 text-center">Ученики</th>
                                    <th className="px-5 py-3 text-center">Задания</th>
                                    <th className="px-5 py-3 text-left">Создан</th>
                                    <th className="px-5 py-3 text-center">Детали</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {classes.map((cls: any) => (
                                    <tr key={cls.id} className="hover:bg-gray-50 transition">
                                        <td className="px-5 py-4">
                                            <div className="font-semibold text-gray-900">{cls.name}</div>
                                            {cls.description && (
                                                <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{cls.description}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-gray-700">
                                            <div>{cls.teacher?.firstName} {cls.teacher?.lastName || ''}</div>
                                            {cls.teacher?.username && (
                                                <div className="text-xs text-gray-400">@{cls.teacher.username}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                                <Users className="w-3 h-3" />
                                                {cls._count?.students || 0}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center text-gray-700 font-medium">
                                            {cls._count?.assignments || 0}
                                        </td>
                                        <td className="px-5 py-4 text-gray-500 text-xs">
                                            {new Date(cls.createdAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <button
                                                onClick={() => setSelectedClassId(cls.id)}
                                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                Ученики <ChevronRight className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-xs text-gray-500">{classes.length} из {total}</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">
                                Назад
                            </button>
                            <span className="px-3 py-1.5 text-xs text-gray-600">{page} / {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">
                                Вперёд
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selectedClassId && (
                <ClassStudentsModal classId={selectedClassId} onClose={() => setSelectedClassId(null)} />
            )}
        </div>
    )
}
