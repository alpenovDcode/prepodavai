'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import {
    ArrowLeft, Plus, Trash2, Save, Filter as FilterIcon, GripVertical,
    Calendar, RefreshCw, Layers, Users, TrendingDown, Settings as SettingsIcon, Target,
    Eye, EyeOff,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface FunnelStep {
    id?: string
    order: number
    label: string
    eventType: string
    eventFilters?: Record<string, any> | null
    isCohortAnchor?: boolean
}

interface Funnel {
    id: string
    name: string
    description: string | null
    isActive: boolean
    globalFilters: Record<string, any> | null
    steps: FunnelStep[]
}

interface StepMetric {
    order: number
    label: string
    eventType: string
    users: number
    conversionFromFirst: number
    conversionFromPrev: number
    avgSecondsFromPrev: number | null
}

interface FunnelMetrics {
    funnelName: string
    totalUsers: number
    steps: StepMetric[]
    segments?: { key: string; label: string; totalUsers: number; steps: StepMetric[] }[]
}

interface CohortMatrix {
    funnelName: string
    anchorLabel: string
    targetLabel: string
    daysWindow: number
    cohorts: { date: string; size: number; conversions: { day: number; users: number; percent: number }[] }[]
}

interface SourceBreakdown {
    funnelName: string
    totalUsers: number
    finalConverted: number
    sources: { source: string; entered: number; finalConverted: number; conversion: number }[]
}

type Tab = 'metrics' | 'cohorts' | 'sources' | 'editor'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

// События, доступные в селекторе шага. Базовый набор — можно дополнять.
const EVENT_TYPES = [
    { value: 'page_view',             label: 'Просмотр страницы (page_view)' },
    { value: 'click',                 label: 'Клик (click)' },
    { value: 'onboarding_view',       label: 'Просмотр онбординга' },
    { value: 'onboarding_step',       label: 'Шаг онбординга' },
    { value: 'user_registered',      label: 'Регистрация' },
    { value: 'user_email_verified', label: 'Email подтверждён' },
    { value: 'tg_linked',             label: 'Привязка ТГ' },
    { value: 'channel_subscribed',    label: 'Подписка на ТГ-канал' },
    { value: 'channel_unsubscribed', label: 'Отписка от канала' },
    { value: 'referral_used',         label: 'Использован реф-код' },
    { value: 'generation_created',    label: 'Генерация (любая)' },
    { value: 'generation_created:nth=1',  label: '⭐ 1-я генерация' },
    { value: 'generation_created:nth=3',  label: '⭐ 3-я генерация' },
    { value: 'generation_created:nth=10', label: '⭐ 10-я генерация' },
    { value: 'assignment_created',    label: 'Создано задание' },
    { value: 'submission_created',    label: 'Сдача ДЗ' },
    { value: 'student_invited',       label: 'Приглашён ученик' },
]

