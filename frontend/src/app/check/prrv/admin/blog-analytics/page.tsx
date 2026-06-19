'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  Eye, Users, Clock, MousePointerClick, TrendingDown,
  BookOpen, CheckCircle, AlertCircle, ExternalLink,
  Search, TrendingUp, Globe, Smartphone, Monitor, Bot,
  MapPin, Link2, FileText,
} from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const PERIODS = [
  { label: '7 дней',   d1: '7daysAgo',   d2: 'today' },
  { label: '30 дней',  d1: '30daysAgo',  d2: 'today' },
  { label: '90 дней',  d1: '90daysAgo',  d2: 'today' },
]

function KpiCard({ title, value, sub, icon, color = 'orange' }: {
  title: string; value: string | number; sub?: string
  icon: React.ReactNode; color?: string
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    red:    'bg-red-50    text-red-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{title}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden">
        <div
          className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
          style={{ width: `${Math.max(pct, 2)}%`, background: color }}
        >
          <span className="text-white text-xs font-bold">{pct}%</span>
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-700 w-12 text-right">{value}</span>
    </div>
  )
}

export default function BlogAnalyticsPage() {
  const [periodIdx, setPeriodIdx] = useState(1)
  const period = PERIODS[periodIdx]

  const { data, error, isLoading } = useSWR(
    `/admin/blog-analytics?date1=${period.d1}&date2=${period.d2}`,
    fetcher,
    { refreshInterval: 0 },
  )

  const { data: gscData } = useSWR(
    `/admin/blog-gsc?date1=${period.d1}&date2=${period.d2}`,
    fetcher,
    { refreshInterval: 0 },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
        Ошибка загрузки данных. Проверьте подключение к бэкенду.
      </div>
    )
  }

  if (!data?.configured) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Блог Преподавай</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Нужен токен Яндекс Метрики</p>
              <p className="text-sm text-amber-700 mt-1">
                Добавьте в <code className="bg-amber-100 px-1 rounded">.env</code> бэкенда:
              </p>
              <pre className="mt-2 bg-amber-100 rounded-lg p-3 text-xs text-amber-900 overflow-x-auto">
                YANDEX_METRIKA_TOKEN=y0_AgAAAA...
              </pre>
              <p className="text-xs text-amber-600 mt-2">
                Токен создаётся в{' '}
                <a
                  href="https://oauth.yandex.ru/"
                  target="_blank" rel="noopener noreferrer"
                  className="underline"
                >
                  oauth.yandex.ru
                </a>{' '}
                — приложение «Яндекс.Метрика», доступ «статистика».
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700">
        Ошибка Метрики: {data.error}
      </div>
    )
  }

  const { traffic, goals, chart, sources, devices, cities, referrers, searchPhrases, blogBotStarts } = data

  const scrollFunnel = [
    { label: '25%',  value: goals.article_scroll_25  ?? 0 },
    { label: '50%',  value: goals.article_scroll_50  ?? 0 },
    { label: '75%',  value: goals.article_scroll_75  ?? 0 },
    { label: '90%',  value: goals.article_scroll_90  ?? 0 },
    { label: '100%', value: goals.article_scroll_100 ?? 0 },
  ]
  const funnelMax = scrollFunnel[0].value || 1

  const timeFunnel = [
    { label: '>30 с',   value: goals.article_time_30s  ?? 0 },
    { label: '>1 мин',  value: goals.article_time_1min ?? 0 },
    { label: '>2 мин',  value: goals.article_time_2min ?? 0 },
    { label: '>5 мин',  value: goals.article_time_5min ?? 0 },
  ]
  const timeMax = timeFunnel[0].value || 1

  const ctaData = [
    { name: 'Регистрация', value: goals.cta_register_click  ?? 0, color: '#f97316' },
    { name: 'Telegram',    value: goals.cta_telegram_click  ?? 0, color: '#0088cc' },
    { name: 'Бот',         value: goals.cta_bot_click       ?? 0, color: '#22c55e' },
  ]

  const avgDurMin = Math.floor((traffic.avgDurationSec ?? 0) / 60)
  const avgDurSec = (traffic.avgDurationSec ?? 0) % 60

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Блог Преподавай</h1>
          <p className="text-sm text-gray-500 mt-0.5">Данные из Яндекс Метрики · счётчик 109983527</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(i)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                i === periodIdx
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          <a
            href="https://metrika.yandex.ru/stat/?id=109983527"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" />
            Открыть Метрику
          </a>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Визиты на блог" value={traffic.visits?.toLocaleString('ru') ?? '—'} icon={<Eye className="w-5 h-5" />} color="orange" />
        <KpiCard title="Уникальные пользователи" value={traffic.users?.toLocaleString('ru') ?? '—'} icon={<Users className="w-5 h-5" />} color="blue" />
        <KpiCard title="Ср. время на странице" value={`${avgDurMin}м ${avgDurSec}с`} icon={<Clock className="w-5 h-5" />} color="purple" />
        <KpiCard title="Дочитали статью" value={goals.article_finished ?? 0} sub={`${traffic.visits > 0 ? Math.round(((goals.article_finished ?? 0) / traffic.visits) * 100) : 0}% от визитов`} icon={<CheckCircle className="w-5 h-5" />} color="green" />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Просмотры страниц" value={traffic.pageviews?.toLocaleString('ru') ?? '—'} sub={`${traffic.visits > 0 ? (((traffic.pageviews ?? 0) / traffic.visits).toFixed(1)) : '0'} стр/визит`} icon={<FileText className="w-5 h-5" />} color="orange" />
        <KpiCard title="Новые пользователи" value={traffic.newUsers?.toLocaleString('ru') ?? '—'} sub={`${traffic.users > 0 ? Math.round(((traffic.newUsers ?? 0) / traffic.users) * 100) : 0}% от всех`} icon={<Users className="w-5 h-5" />} color="blue" />
        <KpiCard title="Вернувшиеся" value={traffic.returningUsers?.toLocaleString('ru') ?? '—'} sub={`${traffic.users > 0 ? Math.round(((traffic.returningUsers ?? 0) / traffic.users) * 100) : 0}% от всех`} icon={<TrendingUp className="w-5 h-5" />} color="green" />
        <KpiCard title="Старты бота из блога" value={blogBotStarts ?? 0} sub="клики по кнопке бота" icon={<Bot className="w-5 h-5" />} color="purple" />
      </div>

      {/* Chart */}
      {chart && chart.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Трафик блога по дням</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="blogGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v, name) => [v, name === 'visits' ? 'Визиты' : 'Пользователи']}
              />
              <Area type="monotone" dataKey="visits" stroke="#f97316" strokeWidth={2} fill="url(#blogGrad)" name="visits" />
              <Area type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={1.5} fill="none" name="users" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Scroll funnel + Time funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Глубина прочтения</h2>
          <p className="text-xs text-gray-400 mb-5">Сколько читателей доскроллили до % статьи</p>
          <div className="space-y-3">
            {scrollFunnel.map(row => (
              <FunnelBar key={row.label} label={row.label} value={row.value} max={funnelMax} color="#f97316" />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Время на странице</h2>
          <p className="text-xs text-gray-400 mb-5">Сколько читателей провели на странице &gt; N секунд</p>
          <div className="space-y-3">
            {timeFunnel.map(row => (
              <FunnelBar key={row.label} label={row.label} value={row.value} max={timeMax} color="#8b5cf6" />
            ))}
          </div>
        </div>
      </div>

      {/* CTA clicks */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Клики по CTA-блокам</h2>
        <p className="text-xs text-gray-400 mb-5">Конверсии из статьи в регистрацию, канал и бота</p>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {ctaData.map(c => (
            <div key={c.name} className="text-center p-4 rounded-xl" style={{ background: c.color + '14' }}>
              <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
              <p className="text-sm text-gray-600 mt-1">{c.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {traffic.visits > 0 ? (((c.value / traffic.visits) * 100).toFixed(1)) : '0'}% конверсия
              </p>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={ctaData} layout="vertical" barCategoryGap={8}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(v: any) => [v, 'Кликов']}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {ctaData.map((c, i) => (
                <rect key={i} fill={c.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bounce rate */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Показатель отказов</h2>
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={traffic.bounceRate > 70 ? '#ef4444' : traffic.bounceRate > 50 ? '#f97316' : '#22c55e'}
                strokeWidth="3"
                strokeDasharray={`${traffic.bounceRate} ${100 - traffic.bounceRate}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-900">{traffic.bounceRate}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600">
              {traffic.bounceRate > 70
                ? '⚠️ Высокий показатель отказов. Стоит улучшить первый экран статьи.'
                : traffic.bounceRate > 50
                ? '🟡 Средний показатель. Есть куда расти.'
                : '✅ Хороший показатель — читатели вовлечены.'}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Отказ = пользователь ушёл с первой страницы без действий
            </p>
          </div>
        </div>
      </div>

      {/* Sources + Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sources && sources.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Источники трафика</h2>
            <p className="text-xs text-gray-400 mb-4">Откуда приходят читатели</p>
            <div className="space-y-2">
              {sources.map((s: any, i: number) => {
                const max = sources[0]?.visits || 1
                const pct = Math.round((s.visits / max) * 100)
                const colors = ['#f97316','#3b82f6','#22c55e','#a78bfa','#f59e0b','#ec4899','#14b8a6','#64748b']
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-28 shrink-0">{s.name}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg" style={{ width: `${Math.max(pct, 2)}%`, background: colors[i % colors.length] }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.visits}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {devices && devices.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-1">Устройства</h2>
            <p className="text-xs text-gray-400 mb-4">С каких устройств читают блог</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={devices} dataKey="visits" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70}>
                    {devices.map((_: any, i: number) => (
                      <Cell key={i} fill={['#3b82f6','#f97316','#22c55e'][i % 3]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Визиты']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {devices.map((d: any, i: number) => {
                  const total = devices.reduce((s: number, x: any) => s + x.visits, 0) || 1
                  const pct = Math.round((d.visits / total) * 100)
                  const icons = [<Monitor key="m" className="w-4 h-4" />, <Smartphone key="s" className="w-4 h-4" />, <Globe key="g" className="w-4 h-4" />]
                  const colors = ['#3b82f6','#f97316','#22c55e']
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <span style={{ color: colors[i % 3] }}>{icons[i % 3]}</span>
                      <span className="text-sm text-gray-700 flex-1">{d.name}</span>
                      <span className="text-sm font-bold" style={{ color: colors[i % 3] }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cities + Referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cities && cities.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-red-500" />
              <h2 className="text-base font-semibold text-gray-800">Топ городов</h2>
            </div>
            <div className="space-y-2">
              {cities.map((c: any, i: number) => (
                <div key={c.name} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  <span className="text-sm font-semibold text-gray-700">{c.visits}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {referrers && referrers.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-4 h-4 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-800">Реферальные источники</h2>
            </div>
            <div className="space-y-2">
              {referrers.map((r: any, i: number) => (
                <div key={r.url} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="flex-1 text-xs text-gray-600 truncate">{r.url}</span>
                  <span className="text-sm font-semibold text-gray-700 shrink-0">{r.visits}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search phrases from Yandex */}
      {searchPhrases && searchPhrases.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-orange-500" />
            <h2 className="text-base font-semibold text-gray-800">Поисковые фразы (Яндекс)</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4">По каким запросам приходят из Яндекса</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
            {searchPhrases.map((p: any, i: number) => {
              const max = searchPhrases[0]?.visits || 1
              const pct = Math.round((p.visits / max) * 100)
              return (
                <div key={p.phrase} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{p.phrase}</span>
                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 w-6 text-right">{p.visits}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Google Search Console */}
      {!gscData || !gscData.configured ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 text-sm">Нужны учётные данные Google</p>
              <p className="text-xs text-blue-700 mt-1">
                Добавьте в <code className="bg-blue-100 px-1 rounded">.env</code> бэкенда:
              </p>
              <pre className="mt-2 bg-blue-100 rounded-lg p-3 text-xs text-blue-900 overflow-x-auto">
{`GOOGLE_SC_CLIENT_ID=...
GOOGLE_SC_CLIENT_SECRET=...
GOOGLE_SC_REFRESH_TOKEN=...`}
              </pre>
              <p className="text-xs text-blue-600 mt-2">
                Инструкция: Google Cloud Console → OAuth 2.0 → Search Console API → получить refresh_token через Playground.
              </p>
            </div>
          </div>
        </div>
      ) : gscData.error ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
          </div>
          <p className="text-sm text-red-500">Ошибка: {gscData.error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* GSC header + KPI */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Search className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
              <span className="text-xs text-gray-400 ml-1">— видимость в поиске Google</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Клики из Google"
                value={gscData.summary.clicks.toLocaleString('ru')}
                icon={<MousePointerClick className="w-5 h-5" />}
                color="blue"
              />
              <KpiCard
                title="Показы в поиске"
                value={gscData.summary.impressions.toLocaleString('ru')}
                icon={<Eye className="w-5 h-5" />}
                color="purple"
              />
              <KpiCard
                title="CTR"
                value={`${gscData.summary.ctr}%`}
                sub="кликов от показов"
                icon={<TrendingUp className="w-5 h-5" />}
                color="green"
              />
              <KpiCard
                title="Средняя позиция"
                value={gscData.summary.position}
                sub="место в Google"
                icon={<Globe className="w-5 h-5" />}
                color="orange"
              />
            </div>
          </div>

          {/* GSC chart */}
          {gscData.chart && gscData.chart.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Клики и показы из Google по дням</h2>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={gscData.chart}>
                  <defs>
                    <linearGradient id="gscGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={35} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: any, name: any) => [v, name === 'clicks' ? 'Клики' : 'Показы']}
                  />
                  <Area type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} fill="url(#gscGrad)" name="clicks" />
                  <Area type="monotone" dataKey="impressions" stroke="#a78bfa" strokeWidth={1.5} fill="none" name="impressions" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top queries + Top pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top queries */}
            {gscData.topQueries && gscData.topQueries.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Топ запросов</h2>
                <div className="space-y-2">
                  {gscData.topQueries.map((q: any, i: number) => (
                    <div key={q.query} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{q.query}</p>
                        <p className="text-xs text-gray-400">позиция {q.position} · CTR {q.ctr}%</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-blue-600">{q.clicks}</p>
                        <p className="text-xs text-gray-400">{q.impressions} показов</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top pages */}
            {gscData.topPages && gscData.topPages.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Топ страниц</h2>
                <div className="space-y-2">
                  {gscData.topPages.map((p: any, i: number) => {
                    const slug = p.page.replace('https://prepodavai.ru', '') || '/'
                    return (
                      <div key={p.page} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{slug}</p>
                          <p className="text-xs text-gray-400">позиция {p.position}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-green-600">{p.clicks}</p>
                          <p className="text-xs text-gray-400">{p.impressions} показов</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Полезные ссылки</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://metrika.yandex.ru/stat/sources/?id=109983527"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <TrendingDown className="w-4 h-4 text-orange-500" />
            Источники трафика
          </a>
          <a
            href="https://metrika.yandex.ru/stat/content/?id=109983527"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <BookOpen className="w-4 h-4 text-blue-500" />
            Контент (Метрика)
          </a>
          <a
            href="https://search.google.com/search-console"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Eye className="w-4 h-4 text-green-500" />
            Google Search Console
          </a>
          <a
            href="https://webmaster.yandex.ru/"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Eye className="w-4 h-4 text-yellow-500" />
            Яндекс Вебмастер
          </a>
          <a
            href="https://prepodavai.ru/blog"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4 text-purple-500" />
            Открыть блог
          </a>
        </div>
      </div>
    </div>
  )
}
