'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis,
    Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { ArrowLeft, Users, BookOpen, BarChart2, UserPlus, Share2, AlertTriangle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Modal } from '@/components/ui/v2/Modal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassAnalytics {
    classInfo: { id: string; name: string; totalStudents: number; totalAssignments: number }
    summary: {
        avgGrade: number | null
        submissionRate: number
        onTimeRate: number | null
        gradedCount: number
        submissionsCount: number
        expectedSubmissions: number
    }
    gradeDistribution: Record<string, number>
    weeksTrend: { weekStart: string; avgGrade: number | null; count: number }[]
    studentBreakdown: {
        id: string; name: string; avatar: string | null
        avgGrade: number | null; submitted: number; graded: number
        totalAssignments: number; submissionRate: number; onTimeRate: number | null
        riskLevel: 'good' | 'watch' | 'risk' | 'unknown'
    }[]
    atRisk: ClassAnalytics['studentBreakdown']
}

interface Student {
    id: string; name: string; email?: string; avatar?: string
    accessCode?: string; status?: 'active' | 'pending'; createdAt: string
}

interface Assignment {
    id: string; status: string; dueDate?: string; createdAt: string
    lesson: { id: string; title: string; topic: string }
}

interface ClassDetail {
    id: string; name: string; description?: string
    students: Student[]; assignments: Assignment[]
}

interface LessonOption {
    id: string; title: string; topic: string; createdAt: string
    generations: { id: string; generationType: string }[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GENERATION_TYPE_LABELS: Record<string, string> = {
    worksheet: 'Рабочий лист', quiz: 'Тест', vocabulary: 'Словарь',
    'lesson-plan': 'План урока', lesson_plan: 'План урока',
    presentation: 'Презентация', 'content-adaptation': 'Адаптация текста',
    content_adaptation: 'Адаптация текста', feedback: 'Фидбек',
    message: 'Сообщение', game_generation: 'Игра',
    exam_variant: 'КИМ', 'exam-variant': 'КИМ',
    lesson_preparation: 'Вау-урок', unpacking: 'Распаковка',
    sales_advisor: 'ИИ-продажник', image_generation: 'Изображение',
    photosession: 'Фотосессия', 'video-analysis': 'Анализ видео',
    video_analysis: 'Анализ видео',
}

const GRADE_COLORS: Record<string, string> = {
    '5': '#10b981', '4': '#84cc16', '3': '#facc15', '2': '#fb923c', '1': '#ef4444',
}

const RISK_COLOR: Record<ClassAnalytics['studentBreakdown'][number]['riskLevel'], string> = {
    good: 'bg-green-100 text-green-700',
    watch: 'bg-amber-100 text-amber-700',
    risk: 'bg-red-100 text-red-700',
    unknown: 'bg-ink-100 text-ink-600',
}

const RISK_LABEL: Record<ClassAnalytics['studentBreakdown'][number]['riskLevel'], string> = {
    good: 'Стабильно', watch: 'Под наблюдением', risk: 'Отстаёт', unknown: 'Мало данных',
}

const SUB_NAV = [
    { label: 'Ученики', href: '/dashboard/students', key: 'students' },
    { label: 'Классы', href: '/dashboard/classes', key: 'classes' },
    { label: 'Домашние задания', href: '/dashboard/assignments', key: 'grading' },
    { label: 'Аналитика', href: '/dashboard/analytics', key: 'analytics' },
] as const

type Tab = 'students' | 'assignments' | 'analytics'

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClassDetailPageV2({ id }: { id: string }) {
    const router = useRouter()
    const menu = useMobileMenu()

    const [classData, setClassData] = useState<ClassDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<Tab>('students')

    const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null)
    const [analyticsLoading, setAnalyticsLoading] = useState(false)

    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteCopied, setInviteCopied] = useState(false)

    const [showAssignModal, setShowAssignModal] = useState(false)
    const [lessons, setLessons] = useState<LessonOption[]>([])
    const [lessonsLoading, setLessonsLoading] = useState(false)
    const [selectedLessonId, setSelectedLessonId] = useState('')
    const [selectedGenerationId, setSelectedGenerationId] = useState('')
    const [assignDueDate, setAssignDueDate] = useState('')
    const [assignSubmitting, setAssignSubmitting] = useState(false)

