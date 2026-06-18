'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Search, RefreshCw, AlertCircle, Info, AlertTriangle, Filter } from 'lucide-react'

const fetcher = ([url, limit, offset, level, category, search]: [string, number, number, string, string, string]) =>
    apiClient.get(url, { params: { limit, offset, level: level || undefined, category: category || undefined, search: search || undefined } }).then(r => r.data)

const LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string; bg: string }> = {
    info:  { icon: Info,          color: 'text-blue-600',   bg: 'bg-blue-50' },
    warn:  { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50' },
    error: { icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50' },
}

export default function AdminLogsPage() {
    const [page, setPage] = useState(1)
    const [level, setLevel] = useState('')
    const [category, setCategory] = useState('')
    const [search, setSearch] = useState('')
    const [autoRefresh, setAutoRefresh] = useState(false)
    const limit = 50

    const { data, isLoading, mutate } = useSWR<any>(
        ['/admin/logs/filtered', limit, (page - 1) * limit, level, category, search],
        fetcher,
        { refreshInterval: autoRefresh ? 5000 : 0 }
    )

    const logs = data?.logs || []
    const total = data?.total || 0
    const categories = data?.categories || []
    const totalPages = Math.ceil(total / limit)

    // Debounce search
    const searchTimer = useRef<NodeJS.Timeout>()
    const handleSearch = (val: string) => {
        clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(() => { setSearch(val); setPage(1) }, 400)
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Системные логи</h1>
                    <p className="text-gray-500">Мониторинг событий платформы в реальном времени</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-100 shadow-sm rounded-xl px-3 py-2 text-sm">
                        <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600" />
                        <span className="text-gray-700 font-medium">Авто-обновление (5с)</span>
                        {autoRefresh && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                    </label>
                    <button onClick={() => mutate()} className="p-2 bg-white border border-gray-100 shadow-sm rounded-xl hover:bg-gray-50 transition">
                        <RefreshCw className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
            </div>

            {/* Сводка по категориям */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {categories.slice(0, 12).map((c: any) => (
                        <button
                            key={c.category}
                            onClick={() => { setCategory(category === c.category ? '' : c.category); setPage(1) }}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition ${
                                category === c.category
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                            }`}
                        >
                            <span>{c.category}</span>
                            <span className="bg-black/10 px-1.5 py-0.5 rounded-full">{c._count.category}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Фильтры */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-blue-500 flex-1">
                        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <input
                            type="text"
                            placeholder="Поиск по сообщению или категории..."
                            onChange={e => handleSearch(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select value={level} onChange={e => { setLevel(e.target.value); setPage(1) }}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
                            <option value="">Все уровни</option>
                            <option value="info">Info</option>
                            <option value="warn">Warn</option>
                            <option value="error">Error</option>
                        </select>
                        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white max-w-[160px]">
                            <option value="">Все категории</option>
                            {categories.map((c: any) => (
                                <option key={c.category} value={c.category}>{c.category}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 flex justify-center">
                        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">Логи не найдены</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {logs.map((log: any) => {
                            const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info
                            const Icon = cfg.icon
                            return (
                                <div key={log.id} className="p-4 hover:bg-gray-50/50 flex gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                                        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                            <span className="text-xs font-mono text-gray-400">
                                                {new Date(log.timestamp).toLocaleString('ru-RU')}
                                            </span>
                                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>
                                                {log.level}
                                            </span>
                                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-mono">
                                                {log.category}
                                            </span>
                                            {log.user && (
                                                <span className="text-xs text-gray-400">
                                                    👤 {log.user.username || log.user.id.slice(0, 8)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-800 break-words">{log.message}</p>
                                        {log.data && (
                                            <details className="mt-1">
                                                <summary className="text-xs text-blue-500 cursor-pointer hover:text-blue-700">
                                                    Данные
                                                </summary>
                                                <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-2 mt-1 overflow-x-auto max-h-32 text-gray-600">
                                                    {JSON.stringify(log.data, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {!isLoading && totalPages > 1 && (
                    <div className="p-4 border-t border-gray-50 flex items-center justify-between bg-white">
                        <span className="text-xs text-gray-500">Показано {logs.length} из {total}</span>
                        <div className="flex gap-1.5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">
                                Назад
                            </button>
                            <span className="px-3 py-1.5 text-xs text-gray-500">{page} / {totalPages}</span>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 border border-gray-100">
                                Вперёд
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
