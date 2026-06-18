'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import {
    Plus, Copy, Check, Trash2, ExternalLink, Sparkles, X,
    Loader2, ToggleLeft, ToggleRight, QrCode,
} from 'lucide-react'
import toast from 'react-hot-toast'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

interface SmartLink {
    id: string
    slug: string
    name: string
    targetUrl: string
    description: string | null
    utmSource: string | null
    utmMedium: string | null
    utmCampaign: string | null
    utmContent: string | null
    utmTerm: string | null
    autoTags: string[]
    clickCount: number
    uniqueClicks: number
    registrations: number
    isActive: boolean
    expiresAt: string | null
    createdAt: string
    conversionRate: number
    funnelId?: string | null
}

interface FunnelOption {
    id: string
    name: string
    isActive: boolean
}

interface CreateForm {
    slug: string
    name: string
    targetUrl: string
    description: string
    utmSource: string
    utmMedium: string
    utmCampaign: string
    utmContent: string
    utmTerm: string
    autoTags: string
    expiresAt: string
    funnelId: string
}

const EMPTY_FORM: CreateForm = {
    slug: '',
    name: '',
    targetUrl: 'https://t.me/prepodavai_bot?start=',
    description: '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmContent: '',
    utmTerm: '',
    autoTags: '',
    expiresAt: '',
    funnelId: '',
}

const PUBLIC_BASE =
    (typeof window !== 'undefined' && window.location.origin) ||
    'https://prepodavai.ru'

const buildPublicUrl = (slug: string) => `${PUBLIC_BASE}/g/${slug}`

