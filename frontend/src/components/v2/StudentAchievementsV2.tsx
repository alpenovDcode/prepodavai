'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Lock, Medal, Compass } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

// ─── Types ────────────────────────────────────────────────────────────────────

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
type AchStatus = 'unlocked' | 'progress' | 'locked'
type FilterStatus = 'all' | AchStatus

interface AchievementItem {
  id: string
  title: string
  description: string
  category: string
  emoji: string
  rarity: Rarity
  xpReward: number
  status: AchStatus
  progress?: { current: number; target: number }
  unlockedAt?: string | null
}

interface StreakCard {
  id: string
  emoji: string
  current: number
  unit: string
  label: string
  sub: string
  color: 'fire' | 'star' | 'perfect' | 'bolt'
}

interface GamificationData {
  name: string
  level: number
  xp: number
  xpInLevel: number
  xpForNextLevel: number
  progressToNextLevel: number
  rank: string
  nextRank?: { label: string; atLevel: number } | null
  streakDays: number
  achievementsUnlocked: number
  achievementsTotal: number
  classRank: number
  streaks: StreakCard[]
  achievements: AchievementItem[]
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  streak:  { emoji: '🔥', label: 'Стрики и постоянство' },
  grade:   { emoji: '⭐', label: 'Оценки и баллы' },
  subject: { emoji: '📚', label: 'Объём работы' },
  game:    { emoji: '🎯', label: 'Точность и скорость' },
  social:  { emoji: '💎', label: 'Редкие и секретные' },
}

const CATEGORY_ORDER = ['streak', 'grade', 'subject', 'game', 'social']

// ─── Rarity labels ───────────────────────────────────────────────────────────

const RARITY_LABEL: Record<Rarity, string> = {
  common:    'обычная',
  rare:      'редкая',
  epic:      'эпическая',
  legendary: 'легендарная',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU')
}

// ─── Streak card color classes ───────────────────────────────────────────────

const STREAK_ICO_BG: Record<StreakCard['color'], string> = {
  fire:    'background: linear-gradient(135deg, #FED7AA, #FB923C)',
  star:    'background: linear-gradient(135deg, #FEF3C7, #FBBF24)',
  perfect: 'background: linear-gradient(135deg, #D1FAE5, #34D399)',
  bolt:    'background: linear-gradient(135deg, #DBEAFE, #60A5FA)',
}

// ─── Medal background by category ────────────────────────────────────────────

