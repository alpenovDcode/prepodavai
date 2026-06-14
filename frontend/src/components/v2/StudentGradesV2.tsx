'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    Trophy, CheckCircle, Hourglass, Star, TrendingUp, Award, Flame, MessageSquare, Compass,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'

import { useTour } from '@/lib/tour/useTour'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface BySubject {
    subject: string
    gradesCount: number
    pendingCount: number
    avgGrade: number
}

interface PendingItem {
    id: string
    title: string
    type: string
    subject: string
    submittedAt: string
}

interface GradedItem {
    id: string
    title: string
    type: string
    subject: string
    grade: number
    gradedAt: string
    feedback: string | null
}

interface GradesData {
    avgGrade: number
    monthDelta: number | null
    submittedCount: number
    totalAssignments: number
    pendingCount: number
    xp: number
    xpToNextLevel: number
    streakDays: number
    bySubject: BySubject[]
    pending: PendingItem[]
    graded: GradedItem[]
    newAchievement?: { id: string; title: string; xp: number; description: string }
}

function relativeDate(iso: string): string {
    const now = Date.now()
    const diff = now - new Date(iso).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'сегодня'
    if (days === 1) return 'вчера'
    if (days < 7) return `${days} дня назад`
    if (days < 14) return 'неделю назад'
    if (days < 21) return '2 недели назад'
    if (days < 28) return '3 недели назад'
    return 'больше месяца назад'
}

function gradeBoxStyle(g: number) {
    if (g >= 5) return 'linear-gradient(135deg, var(--success-500), #047857)'
    if (g >= 4) return 'linear-gradient(135deg, #34D399, var(--success-500))'
    if (g >= 3) return 'linear-gradient(135deg, #FBBF24, var(--warning-500))'
    return 'linear-gradient(135deg, #F87171, var(--danger-500))'
}

function barColor(avg: number): string {
    if (avg >= 4) return 'var(--success-500)'
    if (avg >= 3.5) return 'var(--warning-500)'
    return 'var(--danger-500)'
}

function barTextColor(avg: number): string {
    if (avg >= 4) return 'var(--success-700)'
    if (avg >= 3.5) return 'var(--warning-700)'
    return 'var(--danger-700)'
}

