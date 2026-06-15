'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
    ArrowLeft, ChevronRight, Clock, Users, CheckCircle2, AlertCircle, Hourglass,
    Eye, Loader2, FileText, ChevronDown,
} from 'lucide-react'

import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Button } from '@/components/ui/v2/Button'
import { Card } from '@/components/ui/v2/Card'
import { cn } from '@/lib/utils/cn'

interface Props {
    assignmentId: string
}

interface OverviewResponse {
    assignment: {
        id: string
        status: string
        dueDate: string | null
        createdAt: string
        scope: 'class' | 'student'
        className: string | null
    }
    lesson: {
        id: string
        title: string
        topic: string | null
        generations: { id: string; type: string; title: string | null; outputData: any }[]
    }
    totals: { total: number; submitted: number; graded: number; overdue: number; pending: number }
    students: {
        id: string
        name: string
        avatar: string | null
        email: string | null
        status: 'not_submitted' | 'submitted' | 'graded' | 'overdue'
        isLate: boolean
        submission: { id: string; grade: number | null; createdAt: string; feedback: string | null } | null
    }[]
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

const STATUS_CHIP: Record<OverviewResponse['students'][number]['status'], { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    graded: { label: 'Оценено', bg: 'bg-success-50', text: 'text-success-700', icon: <CheckCircle2 className="w-3 h-3" /> },
    submitted: { label: 'Сдано', bg: 'bg-info-50', text: 'text-info-700', icon: <Hourglass className="w-3 h-3" /> },
    overdue: { label: 'Просрочено', bg: 'bg-danger-50', text: 'text-danger-700', icon: <AlertCircle className="w-3 h-3" /> },
    not_submitted: { label: 'Не сдано', bg: 'bg-ink-100', text: 'text-ink-600', icon: <Clock className="w-3 h-3" /> },
}

function initials(name: string): string {
    return name.split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || '?'
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    } catch { return '' }
}

function formatDateTime(iso: string): string {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' в ' +
            d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
}

// Та же логика, что в MaterialViewerV2: достаём первую генерацию с HTML-контентом
// для предпросмотра задания.
function pickHtmlGeneration(gens: OverviewResponse['lesson']['generations']) {
    for (const g of gens) {
        const od: any = g.outputData
        if (!od) continue
        const raw = typeof od === 'string' ? od : (od.content ?? od.htmlResult ?? od.html ?? '')
        if (typeof raw === 'string' && /<[a-z][^>]*>/i.test(raw)) {
            return { gen: g, html: raw }
        }
    }
    return null
}