function medalBg(category: string): string {
  switch (category) {
    case 'streak':  return 'background: linear-gradient(135deg, #FED7AA, #F97316)'
    case 'grade':   return 'background: linear-gradient(135deg, #FEF3C7, #FBBF24)'
    case 'subject': return 'background: linear-gradient(135deg, #EDE9FE, #A78BFA)'
    case 'game':    return 'background: linear-gradient(135deg, #DBEAFE, #60A5FA)'
    case 'social':  return 'background: linear-gradient(135deg, #FECDD3, #FB7185)'
    default:        return 'background: linear-gradient(135deg, #F1F5F9, #CBD5E1)'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentAchievementsV2() {
  const menu = useStudentMobileMenu()
  const tour = useTour()
  const { data, isLoading } = useSWR<GamificationData>('/gamification/me', fetcher)
  const [filter, setFilter] = useState<FilterStatus>('all')

  const achievements = data?.achievements ?? []
  const streaks = data?.streaks ?? []

  const counts = {
    all:      achievements.length,
    unlocked: achievements.filter((a) => a.status === 'unlocked').length,
    progress: achievements.filter((a) => a.status === 'progress').length,
    locked:   achievements.filter((a) => a.status === 'locked').length,
  }

  const filtered = filter === 'all' ? achievements : achievements.filter((a) => a.status === filter)

  // Group by category in predefined order
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: filtered.filter((a) => a.category === cat),
  })).filter((g) => g.items.length > 0)

  const pct = data
    ? Math.min(100, Math.round((data.xpInLevel / Math.max(1, data.xpForNextLevel)) * 100))
    : 0

  const initials = data?.name ? getInitials(data.name) : '??'

  return (
    <>
      <Topbar
        title="Достижения"
        subtitle="Собирайте награды, прокачивайте уровень, обгоняйте одноклассников"
        onMobileMenuToggle={menu.toggle}
        notificationsAudience="student"
        hideSearch
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={tour.start}
              className="h-9 px-3 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors inline-flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" />
              Тур
            </button>
            {data?.streakDays ? (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold"
                style={{ background: 'var(--brand-50)', color: 'var(--brand-700)', border: '1px solid var(--brand-200)' }}
              >
                <span>🔥</span>
                <span>{data.streakDays} дней подряд</span>
              </div>
            ) : null}
          </div>
        }
      />

      <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">

        {/* ── Hero уровня ──────────────────────────────────────────── */}
        <div
          data-tour="hero"
          className="rounded-2xl p-8 mb-7 relative overflow-hidden max-md:p-5"
          style={{
            background: 'linear-gradient(135deg, #1A120C 0%, #2D1F15 50%, #4A2F1E 100%)',
            boxShadow: '0 18px 50px rgba(26,20,12,.22)',
          }}
        >
          {/* radial overlays */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 18% 25%, rgba(249,115,22,.32), transparent 40%), ' +
                'radial-gradient(circle at 85% 75%, rgba(245,158,11,.22), transparent 38%)',
            }}
          />

          <div className="relative grid gap-7 max-md:grid-cols-1" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            {/* Avatar */}
            <div
              className="w-24 h-24 rounded-[28px] flex items-center justify-center font-display font-extrabold text-[32px] text-white relative flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #F97316, #EA580C)',
                boxShadow: '0 12px 32px rgba(249,115,22,.4), inset 0 -3px 0 rgba(0,0,0,.15)',
                letterSpacing: '-0.02em',
              }}
            >
              {initials}
              <span
                className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-full flex items-center justify-center font-black text-sm"
                style={{
                  background: 'linear-gradient(135deg, #FCD34D, #F59E0B)',
                  color: '#7C2D12',
                  border: '3px solid #1A120C',
                  boxShadow: '0 4px 12px rgba(245,158,11,.4)',
                }}
              >
                {data?.level ?? 1}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-[0.08em] uppercase mb-1.5" style={{ color: '#FBBF24' }}>
                ★ {data?.rank ?? 'Новичок'}
              </div>
              <h2
                className="font-display font-extrabold text-[28px] text-white mb-3.5"
                style={{ letterSpacing: '-0.02em' }}
              >
                Уровень {data?.level ?? 1} · {fmt(data?.xp ?? 0)} опыта
              </h2>

              <div className="flex items-center justify-between mb-2 text-[13px]" style={{ color: 'rgba(255,255,255,.6)' }}>
                <span>До {(data?.level ?? 1) + 1} уровня</span>
                <span>
                  <b className="text-white">{fmt(data?.xpInLevel ?? 0)}</b>
                  {' / '}
                  {fmt(data?.xpForNextLevel ?? 500)} XP
                </span>
              </div>

              <div
                className="h-2.5 rounded-full overflow-hidden relative"
                style={{ background: 'rgba(255,255,255,.08)' }}
              >
                <div
                  className="h-full rounded-full relative transition-all"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, #F97316, #FBBF24)',
                    boxShadow: '0 0 16px rgba(249,115,22,.5)',
                  }}
                >
                  <span
                    className="absolute -right-0.5 -top-0.5 w-3.5 h-3.5 bg-white rounded-full"
                    style={{ boxShadow: '0 0 12px rgba(255,255,255,.6)' }}
                  />
                </div>
              </div>

              {data?.nextRank && (
                <div className="text-xs mt-2" style={{ color: 'rgba(255,255,255,.5)' }}>
                  Следующий ранг:{' '}
                  <b style={{ color: '#FBBF24' }}>{data.nextRank.label}</b> на {data.nextRank.atLevel} уровне
                </div>
              )}
            </div>

            {/* Stats */}
            <div
              className="flex gap-5 px-5 py-3.5 items-center self-center max-md:hidden"
              style={{
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: '12px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <LvlStat value={data?.achievementsUnlocked ?? 0} label="наград" />
              <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,.08)' }} />
              <LvlStat value={data?.achievementsTotal ?? 0} label="всего" />
              <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,.08)' }} />
              <LvlStat value={<><Medal className="w-4 h-4 inline" />{data?.classRank ?? 1}</>} label="место в классе" />
            </div>
          </div>
        </div>

        {/* ── Стрики ────────────────────────────────────────────────── */}
        {streaks.length > 0 && (
          <div data-tour="streaks" className="grid gap-3.5 mb-7" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {streaks.map((s) => (
              <div
                key={s.id}
                className="bg-white flex items-center gap-3.5 p-4 rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ border: '1px solid var(--ink-200)' }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-[26px] leading-none flex-shrink-0"
                  style={{ [STREAK_ICO_BG[s.color].split(':')[0]]: STREAK_ICO_BG[s.color].split(': ')[1] } as React.CSSProperties}
                >
                  {s.emoji}
                </div>
                <div>
                  <div
                    className="font-display font-extrabold text-[28px] leading-none tnum"
                    style={{ color: 'var(--ink-900)', letterSpacing: '-0.02em' }}
                  >
                    {s.current}{' '}
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink-500)' }}>{s.unit}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--ink-500)' }}>{s.label} · {s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Фильтры ───────────────────────────────────────────────── */}
        <div data-tour="filters" className="flex gap-2 flex-wrap mb-5">
          {(
            [
              { key: 'all',      label: 'Все' },
              { key: 'unlocked', label: '✓ Получено' },
              { key: 'progress', label: '↻ В процессе' },
              { key: 'locked',   label: '🔒 Заблокировано' },
            ] as { key: FilterStatus; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-2 h-[38px] px-4 rounded-full font-semibold text-[13px] transition-all',
                filter === key
                  ? 'border'
                  : 'bg-white border hover:bg-[var(--ink-50)] hover:border-[var(--ink-300)]',
              )}
              style={
                filter === key
                  ? { background: 'var(--brand-50)', borderColor: 'var(--brand-300)', color: 'var(--brand-800)' }
                  : { borderColor: 'var(--ink-200)', color: 'var(--ink-700)' }
              }
            >
              {label}
              <span
                className="px-2 py-px rounded-full text-[11px] font-bold"
                style={
                  filter === key
                    ? { background: 'var(--brand-100)', color: 'var(--brand-700)' }
                    : { background: 'var(--ink-100)', color: 'var(--ink-600)' }
                }
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* ── Секции по категориям ─────────────────────────────────── */}
        <div data-tour="achievements">
        {isLoading ? (
          <div className="text-center py-20" style={{ color: 'var(--ink-400)' }}>Загрузка…</div>
        ) : byCategory.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--ink-400)' }}>Нет ачивок в этом фильтре</div>
        ) : (
          byCategory.map(({ cat, items }) => {
            const meta = CATEGORY_META[cat] ?? { emoji: '🏆', label: cat }
            const totalInCat = achievements.filter((a) => a.category === cat).length
            const unlockedInCat = achievements.filter((a) => a.category === cat && a.status === 'unlocked').length
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mt-7 mb-3.5">
                  <h3
                    className="font-display font-bold text-[18px] flex items-center gap-2"
                    style={{ color: 'var(--ink-900)' }}
                  >
                    <span className="text-[22px] leading-none">{meta.emoji}</span>
                    {meta.label}
                  </h3>
                  <span className="text-xs" style={{ color: 'var(--ink-500)' }}>
                    {unlockedInCat} из {totalInCat} получено
                  </span>
                </div>

                <div
                  className="grid gap-3.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
                >
                  {items.map((a) => (
                    <AchCard key={a.id} a={a} />
                  ))}
                </div>
              </div>
            )
          })
        )}
        </div>
      </div>
    </>
  )
}