export default function SmartLinksPage() {
    const { data: links = [], isLoading, mutate } = useSWR<SmartLink[]>('/admin/smart-links', fetcher)
    const { data: funnels = [] } = useSWR<FunnelOption[]>('/admin/funnels', fetcher)

    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState<SmartLink | null>(null)
    const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
    const [qrSlug, setQrSlug] = useState<string | null>(null)
    const [customizing, setCustomizing] = useState<SmartLink | null>(null)
    const [customUtm, setCustomUtm] = useState({
        source: '', medium: '', campaign: '', content: '', term: '',
    })
    const [customCopied, setCustomCopied] = useState(false)

    useEffect(() => {
        if (editing) {
            setForm({
                slug: editing.slug,
                name: editing.name,
                targetUrl: editing.targetUrl,
                description: editing.description || '',
                utmSource: editing.utmSource || '',
                utmMedium: editing.utmMedium || '',
                utmCampaign: editing.utmCampaign || '',
                utmContent: editing.utmContent || '',
                utmTerm: editing.utmTerm || '',
                autoTags: editing.autoTags.join(', '),
                expiresAt: editing.expiresAt ? editing.expiresAt.slice(0, 10) : '',
                funnelId: editing.funnelId || '',
            })
            setShowForm(true)
        }
    }, [editing])

    const totals = useMemo(() => ({
        total: links.length,
        active: links.filter(l => l.isActive).length,
        clicks: links.reduce((s, l) => s + l.clickCount, 0),
        registrations: links.reduce((s, l) => s + l.registrations, 0),
    }), [links])

    const onSubmit = async () => {
        if (!form.slug.trim() || !form.name.trim() || !form.targetUrl.trim()) {
            toast.error('Заполни slug, название и target URL')
            return
        }
        setSaving(true)
        try {
            const payload = {
                slug: form.slug.trim(),
                name: form.name.trim(),
                targetUrl: form.targetUrl.trim(),
                description: form.description.trim() || undefined,
                utmSource: form.utmSource.trim() || undefined,
                utmMedium: form.utmMedium.trim() || undefined,
                utmCampaign: form.utmCampaign.trim() || undefined,
                utmContent: form.utmContent.trim() || undefined,
                utmTerm: form.utmTerm.trim() || undefined,
                autoTags: form.autoTags.split(',').map(s => s.trim()).filter(Boolean),
                expiresAt: form.expiresAt || null,
                funnelId: form.funnelId || null,
            }
            if (editing) {
                await apiClient.patch(`/admin/smart-links/${editing.id}`, payload)
                toast.success('Сохранено')
            } else {
                await apiClient.post('/admin/smart-links', payload)
                toast.success('Ссылка создана')
            }
            setShowForm(false)
            setEditing(null)
            setForm(EMPTY_FORM)
            mutate()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    const onDelete = async (link: SmartLink) => {
        if (!confirm(`Удалить ссылку "${link.name}" (${link.slug})?`)) return
        try {
            await apiClient.delete(`/admin/smart-links/${link.id}`)
            toast.success('Удалено')
            mutate()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось удалить')
        }
    }

    const onToggleActive = async (link: SmartLink) => {
        try {
            await apiClient.patch(`/admin/smart-links/${link.id}`, { isActive: !link.isActive })
            mutate()
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось переключить')
        }
    }

    const onCopy = async (slug: string) => {
        const url = buildPublicUrl(slug)
        try {
            await navigator.clipboard.writeText(url)
            setCopiedSlug(slug)
            toast.success('Ссылка скопирована')
            setTimeout(() => setCopiedSlug(null), 1500)
        } catch {
            toast.error('Не удалось скопировать')
        }
    }

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-purple-600" />
                        Умные ссылки
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Короткие slug-ссылки вида <code className="text-purple-600">{PUBLIC_BASE}/g/&lt;slug&gt;</code> →
                        редирект с трекингом кликов и автотегами.
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true) }}
                    className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold"
                >
                    <Plus className="w-4 h-4" />
                    Новая ссылка
                </button>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-4 gap-3 mb-6">
                <Stat label="Всего ссылок" value={totals.total} />
                <Stat label="Активных" value={totals.active} />
                <Stat label="Кликов" value={totals.clicks} accent="purple" />
                <Stat label="Регистраций" value={totals.registrations} accent="green" />
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                    </div>
                ) : links.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">Пока нет ссылок</p>
                        <p className="text-xs mt-1">Создай первую — она будет работать через {PUBLIC_BASE}/g/&lt;slug&gt;</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold">Slug</th>
                                <th className="text-left px-4 py-3 font-semibold">Название / Target</th>
                                <th className="text-left px-4 py-3 font-semibold">UTM</th>
                                <th className="text-left px-4 py-3 font-semibold">Теги</th>
                                <th className="text-right px-4 py-3 font-semibold">Клики</th>
                                <th className="text-right px-4 py-3 font-semibold">Регистр.</th>
                                <th className="text-right px-4 py-3 font-semibold">CR</th>
                                <th className="text-center px-4 py-3 font-semibold">Статус</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {links.map(l => (
                                <tr key={l.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-xs">
                                        <div className="flex items-center gap-1.5">
                                            <code className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">{l.slug}</code>
                                            <button
                                                onClick={() => onCopy(l.slug)}
                                                title="Скопировать ссылку"
                                                className="text-gray-400 hover:text-purple-600 transition-colors"
                                            >
                                                {copiedSlug === l.slug
                                                    ? <Check className="w-3.5 h-3.5 text-green-600" />
                                                    : <Copy className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => setQrSlug(l.slug)}
                                                title="QR-код"
                                                className="text-gray-400 hover:text-purple-600 transition-colors"
                                            >
                                                <QrCode className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setCustomizing(l)
                                                    setCustomUtm({
                                                        source: l.utmSource || '',
                                                        medium: l.utmMedium || '',
                                                        campaign: l.utmCampaign || '',
                                                        content: l.utmContent || '',
                                                        term: l.utmTerm || '',
                                                    })
                                                    setCustomCopied(false)
                                                }}
                                                title="Кастомизировать UTM"
                                                className="text-gray-400 hover:text-purple-600 transition-colors"
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 max-w-[260px]">
                                        <button
                                            onClick={() => setEditing(l)}
                                            className="font-semibold text-gray-900 hover:text-purple-600 text-left block"
                                        >
                                            {l.name}
                                        </button>
                                        <a
                                            href={l.targetUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mt-0.5 truncate max-w-full"
                                        >
                                            {l.targetUrl.length > 38 ? l.targetUrl.slice(0, 38) + '…' : l.targetUrl}
                                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                        </a>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600">
                                        {[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(' · ') || (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 flex-wrap">
                                            {l.autoTags.length === 0
                                                ? <span className="text-gray-300 text-xs">—</span>
                                                : l.autoTags.map(t => (
                                                    <span key={t} className="bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">
                                                        {t}
                                                    </span>
                                                ))
                                            }
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        <div>{l.clickCount.toLocaleString('ru')}</div>
                                        <div className="text-xs text-gray-400">uniq {l.uniqueClicks.toLocaleString('ru')}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{l.registrations.toLocaleString('ru')}</td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        <span className={l.conversionRate > 5 ? 'text-green-600' : 'text-gray-600'}>
                                            {l.conversionRate}%
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={() => onToggleActive(l)}
                                            title={l.isActive ? 'Активна — кликабельна' : 'Отключена — редирект на ?invalid_link=1'}
                                        >
                                            {l.isActive
                                                ? <ToggleRight className="w-6 h-6 text-green-600" />
                                                : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => onDelete(l)}
                                            title="Удалить"
                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Form modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between p-6 border-b border-gray-200">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    {editing ? 'Редактировать ссылку' : 'Новая умная ссылка'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">
                                    Slug определяет публичный URL: <code className="text-purple-600">{PUBLIC_BASE}/g/{form.slug || '<slug>'}</code>
                                </p>
                            </div>
                            <button onClick={() => { setShowForm(false); setEditing(null) }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 grid grid-cols-2 gap-4">
                            <Field label="Slug *" required>
                                <input
                                    value={form.slug}
                                    onChange={e => setForm({ ...form, slug: e.target.value })}
                                    placeholder="ig-bio-april"
                                    className="input"
                                    pattern="[A-Za-z0-9_-]+"
                                />
                            </Field>
                            <Field label="Название *">
                                <input
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Instagram bio апрель"
                                    className="input"
                                />
                            </Field>
                            <Field label="Target URL *" wide>
                                <input
                                    value={form.targetUrl}
                                    onChange={e => setForm({ ...form, targetUrl: e.target.value })}
                                    placeholder="https://t.me/prepodavai_bot?start=ig"
                                    className="input"
                                />
                            </Field>
                            <Field label="Описание" wide>
                                <input
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Для себя — где размещали, под какой контент"
                                    className="input"
                                />
                            </Field>

                            <div className="col-span-2 mt-2 mb-1">
                                <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider">UTM-параметры (необязательно)</h3>
                                <p className="text-xs text-gray-400">Подмешиваются к target URL при редиректе</p>
                            </div>
                            <Field label="utm_source">
                                <input value={form.utmSource} onChange={e => setForm({ ...form, utmSource: e.target.value })} placeholder="instagram" className="input" />
                            </Field>
                            <Field label="utm_medium">
                                <input value={form.utmMedium} onChange={e => setForm({ ...form, utmMedium: e.target.value })} placeholder="bio" className="input" />
                            </Field>
                            <Field label="utm_campaign">
                                <input value={form.utmCampaign} onChange={e => setForm({ ...form, utmCampaign: e.target.value })} placeholder="april2026" className="input" />
                            </Field>
                            <Field label="utm_content">
                                <input value={form.utmContent} onChange={e => setForm({ ...form, utmContent: e.target.value })} placeholder="banner_v1" className="input" />
                            </Field>
                            <Field label="utm_term" wide>
                                <input value={form.utmTerm} onChange={e => setForm({ ...form, utmTerm: e.target.value })} placeholder="ключевое слово" className="input" />
                            </Field>

                            <Field label="Авто-теги (через запятую)" wide>
                                <input
                                    value={form.autoTags}
                                    onChange={e => setForm({ ...form, autoTags: e.target.value })}
                                    placeholder="leadmagnet, april, ig"
                                    className="input"
                                />
                            </Field>
                            <Field label="Срок действия">
                                <input
                                    type="date"
                                    value={form.expiresAt}
                                    onChange={e => setForm({ ...form, expiresAt: e.target.value })}
                                    className="input"
                                />
                            </Field>

                            <Field label="Воронка (welcome в ТГ-боте)" wide>
                                <select
                                    value={form.funnelId}
                                    onChange={e => setForm({ ...form, funnelId: e.target.value })}
                                    className="input bg-white"
                                >
                                    <option value="">— не привязана (дефолт) —</option>
                                    {funnels.filter(f => f.isActive).map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-gray-500 mt-1.5">
                                    Если выбрана — ТГ-бот пришлёт welcome из этой воронки. Без привязки — дефолтное приветствие.
                                </p>
                            </Field>
                        </div>

                        <div className="flex justify-end gap-2 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                            <button
                                onClick={() => { setShowForm(false); setEditing(null) }}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={onSubmit}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editing ? 'Сохранить' : 'Создать'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR modal */}
            {/* Custom UTM modal — генерация ссылки под конкретный креатив */}
            {customizing && (() => {
                const baseUrl = buildPublicUrl(customizing.slug)
                const params = new URLSearchParams()
                if (customUtm.source) params.set('utm_source', customUtm.source)
                if (customUtm.medium) params.set('utm_medium', customUtm.medium)
                if (customUtm.campaign) params.set('utm_campaign', customUtm.campaign)
                if (customUtm.content) params.set('utm_content', customUtm.content)
                if (customUtm.term) params.set('utm_term', customUtm.term)
                const finalUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl
                const copyFinal = async () => {
                    try {
                        await navigator.clipboard.writeText(finalUrl)
                        setCustomCopied(true)
                        setTimeout(() => setCustomCopied(false), 1500)
                    } catch { toast.error('Не удалось скопировать') }
                }
                return (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCustomizing(null)}>
                        <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full" onClick={e => e.stopPropagation()}>
                            <div className="flex items-start justify-between p-5 border-b border-gray-200">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-purple-600" />
                                        Кастомизировать UTM
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1">
                                        На «{customizing.name}» (<code className="text-purple-600">/g/{customizing.slug}</code>)
                                    </p>
                                </div>
                                <button onClick={() => setCustomizing(null)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5">
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 text-xs text-purple-900">
                                    Поля прокидываются как query-параметры к ссылке: <code>?utm_source=...&utm_medium=...</code>.
                                    Если поле пустое — используется значение из настроек ссылки.
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <UtmField label="Источник (откуда)" placeholder={customizing.utmSource || 'utm_source'}
                                        value={customUtm.source}
                                        onChange={v => setCustomUtm(p => ({ ...p, source: v }))} />
                                    <UtmField label="Канал (как)" placeholder={customizing.utmMedium || 'utm_medium'}
                                        value={customUtm.medium}
                                        onChange={v => setCustomUtm(p => ({ ...p, medium: v }))} />
                                    <UtmField label="Кампания" placeholder={customizing.utmCampaign || 'utm_campaign'}
                                        value={customUtm.campaign}
                                        onChange={v => setCustomUtm(p => ({ ...p, campaign: v }))} />
                                    <UtmField label="Контент / креатив" placeholder={customizing.utmContent || 'utm_content'}
                                        value={customUtm.content}
                                        onChange={v => setCustomUtm(p => ({ ...p, content: v }))} />
                                    <div className="col-span-2">
                                        <UtmField label="Ключевое слово" placeholder={customizing.utmTerm || 'utm_term'}
                                            value={customUtm.term}
                                            onChange={v => setCustomUtm(p => ({ ...p, term: v }))} />
                                    </div>
                                </div>

                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Готовая ссылка</label>
                                <div className="flex items-stretch gap-2">
                                    <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 break-all leading-relaxed">
                                        {finalUrl}
                                    </code>
                                    <button
                                        onClick={copyFinal}
                                        title="Скопировать"
                                        className="px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center justify-center"
                                    >
                                        {customCopied
                                            ? <Check className="w-4 h-4" />
                                            : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">
                                    Поведение: на клике редиректор подмешает эти UTM к target URL.
                                    Telegram-боту через <code>?start=...</code> query-параметры не передаются,
                                    но прилетают в нашу аналитику кликов и привязываются к юзеру через cookie + параметр <code>lid</code>.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                                <button
                                    onClick={() => setCustomizing(null)}
                                    className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Готово
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {qrSlug && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setQrSlug(null)}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 max-w-xs" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold">QR-код</h3>
                            <button onClick={() => setQrSlug(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            alt={`QR ${qrSlug}`}
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(buildPublicUrl(qrSlug))}`}
                            className="w-full"
                        />
                        <p className="text-center text-xs text-gray-500 mt-3 break-all">{buildPublicUrl(qrSlug)}</p>
                    </div>
                </div>
            )}

            <style jsx>{`
                .input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #111827;
                    background: white;
                    outline: none;
                    transition: border-color 0.15s;
                }
                .input:focus {
                    border-color: #9333ea;
                    box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.15);
                }
            `}</style>
        </div>
    )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'purple' | 'green' }) {
    const color =
        accent === 'purple' ? 'text-purple-600' :
            accent === 'green' ? 'text-green-600' : 'text-gray-900'
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString('ru')}</div>
        </div>
    )
}

function Field({ label, children, wide, required }: { label: string; children: React.ReactNode; wide?: boolean; required?: boolean }) {
    return (
        <div className={wide ? 'col-span-2' : ''}>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
                {label}
                {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    )
}

function UtmField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <div>
            <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1">{label}</label>
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/15 transition-all"
            />
        </div>
    )
}
