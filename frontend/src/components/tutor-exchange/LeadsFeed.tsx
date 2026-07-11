'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { Plus, Search, Loader2, AlertCircle, Globe, Users, Compass } from 'lucide-react'
import { LeadCard, LeadCardData } from './LeadCard'
import { useUser } from '@/lib/hooks/useUser'
import { Topbar } from '@/components/layout/v2/Topbar'
import { Button } from '@/components/ui/v2/Button'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'

type Tab = 'all' | 'mine'

interface Filters {
    subject: string
    format: '' | 'ONLINE' | 'OFFLINE'
    type: '' | 'FREE' | 'COMMISSION'
    city: string
}

const EMPTY_FILTERS: Filters = { subject: '', format: '', type: '', city: '' }

export function LeadsFeed() {
    const { user } = useUser()
    const router = useRouter()
    const menu = useMobileMenu()
    const tour = useTour()
    const searchParams = useSearchParams()
    const initialTab: Tab = searchParams?.get('tab') === 'mine' ? 'mine' : 'all'
    const [tab, setTab] = useState<Tab>(initialTab)
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

        const url =
            tab === 'mine'
                ? '/tutor-exchange/leads/mine'
                : `/tutor-exchange/leads${query ? `?${query}` : ''}`

        apiClient
            .get<LeadCardData[]>(url)
            .then((resp) => {
                if (cancelled) return
                setLeads(resp.data)
            })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) {
                    setError(err.response.data.message || 'Биржа временно недоступна')
                } else {
                    setError(err?.response?.data?.message || 'Не удалось загрузить заявки')
                }
            })
        return () => {
            cancelled = true
        }
    }, [query, tab])

    return (
        <>
            <Topbar
                title="Биржа лидов"
                subtitle="Передайте ученика коллеге или заберите чужого."
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" leftIcon={<Compass className="w-4 h-4" />} onClick={tour.start}>
                            Тур
                        </Button>
                        <Button
                            data-tour="create-lead"
                            variant="primary"
                            size="sm"
                            leftIcon={<Plus className="w-4 h-4" />}
                            onClick={() => router.push('/dashboard/leads/new')}
                        >
                            Разместить заявку
                        </Button>
                    </div>
                }
            />
            <div className="p-6 md:p-8 max-w-6xl mx-auto">

            <div data-tour="feed-tabs" className="inline-flex bg-gray-100 rounded-xl p-1 mb-6">
                <button
                    onClick={() => setTab('all')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                        tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Globe className="w-4 h-4" /> Все заявки
                </button>
                <button
                    onClick={() => setTab('mine')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                        tab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Users className="w-4 h-4" /> Мои заявки
                </button>
            </div>

            {tab === 'all' && (
                <div data-tour="feed-filters" className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            value={filters.subject}
                            onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
                            placeholder="Предмет: математика, английский..."
                            className="w-full pl-11 pr-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                    <select
                        value={filters.format}
                        onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as Filters['format'] }))}
                        className="px-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400"
                    >
                        <option value="">Любой формат</option>
                        <option value="ONLINE">Онлайн</option>
                        <option value="OFFLINE">Оффлайн</option>
                    </select>
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters['type'] }))}
                        className="px-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400"
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
                            className="md:col-span-4 px-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400"
                        />
                    )}
                </div>
            )}

            {error && (
                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 text-base text-amber-800 flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!error && leads === null && (
                <div className="flex items-center justify-center py-24 text-gray-500 text-base">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Загружаем ленту...
                </div>
            )}

            {!error && leads?.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
                    {tab === 'mine' ? (
                        <>
                            <div className="text-5xl mb-3">📭</div>
                            <p className="text-lg text-gray-700 font-semibold mb-2">Пока нет ваших заявок</p>
                            <p className="text-sm text-gray-500 mb-5">Разместите первую — коллеги-репетиторы увидят её в ленте.</p>
                            <Link
                                href="/dashboard/leads/new"
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold px-5 py-3 rounded-xl"
                            >
                                <Plus className="w-4 h-4" /> Разместить заявку
                            </Link>
                        </>
                    ) : (
                        <>
                            <div className="text-5xl mb-3">🔍</div>
                            <p className="text-lg text-gray-700 font-semibold mb-2">Пока нет подходящих заявок</p>
                            <p className="text-sm text-gray-500">Попробуйте изменить фильтры или разместите свою.</p>
                        </>
                    )}
                </div>
            )}

            {!error && leads && leads.length > 0 && (
                <div data-tour="feed-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {leads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} meId={user?.id} showStatus={tab === 'mine'} />
                    ))}
                </div>
            )}
            </div>
        </>
    )
}