// ─── LvlStat ─────────────────────────────────────────────────────────────────

function LvlStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="text-center">
      <div
        className="font-display font-extrabold text-[24px] leading-none tnum text-white inline-flex items-center gap-1.5"
      >
        {value}
      </div>
      <div
        className="text-[11px] uppercase tracking-[0.06em] font-semibold mt-1.5"
        style={{ color: 'rgba(255,255,255,.5)' }}
      >
        {label}
      </div>
    </div>
  )
}

// ─── AchCard ─────────────────────────────────────────────────────────────────

function AchCard({ a }: { a: AchievementItem }) {
  const pct = a.progress
    ? Math.min(100, Math.round((a.progress.current / Math.max(1, a.progress.target)) * 100))
    : 0

  const isUnlocked = a.status === 'unlocked'
  const isProgress = a.status === 'progress'
  const isLocked   = a.status === 'locked'

  const hasProgressBar = (isProgress || isLocked) && !!a.progress && a.progress.current > 0 && a.progress.target < 9000

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden transition-all hover:-translate-y-[3px] hover:shadow-md',
        isLocked && 'opacity-55',
      )}
      style={{
        background: 'white',
        border: '1px solid var(--ink-200)',
        padding: '18px 16px 14px',
      }}
    >
      {/* Rarity tag */}
      <span
        className="absolute top-2.5 left-2.5 text-[9px] font-black uppercase tracking-[0.06em] px-1.5 py-px rounded-sm"
        style={rarityStyle(a.rarity)}
      >
        {RARITY_LABEL[a.rarity]}
      </span>

      {/* XP tag */}
      <span
        className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-px rounded-full"
        style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }}
      >
        ★ {fmt(a.xpReward)}
      </span>

      {/* Lock overlay (locked state) */}
      {isLocked && (
        <div
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full flex items-center justify-center z-10"
          style={{ background: 'var(--ink-700)', color: 'white' }}
        >
          <Lock className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Medal */}
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-[32px] leading-none relative',
          isLocked && 'grayscale',
        )}
        style={{ [medalBg(a.category).split(':')[0]]: medalBg(a.category).split(': ')[1] } as React.CSSProperties}
      >
        {a.emoji}
        {isUnlocked && (
          <span
            className="absolute inset-[-6px] rounded-full"
            style={{
              border: '3px solid transparent',
              background: 'linear-gradient(135deg, #FCD34D, #F97316) border-box',
              WebkitMask: 'linear-gradient(white 0 0) content-box, linear-gradient(white 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        )}
      </div>

      {/* Title */}
      <h4
        className="font-display font-bold text-[14px] text-center leading-[1.3] mb-1"
        style={{ color: isLocked ? 'var(--ink-500)' : 'var(--ink-900)' }}
      >
        {a.title}
      </h4>

      {/* Description */}
      <div
        className="text-[12px] text-center leading-[1.45] mb-2.5"
        style={{ color: 'var(--ink-500)', minHeight: '32px' }}
      >
        {a.description}
      </div>

      {/* Unlocked date */}
      {isUnlocked && (
        <div className="text-center">
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full inline-block"
            style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}
          >
            Получено {a.unlockedAt ? formatDate(a.unlockedAt) : ''}
          </span>
        </div>
      )}

      {/* Progress bar (in-progress or locked with partial progress) */}
      {hasProgressBar && (
        <>
          <div
            className="h-1.5 rounded-full overflow-hidden mt-2"
            style={{ background: 'var(--ink-100)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #F97316, #FBBF24)',
              }}
            />
          </div>
          <div
            className="text-[11px] font-semibold text-center mt-1.5 tnum"
            style={{ color: 'var(--ink-500)' }}
          >
            {fmt(a.progress!.current)} / {fmt(a.progress!.target)}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Rarity styles ───────────────────────────────────────────────────────────

function rarityStyle(rarity: Rarity): React.CSSProperties {
  switch (rarity) {
    case 'common':    return { background: '#E5E7EB', color: '#4B5563' }
    case 'rare':      return { background: '#DBEAFE', color: '#1D4ED8' }
    case 'epic':      return { background: '#F3E8FF', color: '#7E22CE' }
    case 'legendary': return { background: 'linear-gradient(135deg, #FEF3C7, #FBBF24)', color: '#92400E' }
  }
}
