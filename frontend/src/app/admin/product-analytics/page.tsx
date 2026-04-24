'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'
import {
  Activity, Users, TrendingUp,
  BookOpen, Zap, BarChart2, UserX, ArrowUp, ArrowDown, Minus,
  Sparkles, CheckCircle, Calendar, Tag
} from 'lucide-react'
import DateRangePicker, { daysFromRange } from '@/components/admin/DateRangePicker'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

// ── Вспомогательные компоненты ────────────────────────────────────────────────
function KpiCard({ title, value, sub, icon, color = 'purple' }: {
  title: string; value: string | number; sub?: string
  icon: React.ReactNode; color?: string
}) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-50 text-purple-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
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

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400 text-xs">—</span>
  if (pct > 0) return <span className="flex items-center gap-0.5 text-green-600 text-xs font-bold"><ArrowUp className="w-3 h-3" />+{pct}%</span>
  if (pct < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-bold"><ArrowDown className="w-3 h-3" />{pct}%</span>
  return <span className="flex items-center gap-0.5 text-gray-400 text-xs font-bold"><Minus className="w-3 h-3" />0%</span>
}

const FEATURE_LABELS: Record<string, string> = {
  worksheet: 'Рабочий лист', lesson_plan: 'План урока', quiz: 'Тест',
  presentation: 'Презентация', image_generation: 'Изображение',
  vocabulary: 'Словарь', feedback: 'Проверка ДЗ', content_adaptation: 'Адаптация текста',
  game_generation: 'Игра', exam_variant: 'ОГЭ/ЕГЭ', text_generation: 'Генерация текста',
  transcription: 'Транскрипция', video_analysis: 'Анализ видео',
}
const ftLabel = (t: string) => FEATURE_LABELS[t] || t

// Цвет ячейки retention
function retentionColor(pct: number) {
  if (pct === 0)  return 'bg-gray-50 text-gray-300'
  if (pct >= 60)  return 'bg-green-500 text-white'
  if (pct >= 40)  return 'bg-green-300 text-green-900'
  if (pct >= 20)  return 'bg-yellow-200 text-yellow-900'
  if (pct >= 10)  return 'bg-orange-200 text-orange-900'
  return 'bg-red-100 text-red-700'
}

const TABS = [
  { id: 'dau',        label: 'DAU/WAU/MAU',   icon: <Activity className="w-4 h-4" /> },
  { id: 'comparison', label: 'Сравнение',      icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'retention',  label: 'Retention',      icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'churn',      label: 'Churn',          icon: <UserX className="w-4 h-4" /> },
  { id: 'onboarding', label: 'Онбординг',      icon: <BookOpen className="w-4 h-4" /> },
  { id: 'features',   label: 'Feature Adoption', icon: <Zap className="w-4 h-4" /> },
  { id: 'm14',        label: 'Фичи M1-M4',     icon: <Sparkles className="w-4 h-4" /> },
]

