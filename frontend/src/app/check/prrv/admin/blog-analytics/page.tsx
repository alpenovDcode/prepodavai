'use client'

import useSWR from 'swr'
import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Eye, Users, Clock, MousePointerClick, TrendingDown,
  BookOpen, CheckCircle, AlertCircle, ExternalLink,
  Search, TrendingUp, Globe, Smartphone, Monitor, Bot,
  MapPin, Link2, FileText, Activity,
} from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const PERIODS = [
  { label: '7 дней',  d1: '7daysAgo',  d2: 'today' },
  { label: '30 дней', d1: '30daysAgo', d2: 'today' },
  { label: '90 дней', d1: '90daysAgo', d2: 'today' },
]

function KpiCard({ title, value, sub, icon, color = 'orange', highlight = false }: {
  title: string; value: string | number; sub?: string
  icon: React.ReactNode; color?: string; highlight?: boolean
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    red:    'bg-red-50    text-red-600',
    teal:   'bg-teal-50   text-teal-600',
  }
  return (
    <div className={`bg-white rounded-2xl border p-5 flex items-center gap-4 ${highlight ? 'border-orange-200 shadow-sm' : 'border-gray-200'}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500 leading-tight">{title}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
        <div
          className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
          style={{ width: `${Math.max(pct, pct > 0 ? 8 : 0)}%`, background: color }}
        >
          {pct > 10 && <span className="text-white text-xs font-bold">{pct}%</span>}
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-700 w-16 text-right">{value} <span className="text-gray-400 font-normal text-xs">({pct}%)</span></span>
    </div>
  )
}

function EmptyRows({ count = 5, cols = 3 }: { count?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50">
          <span className="text-xs font-bold text-gray-200 w-5">#{i + 1}</span>
          <div className="flex-1 h-3 bg-gray-100 rounded-full" style={{ width: `${60 + Math.random() * 30}%` }} />
          <span className="text-xs text-gray-200 shrink-0">—</span>
        </div>
      ))}
      <p className="text-xs text-gray-400 text-center pt-2">Нет данных за период</p>
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
              <pre className="mt-2 bg-amber-100 rounded-lg p-3 text-xs text-amber-900 overflow-x-auto">
                YANDEX_METRIKA_TOKEN=y0_AgAAAA...
              </pre>
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
    { label: '25%',  value: goals?.article_scroll_25  ?? 0 },
    { label: '50%',  value: goals?.article_scroll_50  ?? 0 },
    { label: '75%',  value: goals?.article_scroll_75  ?? 0 },
    { label: '90%',  value: goals?.article_scroll_90  ?? 0 },
    { label: '100%', value: goals?.article_scroll_100 ?? 0 },
  ]
  const funnelMax = scrollFunnel[0].value || 1

  const timeFunnel = [
    { label: '>30 с',  value: goals?.article_time_30s  ?? 0 },
    { label: '>1 мин', value: goals?.article_time_1min ?? 0 },
    { label: '>2 мин', value: goals?.article_time_2min ?? 0 },
    { label: '>5 мин', value: goals?.article_time_5min ?? 0 },
  ]
  const timeMax = timeFunnel[0].value || 1

  const ctaData = [
    { name: 'Регистрация', value: goals?.cta_register_click ?? 0, color: '#f97316' },
    { name: 'Telegram',    value: goals?.cta_telegram_click ?? 0, color: '#0088cc' },
    { name: 'Бот',         value: goals?.cta_bot_click      ?? 0, color: '#22c55e' },
  ]

  const avgDurMin = Math.floor((traffic?.avgDurationSec ?? 0) / 60)
  const avgDurSec = (traffic?.avgDurationSec ?? 0) % 60
  const bounceRate = traffic?.bounceRate ?? 0
  const visits = traffic?.visits ?? 0
  const finished = goals?.article_finished ?? 0
  const finishedPct = visits > 0 ? Math.round((finished / visits) * 100) : 0

  const hasSources = sources && sources.length > 0
  const hasDevices = devices && devices.length > 0
  const hasCities = cities && cities.length > 0
  const hasReferrers = referrers && referrers.length > 0
  const hasPhrases = searchPhrases && searchPhrases.length > 0
  const hasChart = chart && chart.length > 0

  const PIE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a78bfa']
  const BAR_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a78bfa', '#f59e0b', '#ec4899', '#14b8a6', '#64748b']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Блог Преподавай</h1>
          <p className="text-sm text-gray-500 mt-0.5">Яндекс Метрика · счётчик 109983527 · фильтр: /blog</p>
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
            Метрика
          </a>
          <a
            href="https://prepodavai.ru/blog"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <ExternalLink className="w-4 h-4" />
            Блог
          </a>
        </div>
      </div>

      {/* KPI row 1 — основные */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Визиты на блог" value={traffic?.visits?.toLocaleString('ru') ?? '0'} icon={<Eye className="w-5 h-5" />} color="orange" highlight />
        <KpiCard title="Уникальные пользователи" value={traffic?.users?.toLocaleString('ru') ?? '0'} icon={<Users className="w-5 h-5" />} color="blue" />
        <KpiCard title="Ср. время на странице" value={`${avgDurMin}м ${avgDurSec}с`} icon={<Clock className="w-5 h-5" />} color="purple" />
        <KpiCard title="Дочитали статью" value={finished} sub={`${finishedPct}% от визитов`} icon={<CheckCircle className="w-5 h-5" />} color="green" />
      </div>

      {/* KPI row 2 — детали */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Просмотры страниц"
          value={traffic?.pageviews?.toLocaleString('ru') ?? '0'}
          sub={`${visits > 0 ? ((traffic?.pageviews ?? 0) / visits).toFixed(1) : '0'} стр/визит`}
          icon={<FileText className="w-5 h-5" />} color="orange"
        />
        <KpiCard
          title="Новые пользователи"
          value={traffic?.newUsers?.toLocaleString('ru') ?? '0'}
          sub={`${traffic?.users > 0 ? Math.round(((traffic?.newUsers ?? 0) / traffic.users) * 100) : 0}% от всех`}
          icon={<Users className="w-5 h-5" />} color="blue"
        />
        <KpiCard
          title="Вернувшиеся"
          value={traffic?.returningUsers?.toLocaleString('ru') ?? '0'}
          sub={`${traffic?.users > 0 ? Math.round(((traffic?.returningUsers ?? 0) / traffic.users) * 100) : 0}% от всех`}
          icon={<TrendingUp className="w-5 h-5" />} color="green"
        />
        <KpiCard title="Старты бота из блога" value={blogBotStarts ?? 0} sub="переходы в бот" icon={<Bot className="w-5 h-5" />} color="purple" />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-orange-500" />
          <h2 className="text-base font-semibold text-gray-800">Трафик блога по дням</h2>
          <span className="ml-auto flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-500 inline-block rounded" /> Визиты</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Пользователи</span>
          </span>
        </div>
        {hasChart ? (
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
                formatter={(v: any, name: any) => [v, name === 'visits' ? 'Визиты' : 'Пользователи']}
              />
              <Area type="monotone" dataKey="visits" stroke="#f97316" strokeWidth={2} fill="url(#blogGrad)" name="visits" />
              <Area type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={1.5} fill="none" name="users" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex flex-col items-center justify-center text-gray-300 gap-2">
            <Activity className="w-10 h-10" />
            <p className="text-sm">Нет данных за период</p>
          </div>
        )}
      </div>

      {/* Engagement: Scroll depth + Time + Bounce */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scroll depth */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Глубина прочтения</h2>
          <p className="text-xs text-gray-400 mb-4">Сколько читателей доскроллили до % статьи</p>
          <div className="space-y-3">
            {scrollFunnel.map(row => (
              <FunnelBar key={row.label} label={row.label} value={row.value} max={funnelMax} color="#f97316" />
            ))}
          </div>
        </div>

        {/* Time on page */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Время на странице</h2>
          <p className="text-xs text-gray-400 mb-4">Сколько читателей провели &gt; N секунд</p>
          <div className="space-y-3">
            {timeFunnel.map(row => (
              <FunnelBar key={row.label} label={row.label} value={row.value} max={timeMax} color="#8b5cf6" />
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">Ср. время: <span className="font-semibold text-gray-800">{avgDurMin}м {avgDurSec}с</span></p>
          </div>
        </div>

        {/* Bounce rate */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Показатель отказов</h2>
          <p className="text-xs text-gray-400 mb-4">% ушедших без взаимодействия</p>
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={bounceRate > 70 ? '#ef4444' : bounceRate > 50 ? '#f97316' : '#22c55e'}
                  strokeWidth="3"
                  strokeDasharray={`${bounceRate} ${100 - bounceRate}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{bounceRate}%</span>
              </div>
            </div>
            <p className="text-sm text-center text-gray-600">
              {bounceRate === 0 ? '— нет данных' :
                bounceRate > 70 ? '⚠️ Высокий — улучшить первый экран' :
                bounceRate > 50 ? '🟡 Средний — есть куда расти' :
                '✅ Хороший — читатели вовлечены'}
            </p>
          </div>
        </div>
      </div>

      {/* CTA conversions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Клики по CTA-блокам</h2>
        <p className="text-xs text-gray-400 mb-5">Конверсии из статьи в регистрацию, канал и бота</p>
        <div className="grid grid-cols-3 gap-4 mb-5">
          {ctaData.map(c => (
            <div key={c.name} className="text-center p-4 rounded-xl border border-gray-100" style={{ background: c.color + '10' }}>
              <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
              <p className="text-sm text-gray-700 mt-1 font-medium">{c.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {visits > 0 ? ((c.value / visits) * 100).toFixed(1) : '0'}% конверсия
              </p>
            </div>
          ))}
        </div>
        <div className="h-[90px]">
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={ctaData} layout="vertical" barCategoryGap={10}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v: any) => [v, 'Кликов']} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {ctaData.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sources + Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sources */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Источники трафика</h2>
          <p className="text-xs text-gray-400 mb-4">Откуда приходят читатели</p>
          {hasSources ? (
            <div className="space-y-2">
              {sources.map((s: any, i: number) => {
                const maxV = sources[0]?.visits || 1
                const pct = Math.round((s.visits / maxV) * 100)
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-28 shrink-0">{s.name}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg flex items-center" style={{ width: `${Math.max(pct, 3)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}>
                        {pct > 15 && <span className="text-white text-xs font-bold pl-2">{pct}%</span>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.visits}</span>
                  </div>
                )
              })}
            </div>
          ) : <EmptyRows count={4} />}
        </div>

        {/* Devices */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Устройства</h2>
          <p className="text-xs text-gray-400 mb-4">С каких устройств читают блог</p>
          {hasDevices ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={devices} dataKey="visits" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={65}>
                    {devices.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Визиты']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3 flex-1">
                {devices.map((d: any, i: number) => {
                  const total = devices.reduce((s: number, x: any) => s + x.visits, 0) || 1
                  const pct = Math.round((d.visits / total) * 100)
                  const icons = [<Monitor key="m" className="w-4 h-4" />, <Smartphone key="s" className="w-4 h-4" />, <Globe key="g" className="w-4 h-4" />]
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <span style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>{icons[i % 3]}</span>
                      <span className="text-sm text-gray-700 flex-1">{d.name}</span>
                      <span className="text-sm font-bold" style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}>{pct}%</span>
                      <span className="text-xs text-gray-400 w-8 text-right">{d.visits}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-[140px] h-[140px] rounded-full border-4 border-dashed border-gray-100 flex items-center justify-center shrink-0">
                <Globe className="w-8 h-8 text-gray-200" />
              </div>
              <div className="space-y-3 flex-1">
                {['Desktop', 'Mobile', 'Tablet'].map((name, i) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-gray-200">{[<Monitor key="m" className="w-4 h-4" />, <Smartphone key="s" className="w-4 h-4" />, <Globe key="g" className="w-4 h-4" />][i]}</span>
                    <span className="text-sm text-gray-300 flex-1">{name}</span>
                    <span className="text-xs text-gray-200">—</span>
                  </div>
                ))}
                <p className="text-xs text-gray-400 pt-1">Нет данных за период</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cities + Referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-red-500" />
            <h2 className="text-base font-semibold text-gray-800">Топ городов</h2>
          </div>
          {hasCities ? (
            <div className="space-y-1">
              {cities.map((c: any, i: number) => {
                const maxV = cities[0]?.visits || 1
                const pct = Math.round((c.visits / maxV) * 100)
                return (
                  <div key={c.name} className="flex items-center gap-3 py-1.5">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-8 text-right">{c.visits}</span>
                  </div>
                )
              })}
            </div>
          ) : <EmptyRows count={5} />}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Реферальные источники</h2>
          </div>
          {hasReferrers ? (
            <div className="space-y-1">
              {referrers.map((r: any, i: number) => (
                <div key={r.url} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="flex-1 text-xs text-gray-600 truncate">{r.url}</span>
                  <span className="text-sm font-semibold text-gray-700 shrink-0">{r.visits}</span>
                </div>
              ))}
            </div>
          ) : <EmptyRows count={5} />}
        </div>
      </div>

      {/* Search phrases */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-orange-500" />
          <h2 className="text-base font-semibold text-gray-800">Поисковые фразы (Яндекс)</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">По каким запросам приходят из Яндекса</p>
        {hasPhrases ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
            {searchPhrases.map((p: any, i: number) => {
              const maxV = searchPhrases[0]?.visits || 1
              const pct = Math.round((p.visits / maxV) * 100)
              return (
                <div key={p.phrase} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{p.phrase}</span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 w-6 text-right">{p.visits}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
            <EmptyRows count={6} />
            <EmptyRows count={6} />
          </div>
        )}
      </div>

      {/* Google Search Console */}
      {(!gscData || !gscData.configured) ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
            <span className="text-xs text-gray-400 ml-1">— видимость в поиске Google</span>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 text-sm">Нужны учётные данные Google Search Console</p>
              <pre className="mt-2 bg-blue-100 rounded-lg p-3 text-xs text-blue-900 overflow-x-auto">{`GOOGLE_SC_CLIENT_ID=...
GOOGLE_SC_CLIENT_SECRET=...
GOOGLE_SC_REFRESH_TOKEN=...`}</pre>
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
          {/* GSC KPI */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Search className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-800">Google Search Console</h2>
              <span className="text-xs text-gray-400 ml-1">— видимость в поиске Google</span>
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="ml-auto">
                <ExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-500" />
              </a>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard title="Клики из Google" value={gscData.summary?.clicks?.toLocaleString('ru') ?? '0'} icon={<MousePointerClick className="w-5 h-5" />} color="blue" />
              <KpiCard title="Показы в поиске" value={gscData.summary?.impressions?.toLocaleString('ru') ?? '0'} icon={<Eye className="w-5 h-5" />} color="purple" />
              <KpiCard title="CTR" value={`${gscData.summary?.ctr ?? 0}%`} sub="кликов от показов" icon={<TrendingUp className="w-5 h-5" />} color="green" />
              <KpiCard title="Средняя позиция" value={gscData.summary?.position ?? '—'} sub="место в Google" icon={<Globe className="w-5 h-5" />} color="orange" />
            </div>
          </div>

          {/* GSC chart */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Клики и показы из Google по дням</h2>
            {gscData.chart && gscData.chart.length > 0 ? (
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
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v: any, name: any) => [v, name === 'clicks' ? 'Клики' : 'Показы']} />
                  <Area type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} fill="url(#gscGrad)" name="clicks" />
                  <Area type="monotone" dataKey="impressions" stroke="#a78bfa" strokeWidth={1.5} fill="none" name="impressions" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex flex-col items-center justify-center text-gray-300 gap-2">
                <TrendingUp className="w-10 h-10" />
                <p className="text-sm">Нет данных — блог ещё не индексируется Google</p>
              </div>
            )}
          </div>

          {/* Top queries + Top pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Топ запросов Google</h2>
              {gscData.topQueries && gscData.topQueries.length > 0 ? (
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
              ) : <EmptyRows count={5} />}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Топ страниц блога (Google)</h2>
              {gscData.topPages && gscData.topPages.length > 0 ? (
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
              ) : <EmptyRows count={5} />}
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Открыть в сервисах</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Метрика · Обзор', href: 'https://metrika.yandex.ru/stat/?id=109983527', color: 'text-orange-500' },
            { label: 'Метрика · Источники', href: 'https://metrika.yandex.ru/stat/sources/?id=109983527', color: 'text-orange-500' },
            { label: 'Метрика · Страницы', href: 'https://metrika.yandex.ru/stat/content/?id=109983527', color: 'text-orange-500' },
            { label: 'Google Search Console', href: 'https://search.google.com/search-console', color: 'text-blue-500' },
            { label: 'Яндекс Вебмастер', href: 'https://webmaster.yandex.ru/', color: 'text-yellow-600' },
            { label: 'Блог', href: 'https://prepodavai.ru/blog', color: 'text-purple-500' },
          ].map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <ExternalLink className={`w-3.5 h-3.5 ${l.color}`} />
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
