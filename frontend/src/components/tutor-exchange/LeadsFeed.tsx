'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { Plus, Search, Loader2, AlertCircle } from 'lucide-react'
import { LeadCard, LeadCardData } from './LeadCard'

interface Filters {
    subject: string
    format: '' | 'ONLINE' | 'OFFLINE'
    type: '' | 'FREE' | 'COMMISSION'
    city: string
}

const EMPTY_FILTERS: Filters = { subject: '', format: '', type: '', city: '' }

export function LeadsFeed() {
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
    const [leads, setLeads] = useState<LeadCardData[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const query = useMemo(() => {
        const params = new URLSearchParams()
        if (filters.subject.trim()) params.set('subject', filters.subject.trim())
        if (filters.format) params.set('format', filters.format)
        if (filters.type) params.set('type', filters.type)
        if (filters.city.trim()) params.set('city', filters.city.trim())
        return params.toString()
    }, [filters])

    useEffect(() => {
        let cancelled = false
        setLeads(null)
        setError(null)
        apiClient
            .get<LeadCardData[]>(`/tutor-exchange/leads${query ? `?${query}` : ''}`)
            .then((resp) => { if (!cancelled) setLeads(resp.data) })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) {
                    setError(err.response.data.message || 'Биржа временно недоступна')
                } else {
                    setError(err?.response?.data?.message || 'Не удалось загрузить заявки')
                }
            })
        return () => { cancelled = true }
    }, [query])

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <header className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Биржа лидов</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Передайте ученика коллеге или заберите чужого — открытые заявки других репетиторов.
                    </p>
                </div>
                <Link href="/dashboard/leads/new" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                    <Plus className="w-4 h-4" /> Разместить заявку
                </Link>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        value={filters.subject}
                        onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Предмет: математика, английский..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                </div>
                <select
                    value={filters.format}
                    onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as Filters['format'] }))}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                >
                    <option value="">Любой формат</option>
                    <option value="ONLINE">Онлайн</option>
                    <option value="OFFLINE">Оффлайн</option>
                </select>
                <select
                    value={filters.type}
                    onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters['type'] }))}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                >
                    <option value="">Все типы</option>
                    <option value="FREE">Бесплатно</option>
                    <option value="COMMISSION">С комиссией</option>
                </select>
                {filters.format === 'OFFLINE' && (
                    <input
                        value={filters.city}
                        onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Город"
                        className="md:col-span-4 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                )}
            </div>

            {error && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!error && leads === null && (
                <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загружаем ленту...
                </div>
            )}

            {!error && leads?.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500 text-sm">
                    Пока нет заявок по вашим фильтрам. Первым разместите свою — <Link href="/dashboard/leads/new" className="text-blue-600 underline">заполнить форму</Link>.
                </div>
            )}

            {!error && leads && leads.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {leads.map((lead) => (<LeadCard key={lead.id} lead={lead} />))}
                </div>
            )}
        </div>
    )
}
