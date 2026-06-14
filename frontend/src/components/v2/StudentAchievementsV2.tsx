'use client'

import useSWR from 'swr'
import { Trophy, Flame, Star, Zap, BookOpen, Award, Lock, Target, type LucideIcon } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { IconTile, IconTileColor } from '@/components/ui/v2/IconTile'
import { Badge } from '@/components/ui/v2/Badge'
import { cn } from '@/lib/utils/cn'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface BackendAchievement {
    key: string
    title: string
    description: string
    category: string
    iconKey: string
    color: IconTileColor
    xpReward: number
    target: number
    progress: number
    unlocked: boolean
    unlockedAt: string | null
}

interface GamificationProgress {
    xp: number
    level: number
    nextLevelXp: number
    currentLevelStartXp: number
    progressToNextLevel: number
    streakDays: number
    bestStreakDays: number
    counts: { submitted: number; graded: number; perfect: number }
    achievements: BackendAchievement[]
}

const ICON_MAP: Record<string, LucideIcon> = {
    trophy: Trophy,
    flame: Flame,
    star: Star,
    zap: Zap,
    'book-open': BookOpen,
    award: Award,
    target: Target,
}

export default function StudentAchievementsV2() {
    const menu = useStudentMobileMenu()
    const { data, isLoading } = useSWR<GamificationProgress>('/gamification/me', fetcher)

    const achievements = data?.achievements ?? []
    const earned = achievements.filter(a => a.unlocked)

    return (
        <>
            <Topbar
                title="Достижения"
                subtitle={`${earned.length} из ${achievements.length} открыто`}
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Level card */}
                <Card padding="lg" className="mb-6"
                      style={{ background: 'linear-gradient(135deg, var(--brand-50), #fff)', borderColor: 'var(--brand-200)' }}>
                    <div className="flex items-center gap-6 max-md:flex-col max-md:items-start">
                        <span className="w-20 h-20 rounded-full text-white font-display font-extrabold text-[28px] flex items-center justify-center flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}>
                            {data?.level ?? 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="text-[11px] uppercase font-bold tracking-wider text-brand-700 mb-1">
                                Уровень {data?.level ?? 1}
                            </div>
                            <h2 className="font-display font-bold text-[22px] text-ink-900">
                                {levelTitle(data?.level ?? 1)}
                            </h2>
                            <p className="text-[13px] text-ink-600 mt-1 tnum">
                                {data?.xp ?? 0} / {data?.nextLevelXp ?? 500} XP до следующего уровня
                            </p>
                            <div className="h-2 bg-white rounded-full mt-3 overflow-hidden border border-brand-200">
                                <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                                     style={{ width: `${data?.progressToNextLevel ?? 0}%` }} />
                            </div>
                        </div>
                    </div>
                </Card>

                {/* KPI */}
                <div className="grid grid-cols-3 gap-4 mb-6 max-md:grid-cols-1">
                    <KpiTile icon={<Flame className="w-4 h-4 text-amber-500" />} color="warning" label="Стрик"
                             value={`${data?.streakDays ?? 0} дн.`} sub={data?.bestStreakDays ? `рекорд ${data.bestStreakDays} дн.` : undefined} />
                    <KpiTile icon={<Star className="w-4 h-4 text-amber-500" />}  color="brand"   label="Всего XP"
                             value={data?.xp ?? 0} />
                    <KpiTile icon={<Trophy className="w-4 h-4" />}                color="success" label="Ачивок открыто"
                             value={earned.length} />
                </div>

                {/* Achievements grid */}
                <h2 className="font-display font-bold text-[18px] text-ink-900 mb-4">Все достижения</h2>
                {isLoading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : achievements.length === 0 ? (
                    <Card padding="lg" className="text-center">
                        <Trophy className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">Каталог ещё не загружен</h3>
                        <p className="text-[13px] text-ink-500">Попробуйте обновить страницу через минуту.</p>
                    </Card>
                ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {achievements.map(a => <AchievementCard key={a.key} a={a} />)}
                    </div>
                )}
            </div>
        </>
    )
}

function AchievementCard({ a }: { a: BackendAchievement }) {
    const Icon = ICON_MAP[a.iconKey] || Trophy
    const pct = a.target ? Math.min(100, Math.round((a.progress / a.target) * 100)) : 0
    return (
        <Card padding="md" className={cn('flex flex-col gap-2', !a.unlocked && 'opacity-70')}>
            <div className="flex items-start gap-3">
                {a.unlocked ? (
                    <IconTile color={a.color} size="md"><Icon className="w-[18px] h-[18px]" /></IconTile>
                ) : (
                    <span className="w-9 h-9 rounded-md bg-ink-100 text-ink-400 inline-flex items-center justify-center flex-shrink-0">
                        <Lock className="w-4 h-4" />
                    </span>
                )}
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-ink-900 truncate">{a.title}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5">{a.description}</div>
                </div>
                {a.unlocked && <Badge variant="success">+{a.xpReward} XP</Badge>}
            </div>
            {!a.unlocked && a.target > 0 && (
                <>
                    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-ink-500 tnum text-right">{a.progress} / {a.target}</div>
                </>
            )}
        </Card>
    )
}

function KpiTile({ icon, color, label, value, sub }: { icon: React.ReactNode; color: IconTileColor; label: string; value: number | string; sub?: string }) {
    return (
        <Card padding="md">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                <IconTile size="sm" color={color}>{icon}</IconTile>
                <span className="truncate">{label}</span>
            </div>
            <div className="font-display font-extrabold text-[24px] text-ink-900 tnum leading-none">{value}</div>
            {sub && <div className="text-[11px] text-ink-500 mt-1">{sub}</div>}
        </Card>
    )
}

function levelTitle(level: number): string {
    if (level >= 30) return 'Гранд-мастер'
    if (level >= 20) return 'Мастер'
    if (level >= 10) return 'Эксперт'
    if (level >= 5)  return 'Ученик-чемпион'
    return 'Новичок'
}
