'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { apiClient } from '@/lib/api/client'
import {
  Link2, Plus, Trash2, Copy, Check, BarChart2,
  TrendingUp, Users, Clock, Zap, CreditCard, Activity, ArrowRight
} from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

// ── Соцсети ──────────────────────────────────────────────────────────────────
const SOCIAL_NETWORKS = [
  { value: 'instagram', label: 'Instagram', icon: '📸', color: 'bg-pink-100 text-pink-700' },
  { value: 'telegram', label: 'Telegram', icon: '✈️', color: 'bg-blue-100 text-blue-700' },
  { value: 'vk', label: 'ВКонтакте', icon: '🔵', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'youtube', label: 'YouTube', icon: '▶️', color: 'bg-red-100 text-red-700' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵', color: 'bg-gray-100 text-gray-700' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'bg-green-100 text-green-700' },
  { value: 'facebook', label: 'Facebook', icon: '👤', color: 'bg-blue-100 text-blue-800' },
  { value: 'email', label: 'Email-рассылка', icon: '📧', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'other', label: 'Другое', icon: '🔗', color: 'bg-gray-100 text-gray-600' },
]

const MEDIUMS: Record<string, string[]> = {
  instagram: ['bio', 'story', 'post', 'reel', 'direct'],
  telegram: ['bio', 'post', 'channel', 'group', 'direct'],
  vk: ['bio', 'post', 'story', 'group', 'direct'],
  youtube: ['description', 'pinned-comment', 'shorts'],
  tiktok: ['bio', 'video', 'direct'],
  whatsapp: ['broadcast', 'group', 'direct'],
  facebook: ['post', 'story', 'group', 'direct'],
  email: ['newsletter', 'drip', 'digest'],
  other: ['direct', 'post', 'ad'],
}

function SocialBadge({ network }: { network: string }) {
  const sn = SOCIAL_NETWORKS.find(s => s.value === network)
  if (!sn) return <span className="text-gray-400 text-xs">{network}</span>
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sn.color}`}>
      <span>{sn.icon}</span> {sn.label}
    </span>
  )
}

const EMPTY_FORM = {
  name: '',
  socialNetwork: 'instagram',
  utmMedium: 'bio',
  utmCampaign: '',
  utmContent: '',
  utmTerm: '',
  baseUrl: 'https://prepodavai.ru',
}

export default function UtmPage() {
  const { data: linksData, isLoading: linksLoading } = useSWR('/admin/utm', fetcher)
  const { data: analyticsData } = useSWR('/admin/utm/analytics', fetcher)
  const { data: deepData } = useSWR('/admin/utm/analytics/deep', fetcher)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'links' | 'analytics' | 'funnel'>('links')

  const links: any[] = linksData?.links || []
  const analytics = analyticsData || null

  const mediumOptions = MEDIUMS[form.socialNetwork] || MEDIUMS.other

  // Авто-подставляем utm_source из выбранной соцсети
  const utmSource = form.socialNetwork

  // Превью итоговой ссылки
  const previewUrl = (() => {
    if (!form.utmCampaign) return null
    const base = (form.baseUrl || 'https://prepodavai.ru').replace(/\/$/, '')
    const p = new URLSearchParams({
      utm_source: utmSource,
      utm_medium: form.utmMedium,
      utm_campaign: form.utmCampaign,
      ...(form.utmContent ? { utm_content: form.utmContent } : {}),
      ...(form.utmTerm ? { utm_term: form.utmTerm } : {}),
    })
    return `${base}?${p.toString()}`
  })()

  const handleCreate = async () => {
    if (!form.name || !form.utmCampaign) return
    setCreating(true)
    try {
      await apiClient.post('/admin/utm', {
        ...form,
        utmSource,
      })
      mutate('/admin/utm')
      mutate('/admin/utm/analytics')
      setForm(EMPTY_FORM)
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить ссылку?')) return
    await apiClient.delete(`/admin/utm/${id}`)
    mutate('/admin/utm')
    mutate('/admin/utm/analytics')
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">UTM-трекинг</h1>
          <p className="text-sm text-gray-500 mt-1">Создавайте ссылки для соцсетей и отслеживайте откуда приходят пользователи</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition"
        >
          <Plus className="w-4 h-4" />
          Создать ссылку
        </button>
      </div>

      {/* Форма создания */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-gray-900 text-lg">Новая UTM-ссылка</h2>

          {/* Название */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Название (для себя) *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="напр. Instagram bio — апрель 2026"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
            />
          </div>

          {/* Соцсеть */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Социальная сеть *</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {SOCIAL_NETWORKS.map(sn => (
                <button
                  key={sn.value}
                  onClick={() => setForm(f => ({ ...f, socialNetwork: sn.value, utmMedium: MEDIUMS[sn.value]?.[0] || 'direct' }))}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                    form.socialNetwork === sn.value
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-100 hover:border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="text-xl">{sn.icon}</span>
                  <span>{sn.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Тип размещения (medium) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Тип размещения *</label>
              <select
                value={form.utmMedium}
                onChange={e => setForm(f => ({ ...f, utmMedium: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
              >
                {mediumOptions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Кампания */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Название кампании *</label>
              <input
                value={form.utmCampaign}
                onChange={e => setForm(f => ({ ...f, utmCampaign: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="april_promo"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Только латиница и подчёркивания</p>
            </div>

            {/* Контент (опционально) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Контент <span className="text-gray-400 font-normal">(опционально)</span></label>
              <input
                value={form.utmContent}
                onChange={e => setForm(f => ({ ...f, utmContent: e.target.value }))}
                placeholder="variant_a"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>

            {/* Базовый URL */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Целевая страница</label>
              <input
                value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 outline-none"
              />
            </div>
          </div>

          {/* Превью ссылки */}
          {previewUrl && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">ИТОГОВАЯ ССЫЛКА</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-purple-700 break-all">{previewUrl}</code>
                <button
                  onClick={() => handleCopy(previewUrl, 'preview')}
                  className="shrink-0 p-1.5 bg-purple-100 rounded-lg hover:bg-purple-200 transition"
                >
                  {copiedId === 'preview' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-purple-600" />}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={creating || !form.name || !form.utmCampaign}
              className="px-5 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition disabled:opacity-50"
            >
              {creating ? 'Создаём...' : 'Создать ссылку'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {([['links', 'Ссылки'], ['analytics', 'Аналитика'], ['funnel', 'Воронка']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === tab ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Вкладка: Ссылки ── */}
      {activeTab === 'links' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {linksLoading ? (
            <div className="p-8 text-center text-gray-400">Загрузка...</div>
          ) : links.length === 0 ? (
            <div className="p-12 text-center">
              <Link2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Нет ссылок</p>
              <p className="text-sm text-gray-400 mt-1">Создайте первую UTM-ссылку для отслеживания трафика</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ссылка</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Кампания</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Клики</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Регистрации</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Конверсия</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {links.map((link: any) => {
                  const conv = link.clicks > 0 ? Math.round((link.registrations / link.clicks) * 100) : 0
                  return (
                    <tr key={link.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          <SocialBadge network={link.socialNetwork} />
                          <span className="text-xs text-gray-400">{link.utmMedium}</span>
                        </div>
                        <p className="font-medium text-gray-900">{link.name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <code className="text-xs text-gray-400 truncate max-w-xs">{link.fullUrl}</code>
                          <button
                            onClick={() => handleCopy(link.fullUrl, link.id)}
                            className="shrink-0 p-1 hover:bg-gray-200 rounded transition"
                            title="Скопировать ссылку"
                          >
                            {copiedId === link.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">{link.utmCampaign}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-gray-900">{link.clicks}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-bold text-green-600">{link.registrations}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`font-bold text-sm ${conv >= 10 ? 'text-green-600' : conv >= 3 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {link.clicks > 0 ? `${conv}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Вкладка: Аналитика ── */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* KPI */}
          {analytics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analytics.funnel?.totalFromUtm ?? 0}</p>
                    <p className="text-xs text-gray-500">Регистраций по UTM</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analytics.funnel?.withGenerations ?? 0}</p>
                    <p className="text-xs text-gray-500">Сделали генерацию</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <BarChart2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{analytics.funnel?.conversionRate ?? 0}%</p>
                    <p className="text-xs text-gray-500">Активация (регистрация → генерация)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* По источникам */}
          {analytics?.bySource?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-4">По источникам</h3>
              <div className="space-y-3">
                {analytics.bySource.map((row: any) => {
                  const total = analytics.bySource.reduce((s: number, r: any) => s + r.registrations, 0)
                  const pct = total > 0 ? Math.round((row.registrations / total) * 100) : 0
                  return (
                    <div key={row.source} className="flex items-center gap-3">
                      <SocialBadge network={row.source} />
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-purple-500 rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-8 text-right">{row.registrations}</span>
                      <span className="text-xs text-gray-400 w-8">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* По кампаниям */}
          {analytics?.byCampaign?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">По кампаниям</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Кампания</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Источник</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Регистрации</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {analytics.byCampaign.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">{row.campaign}</span>
                      </td>
                      <td className="px-4 py-3"><SocialBadge network={row.source} /></td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">{row.registrations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!analytics || (analytics.bySource?.length === 0 && analytics.byCampaign?.length === 0)) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <BarChart2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Данных пока нет</p>
              <p className="text-sm text-gray-400 mt-1">Создайте ссылку и поделитесь ею — здесь появится аналитика</p>
            </div>
          )}
        </div>
      )}

      {/* ── Вкладка: Воронка ── */}
      {activeTab === 'funnel' && (
        <div className="space-y-5">
          {!deepData?.sources?.length ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Данных пока нет</p>
              <p className="text-sm text-gray-400 mt-1">Появится после первых регистраций по UTM-ссылкам</p>
            </div>
          ) : (
            <>
              {/* Карточки по источникам */}
              {deepData.sources.map((src: any) => (
                <div key={src.source} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Заголовок */}
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <SocialBadge network={src.source} />
                      <span className="text-sm text-gray-500">{src.registrations} регистраций</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {src.avgHoursToFirstGen !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {src.avgHoursToFirstGen < 1
                            ? `${Math.round(src.avgHoursToFirstGen * 60)} мин до первой генерации`
                            : `${src.avgHoursToFirstGen} ч до первой генерации`}
                        </span>
                      )}
                      {src.avgGens30d !== null && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {src.avgGens30d} ген/30д
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Воронка */}
                  <div className="px-5 py-5">
                    <div className="flex items-stretch gap-0">
                      {[
                        {
                          label: 'Регистрации',
                          value: src.registrations,
                          pct: 100,
                          icon: <Users className="w-4 h-4" />,
                          color: 'bg-purple-500',
                          textColor: 'text-purple-700',
                          bg: 'bg-purple-50',
                        },
                        {
                          label: 'Первая генерация (24ч)',
                          value: src.genWithin24h,
                          pct: src.activationRate,
                          icon: <Zap className="w-4 h-4" />,
                          color: 'bg-blue-500',
                          textColor: 'text-blue-700',
                          bg: 'bg-blue-50',
                        },
                        {
                          label: 'Генерация (7 дней)',
                          value: src.genWithin7d,
                          pct: src.registrations > 0 ? Math.round((src.genWithin7d / src.registrations) * 100) : 0,
                          icon: <TrendingUp className="w-4 h-4" />,
                          color: 'bg-indigo-500',
                          textColor: 'text-indigo-700',
                          bg: 'bg-indigo-50',
                        },
                        {
                          label: 'Оформили подписку',
                          value: src.withSubscription,
                          pct: src.subscriptionRate,
                          icon: <CreditCard className="w-4 h-4" />,
                          color: 'bg-green-500',
                          textColor: 'text-green-700',
                          bg: 'bg-green-50',
                        },
                        {
                          label: 'Активны 30 дней',
                          value: src.active30d,
                          pct: src.retention30d,
                          icon: <Activity className="w-4 h-4" />,
                          color: 'bg-orange-500',
                          textColor: 'text-orange-700',
                          bg: 'bg-orange-50',
                        },
                      ].map((step, i, arr) => (
                        <div key={i} className="flex items-center flex-1">
                          <div className={`flex-1 rounded-xl p-4 ${step.bg}`}>
                            <div className={`flex items-center gap-1.5 ${step.textColor} mb-2`}>
                              {step.icon}
                              <span className="text-xs font-semibold">{step.label}</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{step.value}</p>
                            <div className="mt-2 flex items-center gap-1.5">
                              <div className="flex-1 bg-white/60 rounded-full h-1.5">
                                <div
                                  className={`${step.color} rounded-full h-1.5 transition-all`}
                                  style={{ width: `${step.pct}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${step.textColor}`}>{step.pct}%</span>
                            </div>
                          </div>
                          {i < arr.length - 1 && (
                            <ArrowRight className="w-4 h-4 text-gray-300 mx-1 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* LTV-прокси */}
                    {src.avgCreditsUsed !== null && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-6 text-sm">
                        <div>
                          <span className="text-gray-400 text-xs">Среднее потребление токенов</span>
                          <p className="font-bold text-gray-900">{src.avgCreditsUsed} токенов/пользователь</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Суммарно потреблено</span>
                          <p className="font-bold text-gray-900">{src.totalCreditsUsed.toLocaleString()} токенов</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Топ кампаний по подпискам */}
              {deepData.topCampaigns?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900">Кампании по конверсии в подписку</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Кампания</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Источник</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Регистрации</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Подписки</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {deepData.topCampaigns.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <span className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">{row.campaign}</span>
                          </td>
                          <td className="px-4 py-3"><SocialBadge network={row.source} /></td>
                          <td className="px-4 py-3 text-center text-gray-700 font-medium">{row.registrations}</td>
                          <td className="px-4 py-3 text-center font-bold text-green-600">{row.subscriptions}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-bold text-sm ${
                              row.subscriptionRate >= 10 ? 'text-green-600' :
                              row.subscriptionRate >= 3 ? 'text-yellow-600' : 'text-gray-400'
                            }`}>
                              {row.registrations > 0 ? `${row.subscriptionRate}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