export default function StudentGradesV2() {
    const menu = useStudentMobileMenu()
    const tour = useTour()
    const router = useRouter()
    const { data, isLoading } = useSWR<GradesData>('/students/me/grades', fetcher)

    const d = data ?? null

    const streakDays = d?.streakDays ?? 0
    const gradedCount = d?.graded.length ?? 0

    const xpChip = (
        <div
            className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-[13px] font-bold"
            style={{
                background: 'linear-gradient(135deg, #FFFBEB, #FFFFFF)',
                border: '1px solid #FCD34D',
                color: 'var(--warning-700)',
            }}
        >
            <span
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #DC2626)' }}
            >
                <Flame className="w-3 h-3" />
            </span>
            {streakDays} дней подряд
        </div>
    )

    return (
        <>
            <Topbar
                title="Мои оценки"
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" leftIcon={<Compass size={14} />} onClick={tour.start}>
                            Тур
                        </Button>
                        {xpChip}
                    </div>
                }
            />

            <div className="max-w-[1100px] w-full mx-auto p-8 max-md:p-4">

                {/* Achievement strip */}
                {d?.newAchievement && (
                    <div
                        className="flex items-center gap-4 rounded-lg mb-5 p-[18px_22px]"
                        style={{
                            background: 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 70%)',
                            border: '1px solid #FCD34D',
                        }}
                    >
                        <div
                            className="w-12 h-12 rounded-md flex items-center justify-center text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #F59E0B, #DC2626)' }}
                        >
                            <Award className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-extrabold text-ink-900 text-[15px]">
                                Новая ачивка: «{d.newAchievement.title}»
                            </div>
                            <div className="text-[12px] text-ink-600 mt-0.5">
                                {d.newAchievement.description}.{' '}
                                Бонус:{' '}
                                <strong style={{ color: 'var(--warning-700)' }}>
                                    +{d.newAchievement.xp} XP
                                </strong>
                            </div>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => router.push('/student/achievements')}
                        >
                            Посмотреть
                        </Button>
                    </div>
                )}

                {/* KPI grid */}
                <div data-tour="kpi" className="grid grid-cols-4 gap-4 mb-6 max-md:grid-cols-2">
                    {/* Средний балл */}
                    <div className="bg-surface border border-ink-200 rounded-lg p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[13px] text-ink-500">
                            <IconTile color="brand" size="sm">
                                <Trophy className="w-4 h-4" />
                            </IconTile>
                            Средний балл
                        </div>
                        <div
                            className="font-display font-extrabold text-[32px] text-ink-900 leading-tight tnum"
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            {d?.avgGrade ? d.avgGrade.toFixed(1).replace('.', ',') : '—'}
                        </div>
                        {d?.monthDelta != null ? (
                            <div className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--success-700)' }}>
                                <TrendingUp className="w-3 h-3" />
                                +{d.monthDelta.toFixed(1).replace('.', ',')} за месяц
                            </div>
                        ) : (
                            <div className="text-[12px] text-ink-500">за семестр</div>
                        )}
                    </div>

                    {/* Сдано работ */}
                    <div className="bg-surface border border-ink-200 rounded-lg p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[13px] text-ink-500">
                            <IconTile color="success" size="sm">
                                <CheckCircle className="w-4 h-4" />
                            </IconTile>
                            Сдано работ
                        </div>
                        <div
                            className="font-display font-extrabold text-[32px] text-ink-900 leading-tight tnum"
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            {d?.submittedCount ?? 0}
                        </div>
                        <div className="text-[12px] text-ink-500">
                            из {d?.totalAssignments ?? 0} заданий за семестр
                        </div>
                    </div>

                    {/* На проверке */}
                    <div className="bg-surface border border-ink-200 rounded-lg p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[13px] text-ink-500">
                            <IconTile color="warning" size="sm">
                                <Hourglass className="w-4 h-4" />
                            </IconTile>
                            На проверке
                        </div>
                        <div
                            className="font-display font-extrabold text-[32px] text-ink-900 leading-tight tnum"
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            {d?.pendingCount ?? 0}
                        </div>
                        <div className="text-[12px] text-ink-500">оценка появится скоро</div>
                    </div>

                    {/* Опыт */}
                    <div className="bg-surface border border-ink-200 rounded-lg p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[13px] text-ink-500">
                            <span
                                className="w-7 h-7 rounded inline-flex items-center justify-center"
                                style={{ background: '#FEF3C7', color: '#92400E' }}
                            >
                                <Star className="w-4 h-4" />
                            </span>
                            Опыт
                        </div>
                        <div
                            className="font-display font-extrabold text-[32px] text-ink-900 leading-tight tnum"
                            style={{ letterSpacing: '-0.02em' }}
                        >
                            {d?.xp ?? 0}
                        </div>
                        <div className="text-[12px] text-ink-500">
                            до следующего уровня: {d?.xpToNextLevel ?? 0}
                        </div>
                    </div>
                </div>

                {/* По предметам */}
                <div data-tour="by-subject">
                <SectionHead
                    title="По предметам"
                    subtitle="Твой средний балл по каждому предмету"
                />
                <div className="mb-7">
                    {isLoading ? (
                        <div className="text-[13px] text-ink-500 py-4">Загрузка…</div>
                    ) : (d?.bySubject ?? []).length === 0 ? (
                        <div className="text-[13px] text-ink-500 py-4">Нет данных</div>
                    ) : (
                        (d?.bySubject ?? []).map((s) => (
                            <div
                                key={s.subject}
                                className="bg-surface border border-ink-200 rounded-md mb-2 grid items-center gap-4"
                                style={{ padding: '14px 18px', gridTemplateColumns: '1fr 140px 80px' }}
                            >
                                <div>
                                    <div className="font-bold text-ink-900 text-[14px]">{s.subject}</div>
                                    <div className="text-[12px] text-ink-500 mt-0.5">
                                        {s.gradesCount} оценок
                                        {s.pendingCount > 0 ? ` · ${s.pendingCount} на проверке` : ''}
                                    </div>
                                </div>
                                <div
                                    className="rounded-full overflow-hidden"
                                    style={{ height: 8, background: 'var(--ink-100)' }}
                                >
                                    <div
                                        style={{
                                            width: `${Math.min(100, (s.avgGrade / 5) * 100)}%`,
                                            height: '100%',
                                            background: barColor(s.avgGrade),
                                            borderRadius: '9999px',
                                        }}
                                    />
                                </div>
                                <div
                                    className="font-display font-extrabold text-[22px] text-right tnum"
                                    style={{ color: barTextColor(s.avgGrade) }}
                                >
                                    {s.avgGrade > 0 ? s.avgGrade.toFixed(1).replace('.', ',') : '—'}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                </div>

                {/* Ждут оценки */}
                <div data-tour="pending">
                <SectionHead
                    title="Ждут оценки"
                    subtitle="Учитель скоро проверит"
                />
                <div className="mb-7">
                    {isLoading ? (
                        <div className="text-[13px] text-ink-500 py-4">Загрузка…</div>
                    ) : (d?.pending ?? []).length === 0 ? (
                        <div className="text-[13px] text-ink-500 py-4">Нет работ на проверке</div>
                    ) : (
                        (d?.pending ?? []).map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center gap-4 rounded-lg mb-2"
                                style={{
                                    background: 'var(--surface-soft, #F9FAFB)',
                                    border: '1px dashed var(--ink-300)',
                                    padding: '16px 18px',
                                    opacity: 0.92,
                                }}
                            >
                                <div
                                    className="w-[60px] h-[60px] rounded-md flex items-center justify-center flex-shrink-0 text-ink-400"
                                    style={{ border: '2px dashed var(--ink-300)' }}
                                >
                                    <Hourglass className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-ink-900 text-[14px]">
                                        {p.type} · {p.title}
                                    </div>
                                    <div className="text-[12px] text-ink-500 mt-1">
                                        {p.subject} · сдано {relativeDate(p.submittedAt)}
                                    </div>
                                </div>
                                <Badge variant="warning">На проверке</Badge>
                            </div>
                        ))
                    )}
                </div>

                </div>

                {/* Последние оценки */}
                <div data-tour="graded">
                <SectionHead
                    title="Последние оценки"
                    subtitle="С комментариями учителя"
                    action={
                        gradedCount > 0 ? (
                            <Button variant="secondary" size="sm">
                                Все {gradedCount}
                            </Button>
                        ) : undefined
                    }
                />
                <div>
                    {isLoading ? (
                        <div className="text-[13px] text-ink-500 py-4">Загрузка…</div>
                    ) : (d?.graded ?? []).length === 0 ? (
                        <div className="text-[13px] text-ink-500 py-4">Оценённых работ пока нет</div>
                    ) : (
                        (d?.graded ?? []).map((g) => (
                            <div
                                key={g.id}
                                className="bg-surface border border-ink-200 rounded-lg mb-3 overflow-hidden cursor-pointer transition-all"
                                style={{ ['--tw-border-opacity' as any]: 1 }}
                                onClick={() => router.push(`/student/assignments/${g.id}`)}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-300)'
                                    ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, 0 1px 4px rgba(0,0,0,.08))'
                                }}
                                onMouseLeave={(e) => {
                                    ;(e.currentTarget as HTMLElement).style.borderColor = ''
                                    ;(e.currentTarget as HTMLElement).style.boxShadow = ''
                                }}
                            >
                                {/* head */}
                                <div className="flex items-center gap-4 px-[18px] py-[14px]">
                                    <IconTile color="info" size="md">
                                        <MessageSquare className="w-[18px] h-[18px]" />
                                    </IconTile>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-ink-900 text-[14px] leading-snug mb-1">
                                            {g.type} · {g.title}
                                        </div>
                                        <div className="flex items-center gap-2 text-[12px] text-ink-500">
                                            <span>{g.subject}</span>
                                            <span>·</span>
                                            <span>{relativeDate(g.gradedAt)}</span>
                                        </div>
                                    </div>
                                    <div
                                        className="w-[60px] h-[60px] rounded-md flex items-center justify-center font-display font-extrabold text-[28px] text-white flex-shrink-0"
                                        style={{ background: gradeBoxStyle(g.grade) }}
                                    >
                                        {g.grade}
                                    </div>
                                </div>

                                {/* feedback */}
                                {g.feedback && (
                                    <div
                                        className="px-[18px] pb-[18px] pt-4"
                                        style={{ borderTop: '1px solid var(--ink-100)' }}
                                    >
                                        <div
                                            className="flex gap-[10px] text-[13px] leading-relaxed text-ink-700 rounded-r-md"
                                            style={{
                                                background: 'var(--info-50)',
                                                borderLeft: '3px solid var(--info-500)',
                                                padding: '12px 14px',
                                            }}
                                        >
                                            <div
                                                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                                                style={{ background: 'linear-gradient(135deg, var(--brand-300), var(--brand-500))' }}
                                            >
                                                У
                                            </div>
                                            <div>
                                                <strong className="text-ink-900 block mb-0.5 text-[12px]">
                                                    Учитель
                                                </strong>
                                                {g.feedback}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
                </div>
            </div>
        </>
    )
}

function SectionHead({
    title,
    subtitle,
    action,
}: {
    title: string
    subtitle: string
    action?: React.ReactNode
}) {
    return (
        <div className="flex items-end justify-between mb-4">
            <div>
                <h2 className="font-bold text-ink-900 text-[18px]">{title}</h2>
                <div className="text-[13px] text-ink-500 mt-0.5">{subtitle}</div>
            </div>
            {action}
        </div>
    )
}
