'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  Trophy, CheckCircle, Users, AlertTriangle, Clock, FileText,
  TrendingUp, TrendingDown, Minus, Download, Compass, School,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar,
} from 'recharts'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiData {
  avgGrade: number | null
  avgGradeDelta: number | null
  onTimePct: number | null
  onTimeDelta: number | null
  activeStudents: number
  totalStudents: number
  engagementPct: number
  watchCount: number
  riskCount: number
  avgSubmitDays: number | null
  avgSubmitDaysDelta: number | null
  materialsThisPeriod: number
  materialsTotal: number
}

interface GradeTrendPoint { month: string; currentScore: number | null; prevScore: number | null }
interface GradeDist { total: number; fives: number; fours: number; threes: number; twos: number }
interface HeatmapData { weeks: string[]; classes: Array<{ id: string; name: string; weeks: number[] }> }
interface TopicItem { topic: string; difficulty: number; total: number }
interface WeekdayItem { day: string; count: number }
interface MaterialItem { lessonId: string; title: string; className: string; avgGrade: number; submittedPct: number; avgDays: number | null }
interface ClassItem { id: string; name: string; initials: string; studentsCount: number; avgGrade: number | null; onTimePct: number | null; trend: number[]; direction: string }
interface StudentItem { id: string; name: string; classId?: string; className: string; avgGrade: number; submittedPct: number; onTimePct?: number | null; trend: number[]; direction: string; level?: string }
interface LevelDist { total: number; excellent: number; good: number; average: number; risk: number }
interface StudentDyn { up: number; flat: number; down: number }

interface OverviewData {
  range: string
  kpi: KpiData
  gradeTrend: GradeTrendPoint[]
  gradeDistribution: GradeDist
  heatmap: HeatmapData
  topicDifficulty: TopicItem[]
  submissionTimesByWeekday: WeekdayItem[]
  topMaterials: MaterialItem[]
  classComparison: ClassItem[]
  bestStudents: StudentItem[]
  watchStudents: StudentItem[]
  levelDistribution: LevelDist
  studentDynamics: StudentDyn
  classes: Array<{ id: string; name: string }>
}

interface LeaderboardData {
  total: number
  page: number
  pageSize: number
  items: Array<{ id: string; name: string; classId: string; className: string; avgGrade: number; submittedPct: number; trend: number[]; direction: string }>
}