export default function AdminFunnelDetailPage() {
    const params = useParams<{ id: string }>()
    const router = useRouter()
    const id = params?.id as string

    const [tab, setTab] = useState<Tab>('metrics')

    // Фильтры
    const [dateFrom, setDateFrom] = useState<string>(() => {
        const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
    })
    const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [groupBy, setGroupBy] = useState<'none' | 'utmSource' | 'utmCampaign' | 'utmMedium' | 'eventName'>('none')
    const [maxWindowDays, setMaxWindowDays] = useState<number>(0) // 0 = без лимита

    const querySuffix = useMemo(() => {
        const p = new URLSearchParams()
        if (dateFrom) p.set('from', new Date(dateFrom).toISOString())
        if (dateTo) p.set('to', new Date(dateTo + 'T23:59:59').toISOString())
        if (groupBy !== 'none') p.set('groupBy', groupBy)
        if (maxWindowDays > 0) p.set('maxWindowSeconds', String(maxWindowDays * 86400))
        return p.toString() ? `?${p.toString()}` : ''
    }, [dateFrom, dateTo, groupBy, maxWindowDays])

    const { data: funnel, isLoading } = useSWR<Funnel>(`/admin/funnels/${id}`, fetcher)
    const { data: metrics, isLoading: mLoading } = useSWR<FunnelMetrics>(
        tab === 'metrics' ? `/admin/funnels/${id}/metrics${querySuffix}` : null,
        fetcher,
    )
    const { data: cohorts, isLoading: cLoading } = useSWR<CohortMatrix>(
        tab === 'cohorts' ? `/admin/funnels/${id}/cohorts${querySuffix}` : null,
        fetcher,
    )
    const { data: sources, isLoading: sLoading } = useSWR<SourceBreakdown>(
        tab === 'sources' ? `/admin/funnels/${id}/sources${querySuffix}` : null,
        fetcher,
    )

    const refreshAll = () => {
        globalMutate(`/admin/funnels/${id}`)
        globalMutate(`/admin/funnels/${id}/metrics${querySuffix}`)
        globalMutate(`/admin/funnels/${id}/cohorts${querySuffix}`)
        globalMutate(`/admin/funnels/${id}/sources${querySuffix}`)
    }

    if (isLoading) return <div className="p-6 text-gray-400">Загрузка…</div>
    if (!funnel) return <div className="p-6 text-gray-400">Воронка не найдена</div>

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <Link href="/check/prrv/admin/funnels" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-primary-600 mb-2">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Все воронки
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FilterIcon className="w-6 h-6 text-primary-600" />
                        {funnel.name}
                        {!funnel.isActive && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                <EyeOff className="w-3 h-3" />
                                отключена
                            </span>
                        )}
                    </h1>
                    {funnel.description && (
                        <p className="text-sm text-gray-500 mt-1">{funnel.description}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={refreshAll}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Обновить
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 mb-4">
                {([
                    ['metrics', 'Метрики', TrendingDown],
                    ['cohorts', 'Когорты', Calendar],
                    ['sources', 'Источники', Target],
                    ['editor', 'Редактор шагов', SettingsIcon],
                ] as const).map(([k, l, Icon]) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => setTab(k)}
                        className={`relative h-10 px-3 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                            tab === k ? 'text-primary-700' : 'text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        {l}
                        {tab === k && (
                            <span className="absolute inset-x-3 -bottom-px h-0.5 bg-primary-500 rounded-sm" />
                        )}
                    </button>
                ))}
            </div>

            {/* Filters (для metrics/cohorts/sources) */}
            {tab !== 'editor' && (
                <div className="mb-5 p-4 bg-white rounded-xl border border-gray-200 flex items-end gap-3 flex-wrap">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">С даты</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                               className="h-9 px-2 rounded-md border border-gray-200 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">По дату</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                               className="h-9 px-2 rounded-md border border-gray-200 text-sm" />
                    </div>
                    {tab === 'metrics' && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Срез по</label>
                                <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
                                        className="h-9 px-2 rounded-md border border-gray-200 text-sm bg-white">
                                    <option value="none">— без среза —</option>
                                    <option value="utmSource">UTM source (блогер)</option>
                                    <option value="utmCampaign">UTM campaign</option>
                                    <option value="utmMedium">UTM medium</option>
                                    <option value="eventName">Имя события (тип генерации)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Окно макс (дни)</label>
                                <input type="number" min={0} value={maxWindowDays}
                                       onChange={e => setMaxWindowDays(Number(e.target.value) || 0)}
                                       className="h-9 px-2 rounded-md border border-gray-200 text-sm w-24"
                                       placeholder="0 = ∞" />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* TAB: Метрики */}
            {tab === 'metrics' && (
                mLoading ? <div className="text-gray-400 py-10 text-center">Считаем воронку…</div>
                : !metrics ? <div className="text-gray-400 py-10 text-center">Нет данных</div>
                : <FunnelMetricsView metrics={metrics} />
            )}

            {/* TAB: Когорты */}
            {tab === 'cohorts' && (
                cLoading ? <div className="text-gray-400 py-10 text-center">Считаем когорты…</div>
                : !cohorts ? <div className="text-gray-400 py-10 text-center">Нет данных</div>
                : <CohortView cohorts={cohorts} />
            )}

            {/* TAB: Источники */}
            {tab === 'sources' && (
                sLoading ? <div className="text-gray-400 py-10 text-center">Считаем источники…</div>
                : !sources ? <div className="text-gray-400 py-10 text-center">Нет данных</div>
                : <SourcesView sources={sources} />
            )}

            {/* TAB: Редактор */}
            {tab === 'editor' && <FunnelEditor funnel={funnel} onSaved={refreshAll} />}
        </div>
    )
}

// ───────── Metrics view ─────────
function FunnelMetricsView({ metrics }: { metrics: FunnelMetrics }) {
    const maxUsers = Math.max(1, ...metrics.steps.map(s => s.users))
    return (
        <>
            <div className="grid grid-cols-3 gap-3 mb-5 max-md:grid-cols-1">
                <KpiBox icon={<Users className="w-4 h-4" />} label="Вошло в воронку" value={metrics.totalUsers} />
                <KpiBox icon={<TrendingDown className="w-4 h-4" />} label="Дошло до последнего шага"
                        value={metrics.steps[metrics.steps.length - 1]?.users ?? 0} />
                <KpiBox icon={<Target className="w-4 h-4" />} label="Итоговая конверсия"
                        value={`${metrics.steps[metrics.steps.length - 1]?.conversionFromFirst ?? 0}%`} />
            </div>

            {/* Bar chart воронки */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                <h3 className="font-bold text-gray-900 mb-4">Воронка</h3>
                <div className="space-y-2">
                    {metrics.steps.map((s, i) => {
                        const width = (s.users / maxUsers) * 100
                        const dropFromPrev = i === 0 ? 0 : Math.max(0, 100 - s.conversionFromPrev)
                        return (
                            <div key={s.order}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="font-semibold text-gray-700">{s.label}</span>
                                    <span className="text-gray-500">
                                        <span className="tnum font-bold text-gray-900">{s.users}</span>
                                        <span className="ml-1">польз.</span>
                                        {i > 0 && (
                                            <>
                                                <span className="mx-2 text-gray-300">·</span>
                                                <span className="tnum">{s.conversionFromPrev}%</span>
                                                <span className="ml-0.5">от пред.</span>
                                                {dropFromPrev > 0 && (
                                                    <span className="ml-2 text-red-500 tnum">−{dropFromPrev.toFixed(1)}%</span>
                                                )}
                                            </>
                                        )}
                                    </span>
                                </div>
                                <div className="h-6 rounded bg-gray-100 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all"
                                        style={{ width: `${width}%` }}
                                    />
                                </div>
                                {s.avgSecondsFromPrev != null && (
                                    <div className="text-[11px] text-gray-400 mt-1 tnum">
                                        ⏱ среднее от предыдущего: {formatDuration(s.avgSecondsFromPrev)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Сегменты */}
            {metrics.segments && metrics.segments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900 mb-4">Срез по сегментам</h3>
                    <table className="w-full text-sm">
                        <thead className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th className="text-left py-2 pr-3">Сегмент</th>
                                <th className="text-right py-2 pr-3">Вошло</th>
                                {metrics.steps.slice(1).map(s => (
                                    <th key={s.order} className="text-right py-2 pr-3 truncate" title={s.label}>{s.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {metrics.segments.map(seg => (
                                <tr key={seg.key} className="hover:bg-gray-50">
                                    <td className="py-2 pr-3 font-semibold text-gray-900">{seg.label}</td>
                                    <td className="py-2 pr-3 text-right tnum">{seg.totalUsers}</td>
                                    {seg.steps.slice(1).map((s, i) => (
                                        <td key={i} className="py-2 pr-3 text-right tnum">
                                            <div>{s.users}</div>
                                            <div className="text-[10px] text-gray-400">{s.conversionFromFirst}%</div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    )
}

// ───────── Cohort view ─────────
function CohortView({ cohorts }: { cohorts: CohortMatrix }) {
    const showDays = [0, 1, 3, 7, 14, 30].filter(d => d <= cohorts.daysWindow)
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto">
            <h3 className="font-bold text-gray-900 mb-1">
                Когортный анализ
            </h3>
            <p className="text-xs text-gray-500 mb-4">
                Из «{cohorts.anchorLabel}» в «{cohorts.targetLabel}» — % дошедших за N дней с даты якоря.
            </p>
            {cohorts.cohorts.length === 0 ? (
                <div className="py-10 text-center text-gray-400">Нет когорт за период</div>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-gray-500 uppercase font-semibold tracking-wider">
                            <th className="text-left py-2 pr-3">Дата</th>
                            <th className="text-right py-2 pr-3">Когорта</th>
                            {showDays.map(d => (
                                <th key={d} className="text-right py-2 pr-3 tnum">День {d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {cohorts.cohorts.map(c => (
                            <tr key={c.date}>
                                <td className="py-2 pr-3 font-semibold text-gray-900">{c.date}</td>
                                <td className="py-2 pr-3 text-right tnum">{c.size}</td>
                                {showDays.map(d => {
                                    const cell = c.conversions[d]
                                    if (!cell) return <td key={d} className="py-2 pr-3 text-right">—</td>
                                    const intensity = Math.min(1, cell.percent / 100)
                                    return (
                                        <td key={d} className="py-2 pr-3 text-right tnum"
                                            style={{ background: `rgba(255, 126, 88, ${intensity * 0.35})` }}>
                                            <div className="font-semibold">{cell.percent}%</div>
                                            <div className="text-[10px] text-gray-500">{cell.users}</div>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

// ───────── Sources view ─────────
function SourcesView({ sources }: { sources: SourceBreakdown }) {
    const maxEntered = Math.max(1, ...sources.sources.map(s => s.entered))
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Источники трафика (UTM source)</h3>
            {sources.sources.length === 0 ? (
                <div className="py-10 text-center text-gray-400">Нет данных по источникам в этом периоде</div>
            ) : (
                <div className="space-y-3">
                    {sources.sources.map(s => (
                        <div key={s.source} className="grid grid-cols-12 gap-3 items-center">
                            <div className="col-span-3 font-semibold text-gray-900 truncate" title={s.source}>
                                {s.source}
                            </div>
                            <div className="col-span-6">
                                <div className="h-5 rounded bg-gray-100 overflow-hidden">
                                    <div
                                        className="h-full bg-primary-500"
                                        style={{ width: `${(s.entered / maxEntered) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="col-span-1 text-right text-xs text-gray-500 tnum">
                                {s.entered} вход.
                            </div>
                            <div className="col-span-1 text-right text-xs text-gray-700 tnum font-semibold">
                                {s.finalConverted} дошл.
                            </div>
                            <div className="col-span-1 text-right text-xs text-primary-600 font-bold tnum">
                                {s.conversion}%
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ───────── Editor ─────────
function FunnelEditor({ funnel, onSaved }: { funnel: Funnel; onSaved: () => void }) {
    const [name, setName] = useState(funnel.name)
    const [description, setDescription] = useState(funnel.description || '')
    const [steps, setSteps] = useState<FunnelStep[]>(() => funnel.steps.map((s, i) => ({ ...s, order: i })))
    const [saving, setSaving] = useState(false)
    const [filtersJson, setFiltersJson] = useState(JSON.stringify(funnel.globalFilters ?? {}, null, 2))
    // ───── Welcome-конфиг для Telegram-бота ─────
    const f: any = funnel
    const [welcomeText, setWelcomeText] = useState<string>(f.welcomeText || '')
    const [welcomeButtonLabel, setWelcomeButtonLabel] = useState<string>(f.welcomeButtonLabel || '')
    const [welcomeButtonAction, setWelcomeButtonAction] = useState<string>(f.welcomeButtonAction || 'url')
    const [welcomeButtonUrl, setWelcomeButtonUrl] = useState<string>(f.welcomeButtonUrl || '')
    const [subscriptionChannelId, setSubscriptionChannelId] = useState<string>(f.subscriptionChannelId || '')
    const [subscriptionChannelName, setSubscriptionChannelName] = useState<string>(f.subscriptionChannelName || '')
    const [subscriptionPromptText, setSubscriptionPromptText] = useState<string>(f.subscriptionPromptText || '')
    const [subscriptionSuccessText, setSubscriptionSuccessText] = useState<string>(f.subscriptionSuccessText || '')

    const update = (i: number, patch: Partial<FunnelStep>) =>
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
    const add = () =>
        setSteps(prev => [...prev, { order: prev.length, label: 'Новый шаг', eventType: 'page_view' }])
    const remove = (i: number) =>
        setSteps(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })))
    const move = (i: number, dir: -1 | 1) => {
        setSteps(prev => {
            const next = [...prev]
            const ni = i + dir
            if (ni < 0 || ni >= next.length) return prev
            ;[next[i], next[ni]] = [next[ni], next[i]]
            return next.map((s, idx) => ({ ...s, order: idx }))
        })
    }

    const save = async () => {
        if (!name.trim()) {
            toast.error('Название обязательно')
            return
        }
        if (!steps.length) {
            toast.error('Должен быть хотя бы один шаг')
            return
        }
        let gf: any = null
        try {
            gf = filtersJson.trim() ? JSON.parse(filtersJson) : null
        } catch {
            toast.error('Глобальные фильтры — невалидный JSON')
            return
        }
        setSaving(true)
        try {
            await apiClient.put(`/admin/funnels/${funnel.id}`, {
                name: name.trim(),
                description: description.trim() || undefined,
                steps,
                globalFilters: gf,
                welcomeText: welcomeText.trim() || null,
                welcomeButtonLabel: welcomeButtonLabel.trim() || null,
                welcomeButtonAction: welcomeButtonAction || 'url',
                welcomeButtonUrl: welcomeButtonUrl.trim() || null,
                subscriptionChannelId: subscriptionChannelId.trim() || null,
                subscriptionChannelName: subscriptionChannelName.trim() || null,
                subscriptionPromptText: subscriptionPromptText.trim() || null,
                subscriptionSuccessText: subscriptionSuccessText.trim() || null,
            })
            toast.success('Сохранено')
            onSaved()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-1">
            <div className="col-span-8 max-lg:col-span-1 space-y-4">
                {/* Основные поля */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900 mb-4 inline-flex items-center gap-2">
                        <SettingsIcon className="w-4 h-4 text-primary-600" />
                        Основные параметры
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Название *</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                   className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Описание</label>
                            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                                   className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm" />
                        </div>
                    </div>
                </div>

                {/* Шаги */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 inline-flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary-600" />
                            Шаги воронки
                        </h3>
                        <button onClick={add}
                                className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-semibold">
                            <Plus className="w-3.5 h-3.5" />
                            Добавить шаг
                        </button>
                    </div>

                    <div className="space-y-2">
                        {steps.map((s, i) => (
                            <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50 grid grid-cols-12 gap-2 items-start">
                                <div className="col-span-1 flex flex-col items-center gap-1 pt-1.5">
                                    <button onClick={() => move(i, -1)} disabled={i === 0}
                                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Вверх">▲</button>
                                    <GripVertical className="w-3 h-3 text-gray-300" />
                                    <button onClick={() => move(i, 1)} disabled={i === steps.length - 1}
                                            className="text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Вниз">▼</button>
                                </div>
                                <div className="col-span-4">
                                    <label className="block text-[10px] font-semibold uppercase text-gray-500 mb-0.5">Название</label>
                                    <input type="text" value={s.label} onChange={e => update(i, { label: e.target.value })}
                                           className="w-full h-8 px-2 rounded border border-gray-200 text-xs bg-white" />
                                </div>
                                <div className="col-span-4">
                                    <label className="block text-[10px] font-semibold uppercase text-gray-500 mb-0.5">Событие</label>
                                    <select value={s.eventType} onChange={e => update(i, { eventType: e.target.value })}
                                            className="w-full h-8 px-2 rounded border border-gray-200 text-xs bg-white">
                                        {EVENT_TYPES.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-semibold uppercase text-gray-500 mb-0.5">Якорь</label>
                                    <label className="inline-flex items-center gap-1.5 h-8 text-xs text-gray-700">
                                        <input type="checkbox" checked={!!s.isCohortAnchor}
                                               onChange={e => update(i, { isCohortAnchor: e.target.checked })} />
                                        для когорт
                                    </label>
                                </div>
                                <div className="col-span-1 pt-4 text-right">
                                    <button onClick={() => remove(i)} title="Удалить шаг"
                                            className="text-red-500 hover:bg-red-50 p-1 rounded">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="col-span-12">
                                    <label className="block text-[10px] font-semibold uppercase text-gray-500 mb-0.5">
                                        Фильтр события (JSON, опционально)
                                    </label>
                                    <input type="text"
                                           value={JSON.stringify(s.eventFilters ?? {})}
                                           onChange={e => {
                                               try {
                                                   const parsed = JSON.parse(e.target.value || '{}')
                                                   update(i, { eventFilters: Object.keys(parsed).length ? parsed : null })
                                               } catch { /* invalid — оставляем */ }
                                           }}
                                           placeholder='{"utmSource":"instagram"} или {"payload.generationType":"worksheet"}'
                                           className="w-full h-8 px-2 rounded border border-gray-200 text-xs font-mono bg-white" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Save */}
                <div className="flex justify-end">
                    <button onClick={save} disabled={saving}
                            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {saving ? 'Сохранение…' : 'Сохранить воронку'}
                    </button>
                </div>

                {/* Welcome-сообщение для Telegram-бота */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-900 mb-1 inline-flex items-center gap-2">
                        <SettingsIcon className="w-4 h-4 text-primary-600" />
                        Welcome в Telegram-боте
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Привяжи к этой воронке умную ссылку (раздел «Умные ссылки»). Когда пользователь
                        кликнет по ней и зайдёт в бот через <code className="text-purple-600">t.me/?start=...</code> —
                        бот пришлёт это сообщение вместо дефолтного. Если поля пустые — используется
                        стандартное приветствие.
                    </p>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Текст приветствия (Markdown)
                            </label>
                            <textarea value={welcomeText} onChange={e => setWelcomeText(e.target.value)}
                                rows={5}
                                placeholder="👋 Привет! Подпишись на наш канал и получи бесплатный доступ..."
                                className="w-full p-3 rounded-md border border-gray-200 text-sm font-mono" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Текст кнопки</label>
                                <input type="text" value={welcomeButtonLabel}
                                    onChange={e => setWelcomeButtonLabel(e.target.value)}
                                    placeholder="Перейти в канал"
                                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Действие кнопки
                                </label>
                                <select value={welcomeButtonAction}
                                    onChange={e => setWelcomeButtonAction(e.target.value)}
                                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm bg-white">
                                    <option value="url">Открыть ссылку (URL)</option>
                                    <option value="mini_app">Открыть Mini App</option>
                                    <option value="check_subscription">Проверить подписку на канал</option>
                                </select>
                            </div>
                        </div>

                        {welcomeButtonAction !== 'check_subscription' && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">URL кнопки</label>
                                <input type="text" value={welcomeButtonUrl}
                                    onChange={e => setWelcomeButtonUrl(e.target.value)}
                                    placeholder={welcomeButtonAction === 'mini_app'
                                        ? 'https://prepodavai.ru/dashboard'
                                        : 'https://t.me/yourchannel'}
                                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm" />
                            </div>
                        )}

                        {welcomeButtonAction === 'check_subscription' && (
                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Канал для подписки
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-xs text-yellow-900">
                                    Бот должен быть админом канала, иначе <code>getChatMember</code> не сработает.
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            ID канала или @username
                                        </label>
                                        <input type="text" value={subscriptionChannelId}
                                            onChange={e => setSubscriptionChannelId(e.target.value)}
                                            placeholder="@prepodavai или -1001234567890"
                                            className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm font-mono" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Название для текста
                                        </label>
                                        <input type="text" value={subscriptionChannelName}
                                            onChange={e => setSubscriptionChannelName(e.target.value)}
                                            placeholder="ПреподаваИИ"
                                            className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Если не подписан (Markdown)
                                    </label>
                                    <textarea value={subscriptionPromptText}
                                        onChange={e => setSubscriptionPromptText(e.target.value)}
                                        rows={2}
                                        placeholder="Похоже, вы ещё не подписались. Подпишитесь и нажмите ещё раз."
                                        className="w-full p-3 rounded-md border border-gray-200 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        После успешной подписки (Markdown)
                                    </label>
                                    <textarea value={subscriptionSuccessText}
                                        onChange={e => setSubscriptionSuccessText(e.target.value)}
                                        rows={2}
                                        placeholder="✅ Спасибо за подписку! Открываем сервис."
                                        className="w-full p-3 rounded-md border border-gray-200 text-sm" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Глобальные фильтры */}
            <div className="col-span-4 max-lg:col-span-1">
                <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
                    <h3 className="font-bold text-gray-900 mb-2 inline-flex items-center gap-2">
                        <FilterIcon className="w-4 h-4 text-primary-600" />
                        Глобальные фильтры
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                        Применяются ко всем шагам. Например <code>{`{"utmSource":"instagram"}`}</code> покажет
                        воронку только для пришедших с инсты.
                    </p>
                    <textarea value={filtersJson} onChange={e => setFiltersJson(e.target.value)}
                              rows={8}
                              className="w-full p-3 rounded-md border border-gray-200 text-xs font-mono bg-gray-50" />
                    <h4 className="font-bold text-gray-900 mt-5 mb-2 text-sm">Подсказка</h4>
                    <ul className="text-xs text-gray-600 space-y-1.5">
                        <li>• <code>page_view</code> — клиентский pageview</li>
                        <li>• <code>generation_created:nth=N</code> — N-я генерация юзера</li>
                        <li>• Фильтр <code>{`{"payload.generationType":"worksheet"}`}</code> — только worksheet</li>
                        <li>• Фильтр по UTM: <code>{`{"utmSource":"blogger_xxx"}`}</code></li>
                    </ul>
                </div>
            </div>
        </div>
    )
}

function KpiBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                <span className="text-primary-600">{icon}</span>
                <span>{label}</span>
            </div>
            <div className="text-[26px] font-extrabold text-gray-900 tnum leading-none">{value}</div>
        </div>
    )
}

function formatDuration(sec: number): string {
    if (sec < 60) return `${sec} сек`
    if (sec < 3600) return `${Math.round(sec / 60)} мин`
    if (sec < 86400) return `${Math.round(sec / 3600)} ч`
    return `${Math.round(sec / 86400)} дн`
}
