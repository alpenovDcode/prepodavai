'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { GraduationCap, Star, TrendingUp, Award } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface Submission {
    id: string
    grade: number | null
    feedback?: string | null
    status: string
    createdAt: string
    assignment: {
        lesson: { title: string; topic?: string }
    }
}

export default function StudentGradesV2() {
    const menu = useStudentMobileMenu()
    const { data, isLoading } = useSWR<Submission[]>('/submissions/my', fetcher)
    const submissions = Array.isArray(data) ? data : []

    const stats = useMemo(() => {
        const graded = submissions.filter(s => s.grade != null)
        const avg = graded.length ? graded.reduce((s, x) => s + (x.grade || 0), 0) / graded.length : 0
        const best = graded.length ? Math.max(...graded.map(s => s.grade || 0)) : 0
        return { total: submissions.length, graded: graded.length, avg, best }
    }, [submissions])

    return (
        <>
            <Topbar
                title="Оценки"
                subtitle={`Средний балл: ${stats.avg ? stats.avg.toFixed(1) : '—'}`}
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <div className="grid grid-cols-4 gap-4 mb-6 max-md:grid-cols-2">
                    <KpiTile icon={<GraduationCap className="w-4 h-4" />} color="brand"   label="Всего работ" value={stats.total} />
                    <KpiTile icon={<Star className="w-4 h-4" />}          color="warning" label="Оценено"     value={stats.graded} />
                    <KpiTile icon={<TrendingUp className="w-4 h-4" />}    color="info"    label="Средний"     value={stats.avg ? stats.avg.toFixed(1) : '—'} />
                    <KpiTile icon={<Award className="w-4 h-4" />}         color="success" label="Лучший"      value={stats.best || '—'} />
                </div>

                {isLoading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : submissions.length === 0 ? (
                    <Card padding="lg" className="text-center">
                        <GraduationCap className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">Оценок пока нет</h3>
                        <p className="text-[13px] text-ink-500">Сдавайте задания — учитель оценит их.</p>
                    </Card>
                ) : (
                    <Card padding="none">
                        <div className="divide-y divide-ink-100">
                            {submissions.map(s => (
                                <div key={s.id} className="px-5 py-4 flex items-center gap-3">
                                    <IconTile color={s.grade != null ? gradeColor(s.grade) : 'neutral'} size="md">
                                        <GraduationCap className="w-[18px] h-[18px]" />
                                    </IconTile>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-[14px] text-ink-900 truncate">{s.assignment?.lesson?.title || 'Работа'}</div>
                                        {s.assignment?.lesson?.topic && (
                                            <div className="text-[11px] text-ink-500 truncate">{s.assignment.lesson.topic}</div>
                                        )}
                                        {s.feedback && (
                                            <div className="text-[12px] text-ink-600 italic mt-1 line-clamp-2">«{s.feedback}»</div>
                                        )}
                                    </div>
                                    {s.grade != null ? (
                                        <div className="flex flex-col items-end">
                                            <div className="font-display font-extrabold text-[24px] text-ink-900 tnum leading-none">{s.grade}</div>
                                            <div className="text-[10px] uppercase font-bold text-ink-500 tracking-wide">балл</div>
                                        </div>
                                    ) : (
                                        <Badge variant="info">на проверке</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                )}
            </div>
        </>
    )
}

function gradeColor(g: number): any {
    if (g >= 5) return 'success'
    if (g >= 4) return 'brand'
    if (g >= 3) return 'warning'
    return 'danger'
}

function KpiTile({ icon, color, label, value }: { icon: React.ReactNode; color: any; label: string; value: number | string }) {
    return (
        <Card padding="md">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                <IconTile size="sm" color={color}>{icon}</IconTile>
                <span className="truncate">{label}</span>
            </div>
            <div className="font-display font-extrabold text-[24px] text-ink-900 tnum leading-none">{value}</div>
        </Card>
    )
}