export default function ProductAnalyticsPage() {
  const [tab, setTab] = useState('dau')
  const [dauRange, setDauRange] = useState('90d')
  const [featRange, setFeatRange] = useState('30d')
  const [m14Range, setM14Range] = useState('30d')
  const [cmpPeriod, setCmpPeriod] = useState<'week' | 'month'>('week')

  const { data: dau }    = useSWR(`/admin/product/dau-wau-mau?days=${daysFromRange(dauRange)}`, fetcher)
  const { data: ret }    = useSWR('/admin/product/retention', fetcher)
  const { data: churn }  = useSWR('/admin/product/churn', fetcher)
  const { data: onb }    = useSWR('/admin/product/onboarding', fetcher)
  const { data: feat }   = useSWR(`/admin/product/features?days=${daysFromRange(featRange)}`, fetcher)
  const { data: cmp }    = useSWR(`/admin/product/comparison?period=${cmpPeriod}`, fetcher)
  const { data: m14 }    = useSWR(
    tab === 'm14' ? `/admin/product/m-features?days=${daysFromRange(m14Range)}` : null,
    fetcher,
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Продуктовая аналитика</h1>
        <p className="text-sm text-gray-500 mt-1">Engagement, retention, churn и adoption метрики</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── DAU/WAU/MAU ── */}
      {tab === 'dau' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">DAU / WAU / MAU</h2>
            <DateRangePicker value={dauRange} onChange={setDauRange} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <KpiCard title="MAU (последний месяц)" value={dau?.lastMau ?? '—'} icon={<Users className="w-5 h-5" />} color="purple" />
            <KpiCard title="Avg DAU (последний месяц)" value={dau?.avgDau ?? '—'} icon={<Activity className="w-5 h-5" />} color="blue" />
            <KpiCard title="Stickiness (DAU/MAU)" value={dau?.stickiness ? `${dau.stickiness}%` : '—'} sub="Цель: 20%+" icon={<TrendingUp className="w-5 h-5" />} color={dau?.stickiness >= 20 ? 'green' : 'orange'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-700 mb-4">Ежедневные активные пользователи (DAU)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dau?.daily || []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <Tooltip formatter={(v: any) => [v, 'DAU']} labelFormatter={(v: any) => new Date(v).toLocaleDateString('ru')} />
                <Line type="monotone" dataKey="dau" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">WAU (недельные)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dau?.weekly || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} />
                  <YAxis tick={{ fontSize: 10 }} width={30} />
                  <Tooltip formatter={(v: any) => [v, 'WAU']} />
                  <Bar dataKey="wau" fill="#7c3aed" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">MAU (месячные)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dau?.monthly || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleDateString('ru', { month: 'short', year: '2-digit' })} />
                  <YAxis tick={{ fontSize: 10 }} width={30} />
                  <Tooltip formatter={(v: any) => [v, 'MAU']} />
                  <Bar dataKey="mau" fill="#4f46e5" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Сравнение периодов ── */}
      {tab === 'comparison' && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-gray-900">Сравнение периодов</h2>
            <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
              {(['week', 'month'] as const).map(p => (
                <button key={p} onClick={() => setCmpPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${cmpPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >{p === 'week' ? 'Неделя' : 'Месяц'}</button>
              ))}
            </div>
          </div>

          {cmp && (
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: 'registrations',    label: 'Регистрации',   icon: <Users className="w-5 h-5" />,    color: 'purple' },
                { key: 'generations',      label: 'Генерации',     icon: <Zap className="w-5 h-5" />,      color: 'blue' },
                { key: 'activeUsers',      label: 'Активных польз.',icon: <Activity className="w-5 h-5" />, color: 'green' },
                { key: 'newSubscriptions', label: 'Новых подписок', icon: <TrendingUp className="w-5 h-5" />,color: 'orange' },
              ] as const).map(item => {
                const d = cmp[item.key]
                return (
                  <div key={item.key} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-600">{item.label}</p>
                      <Delta pct={d?.pct} />
                    </div>
                    <div className="flex items-end gap-4">
                      <div>
                        <p className="text-3xl font-bold text-gray-900">{d?.current ?? '—'}</p>
                        <p className="text-xs text-gray-400">Текущий период</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-gray-400">{d?.previous ?? '—'}</p>
                        <p className="text-xs text-gray-400">Предыдущий</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <div className="flex-1 bg-purple-100 rounded-full h-1.5">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, d?.current ? (d.current / Math.max(d.current, d.previous || 1)) * 100 : 0)}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Retention Grid ── */}
      {tab === 'retention' && (
        <div className="space-y-5">
          <div>
            <h2 className="font-bold text-gray-900">Когортная Retention-сетка</h2>
            <p className="text-xs text-gray-500 mt-1">% пользователей когорты, вернувшихся на N-ю неделю. Активность = совершил генерацию.</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Когорта (неделя)</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">Размер</th>
                  {['Нед 0', 'Нед 1', 'Нед 2', 'Нед 4', 'Нед 8'].map(w => (
                    <th key={w} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 min-w-[72px]">{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(ret || []).map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap text-xs">
                      {new Date(row.cohortWeek).toLocaleDateString('ru', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">{row.cohortSize}</td>
                    {['w0','w1','w2','w4','w8'].map(wk => (
                      <td key={wk} className="px-3 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold min-w-[48px] text-center ${retentionColor(row[wk]?.pct ?? 0)}`}>
                          {row[wk]?.pct ?? 0}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {(!ret || ret.length === 0) && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Нет данных — нужны пользователи с историей генераций</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Легенда:</span>
            {[['≥60%','bg-green-500 text-white'], ['40–59%','bg-green-300 text-green-900'], ['20–39%','bg-yellow-200 text-yellow-900'], ['10–19%','bg-orange-200 text-orange-900'], ['<10%','bg-red-100 text-red-700']].map(([l,c]) => (
              <span key={l} className={`px-2 py-0.5 rounded-lg font-semibold ${c}`}>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Churn ── */}
      {tab === 'churn' && (
        <div className="space-y-5">
          <h2 className="font-bold text-gray-900">Churn-аналитика</h2>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard title="Всего ушедших" value={churn?.totalChurned ?? '—'} icon={<UserX className="w-5 h-5" />} color="red" />
            <KpiCard title="Медиана дней до чёрна" value={churn?.medianDaysBeforeChurn ? `${churn.medianDaysBeforeChurn} дн` : '—'} icon={<Activity className="w-5 h-5" />} color="orange" />
            <KpiCard title="Топ действие перед уходом" value={churn?.lastActionTypes?.[0]?.type ? ftLabel(churn.lastActionTypes[0].type) : '—'} icon={<Zap className="w-5 h-5" />} color="blue" />
          </div>

          {churn?.monthlyChurn?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Churn rate по месяцам</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={churn.monthlyChurn}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => new Date(v).toLocaleDateString('ru', { month: 'short', year: '2-digit' })} />
                  <YAxis tick={{ fontSize: 10 }} width={35} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Churn']} />
                  <Bar dataKey="rate" fill="#ef4444" radius={[4,4,0,0]} name="Churn %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-2 gap-5">
            {churn?.lastActionTypes?.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <p className="text-sm font-bold text-gray-700 mb-4">Что делали перед уходом (7 дней до чёрна)</p>
                <div className="space-y-2">
                  {churn.lastActionTypes.slice(0, 8).map((row: any) => {
                    const max = churn.lastActionTypes[0].count
                    return (
                      <div key={row.type} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-32 shrink-0">{ftLabel(row.type)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="bg-red-400 rounded-full h-2" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700 w-6">{row.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-700">Последние уходы</p>
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {(churn?.churnedUsers || []).slice(0, 15).map((u: any) => (
                  <div key={u.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{u.username || u.email}</p>
                      <p className="text-xs text-gray-400">{u.days_as_customer} дн. клиентом · {u.credits_used} токенов</p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(u.sub_end).toLocaleDateString('ru')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Онбординг ── */}
      {tab === 'onboarding' && (
        <div className="space-y-5">
          <h2 className="font-bold text-gray-900">Воронка онбординга</h2>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard title="Всего пользователей" value={onb?.totalUsers ?? '—'} icon={<Users className="w-5 h-5" />} color="purple" />
            <KpiCard title="Завершили онбординг" value={onb?.fullyCompleted ?? '—'} icon={<BookOpen className="w-5 h-5" />} color="green" />
            <KpiCard title="Процент завершения" value={onb?.completionRate ? `${onb.completionRate}%` : '—'} icon={<TrendingUp className="w-5 h-5" />} color={onb?.completionRate >= 30 ? 'green' : 'orange'} />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Прохождение шагов квеста</p>
              <div className="space-y-3">
                {(onb?.steps || []).map((step: any) => (
                  <div key={step.step} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 font-medium">{step.step.replace(/_/g,' ')}</span>
                      <span className="text-gray-900 font-bold">{step.completed} <span className="text-gray-400">({step.pct}%)</span></span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div className="bg-purple-500 rounded-full h-2 transition-all" style={{ width: `${step.pct}%` }} />
                    </div>
                    {step.medianMinutes !== null && (
                      <p className="text-xs text-gray-400">Медиана: {step.medianMinutes < 60 ? `${step.medianMinutes} мин` : `${Math.round(step.medianMinutes / 60)} ч`}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Retention: онбординг завершён vs нет</p>
              <div className="space-y-4 mt-6">
                {(onb?.retention || []).map((r: any) => (
                  <div key={String(r.completedOnboarding)} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        {r.completedOnboarding ? '✅ Завершили онбординг' : '⏸ Не завершили'}
                      </span>
                      <span className="font-bold text-gray-900">{r.retentionRate}% активны 30д</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-3">
                      <div
                        className={`${r.completedOnboarding ? 'bg-green-500' : 'bg-gray-400'} rounded-full h-3`}
                        style={{ width: `${r.retentionRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{r.active30d} из {r.total} активны</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Feature Adoption ── */}
      {tab === 'features' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Feature Adoption</h2>
            <DateRangePicker value={featRange} onChange={setFeatRange} />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Топ фич по использованию</p>
              <div className="space-y-2">
                {(feat?.byType || []).slice(0, 10).map((row: any) => {
                  const max = feat?.byType?.[0]?.count || 1
                  return (
                    <div key={row.type} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-36 shrink-0 truncate">{ftLabel(row.type)}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-purple-500 rounded-full h-2" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-8 text-right">{row.count}</span>
                      <span className="text-xs text-gray-400 w-14 text-right">{row.uniqueUsers} польз.</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Первые 7 дней нового пользователя</p>
              <div className="space-y-2">
                {(feat?.newUserBehavior || []).slice(0, 10).map((row: any) => {
                  const max = feat?.newUserBehavior?.[0]?.count || 1
                  return (
                    <div key={row.type} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-36 shrink-0 truncate">{ftLabel(row.type)}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 rounded-full h-2" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-8 text-right">{row.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Платные vs бесплатные */}
          {feat?.byPlan?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <p className="text-sm font-bold text-gray-700 mb-4">Платные vs бесплатные — что используют</p>
              <div className="grid grid-cols-2 gap-6">
                {[true, false].map(isPaid => {
                  const rows = (feat.byPlan || []).filter((r: any) => r.isPaid === isPaid).slice(0, 8)
                  const max = rows[0]?.count || 1
                  return (
                    <div key={String(isPaid)}>
                      <p className={`text-xs font-bold mb-2 ${isPaid ? 'text-green-600' : 'text-gray-500'}`}>
                        {isPaid ? '💳 Платные' : '🆓 Бесплатные'}
                      </p>
                      <div className="space-y-1.5">
                        {rows.map((row: any) => (
                          <div key={row.type} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-32 shrink-0 truncate">{ftLabel(row.type)}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className={`${isPaid ? 'bg-green-500' : 'bg-gray-400'} rounded-full h-1.5`} style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                            </div>
                            <span className="text-xs font-bold text-gray-700 w-6">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── M1-M4 Feature Adoption ── */}
      {tab === 'm14' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">Адопшн фич M1-M4</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Проверка ДЗ с ИИ · Аналитика · Календарь · Библиотека с тегами
              </p>
            </div>
            <DateRangePicker value={m14Range} onChange={setM14Range} />
          </div>

          {!m14 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400">
              Считаем метрики...
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-400">
                Всего учителей в системе: <span className="font-bold text-gray-700">{m14.totalTeachers}</span>
                {' · '}процент адопшна = уникальные учителя / всего учителей
              </div>

              {/* === M1 === */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  M1 · Проверка работ (с ИИ-черновиком)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard
                    title={`Оценок поставлено за ${m14.days}д`}
                    value={m14.m1.gradedCount}
                    icon={<CheckCircle className="w-5 h-5" />}
                    color="green"
                  />
                  <KpiCard
                    title="С текстовым фидбеком"
                    value={`${m14.m1.withFeedbackCount}`}
                    sub={`${m14.m1.withFeedbackPct}% от всех оценок`}
                    icon={<Sparkles className="w-5 h-5" />}
                    color="purple"
                  />
                  <KpiCard
                    title="Учителя-пользователи"
                    value={m14.m1.uniqueTeachers}
                    sub={`${m14.m1.adoptionPct}% адопшн`}
                    icon={<Users className="w-5 h-5" />}
                    color={m14.m1.adoptionPct >= 30 ? 'green' : 'orange'}
                  />
                  <KpiCard
                    title="Среднее/день"
                    value={m14.days > 0 ? Math.round(m14.m1.gradedCount / m14.days) : 0}
                    icon={<Activity className="w-5 h-5" />}
                    color="blue"
                  />
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <p className="text-sm font-bold text-gray-700 mb-4">Проверки по дням</p>
                  {m14.m1.daily.length === 0 ? (
                    <div className="text-center text-gray-400 text-xs py-8">Нет данных за период</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={m14.m1.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: any) => new Date(v).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                        />
                        <YAxis tick={{ fontSize: 10 }} width={30} allowDecimals={false} />
                        <Tooltip
                          formatter={(v: any) => [v, 'оценок']}
                          labelFormatter={(v: any) => new Date(v).toLocaleDateString('ru')}
                        />
                        <Bar dataKey="graded" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

              {/* === M2 === */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <BarChart2 className="w-4 h-4 text-indigo-600" />
                  M2 · Аналитика ученика/класса
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <KpiCard
                    title="Учеников готовы для risk-скоринга"
                    value={m14.m2.eligibleStudents}
                    sub="≥3 оценок — можно показывать тренд и статус"
                    icon={<Users className="w-5 h-5" />}
                    color="blue"
                  />
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
                    <p className="font-semibold mb-1">⚠ Прямого трекинга просмотров нет</p>
                    <p className="opacity-80">{m14.m2.note}. Чтобы измерять реальное посещение страниц аналитики — нужно добавить событийный трекинг (не в этой итерации).</p>
                  </div>
                </div>
              </section>

              {/* === M3 === */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  M3 · Расписание и календарь
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard
                    title="Уроков в расписании"
                    value={m14.m3.scheduledLessons}
                    sub={`${m14.m3.schedulePct}% от всех уроков`}
                    icon={<Calendar className="w-5 h-5" />}
                    color={m14.m3.schedulePct >= 20 ? 'green' : 'orange'}
                  />
                  <KpiCard
                    title="Привязано к классу"
                    value={m14.m3.withClass}
                    sub={`из ${m14.m3.scheduledLessons} запланированных`}
                    icon={<Users className="w-5 h-5" />}
                    color="blue"
                  />
                  <KpiCard
                    title="Учителя-пользователи"
                    value={m14.m3.uniqueTeachers}
                    sub={`${m14.m3.adoptionPct}% адопшн`}
                    icon={<Users className="w-5 h-5" />}
                    color={m14.m3.adoptionPct >= 20 ? 'green' : 'orange'}
                  />
                  <KpiCard
                    title="Ближайшие 7 дней"
                    value={m14.m3.upcoming7d}
                    sub={`${m14.m3.upcomingTeachers7d} учителей`}
                    icon={<Activity className="w-5 h-5" />}
                    color="purple"
                  />
                </div>
              </section>

              {/* === M4 === */}
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Tag className="w-4 h-4 text-purple-600" />
                  M4 · Библиотека с тегами
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard
                    title="Уроков с тегами"
                    value={m14.m4.taggedLessons}
                    sub={`${m14.m4.tagPct}% от всех уроков`}
                    icon={<Tag className="w-5 h-5" />}
                    color={m14.m4.tagPct >= 20 ? 'green' : 'orange'}
                  />
                  <KpiCard
                    title="Тегов на урок (avg)"
                    value={m14.m4.avgTagsPerLesson}
                    icon={<BarChart2 className="w-5 h-5" />}
                    color="blue"
                  />
                  <KpiCard
                    title="Учителя-пользователи"
                    value={m14.m4.uniqueTeachers}
                    sub={`${m14.m4.adoptionPct}% адопшн`}
                    icon={<Users className="w-5 h-5" />}
                    color={m14.m4.adoptionPct >= 20 ? 'green' : 'orange'}
                  />
                  <KpiCard
                    title="Уникальных тегов (топ)"
                    value={m14.m4.topTags.length}
                    sub="в топ-20"
                    icon={<Sparkles className="w-5 h-5" />}
                    color="purple"
                  />
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <p className="text-sm font-bold text-gray-700 mb-3">Топ-20 тегов платформы</p>
                  {m14.m4.topTags.length === 0 ? (
                    <div className="text-center text-gray-400 text-xs py-6">Пока ни одного тега</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {m14.m4.topTags.map((t: any) => (
                        <span
                          key={t.tag}
                          className="inline-flex items-center gap-1 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-md"
                        >
                          #{t.tag}
                          <span className="text-purple-400 text-[10px] font-bold ml-0.5">{t.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