type Range = 'week' | 'month' | 'semester' | 'year'
type MainTab = 'classes' | 'students'

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsPageV2() {
  const menu = useMobileMenu()
  const tour = useTour()
  const [range, setRange] = useState<Range>('month')
  const [classId, setClassId] = useState('')
  const [filter, setFilter] = useState<'all' | 'problems' | 'growing'>('all')
  const [mainTab, setMainTab] = useState<MainTab>('classes')
  const [lbPage, setLbPage] = useState(1)

  const overviewKey = `/analytics/overview-v2?range=${range}${classId ? `&classId=${classId}` : ''}`
  const lbKey = `/analytics/students-leaderboard?range=${range}${classId ? `&classId=${classId}` : ''}&page=${lbPage}&pageSize=20`

  const { data: ov } = useSWR<OverviewData>(overviewKey, fetcher)
  const { data: lb } = useSWR<LeaderboardData>(lbKey, fetcher)

  const filteredClasses = useMemo(() => {
    if (!ov?.classComparison) return []
    if (filter === 'problems') return ov.classComparison.filter(c => c.direction === 'down' || (c.avgGrade !== null && c.avgGrade < 3.7))
    if (filter === 'growing') return ov.classComparison.filter(c => c.direction === 'up')
    return ov.classComparison
  }, [ov?.classComparison, filter])

  const totalClasses = ov?.classes?.length ?? 0
  const totalStudents = ov?.kpi?.totalStudents ?? 0

  const RANGES: { key: Range; label: string }[] = [
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'semester', label: 'Семестр' },
    { key: 'year', label: 'Год' },
  ]

  return (
    <>
      <Topbar
        title="Аналитика"
        subtitle="Как идут дела у классов и каждого ученика"
        onMobileMenuToggle={menu.toggle}
        hideSearch
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={tour.start}
              className="h-8 px-3 hidden md:flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Тур
            </button>
            <div data-tour="range-picker" className="hidden md:flex bg-ink-100 rounded-full p-[3px] gap-[2px]">
              {RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    'h-[30px] px-3.5 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap',
                    range === r.key
                      ? 'bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                      : 'text-ink-600 hover:text-ink-900',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                if (!ov) return
                const rows: string[][] = [['Показатель', 'Значение']]
                rows.push(['Средняя оценка', String(ov.kpi.avgGrade ?? '—')])
                rows.push(['Активные ученики', String(ov.kpi.activeStudents)])
                rows.push(['Всего учеников', String(ov.kpi.totalStudents)])
                rows.push(['Сдано вовремя %', String(ov.kpi.onTimePct ?? '—')])
                rows.push(['Вовлечённость %', String(ov.kpi.engagementPct)])
                rows.push(['Под наблюдением', String(ov.kpi.riskCount)])
                rows.push([])
                rows.push(['Классы', 'Ср. оценка', 'Вовремя %', 'Учеников'])
                for (const c of (ov.classComparison ?? [])) {
                  rows.push([c.name, String(c.avgGrade ?? '—'), String(c.onTimePct ?? '—'), String(c.studentsCount)])
                }
                rows.push([])
                rows.push(['Ученики', 'Класс', 'Ср. оценка', 'Сдано %'])
                for (const s of [...(ov.bestStudents ?? []), ...(ov.watchStudents ?? [])]) {
                  rows.push([s.name, s.className, String(s.avgGrade), String(s.submittedPct)])
                }
                const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `analytics_${range}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink-700 bg-surface border border-ink-200 hover:bg-ink-50 hover:border-ink-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Скачать отчёт</span>
            </button>
          </div>
        }
      />

      <div className="max-w-[1280px] w-full mx-auto p-6 max-md:p-4">

        {/* ── Период-пикер на мобильных (в topbar скрыт) ── */}
        <div className="md:hidden flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex bg-ink-100 rounded-full p-[3px] gap-[2px]">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'h-[30px] px-3.5 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap',
                  range === r.key
                    ? 'bg-white text-ink-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                    : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Фильтры ── */}
        <div data-tour="filters" className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="relative inline-flex items-center">
            <select
              value={classId}
              onChange={e => { setClassId(e.target.value); setLbPage(1) }}
              className="appearance-none h-9 pl-4 pr-9 bg-surface border border-ink-200 rounded-full text-[13px] font-semibold text-ink-700 cursor-pointer hover:bg-ink-50 hover:border-ink-300 transition-all focus:outline-none focus:border-brand-300"
            >
              <option value="">Все классы</option>
              {(ov?.classes ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3.5 top-1/2 w-[7px] h-[7px] border-r border-b border-ink-500 rotate-45 -translate-y-[65%]" />
          </div>

          <FilterPill
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Только проблемные"
            active={filter === 'problems'}
            onClick={() => setFilter(f => f === 'problems' ? 'all' : 'problems')}
          />
          <FilterPill
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label="Только растущие"
            active={filter === 'growing'}
            onClick={() => setFilter(f => f === 'growing' ? 'all' : 'growing')}
          />
        </div>

        {/* ── KPI Grid ── */}
        <div data-tour="kpi" className="grid grid-cols-6 gap-3.5 mb-6 max-xl:grid-cols-3 max-sm:grid-cols-2">
          <KpiCard
            icon={<Trophy className="w-[15px] h-[15px]" />}
            iconBg="bg-brand-50" iconColor="text-brand-600"
            label="Средний балл"
            value={ov?.kpi?.avgGrade != null ? ov.kpi.avgGrade.toFixed(1).replace('.', ',') : '—'}
            delta={ov?.kpi?.avgGradeDelta != null ? `${ov.kpi.avgGradeDelta > 0 ? '+' : ''}${ov.kpi.avgGradeDelta.toFixed(1).replace('.', ',')} за месяц` : undefined}
            deltaDir={ov?.kpi?.avgGradeDelta != null ? (ov.kpi.avgGradeDelta > 0 ? 'up' : ov.kpi.avgGradeDelta < 0 ? 'down' : 'flat') : 'flat'}
          />
          <KpiCard
            icon={<CheckCircle className="w-[15px] h-[15px]" />}
            iconBg="bg-[#F0FDF4]" iconColor="text-[#15803D]"
            label="Сдают вовремя"
            value={ov?.kpi?.onTimePct != null ? `${ov.kpi.onTimePct}%` : '—'}
            delta={ov?.kpi?.onTimeDelta != null ? `${ov.kpi.onTimeDelta > 0 ? '+' : ''}${ov.kpi.onTimeDelta}% за неделю` : undefined}
            deltaDir={ov?.kpi?.onTimeDelta != null ? (ov.kpi.onTimeDelta > 0 ? 'up' : ov.kpi.onTimeDelta < 0 ? 'down' : 'flat') : 'flat'}
          />
          <KpiCard
            icon={<Users className="w-[15px] h-[15px]" />}
            iconBg="bg-[#EFF6FF]" iconColor="text-[#1D4ED8]"
            label="Активные ученики"
            value={ov ? `${ov.kpi.activeStudents}` : '—'}
            valueSuffix={ov ? `/${ov.kpi.totalStudents}` : undefined}
            delta={ov ? `${ov.kpi.engagementPct}% вовлечённость` : undefined}
            deltaDir="flat"
          />
          <KpiCard
            icon={<AlertTriangle className="w-[15px] h-[15px]" />}
            iconBg="bg-warning-50" iconColor="text-warning-700"
            label="Под наблюдением"
            value={ov?.kpi?.watchCount != null ? String(ov.kpi.watchCount) : '—'}
            delta={ov ? `из ${ov.kpi.totalStudents} учеников` : undefined}
            deltaDir="flat"
          />
          <KpiCard
            icon={<Clock className="w-[15px] h-[15px]" />}
            iconBg="bg-[#FDF4FF]" iconColor="text-[#A21CAF]"
            label="Среднее время сдачи"
            value={ov?.kpi?.avgSubmitDays != null ? ov.kpi.avgSubmitDays.toFixed(1).replace('.', ',') : '—'}
            valueSuffix={ov?.kpi?.avgSubmitDays != null ? ' дня' : undefined}
            delta={
              ov?.kpi?.avgSubmitDaysDelta != null
                ? ov.kpi.avgSubmitDaysDelta < 0
                  ? `Быстрее на ${Math.abs(ov.kpi.avgSubmitDaysDelta).toFixed(1)} дня`
                  : `Медленнее на ${ov.kpi.avgSubmitDaysDelta.toFixed(1)} дня`
                : undefined
            }
            deltaDir={ov?.kpi?.avgSubmitDaysDelta != null ? (ov.kpi.avgSubmitDaysDelta < 0 ? 'up' : ov.kpi.avgSubmitDaysDelta > 0 ? 'down' : 'flat') : 'flat'}
          />
          <KpiCard
            icon={<FileText className="w-[15px] h-[15px]" />}
            iconBg="bg-[#ECFDF5]" iconColor="text-[#047857]"
            label="Материалов создано"
            value={ov?.kpi?.materialsThisPeriod != null ? String(ov.kpi.materialsThisPeriod) : '—'}
            delta={ov ? `за период · ${ov.kpi.materialsTotal} всего` : undefined}
            deltaDir="flat"
          />
        </div>

        {/* ── Main Tabs ── */}
        <div data-tour="tabs" className="flex gap-1 border-b border-ink-200 mb-6">
          {([
            { key: 'classes' as MainTab, label: 'По классам', count: totalClasses, Icon: School },
            { key: 'students' as MainTab, label: 'По ученикам', count: totalStudents, Icon: Users },
          ] as const).map(({ key, label, count, Icon }) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              className={cn(
                'relative px-[18px] pt-3.5 pb-4 font-bold text-[15px] flex items-center gap-2 transition-colors',
                mainTab === key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[11px] font-bold',
                mainTab === key ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600',
              )}>
                {count}
              </span>
              {mainTab === key && (
                <span className="absolute bottom-[-1px] left-[14px] right-[14px] h-[2.5px] bg-brand-500 rounded-[2px]" />
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════ */}
        {/*           ВКЛАДКА: ПО КЛАССАМ             */}
        {/* ══════════════════════════════════════════ */}
        {mainTab === 'classes' && (
          <div>
            {/* Ряд 1: Тренд + Распределение */}
            <div className="grid grid-cols-12 gap-4 mb-4">
              <div data-tour="grade-trend" className="col-span-8 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                  <div>
                    <h2 className="text-[16px] font-bold text-ink-900">Динамика среднего балла</h2>
                    <div className="text-[12px] text-ink-500 mt-0.5">По всем классам · последние 6 месяцев</div>
                  </div>
                  <div className="flex gap-3.5 text-[12px] text-ink-600 flex-shrink-0">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-[2.5px] bg-brand-500 rounded-sm" />
                      Этот период
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-[2px] bg-ink-400 rounded-sm" />
                      Прошлый
                    </span>
                  </div>
                </div>
                <GradeTrendChart data={ov?.gradeTrend ?? []} />
              </div>

              <div className="col-span-4 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Распределение оценок</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Все работы за период</div>
                </div>
                <GradeDonut dist={ov?.gradeDistribution} />
              </div>
            </div>

            {/* Ряд 2: Heatmap + Сложность тем */}
            <div className="grid grid-cols-12 gap-4 mb-4">
              <div className="col-span-7 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Вовлечённость по неделям</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">% учеников каждого класса, сдавших работы вовремя</div>
                </div>
                <HeatmapChart heatmap={ov?.heatmap} />
              </div>

              <div className="col-span-5 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Сложность тем</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">% учеников с трудностями</div>
                </div>
                <TopicDifficultyBars topics={ov?.topicDifficulty ?? []} />
              </div>
            </div>

            {/* Ряд 3: Когда сдают + Топ материалов */}
            <div className="grid grid-cols-12 gap-4 mb-4">
              <div className="col-span-5 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Когда сдают</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Активность учеников по дням недели</div>
                </div>
                <WeekdayBarsChart data={ov?.submissionTimesByWeekday ?? []} />
              </div>

              <div className="col-span-7 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5 min-w-0">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Топ материалов</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Лучшие по среднему баллу учеников</div>
                </div>
                <MaterialsList items={ov?.topMaterials ?? []} />
              </div>
            </div>

            {/* Ряд 4: Сравнение классов */}
            <div data-tour="class-comparison" className="bg-surface border border-ink-200 rounded-xl p-5">
              <div className="mb-4">
                <h2 className="text-[16px] font-bold text-ink-900">Сравнение классов</h2>
                <div className="text-[12px] text-ink-500 mt-0.5">Где растут, где буксуют</div>
              </div>
              <ClassComparisonList classes={filteredClasses} />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════ */}
        {/*          ВКЛАДКА: ПО УЧЕНИКАМ             */}
        {/* ══════════════════════════════════════════ */}
        {mainTab === 'students' && (
          <div>
            {/* Ряд 1: Лучшие + Под наблюдением */}
            <div className="grid grid-cols-12 gap-4 mb-4">
              <div data-tour="best-students" className="col-span-6 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900 flex items-center gap-2">
                    <Trophy className="w-[18px] h-[18px] text-[#15803D]" />
                    Лучшие ученики
                  </h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Топ по успеваемости за период</div>
                </div>
                <StudentDataList students={ov?.bestStudents ?? []} variant="good" />
              </div>

              <div data-tour="watch-students" className="col-span-6 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900 flex items-center gap-2">
                    <AlertTriangle className="w-[18px] h-[18px] text-warning-700" />
                    Под наблюдением
                  </h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Ученики, кому нужно особое внимание</div>
                </div>
                <StudentDataList students={ov?.watchStudents ?? []} variant="watch" />
                {(ov?.watchStudents?.length ?? 0) > 0 && (
                  <div className="mt-3.5 p-3.5 rounded-xl text-[13px] text-ink-700 flex gap-3 items-start leading-snug" style={{ background: 'linear-gradient(165deg,#EEF2FF 0%,#fff 60%)', border: '1px solid #C7D2FE' }}>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>ИИ</span>
                    <span>У учеников из списка снижение несколько недель подряд. Рекомендую: индивидуальный план уроков.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Ряд 2: Все ученики — рейтинг */}
            <div data-tour="leaderboard" className="bg-surface border border-ink-200 rounded-xl p-5 mb-4">
              <div className="mb-4">
                <h2 className="text-[16px] font-bold text-ink-900">Все ученики · рейтинг</h2>
                <div className="text-[12px] text-ink-500 mt-0.5">{lb?.total ?? 0} учеников · сортировка по среднему баллу</div>
              </div>
              <StudentLeaderboard data={lb} onPageChange={setLbPage} />
            </div>

            {/* Ряд 3: Уровни + Динамика */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Распределение по уровням</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Все ученики · средний балл за период</div>
                </div>
                <LevelDistribution dist={ov?.levelDistribution} />
              </div>

              <div className="col-span-6 max-lg:col-span-12 bg-surface border border-ink-200 rounded-xl p-5">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-ink-900">Динамика по ученикам</h2>
                  <div className="text-[12px] text-ink-500 mt-0.5">Сколько растут / падают / стабильны</div>
                </div>
                <StudentDynamicsChart dyn={ov?.studentDynamics} total={totalStudents} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── FilterPill ────────────────────────────────────────────────────────────────

function FilterPill({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold border transition-all whitespace-nowrap',
        active
          ? 'bg-brand-50 border-brand-300 text-brand-800'
          : 'bg-surface border-ink-200 text-ink-700 hover:bg-ink-50 hover:border-ink-300',
      )}
    >
      <span className={cn('opacity-70', active && 'opacity-100')}>{icon}</span>
      {label}
    </button>
  )
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, iconColor, label, value, valueSuffix, delta, deltaDir }: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: string
  valueSuffix?: string
  delta?: string
  deltaDir?: 'up' | 'down' | 'flat'
}) {
  return (
    <div className="bg-surface border border-ink-200 rounded-xl p-[18px_20px] hover:border-ink-300 hover:shadow-sm hover:-translate-y-px transition-all">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-500 mb-2.5">
        <span className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', iconBg, iconColor)}>
          {icon}
        </span>
        {label}
      </div>
      <div className="font-display font-extrabold text-[30px] leading-none text-ink-900 tnum mb-1.5 tracking-[-0.02em]">
        {value}
        {valueSuffix && <span className="text-[18px] text-ink-500 font-semibold">{valueSuffix}</span>}
      </div>
      {delta && (
        <div className={cn(
          'text-[12px] font-semibold inline-flex items-center gap-1',
          deltaDir === 'up' ? 'text-[#15803D]' : deltaDir === 'down' ? 'text-danger-700' : 'text-ink-500',
        )}>
          {deltaDir === 'up' && <TrendingUp className="w-3 h-3" />}
          {deltaDir === 'down' && <TrendingDown className="w-3 h-3" />}
          {delta}
        </div>
      )}
    </div>
  )
}

// ─── GradeTrendChart (Line) ────────────────────────────────────────────────────

function GradeTrendChart({ data }: { data: GradeTrendPoint[] }) {
  const hasData = data.some(d => d.currentScore != null)
  const placeholder = [
    { month: 'Янв', currentScore: 3.8, prevScore: 3.5 },
    { month: 'Фев', currentScore: 4.0, prevScore: 3.7 },
    { month: 'Мар', currentScore: 4.2, prevScore: 3.9 },
    { month: 'Апр', currentScore: 4.1, prevScore: 4.0 },
    { month: 'Май', currentScore: 4.4, prevScore: 4.1 },
    { month: 'Июн', currentScore: 4.3, prevScore: 4.0 },
  ]
  const chartData = hasData ? data : placeholder

  return (
    <div className="relative h-[220px]">
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-[12px] text-ink-400 font-medium bg-surface/80 px-3 py-1 rounded-full">Нет данных — пример</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 25 }}>
          <CartesianGrid stroke="var(--ink-100, #F1F5F9)" strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--ink-400, #94A3B8)', fontFamily: 'inherit' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[2, 5]}
            ticks={[2, 3, 4, 5]}
            tick={{ fontSize: 11, fill: 'var(--ink-400, #94A3B8)', fontFamily: 'inherit' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#0F172A',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              fontSize: 12,
              padding: '6px 12px',
            }}
            itemStyle={{ color: 'white' }}
            labelStyle={{ color: '#94A3B8', fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="prevScore"
            stroke="#94A3B8"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            name="Прошлый"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="currentScore"
            stroke="var(--brand-500, #FF7E58)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'white', stroke: 'var(--brand-500, #FF7E58)', strokeWidth: 2.5 }}
            activeDot={{ r: 5, fill: 'var(--brand-500, #FF7E58)' }}
            name="Этот период"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── GradeDonut (SVG) ─────────────────────────────────────────────────────────

function GradeDonut({ dist }: { dist?: GradeDist }) {
  const total = dist?.total ?? 0
  const segments = [
    { value: dist?.fives ?? 0, color: 'var(--success-500, #22C55E)', label: 'Отлично (5)' },
    { value: dist?.fours ?? 0, color: '#34D399', label: 'Хорошо (4)' },
    { value: dist?.threes ?? 0, color: 'var(--warning-500, #F59E0B)', label: 'Удовл. (3)' },
    { value: dist?.twos ?? 0, color: 'var(--danger-500, #EF4444)', label: 'Неуд. (2)' },
  ]
  const circumference = 2 * Math.PI * 40
  let offset = 0

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 100 100" width={150} height={150} style={{ transform: 'rotate(-90deg)' }}>
          {total === 0 ? (
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ink-100,#F1F5F9)" strokeWidth="14" />
          ) : (
            segments.map((seg, i) => {
              const dash = total > 0 ? (seg.value / total) * circumference : 0
              const el = (
                <circle
                  key={i}
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += dash
              return el
            })
          )}
        </svg>
        <div className="absolute text-center pointer-events-none">
          <div className="font-display font-extrabold text-[26px] text-ink-900 tnum leading-none">{total}</div>
          <div className="text-[11px] text-ink-500 uppercase tracking-[0.04em] font-semibold mt-0.5">работ</div>
        </div>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-ink-700 flex-1 min-w-0 truncate">{seg.label}</span>
            <span className="font-bold text-ink-900 tnum">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── HeatmapChart ────────────────────────────────────────────────────────────

const HEAT_COLORS = [
  'var(--ink-100,#F1F5F9)',
  '#FFE3D9',
  '#FFC7B3',
  '#FF8E69',
  'var(--brand-500,#FF7E58)',
  'var(--brand-700,#CC5533)',
]

function HeatmapChart({ heatmap }: { heatmap?: HeatmapData }) {
  const weeks = heatmap?.weeks ?? Array.from({ length: 12 }, (_, i) => `Н${i + 1}`)
  const classes = heatmap?.classes ?? []

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1 items-center min-w-[380px]"
          style={{ gridTemplateColumns: `70px repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          <div />
          {weeks.map(w => (
            <div key={w} className="text-center text-[10px] text-ink-400 font-medium">{w}</div>
          ))}
          {classes.length === 0 ? (
            <div className="col-span-full text-center py-6 text-[13px] text-ink-400">Нет данных</div>
          ) : (
            classes.map(cls => (
              <>
                <div key={`lbl-${cls.id}`} className="text-[12px] font-semibold text-ink-700 text-right pr-2 truncate">{cls.name}</div>
                {cls.weeks.map((level, wi) => (
                  <div
                    key={`${cls.id}-${wi}`}
                    className="rounded aspect-square cursor-pointer hover:scale-[1.15] hover:z-10 hover:shadow-md transition-transform"
                    style={{ background: HEAT_COLORS[Math.min(5, Math.max(0, level))] }}
                    title={`${cls.name} · ${weeks[wi]}: уровень ${level}`}
                  />
                ))}
              </>
            ))
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4 text-[11px] text-ink-500">
        <span>меньше</span>
        {HEAT_COLORS.map((c, i) => (
          <span key={i} className="w-3.5 h-3.5 rounded-[3px]" style={{ background: c }} />
        ))}
        <span>больше</span>
      </div>
    </div>
  )
}

// ─── TopicDifficultyBars ──────────────────────────────────────────────────────

function TopicDifficultyBars({ topics }: { topics: TopicItem[] }) {
  if (!topics.length) {
    return <div className="py-8 text-center text-[13px] text-ink-400">Нет данных</div>
  }
  return (
    <div className="flex flex-col gap-3">
      {topics.map((t, i) => {
        const color = t.difficulty >= 60 ? 'var(--danger-500,#EF4444)' : t.difficulty >= 40 ? 'var(--warning-500,#F59E0B)' : 'var(--success-500,#22C55E)'
        return (
          <div key={i} className="grid gap-3 items-center" style={{ gridTemplateColumns: 'minmax(80px,130px) 1fr 44px' }}>
            <span className="text-[13px] text-ink-700 truncate">{t.topic}</span>
            <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${t.difficulty}%`, background: color }} />
            </div>
            <span className="text-right text-[13px] font-bold text-ink-900 tnum">{t.difficulty}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── WeekdayBarsChart ─────────────────────────────────────────────────────────

function WeekdayBarsChart({ data }: { data: WeekdayItem[] }) {
  const max = Math.max(1, ...data.map(d => d.count))
  if (!data.length) {
    return <div className="py-8 text-center text-[13px] text-ink-400">Нет данных</div>
  }
  return (
    <div>
      <div className="grid gap-2.5 items-end h-[160px]" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
        {data.map((d, i) => {
          const h = d.count > 0 ? Math.max(8, Math.round((d.count / max) * 100)) : 4
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[12px] font-bold text-ink-700 tnum">{d.count}</span>
              <div
                className="w-full max-w-[40px] rounded-t-[6px] cursor-pointer hover:opacity-85 transition-opacity"
                style={{ height: `${h}%`, background: 'linear-gradient(180deg,var(--brand-500,#FF7E58),var(--brand-300,#FFBCAA))' }}
              />
              <span className="text-[11px] font-semibold text-ink-500">{d.day}</span>
            </div>
          )
        })}
      </div>
      <div className="text-[12px] text-ink-500 mt-3">
        {(() => {
          const peak = data.reduce((a, b) => b.count > a.count ? b : a, data[0])
          return peak?.count > 0 ? <>Пик сдач — <b className="text-ink-900">{peak.day}</b>.</> : null
        })()}
      </div>
    </div>
  )
}

// ─── MaterialsList ────────────────────────────────────────────────────────────

function MaterialsList({ items }: { items: MaterialItem[] }) {
  if (!items.length) {
    return <div className="py-8 text-center text-[13px] text-ink-400">Нет материалов с оценками за период</div>
  }
  return (
    <div className="overflow-x-auto">
    <div className="divide-y divide-ink-100 min-w-[440px]">
      {items.map((m, i) => {
        const isGood = m.avgGrade >= 4.5
        const isWarn = m.avgGrade < 3.7
        return (
          <div key={i} className="grid gap-3.5 py-3 px-1 hover:bg-ink-50 rounded-sm transition-colors cursor-pointer items-center"
            style={{ gridTemplateColumns: '40px minmax(0,1fr) 70px 70px 90px' }}
          >
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0',
              isGood ? 'bg-[#F0FDF4] text-[#15803D]' : isWarn ? 'bg-warning-50 text-warning-700' : 'bg-brand-50 text-brand-700',
            )}>
              📄
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[14px] text-ink-900 truncate">{m.title}</div>
              <div className="text-[12px] text-ink-500 truncate">{m.className}</div>
            </div>
            <div className={cn('font-display font-bold text-[15px] tnum', isGood ? 'text-[#15803D]' : isWarn ? 'text-warning-700' : 'text-ink-900')}>
              {m.avgGrade.toFixed(1)}
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">балл</div>
            </div>
            <div className="font-display font-bold text-[15px] tnum text-ink-900">
              {m.submittedPct}%
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">сдали</div>
            </div>
            <DirectionBadge dir={isGood ? 'up' : isWarn ? 'warn' : 'flat'} />
          </div>
        )
      })}
    </div>
    </div>
  )
}

// ─── ClassComparisonList ──────────────────────────────────────────────────────

function ClassComparisonList({ classes }: { classes: ClassItem[] }) {
  if (!classes.length) {
    return <div className="py-8 text-center text-[13px] text-ink-400">Нет классов</div>
  }
  return (
    <div className="overflow-x-auto">
    <div className="divide-y divide-ink-100 min-w-[440px]">
      {classes.map(cls => {
        const gradeColor = cls.avgGrade != null && cls.avgGrade < 3.7
          ? (cls.avgGrade < 3 ? 'text-danger-700' : 'text-warning-700')
          : 'text-ink-900'
        const initColor = cls.direction === 'down' ? 'bg-danger-50 text-danger-700' : cls.direction === 'up' ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-brand-50 text-brand-700'

        return (
          <div
            key={cls.id}
            className="grid gap-3.5 py-3 px-1 items-center hover:bg-ink-50 rounded-sm transition-colors cursor-pointer"
            style={{ gridTemplateColumns: '40px minmax(0,1fr) 70px 70px minmax(80px,110px) 88px' }}
          >
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0', initColor)}>
              {cls.initials}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[14px] text-ink-900 truncate">{cls.name}</div>
              <div className="text-[12px] text-ink-500">{cls.studentsCount} учеников</div>
            </div>
            <div className={cn('font-display font-bold text-[15px] tnum', gradeColor)}>
              {cls.avgGrade != null ? cls.avgGrade.toFixed(1) : '—'}
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">балл</div>
            </div>
            <div className={cn('font-display font-bold text-[15px] tnum', cls.onTimePct != null && cls.onTimePct >= 85 ? 'text-[#15803D]' : cls.onTimePct != null && cls.onTimePct < 75 ? 'text-warning-700' : 'text-ink-900')}>
              {cls.onTimePct != null ? `${cls.onTimePct}%` : '—'}
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">вовремя</div>
            </div>
            <TrendBar values={cls.trend} />
            <DirectionBadge dir={cls.direction} />
          </div>
        )
      })}
    </div>
    </div>
  )
}

// ─── StudentDataList (shared for best + watch) ────────────────────────────────

function StudentDataList({ students, variant }: { students: StudentItem[]; variant: 'good' | 'watch' }) {
  if (!students.length) {
    return <div className="py-6 text-center text-[13px] text-ink-400">Нет данных за период</div>
  }

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  return (
    <div className="overflow-x-auto">
    <div className="divide-y divide-ink-100 min-w-[440px]">
      {students.map(st => {
        const avatarClass = variant === 'good'
          ? 'bg-[#F0FDF4] text-[#15803D]'
          : st.level === 'risk'
            ? 'bg-danger-50 text-danger-700'
            : 'bg-warning-50 text-warning-700'
        const gradeColor = variant === 'good'
          ? 'text-[#15803D]'
          : st.avgGrade < 3 ? 'text-danger-700' : 'text-warning-700'
        const pctColor = variant === 'watch' && st.submittedPct < 70 ? 'text-warning-700' : 'text-ink-900'

        return (
          <div
            key={st.id}
            className="grid gap-3.5 py-3 px-1 items-center hover:bg-ink-50 rounded-sm transition-colors cursor-pointer"
            style={{ gridTemplateColumns: '40px minmax(0,1fr) 70px 70px minmax(80px,110px) 88px' }}
          >
            <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0', avatarClass)}>
              {initials(st.name)}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[14px] text-ink-900 truncate">{st.name}</div>
              <div className="text-[12px] text-ink-500 truncate">{st.className}</div>
            </div>
            <div className={cn('font-display font-bold text-[15px] tnum', gradeColor)}>
              {st.avgGrade > 0 ? st.avgGrade.toFixed(1) : '—'}
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">балл</div>
            </div>
            <div className={cn('font-display font-bold text-[15px] tnum', pctColor)}>
              {st.submittedPct}%
              <div className="text-[10px] uppercase tracking-wide font-semibold text-ink-500 font-sans">сдали</div>
            </div>
            <TrendBar values={st.trend} dimColor={variant === 'watch' && (st.level === 'risk' || st.direction === 'down')} />
            <DirectionBadge dir={st.direction} />
          </div>
        )
      })}
    </div>
    </div>
  )
}

// ─── StudentLeaderboard ───────────────────────────────────────────────────────

function StudentLeaderboard({ data, onPageChange }: { data?: LeaderboardData; onPageChange: (p: number) => void }) {
  if (!data?.items?.length) {
    return <div className="py-8 text-center text-[13px] text-ink-400">Нет учеников за выбранный период</div>
  }

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  const hasMore = data.total > data.page * data.pageSize

  return (
    <>
      <div className="overflow-x-auto">
      <div className="divide-y divide-ink-100 min-w-[440px]">
        {data.items.map(st => {
          const avatarClass = st.avgGrade >= 4.5
            ? 'bg-[#F0FDF4] text-[#15803D]'
            : st.avgGrade < 3 ? 'bg-danger-50 text-danger-700' : st.avgGrade < 3.7 ? 'bg-warning-50 text-warning-700' : 'bg-brand-50 text-brand-700'
          const gradeColor = st.avgGrade >= 4.5 ? 'text-[#15803D]' : st.avgGrade < 3 ? 'text-danger-700' : st.avgGrade < 3.7 ? 'text-warning-700' : 'text-ink-900'

          return (
            <div
              key={st.id}
              className="grid gap-3.5 py-3 px-1 items-center hover:bg-ink-50 rounded-sm transition-colors cursor-pointer"
              style={{ gridTemplateColumns: '40px minmax(0,1fr) 70px 70px minmax(80px,110px) 88px' }}
            >
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0', avatarClass)}>
                {initials(st.name)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[14px] text-ink-900 truncate">{st.name}</div>
                <div className="text-[12px] text-ink-500 truncate">{st.className}</div>
              </div>
              <div className={cn('font-display font-bold text-[15px] tnum', gradeColor)}>
                {st.avgGrade > 0 ? st.avgGrade.toFixed(1) : '—'}
              </div>
              <div className="font-display font-bold text-[15px] tnum text-ink-900">{st.submittedPct}%</div>
              <TrendBar values={st.trend} />
              <DirectionBadge dir={st.direction} short />
            </div>
          )
        })}
      </div>
      </div>
      {hasMore && (
        <div className="text-center pt-3.5 border-t border-ink-100 mt-2">
          <button
            onClick={() => onPageChange(data.page + 1)}
            className="h-8 px-4 text-[13px] font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 rounded-lg transition-colors"
          >
            Показать ещё {data.total - data.page * data.pageSize} учеников
          </button>
        </div>
      )}
    </>
  )
}

// ─── LevelDistribution (Donut) ────────────────────────────────────────────────

function LevelDistribution({ dist }: { dist?: LevelDist }) {
  const total = dist?.total ?? 0
  const segments = [
    { value: dist?.excellent ?? 0, color: 'var(--success-500,#22C55E)', label: 'Отличники (4,5+)' },
    { value: dist?.good ?? 0, color: '#34D399', label: 'Хорошисты (3,5–4,5)' },
    { value: dist?.average ?? 0, color: 'var(--warning-500,#F59E0B)', label: 'Удовл. (3–3,5)' },
    { value: dist?.risk ?? 0, color: 'var(--danger-500,#EF4444)', label: 'В риске (<3)' },
  ]
  const circumference = 2 * Math.PI * 40
  let offset = 0

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 100 100" width={150} height={150} style={{ transform: 'rotate(-90deg)' }}>
          {total === 0 ? (
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ink-100,#F1F5F9)" strokeWidth="14" />
          ) : (
            segments.map((seg, i) => {
              const dash = total > 0 ? (seg.value / total) * circumference : 0
              const el = (
                <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={seg.color} strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference}`} strokeDashoffset={-offset} />
              )
              offset += dash
              return el
            })
          )}
        </svg>
        <div className="absolute text-center pointer-events-none">
          <div className="font-display font-extrabold text-[26px] text-ink-900 tnum leading-none">{total || (dist?.excellent ?? 0) + (dist?.good ?? 0) + (dist?.average ?? 0) + (dist?.risk ?? 0)}</div>
          <div className="text-[11px] text-ink-500 uppercase tracking-[0.04em] font-semibold mt-0.5">учеников</div>
        </div>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-ink-700 flex-1 min-w-0 truncate">{seg.label}</span>
            <span className="font-bold text-ink-900 tnum">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── StudentDynamicsChart ─────────────────────────────────────────────────────

function StudentDynamicsChart({ dyn, total }: { dyn?: StudentDyn; total: number }) {
  const up = dyn?.up ?? 0
  const flat = dyn?.flat ?? 0
  const down = dyn?.down ?? 0
  const grand = up + flat + down || 1
  const bars = [
    { label: 'Растут', Icon: TrendingUp, color: 'var(--success-500,#22C55E)', value: up, pct: Math.round((up / grand) * 100), textColor: 'text-[#15803D]' },
    { label: 'Стабильно', Icon: Minus, color: 'var(--ink-400,#94A3B8)', value: flat, pct: Math.round((flat / grand) * 100), textColor: 'text-ink-600' },
    { label: 'Падают', Icon: TrendingDown, color: 'var(--danger-500,#EF4444)', value: down, pct: Math.round((down / grand) * 100), textColor: 'text-danger-700' },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 mb-4">
        {bars.map((b, i) => (
          <div key={i} className="grid gap-3 items-center" style={{ gridTemplateColumns: 'minmax(80px,130px) 1fr 44px' }}>
            <span className={cn('text-[13px] flex items-center gap-1.5', b.textColor)}>
              <b.Icon className="w-3.5 h-3.5" />
              {b.label}
            </span>
            <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${b.pct}%`, background: b.color }} />
            </div>
            <span className="text-right text-[13px] font-bold text-ink-900 tnum">{b.value}</span>
          </div>
        ))}
      </div>
      {up > 0 && (
        <div className="mt-1 p-3.5 rounded-xl text-[13px] text-ink-700 flex gap-3 items-start leading-snug" style={{ background: 'linear-gradient(165deg,#EEF2FF 0%,#fff 60%)', border: '1px solid #C7D2FE' }}>
          <span className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>ИИ</span>
          <span>За период <b>+{dyn?.up ?? 0}</b> учеников показали рост успеваемости.</span>
        </div>
      )}
    </div>
  )
}

// ─── TrendBar ─────────────────────────────────────────────────────────────────

function TrendBar({ values, dimColor = false }: { values: number[]; dimColor?: boolean }) {
  const max = Math.max(5, ...values)
  const barColor = dimColor ? 'var(--ink-300,#CBD5E1)' : 'var(--brand-300,#FFBCAA)'
  return (
    <div className="flex gap-[2px] items-end h-6">
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: v > 0 ? `${Math.round((v / max) * 100)}%` : '10%',
            background: v > 0 ? barColor : 'var(--ink-200,#E2E8F0)',
            borderRadius: '2px 2px 0 0',
            display: 'inline-block',
          }}
        />
      ))}
    </div>
  )
}

// ─── DirectionBadge ───────────────────────────────────────────────────────────

function DirectionBadge({ dir, short = false }: { dir: string; short?: boolean }) {
  if (dir === 'up') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F0FDF4] text-[#15803D] whitespace-nowrap">
        {short ? '↑' : '↑ Растёт'}
      </span>
    )
  }
  if (dir === 'down') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-danger-50 text-danger-700 whitespace-nowrap">
        {short ? '↓' : '↓ Падает'}
      </span>
    )
  }
  if (dir === 'warn') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-warning-50 text-warning-700 whitespace-nowrap">
        Сложно
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-ink-100 text-ink-600 whitespace-nowrap">
      {short ? '→' : '→ Стабильно'}
    </span>
  )
}