    useEffect(() => {
        apiClient.get(`/classes/${id}`)
            .then(r => setClassData(r.data))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id])

    useEffect(() => {
        if (activeTab !== 'analytics' || analytics) return
        setAnalyticsLoading(true)
        apiClient.get(`/classes/${id}/analytics`)
            .then(r => setAnalytics(r.data))
            .catch(console.error)
            .finally(() => setAnalyticsLoading(false))
    }, [activeTab, analytics, id])

    const openAssignModal = async () => {
        setShowAssignModal(true)
        setSelectedLessonId('')
        setSelectedGenerationId('')
        setAssignDueDate('')
        setLessonsLoading(true)
        try {
            const res = await apiClient.get<LessonOption[]>('/lessons')
            setLessons(res.data)
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось загрузить материалы')
        } finally {
            setLessonsLoading(false)
        }
    }

    const submitAssign = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedLessonId) return
        setAssignSubmitting(true)
        try {
            await apiClient.post('/assignments', {
                lessonId: selectedLessonId,
                classId: id,
                generationId: selectedGenerationId || undefined,
                dueDate: assignDueDate ? new Date(assignDueDate).toISOString() : undefined,
            })
            setShowAssignModal(false)
            const response = await apiClient.get(`/classes/${id}`)
            setClassData(response.data)
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось выдать материал')
        } finally {
            setAssignSubmitting(false)
        }
    }

    const handleInvite = async () => {
        setInviteLoading(true)
        setInviteCopied(false)
        try {
            const response = await apiClient.post<{ token: string }>('/student-invites', { classId: id })
            const url = `${window.location.origin}/invite/${response.data.token}`
            setInviteUrl(url)
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось создать приглашение')
        } finally {
            setInviteLoading(false)
        }
    }

    const copyInvite = async () => {
        if (!inviteUrl) return
        await navigator.clipboard.writeText(inviteUrl)
        setInviteCopied(true)
        setTimeout(() => setInviteCopied(false), 2000)
    }

    const approveStudent = async (studentId: string) => {
        try {
            await apiClient.post(`/students/${studentId}/approve`)
            setClassData(prev => prev
                ? { ...prev, students: prev.students.map(s => s.id === studentId ? { ...s, status: 'active' as const } : s) }
                : prev)
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось принять ученика')
        }
    }

    const rejectStudent = async (studentId: string) => {
        if (!confirm('Отклонить заявку ученика? Его аккаунт будет удалён.')) return
        try {
            await apiClient.post(`/students/${studentId}/reject`)
            setClassData(prev => prev
                ? { ...prev, students: prev.students.filter(s => s.id !== studentId) }
                : prev)
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось отклонить')
        }
    }

    // ─── Loading / Error ───────────────────────────────────────────────────

    const topbar = (
        <Topbar
            title={classData?.name ?? 'Класс'}
            onMobileMenuToggle={menu.toggle}
            hideSearch
            leading={
                <button
                    type="button"
                    onClick={() => router.push('/dashboard/classes')}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-all"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
            }
            actions={
                classData ? (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Share2 className="w-4 h-4" />}
                            onClick={openAssignModal}
                        >
                            <span className="max-sm:hidden">Выдать материал</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<UserPlus className="w-4 h-4" />}
                            onClick={handleInvite}
                            disabled={inviteLoading}
                        >
                            <span className="max-sm:hidden">{inviteLoading ? 'Создаём…' : 'Пригласить'}</span>
                        </Button>
                    </div>
                ) : undefined
            }
        />
    )

    const subNav = (
        <div className="border-b border-ink-200 bg-surface px-8 max-md:px-4">
            <div className="flex gap-0 max-w-[1320px] mx-auto">
                {SUB_NAV.map(({ label, href, key }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => router.push(href)}
                        className={cn(
                            'relative px-4 py-3 text-[14px] font-semibold transition-colors whitespace-nowrap',
                            key === 'classes' ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900',
                        )}
                    >
                        {label}
                        {key === 'classes' && (
                            <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t bg-brand-500" />
                        )}
                    </button>
                ))}
            </div>
        </div>
    )

    if (loading) {
        return (
            <>
                {topbar}
                {subNav}
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
                </div>
            </>
        )
    }

    if (!classData) {
        return (
            <>
                {topbar}
                {subNav}
                <div className="max-w-[1320px] w-full mx-auto p-8">
                    <Card padding="lg" className="text-center py-16">
                        <p className="text-ink-500 mb-4">Класс не найден</p>
                        <Button variant="secondary" onClick={() => router.push('/dashboard/classes')}>
                            ← Вернуться к классам
                        </Button>
                    </Card>
                </div>
            </>
        )
    }

    const completedCount = classData.assignments.filter(a => a.status !== 'assigned').length
    const completionPct = classData.assignments.length > 0
        ? Math.round((completedCount / classData.assignments.length) * 100)
        : 0

    const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
        { key: 'students', label: `Ученики (${classData.students.length})`, icon: <Users className="w-4 h-4" /> },
        { key: 'assignments', label: `Задания (${classData.assignments.length})`, icon: <BookOpen className="w-4 h-4" /> },
        { key: 'analytics', label: 'Аналитика', icon: <BarChart2 className="w-4 h-4" /> },
    ]

    return (
        <>
            {topbar}
            {subNav}

            <div className="max-w-[1320px] w-full mx-auto p-8 max-md:p-4 space-y-6">

                {/* Stats pills */}
                <div className="flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                        <Users className="w-3.5 h-3.5" />
                        {classData.students.length} учеников
                    </span>
                    <span className="inline-flex items-center gap-1.5 bg-ink-50 text-ink-600 px-3 py-1.5 rounded-lg text-sm font-medium">
                        <BookOpen className="w-3.5 h-3.5" />
                        {classData.assignments.length} заданий
                    </span>
                    {classData.assignments.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                            {completionPct}% выполнено
                        </span>
                    )}
                    {classData.description && (
                        <span className="text-sm text-ink-500 self-center">{classData.description}</span>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-ink-200">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'relative flex items-center gap-2 px-4 py-3 text-[14px] font-semibold transition-colors',
                                activeTab === tab.key
                                    ? 'text-brand-700'
                                    : 'text-ink-500 hover:text-ink-900',
                            )}
                        >
                            {tab.icon}
                            {tab.label}
                            {activeTab === tab.key && (
                                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-brand-500" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'students' && (
                    <Card padding="none" className="overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-ink-100 bg-ink-50/50">
                                    <th className="text-left py-3.5 px-5 text-[13px] font-semibold text-ink-600">Ученик</th>
                                    <th className="text-left py-3.5 px-5 text-[13px] font-semibold text-ink-600">Дата добавления</th>
                                    <th className="text-right py-3.5 px-5 text-[13px] font-semibold text-ink-600">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-50">
                                {classData.students.map(student => (
                                    <tr key={student.id} className="hover:bg-ink-50/40 transition">
                                        <td className="py-4 px-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                                                    {student.avatar || student.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-ink-900 text-[14px]">{student.name}</p>
                                                        {student.status === 'pending' && (
                                                            <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700 rounded-full">
                                                                Ожидает
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[13px] text-ink-500">{student.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-5 text-[13px] text-ink-500">
                                            {new Date(student.createdAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td className="py-4 px-5 text-right">
                                            {student.status === 'pending' ? (
                                                <div className="inline-flex items-center gap-2">
                                                    <Button size="sm" variant="secondary" onClick={() => approveStudent(student.id)} className="text-green-700 border-green-200 hover:bg-green-50">
                                                        Принять
                                                    </Button>
                                                    <Button size="sm" variant="secondary" onClick={() => rejectStudent(student.id)} className="text-danger-700 border-danger-500 hover:bg-danger-50">
                                                        Отклонить
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="inline-flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        leftIcon={<Share2 className="w-3.5 h-3.5" />}
                                                        onClick={() => {
                                                            const link = `${window.location.origin}/student/login`
                                                            navigator.clipboard.writeText(link)
                                                            toast.success('Ссылка для входа скопирована')
                                                        }}
                                                        title="Скопировать ссылку на страницу входа для ученика"
                                                    >
                                                        Ссылка для входа
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => router.push(`/dashboard/students/${student.id}`)}
                                                        title="Открыть карточку ученика"
                                                    >
                                                        Открыть
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {classData.students.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-16 text-center text-ink-400 text-[14px]">
                                            В этом классе пока нет учеников
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </Card>
                )}

                {activeTab === 'assignments' && (
                    <div className="grid gap-3">
                        {classData.assignments.map(assignment => (
                            <Card
                                key={assignment.id}
                                padding="md"
                                interactive
                                className="hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => router.push(`/dashboard/assignments/${assignment.id}`)}
                                title="Открыть карточку задания"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-ink-900 text-[15px] mb-0.5">{assignment.lesson.title}</h3>
                                        <p className="text-[13px] text-ink-500 mb-3">{assignment.lesson.topic}</p>
                                        <div className="flex items-center gap-3 text-[13px]">
                                            <span className={cn(
                                                'px-2.5 py-1 rounded-full font-semibold',
                                                assignment.status === 'assigned'
                                                    ? 'bg-brand-50 text-brand-700'
                                                    : 'bg-green-50 text-green-700'
                                            )}>
                                                {assignment.status === 'assigned' ? 'Выдано' : 'Завершено'}
                                            </span>
                                            {assignment.dueDate && (
                                                <span className="text-ink-500">
                                                    Срок: {new Date(assignment.dueDate).toLocaleDateString('ru-RU')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0 mt-1" />
                                </div>
                            </Card>
                        ))}
                        {classData.assignments.length === 0 && (
                            <Card padding="lg" className="text-center py-16 text-ink-400 text-[14px]">
                                Этому классу ещё не выдано ни одного задания
                            </Card>
                        )}
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <AnalyticsView
                        loading={analyticsLoading}
                        analytics={analytics}
                        onSelectStudent={studentId => router.push(`/dashboard/students/${studentId}`)}
                    />
                )}
            </div>

            {/* Assign material modal */}
            <Modal
                open={showAssignModal}
                onClose={() => setShowAssignModal(false)}
                title="Выдать материал классу"
                description={`Класс: ${classData.name}`}
                size="sm"
            >
                <form onSubmit={submitAssign} className="p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">Материал*</label>
                        {lessonsLoading ? (
                            <div className="px-3 py-2 text-[13px] text-ink-500">Загружаем…</div>
                        ) : lessons.length === 0 ? (
                            <div className="px-3 py-2 text-[13px] text-ink-500 bg-ink-50 border border-ink-200 rounded-lg">
                                У вас пока нет созданных материалов.
                            </div>
                        ) : (
                            <>
                                <select
                                    value={selectedLessonId}
                                    onChange={e => { setSelectedLessonId(e.target.value); setSelectedGenerationId('') }}
                                    required
                                    className="h-10 px-3 rounded-lg border border-ink-200 text-[14px] text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15"
                                >
                                    <option value="">Выберите материал</option>
                                    {lessons.map(l => (
                                        <option key={l.id} value={l.id}>
                                            {l.title || l.topic} · {new Date(l.createdAt).toLocaleDateString('ru-RU')}
                                        </option>
                                    ))}
                                </select>
                                {selectedLessonId && (() => {
                                    const gens = lessons.find(l => l.id === selectedLessonId)?.generations || []
                                    if (!gens.length) return null
                                    return (
                                        <div className="flex flex-col gap-1.5 mt-2">
                                            <label className="text-[13px] font-semibold text-ink-700">
                                                Конкретная генерация <span className="text-ink-400 font-normal">(необязательно)</span>
                                            </label>
                                            <select
                                                value={selectedGenerationId}
                                                onChange={e => setSelectedGenerationId(e.target.value)}
                                                className="h-10 px-3 rounded-lg border border-ink-200 text-[14px] text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15"
                                            >
                                                <option value="">Весь урок целиком</option>
                                                {gens.map(g => (
                                                    <option key={g.id} value={g.id}>
                                                        {GENERATION_TYPE_LABELS[g.generationType] || g.generationType}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )
                                })()}
                            </>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">
                            Срок сдачи <span className="text-ink-400 font-normal">(необязательно)</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={assignDueDate}
                            onChange={e => setAssignDueDate(e.target.value)}
                            className="h-10 px-3 rounded-lg border border-ink-200 text-[14px] text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAssignModal(false)}>
                            Отмена
                        </Button>
                        <Button type="submit" variant="primary" className="flex-1" disabled={assignSubmitting || !selectedLessonId}>
                            {assignSubmitting ? 'Выдаём…' : 'Выдать'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Invite link modal */}
            <Modal
                open={!!inviteUrl}
                onClose={() => setInviteUrl(null)}
                title="Пригласительная ссылка"
                description={`Отправьте эту ссылку ученику — после регистрации он попадёт в класс «${classData.name}».`}
                size="sm"
            >
                <div className="p-5 flex flex-col gap-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={inviteUrl ?? ''}
                            className="flex-1 h-10 px-3 bg-ink-50 border border-ink-200 rounded-lg text-[13px] text-ink-700 font-mono"
                        />
                        <Button variant="primary" onClick={copyInvite}>
                            {inviteCopied ? 'Скопировано' : 'Копировать'}
                        </Button>
                    </div>
                    <Button variant="secondary" onClick={() => setInviteUrl(null)}>
                        Закрыть
                    </Button>
                </div>
            </Modal>
        </>
    )
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView({
    loading, analytics, onSelectStudent,
}: {
    loading: boolean
    analytics: ClassAnalytics | null
    onSelectStudent: (id: string) => void
}) {
    if (loading) {
        return (
            <Card padding="lg" className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600 mb-4" />
                <p className="text-[13px] text-ink-500">Считаем аналитику класса…</p>
            </Card>
        )
    }
    if (!analytics) {
        return (
            <Card padding="lg" className="text-center py-16 text-ink-400 text-[14px]">
                Не удалось загрузить аналитику.
            </Card>
        )
    }

    const { summary, gradeDistribution, weeksTrend, studentBreakdown, atRisk } = analytics
    const submissionPct = Math.round(summary.submissionRate * 100)
    const onTimePct = summary.onTimeRate !== null ? Math.round(summary.onTimeRate * 100) : null

    const distributionData = (['5', '4', '3', '2', '1'] as const).map(g => ({
        grade: g, count: gradeDistribution[g] || 0, color: GRADE_COLORS[g],
    }))

    const trendData = weeksTrend.map(w => ({
        week: new Date(w.weekStart).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        avgGrade: w.avgGrade, count: w.count,
    }))

    return (
        <div className="space-y-6">
            {/* Metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label="Средний балл"
                    value={summary.avgGrade ?? '—'}
                    sub={`${summary.gradedCount} проверенных работ`}
                    color={summary.avgGrade !== null
                        ? summary.avgGrade >= 4 ? 'text-green-600'
                        : summary.avgGrade >= 3 ? 'text-amber-600'
                        : 'text-red-500'
                        : 'text-ink-400'}
                />
                <MetricCard
                    label="Сдают задания"
                    value={`${submissionPct}%`}
                    sub={`${summary.submissionsCount} / ${summary.expectedSubmissions} сдач`}
                    color={submissionPct < 60 ? 'text-red-500' : submissionPct < 80 ? 'text-amber-600' : 'text-green-600'}
                />
                <MetricCard
                    label="Сдают вовремя"
                    value={onTimePct !== null ? `${onTimePct}%` : '—'}
                    sub={onTimePct === null ? 'Нет дедлайнов' : ''}
                    color={onTimePct !== null && onTimePct < 60 ? 'text-red-500' : 'text-ink-900'}
                />
                <MetricCard
                    label="Под наблюдением"
                    value={atRisk.length}
                    sub={atRisk.length === 0 ? 'Все справляются' : 'Требуют внимания'}
                    color={atRisk.length === 0 ? 'text-green-600' : 'text-amber-600'}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card padding="md">
                    <h3 className="text-[15px] font-bold text-ink-900 mb-0.5">Распределение оценок</h3>
                    <p className="text-[12px] text-ink-400 mb-4">Сколько каких оценок выставлено в классе</p>
                    {summary.gradedCount === 0 ? (
                        <div className="text-center text-ink-400 py-12 text-[13px]">Нет проверенных работ</div>
                    ) : (
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#6b7280' }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [v, 'работ']} labelFormatter={(l: any) => `Оценка ${l}`} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {distributionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                <Card padding="md">
                    <h3 className="text-[15px] font-bold text-ink-900 mb-0.5">Динамика среднего балла</h3>
                    <p className="text-[12px] text-ink-400 mb-4">По неделям, за последние 8 недель</p>
                    {trendData.every(d => d.avgGrade === null) ? (
                        <div className="text-center text-ink-400 py-12 text-[13px]">Недостаточно данных</div>
                    ) : (
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: any, _: any, item: any) => [v ?? 'нет работ', `Средний балл (${item?.payload?.count ?? 0} работ)`]} />
                                    <Line type="monotone" dataKey="avgGrade" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4, fill: '#6366f1' }} connectNulls />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>
            </div>

            {/* At-risk */}
            {atRisk.length > 0 && (
                <Card padding="none" className="border-amber-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h3 className="text-[15px] font-bold text-ink-900">Кому нужна помощь ({atRisk.length})</h3>
                    </div>
                    <div className="divide-y divide-ink-50">
                        {atRisk.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => onSelectStudent(s.id)}
                                className="w-full text-left px-5 py-3.5 hover:bg-ink-50 transition flex items-center justify-between gap-3"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center text-ink-600 font-bold text-sm flex-shrink-0">
                                        {s.avatar || s.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-ink-900 truncate text-[14px]">{s.name}</p>
                                        <p className="text-[12px] text-ink-400">
                                            Сдано {s.submitted}/{s.totalAssignments}
                                            {s.onTimeRate !== null && ` · вовремя ${Math.round(s.onTimeRate * 100)}%`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className={cn('text-lg font-black', s.avgGrade === null ? 'text-ink-400' : s.avgGrade >= 4 ? 'text-green-600' : s.avgGrade >= 3 ? 'text-amber-600' : 'text-red-500')}>
                                        {s.avgGrade ?? '—'}
                                    </span>
                                    <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold', RISK_COLOR[s.riskLevel])}>
                                        {RISK_LABEL[s.riskLevel]}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-ink-300" />
                                </div>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {/* Full breakdown */}
            <Card padding="none" className="overflow-hidden">
                <div className="px-5 py-4 border-b border-ink-100">
                    <h3 className="text-[15px] font-bold text-ink-900">Все ученики</h3>
                    <p className="text-[12px] text-ink-400">Сортировка: сначала те, кому нужно внимание</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-[12px] text-ink-500 bg-ink-50/50">
                                <th className="text-left py-2.5 px-4 font-semibold">Ученик</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Средний балл</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Сдано</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Вовремя</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-50">
                            {studentBreakdown.map(s => (
                                <tr key={s.id} onClick={() => onSelectStudent(s.id)} className="hover:bg-ink-50/40 transition cursor-pointer">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-ink-100 flex items-center justify-center text-ink-600 font-bold text-xs">
                                                {s.avatar || s.name.charAt(0)}
                                            </div>
                                            <span className="font-medium text-ink-900">{s.name}</span>
                                        </div>
                                    </td>
                                    <td className={cn('text-center py-3 px-3 font-bold', s.avgGrade === null ? 'text-ink-400' : s.avgGrade >= 4 ? 'text-green-600' : s.avgGrade >= 3 ? 'text-amber-600' : 'text-red-500')}>
                                        {s.avgGrade ?? '—'}
                                    </td>
                                    <td className="text-center py-3 px-3 text-ink-600">{s.submitted}/{s.totalAssignments}</td>
                                    <td className="text-center py-3 px-3 text-ink-600">
                                        {s.onTimeRate !== null ? `${Math.round(s.onTimeRate * 100)}%` : '—'}
                                    </td>
                                    <td className="text-center py-3 px-3">
                                        <span className={cn('inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold', RISK_COLOR[s.riskLevel])}>
                                            {RISK_LABEL[s.riskLevel]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

function MetricCard({ label, value, sub, color = 'text-ink-900' }: {
    label: string; value: string | number; sub?: string; color?: string
}) {
    return (
        <Card padding="md">
            <div className="text-[12px] text-ink-400 font-medium mb-1">{label}</div>
            <div className={cn('text-2xl font-bold', color)}>{value}</div>
            {sub && <div className="text-[11px] text-ink-400 mt-1">{sub}</div>}
        </Card>
    )
}