function buildPreviewSrcDoc(html: string): string {
    const BASE = `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f9fafb; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
        .header-logo { width: 40px; height: 40px; object-fit: contain; }
        h1 { font-size: 28px; font-weight: 700; color: #111827; }
        h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #374151; }
        h3 { font-size: 17px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #374151; }
        p { margin-bottom: 16px; }
        ul, ol { padding-left: 24px; margin-bottom: 20px; }
        li { margin-bottom: 8px; }
        input, textarea, select, button { pointer-events: none; opacity: 0.85; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
        th, td { padding: 12px; border: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; text-align: left; }
    `
    const MATH = `<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']],processEscapes:true},chtml:{fontCache:'global'}};</script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`
    let base = html.replace(/<script[^>]+src=["'][^"']*polyfill\.io[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
    const styleBlock = `<style>${BASE}</style>`
    const hasMath = /mathjax/i.test(base)
    const headInjection = `${styleBlock}${hasMath ? '' : MATH}`

    const hasHead = /<head[\s>]/i.test(base)
    const hasBody = /<body[\s>]/i.test(base)
    if (hasHead) return base.replace(/<head([^>]*)>/i, `<head$1>${headInjection}`)
    if (hasBody) return base.replace(/<body([^>]*)>/i, `<head>${headInjection}</head><body$1`)
    const hasContainer = /class\s*=\s*["'][^"']*\bcontainer\b/i.test(base)
    const body = hasContainer ? base : `<div class="container">${base}</div>`
    return `<!DOCTYPE html><html><head>${headInjection}</head><body>${body}</body></html>`
}

export default function AssignmentOverviewV2({ assignmentId }: Props) {
    const router = useRouter()
    const menu = useMobileMenu()
    const [previewOpen, setPreviewOpen] = useState(true)

    const { data, error, isLoading } = useSWR<OverviewResponse>(`/assignments/${assignmentId}/overview`, fetcher)

    const htmlPick = useMemo(() => data ? pickHtmlGeneration(data.lesson.generations) : null, [data])
    const srcDoc = useMemo(() => htmlPick ? buildPreviewSrcDoc(htmlPick.html) : '', [htmlPick])

    if (isLoading) {
        return (
            <>
                <Topbar title="Загрузка…" onMobileMenuToggle={menu.toggle} hideSearch />
                <div className="flex justify-center items-center py-24">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                </div>
            </>
        )
    }

    if (error || !data) {
        return (
            <>
                <Topbar title="Задание" onMobileMenuToggle={menu.toggle} hideSearch />
                <div className="max-w-xl mx-auto py-16 px-6 text-center">
                    <h2 className="font-display font-bold text-[20px] text-ink-900 mb-2">Задание не найдено</h2>
                    <Button variant="secondary" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>
                        Назад
                    </Button>
                </div>
            </>
        )
    }

    const { assignment, lesson, totals, students } = data
    const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date()

    return (
        <>
            <Topbar
                title={
                    <span className="inline-flex items-center gap-2 text-[13px] text-ink-500 font-medium">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="text-ink-500 hover:text-ink-900 transition-colors"
                        >
                            Назад
                        </button>
                        <ChevronRight className="w-3 h-3 text-ink-300" />
                        <span className="text-ink-900 font-bold text-[15px] truncate max-w-[420px]">{lesson.title}</span>
                    </span>
                }
                onMobileMenuToggle={menu.toggle}
                hideSearch
                leading={
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                        aria-label="Назад"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                }
            />

            <div className="max-w-[1320px] mx-auto px-8 py-6 max-md:px-4">
                {/* Hero */}
                <Card padding="lg" className="mb-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                            <h1 className="font-display text-[26px] font-extrabold tracking-tight leading-tight text-ink-900">
                                {lesson.title}
                            </h1>
                            {lesson.topic && (
                                <p className="mt-1 text-[14px] text-ink-600">{lesson.topic}</p>
                            )}
                            <div className="mt-3 flex items-center gap-2 flex-wrap text-[13px] text-ink-500">
                                {assignment.scope === 'class' ? (
                                    <span className="inline-flex items-center gap-1.5 text-ink-700 font-semibold">
                                        <Users className="w-3.5 h-3.5" /> Класс {assignment.className ?? ''}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-ink-700 font-semibold">
                                        <Users className="w-3.5 h-3.5" /> Персональное
                                    </span>
                                )}
                                <span className="text-ink-300">·</span>
                                <span className="inline-flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> Выдано {formatDate(assignment.createdAt)}
                                </span>
                                {assignment.dueDate && (
                                    <>
                                        <span className="text-ink-300">·</span>
                                        <span className={cn(
                                            'inline-flex items-center gap-1.5',
                                            isOverdue && totals.pending + (totals.total - totals.submitted) > 0 ? 'text-danger-700 font-semibold' : '',
                                        )}>
                                            <Clock className="w-3.5 h-3.5" /> Срок {formatDate(assignment.dueDate)}
                                            {isOverdue && <span className="ml-1">· истёк</span>}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Quick stats */}
                        <div className="flex items-center gap-2">
                            <Stat tone="success" label="Оценено" value={totals.graded} />
                            <Stat tone="info" label="Ждут проверки" value={totals.pending} />
                            <Stat tone="danger" label="Просрочено" value={totals.overdue} />
                            <Stat tone="ink" label="Всего" value={totals.total} />
                        </div>
                    </div>
                </Card>

                {/* Material preview (collapsible) */}
                {srcDoc ? (
                    <Card padding="none" className="mb-5 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setPreviewOpen((v) => !v)}
                            className="w-full flex items-center justify-between px-5 py-4 hover:bg-ink-50 transition-colors"
                        >
                            <div className="inline-flex items-center gap-2.5">
                                <FileText className="w-4 h-4 text-ink-500" />
                                <span className="font-semibold text-[14px] text-ink-900">Материал задания</span>
                            </div>
                            <ChevronDown className={cn('w-4 h-4 text-ink-400 transition-transform', previewOpen ? 'rotate-180' : '')} />
                        </button>
                        {previewOpen && (
                            <div className="border-t border-ink-100 bg-ink-50 px-3 pb-3">
                                <iframe
                                    srcDoc={srcDoc}
                                    title="assignment-preview"
                                    width="100%"
                                    className="block bg-white border-0 rounded-md"
                                    style={{ width: '100%', minHeight: '480px', height: '60vh' }}
                                    sandbox="allow-scripts allow-same-origin"
                                />
                            </div>
                        )}
                    </Card>
                ) : null}

                {/* Students list */}
                <Card padding="none">
                    <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
                        <h2 className="font-display font-bold text-[16px] text-ink-900">
                            Ученики <span className="text-ink-400 font-medium">· {students.length}</span>
                        </h2>
                    </div>

                    {students.length === 0 ? (
                        <div className="p-8 text-center text-[14px] text-ink-500">
                            В классе пока нет учеников.
                        </div>
                    ) : (
                        <div className="divide-y divide-ink-100">
                            {students.map((s) => {
                                const chip = STATUS_CHIP[s.status]
                                const canCheck = !!s.submission
                                return (
                                    <div key={s.id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap hover:bg-ink-50/70 transition-colors">
                                        <div className="flex items-center gap-3 min-w-[200px] flex-1">
                                            <button
                                                type="button"
                                                onClick={() => router.push(`/dashboard/students/${s.id}`)}
                                                className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white inline-flex items-center justify-center font-bold text-sm flex-shrink-0"
                                                title="Открыть карточку ученика"
                                            >
                                                {s.avatar || initials(s.name)}
                                            </button>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-[14px] text-ink-900 truncate">{s.name}</div>
                                                {s.email && (
                                                    <div className="text-[12px] text-ink-400 truncate">{s.email}</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                                                chip.bg, chip.text,
                                            )}>
                                                {chip.icon}
                                                {chip.label}
                                            </span>
                                            {s.isLate && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning-50 text-warning-700 rounded-full text-[11px] font-semibold">
                                                    Поздняя сдача
                                                </span>
                                            )}
                                            {s.submission?.grade != null && (
                                                <span className={cn(
                                                    'inline-flex items-center justify-center w-7 h-7 rounded-md text-[13px] font-extrabold',
                                                    s.submission.grade >= 4 ? 'bg-success-100 text-success-700'
                                                        : s.submission.grade >= 3 ? 'bg-warning-100 text-warning-700'
                                                            : 'bg-danger-100 text-danger-700',
                                                )}>
                                                    {s.submission.grade}
                                                </span>
                                            )}
                                            {s.submission?.createdAt && (
                                                <span className="text-[12px] text-ink-500 whitespace-nowrap">
                                                    {formatDateTime(s.submission.createdAt)}
                                                </span>
                                            )}
                                        </div>

                                        <div className="ml-auto flex items-center gap-2">
                                            {canCheck ? (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                                                    onClick={() => router.push(`/dashboard/grading?submission=${s.submission!.id}`)}
                                                >
                                                    Проверить
                                                </Button>
                                            ) : (
                                                <span className="text-[12px] text-ink-400 italic">Работа не сдана</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Card>
            </div>
        </>
    )
}

function Stat({ tone, label, value }: { tone: 'success' | 'info' | 'danger' | 'ink'; label: string; value: number }) {
    const toneClasses: Record<typeof tone, string> = {
        success: 'bg-success-50 text-success-700',
        info: 'bg-info-50 text-info-700',
        danger: 'bg-danger-50 text-danger-700',
        ink: 'bg-ink-100 text-ink-700',
    }
    return (
        <div className={cn('px-3 py-2 rounded-lg text-center min-w-[78px]', toneClasses[tone])}>
            <div className="font-display font-extrabold text-[18px] leading-none">{value}</div>
            <div className="text-[10px] uppercase font-bold tracking-wider mt-1">{label}</div>
        </div>
    )
}
