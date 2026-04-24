'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Cell,
} from 'recharts'

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
        id: string
        name: string
        avatar: string | null
        avgGrade: number | null
        submitted: number
        graded: number
        totalAssignments: number
        submissionRate: number
        onTimeRate: number | null
        riskLevel: 'good' | 'watch' | 'risk' | 'unknown'
    }[]
    atRisk: ClassAnalytics['studentBreakdown']
}

const RISK_COLOR: Record<ClassAnalytics['studentBreakdown'][number]['riskLevel'], string> = {
    good: 'bg-green-100 text-green-700',
    watch: 'bg-amber-100 text-amber-700',
    risk: 'bg-red-100 text-red-700',
    unknown: 'bg-gray-100 text-gray-600',
}

const RISK_LABEL: Record<ClassAnalytics['studentBreakdown'][number]['riskLevel'], string> = {
    good: 'Стабильно',
    watch: 'Под наблюдением',
    risk: 'Отстаёт',
    unknown: 'Мало данных',
}

const GRADE_COLORS: Record<string, string> = {
    '5': '#10b981',
    '4': '#84cc16',
    '3': '#facc15',
    '2': '#fb923c',
    '1': '#ef4444',
}

interface Student {
    id: string
    name: string
    email?: string
    avatar?: string
    accessCode?: string
    status?: 'active' | 'pending'
    createdAt: string
}

interface Assignment {
    id: string
    status: string
    dueDate?: string
    createdAt: string
    lesson: {
        id: string
        title: string
        topic: string
    }
}

interface ClassDetail {
    id: string
    name: string
    description?: string
    students: Student[]
    assignments: Assignment[]
}

interface LessonOption {
    id: string
    title: string
    topic: string
    createdAt: string
    generations: { id: string; generationType: string }[]
}

const GENERATION_TYPE_LABELS: Record<string, string> = {
    worksheet: 'Рабочий лист',
    quiz: 'Тест',
    vocabulary: 'Словарь',
    'lesson-plan': 'План урока',
    lesson_plan: 'План урока',
    presentation: 'Презентация',
    'content-adaptation': 'Адаптация текста',
    content_adaptation: 'Адаптация текста',
    feedback: 'Фидбек',
    message: 'Сообщение',
    game_generation: 'Игра',
    exam_variant: 'КИМ',
    'exam-variant': 'КИМ',
    lesson_preparation: 'Вау-урок',
    unpacking: 'Распаковка',
    sales_advisor: 'ИИ-продажник',
    image_generation: 'Изображение',
    photosession: 'Фотосессия',
    'video-analysis': 'Анализ видео',
    video_analysis: 'Анализ видео',
}

function formatGenerationType(type: string): string {
    return GENERATION_TYPE_LABELS[type] || type
}

interface ClassDetailPageProps {
    id: string
}

export default function ClassDetailPage({ id }: ClassDetailPageProps) {
    const [classData, setClassData] = useState<ClassDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'students' | 'assignments' | 'analytics'>('students')
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

    const router = useRouter()

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
            setClassData((prev) =>
                prev
                    ? { ...prev, students: prev.students.map((s) => (s.id === studentId ? { ...s, status: 'active' } : s)) }
                    : prev,
            )
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось принять ученика')
        }
    }

    const rejectStudent = async (studentId: string) => {
        if (!confirm('Отклонить заявку ученика? Его аккаунт будет удалён.')) return
        try {
            await apiClient.post(`/students/${studentId}/reject`)
            setClassData((prev) =>
                prev ? { ...prev, students: prev.students.filter((s) => s.id !== studentId) } : prev,
            )
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Не удалось отклонить')
        }
    }

    useEffect(() => {
        const fetchClassData = async () => {
            try {
                const response = await apiClient.get(`/classes/${id}`)
                setClassData(response.data)
            } catch (error) {
                console.error('Failed to fetch class data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchClassData()
    }, [id])

    useEffect(() => {
        if (activeTab !== 'analytics' || analytics) return
        const fetchAnalytics = async () => {
            setAnalyticsLoading(true)
            try {
                const res = await apiClient.get(`/classes/${id}/analytics`)
                setAnalytics(res.data)
            } catch (error) {
                console.error('Failed to fetch class analytics:', error)
            } finally {
                setAnalyticsLoading(false)
            }
        }
        fetchAnalytics()
    }, [activeTab, analytics, id])

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!classData) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900">Класс не найден</h3>
                <button
                    onClick={() => router.back()}
                    className="text-primary-600 font-medium hover:text-primary-700 mt-4"
                >
                    &larr; Вернуться назад
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto">
            {showAssignModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAssignModal(false)}>
                    <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">Выдать материал классу</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Класс: <span className="font-semibold">{classData.name}</span>
                        </p>

                        <form onSubmit={submitAssign} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Материал</label>
                                {lessonsLoading ? (
                                    <div className="px-3 py-2 text-sm text-gray-500">Загружаем...</div>
                                ) : lessons.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                                        У вас пока нет созданных материалов. Сгенерируйте урок в «ИИ Генераторе».
                                    </div>
                                ) : (
                                    <>
                                        <select
                                            value={selectedLessonId}
                                            onChange={(e) => {
                                                setSelectedLessonId(e.target.value)
                                                setSelectedGenerationId('')
                                            }}
                                            required
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                                        >
                                            <option value="">Выберите материал</option>
                                            {lessons.map((l) => (
                                                <option key={l.id} value={l.id}>
                                                    {l.title || l.topic} · {new Date(l.createdAt).toLocaleDateString('ru-RU')}
                                                    {l.generations?.length ? ` (${l.generations.length})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedLessonId && (() => {
                                            const lesson = lessons.find((l) => l.id === selectedLessonId)
                                            const gens = lesson?.generations || []
                                            if (gens.length === 0) return null
                                            return (
                                                <div className="mt-3">
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                                        Конкретная генерация <span className="text-gray-400 font-normal">(необязательно)</span>
                                                    </label>
                                                    <select
                                                        value={selectedGenerationId}
                                                        onChange={(e) => setSelectedGenerationId(e.target.value)}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                                                    >
                                                        <option value="">Весь урок целиком</option>
                                                        {gens.map((g) => (
                                                            <option key={g.id} value={g.id}>
                                                                {formatGenerationType(g.generationType)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )
                                        })()}
                                    </>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Срок сдачи <span className="text-gray-400 font-normal">(необязательно)</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={assignDueDate}
                                    onChange={(e) => setAssignDueDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAssignModal(false)}
                                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={assignSubmitting || !selectedLessonId}
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-60"
                                >
                                    {assignSubmitting ? 'Выдаём...' : 'Выдать'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {inviteUrl && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setInviteUrl(null)}>
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Пригласительная ссылка</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Отправьте эту ссылку ученику. После регистрации он будет автоматически добавлен в класс «{classData.name}».
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={inviteUrl}
                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-mono"
                            />
                            <button
                                onClick={copyInvite}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
                            >
                                {inviteCopied ? 'Скопировано' : 'Копировать'}
                            </button>
                        </div>
                        <button
                            onClick={() => setInviteUrl(null)}
                            className="mt-4 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.back()}
                    className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-2"
                >
                    <i className="fas fa-arrow-left"></i>
                    Назад к списку
                </button>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{classData.name}</h1>
                        <p className="text-gray-600">{classData.description || 'Нет описания'}</p>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition flex items-center gap-2 shadow-sm">
                            <i className="fas fa-edit"></i>
                            Редактировать
                        </button>
                        <button
                            onClick={openAssignModal}
                            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition flex items-center gap-2 shadow-sm"
                        >
                            <i className="fas fa-share-square"></i>
                            Выдать материал
                        </button>
                        <button
                            onClick={handleInvite}
                            disabled={inviteLoading}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition flex items-center gap-2 shadow-md disabled:opacity-60"
                        >
                            <i className="fas fa-user-plus"></i>
                            {inviteLoading ? 'Создаём...' : 'Пригласить ученика'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Class Stats Pills */}
            {(() => {
                const completedCount = classData.assignments.filter(a => a.status !== 'assigned').length
                const completionPct = classData.assignments.length > 0
                    ? Math.round((completedCount / classData.assignments.length) * 100)
                    : 0
                return (
                    <div className="flex flex-wrap gap-3 mb-6">
                        <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                            <i className="fas fa-users text-xs"></i>
                            {classData.students.length} учеников
                        </div>
                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                            <i className="fas fa-tasks text-xs"></i>
                            {classData.assignments.length} заданий
                        </div>
                        {classData.assignments.length > 0 && (
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                                completionPct >= 70 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                            }`}>
                                <i className="fas fa-check-circle text-xs"></i>
                                {completionPct}% выполнено
                            </div>
                        )}
                    </div>
                )
            })()}

            {/* Tabs */}
            <div className="flex gap-6 border-b border-gray-200 mb-6">
                <button
                    onClick={() => setActiveTab('students')}
                    className={`pb-4 px-2 font-medium transition relative ${activeTab === 'students'
                        ? 'text-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Ученики ({classData.students.length})
                    {activeTab === 'students' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 rounded-t-full"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('assignments')}
                    className={`pb-4 px-2 font-medium transition relative ${activeTab === 'assignments'
                        ? 'text-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Задания ({classData.assignments.length})
                    {activeTab === 'assignments' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 rounded-t-full"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`pb-4 px-2 font-medium transition relative ${activeTab === 'analytics'
                        ? 'text-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <i className="fas fa-chart-line mr-1.5 text-xs"></i>
                    Аналитика
                    {activeTab === 'analytics' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 rounded-t-full"></div>
                    )}
                </button>
            </div>

            {/* Content */}
            {activeTab === 'analytics' ? (
                <ClassAnalyticsView
                    loading={analyticsLoading}
                    analytics={analytics}
                    onSelectStudent={(studentId: string) => router.push(`/dashboard/students/${studentId}`)}
                />
            ) : activeTab === 'students' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-50 bg-gray-50/50">
                                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Имя ученика</th>
                                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Код доступа</th>
                                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Дата добавления</th>
                                <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {classData.students.map((student) => (
                                <tr key={student.id} className="hover:bg-gray-50 transition">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                                                {student.avatar || student.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-semibold text-gray-900">{student.name}</p>
                                                    {student.status === 'pending' && (
                                                        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                                                            Ожидает подтверждения
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500">{student.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-600">
                                            {student.accessCode}
                                        </code>
                                    </td>
                                    <td className="py-4 px-6 text-sm text-gray-600">
                                        {new Date(student.createdAt).toLocaleDateString('ru-RU')}
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        {student.status === 'pending' ? (
                                            <div className="inline-flex items-center gap-2">
                                                <button
                                                    onClick={() => approveStudent(student.id)}
                                                    className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition"
                                                >
                                                    Принять
                                                </button>
                                                <button
                                                    onClick={() => rejectStudent(student.id)}
                                                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition"
                                                >
                                                    Отклонить
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const link = `${window.location.origin}/student/login?code=${student.accessCode}`
                                                        navigator.clipboard.writeText(link)
                                                        alert('Ссылка для входа скопирована!')
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-primary-600 transition mr-2"
                                                    title="Копировать ссылку для входа"
                                                >
                                                    <i className="fas fa-link"></i>
                                                </button>
                                                <button className="text-gray-400 hover:text-red-600 transition">
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {classData.students.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-gray-500">
                                        В этом классе пока нет учеников
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid gap-4">
                    {classData.assignments.map((assignment) => (
                        <div key={assignment.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">{assignment.lesson.title}</h3>
                                    <p className="text-gray-500 text-sm mb-3">{assignment.lesson.topic}</p>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className={`px-3 py-1 rounded-full font-medium ${assignment.status === 'assigned' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                            {assignment.status === 'assigned' ? 'Выдано' : 'Завершено'}
                                        </span>
                                        {assignment.dueDate && (
                                            <span className="text-gray-600 flex items-center gap-1">
                                                <i className="fas fa-calendar-alt"></i>
                                                Срок: {new Date(assignment.dueDate).toLocaleDateString('ru-RU')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button className="p-2 text-gray-400 hover:text-primary-600 transition">
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                    {classData.assignments.length === 0 && (
                        <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500">
                            Этому классу еще не выдано ни одного задания
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

interface ClassAnalyticsViewProps {
    loading: boolean
    analytics: ClassAnalytics | null
    onSelectStudent: (studentId: string) => void
}

function ClassAnalyticsView({ loading, analytics, onSelectStudent }: ClassAnalyticsViewProps) {
    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-4"></div>
                <p className="text-sm text-gray-500">Считаем аналитику класса...</p>
            </div>
        )
    }

    if (!analytics) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-500">
                Не удалось загрузить аналитику.
            </div>
        )
    }

    const { summary, gradeDistribution, weeksTrend, studentBreakdown, atRisk } = analytics
    const submissionPct = Math.round(summary.submissionRate * 100)
    const onTimePct = summary.onTimeRate !== null ? Math.round(summary.onTimeRate * 100) : null

    const distributionData = (['5', '4', '3', '2', '1'] as const).map((g) => ({
        grade: g,
        count: gradeDistribution[g] || 0,
        color: GRADE_COLORS[g],
    }))

    const trendData = weeksTrend.map((w) => ({
        week: new Date(w.weekStart).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        avgGrade: w.avgGrade,
        count: w.count,
    }))

    return (
        <div className="space-y-6">
            {/* Top metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label="Средний балл класса"
                    value={summary.avgGrade ?? '—'}
                    color={
                        summary.avgGrade !== null
                            ? summary.avgGrade >= 4 ? 'text-green-600'
                                : summary.avgGrade >= 3 ? 'text-yellow-600'
                                : 'text-red-500'
                            : 'text-gray-400'
                    }
                    sub={`${summary.gradedCount} проверенных работ`}
                />
                <MetricCard
                    label="Сдают задания"
                    value={`${submissionPct}%`}
                    color={submissionPct < 60 ? 'text-red-500' : submissionPct < 80 ? 'text-yellow-600' : 'text-green-600'}
                    sub={`${summary.submissionsCount} / ${summary.expectedSubmissions} сдач`}
                />
                <MetricCard
                    label="Сдают вовремя"
                    value={onTimePct !== null ? `${onTimePct}%` : '—'}
                    color={onTimePct !== null && onTimePct < 60 ? 'text-red-500' : 'text-gray-900'}
                    sub={onTimePct === null ? 'Нет дедлайнов' : ''}
                />
                <MetricCard
                    label="Под наблюдением"
                    value={atRisk.length}
                    color={atRisk.length === 0 ? 'text-green-600' : 'text-amber-600'}
                    sub={atRisk.length === 0 ? 'Все справляются' : 'Требуют внимания'}
                />
            </div>

            {/* Two-column: distribution + trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-1">Распределение оценок</h3>
                    <p className="text-xs text-gray-500 mb-4">Сколько каких оценок выставлено в классе</p>
                    {summary.gradedCount === 0 ? (
                        <div className="text-center text-gray-400 py-12 text-sm">Нет проверенных работ</div>
                    ) : (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#6b7280' }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                                        formatter={(value: any) => [value, 'работ']}
                                        labelFormatter={(label: any) => `Оценка ${label}`}
                                    />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {distributionData.map((d, i) => (
                                            <Cell key={i} fill={d.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-1">Динамика среднего балла</h3>
                    <p className="text-xs text-gray-500 mb-4">По неделям, за последние 8 недель</p>
                    {trendData.every((d) => d.avgGrade === null) ? (
                        <div className="text-center text-gray-400 py-12 text-sm">Недостаточно данных для тренда</div>
                    ) : (
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                                        formatter={(value: any, _name: any, item: any) => [
                                            value === null ? 'нет работ' : value,
                                            `Средний балл (${item?.payload?.count ?? 0} работ)`,
                                        ]}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="avgGrade"
                                        stroke="#6366f1"
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: '#6366f1' }}
                                        connectNulls
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* At-risk students */}
            {atRisk.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
                    <div className="p-5 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2">
                        <i className="fas fa-exclamation-triangle text-amber-600"></i>
                        <h3 className="text-base font-bold text-gray-900">Кому нужна помощь ({atRisk.length})</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {atRisk.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => onSelectStudent(s.id)}
                                className="w-full text-left p-4 hover:bg-gray-50 transition flex items-center justify-between gap-3"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                                        {s.avatar || s.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                                        <p className="text-xs text-gray-500">
                                            Сдано {s.submitted}/{s.totalAssignments}
                                            {s.onTimeRate !== null && ` · вовремя ${Math.round(s.onTimeRate * 100)}%`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className={`text-lg font-black ${
                                        s.avgGrade === null ? 'text-gray-400'
                                            : s.avgGrade >= 4 ? 'text-green-600'
                                            : s.avgGrade >= 3 ? 'text-yellow-600'
                                            : 'text-red-500'
                                    }`}>
                                        {s.avgGrade ?? '—'}
                                    </span>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${RISK_COLOR[s.riskLevel]}`}>
                                        {RISK_LABEL[s.riskLevel]}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Full breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                    <h3 className="text-base font-bold text-gray-900">Все ученики</h3>
                    <p className="text-xs text-gray-500">Сортировка: сначала те, кому нужно внимание</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-500 bg-gray-50/50">
                                <th className="text-left py-2.5 px-4 font-semibold">Ученик</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Средний балл</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Сдано</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Вовремя</th>
                                <th className="text-center py-2.5 px-3 font-semibold">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {studentBreakdown.map((s) => (
                                <tr
                                    key={s.id}
                                    onClick={() => onSelectStudent(s.id)}
                                    className="hover:bg-gray-50 transition cursor-pointer"
                                >
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">
                                                {s.avatar || s.name.charAt(0)}
                                            </div>
                                            <span className="font-medium text-gray-900">{s.name}</span>
                                        </div>
                                    </td>
                                    <td className={`text-center py-3 px-3 font-bold ${
                                        s.avgGrade === null ? 'text-gray-400'
                                            : s.avgGrade >= 4 ? 'text-green-600'
                                            : s.avgGrade >= 3 ? 'text-yellow-600'
                                            : 'text-red-500'
                                    }`}>
                                        {s.avgGrade ?? '—'}
                                    </td>
                                    <td className="text-center py-3 px-3 text-gray-700">
                                        {s.submitted}/{s.totalAssignments}
                                    </td>
                                    <td className="text-center py-3 px-3 text-gray-700">
                                        {s.onTimeRate !== null ? `${Math.round(s.onTimeRate * 100)}%` : '—'}
                                    </td>
                                    <td className="text-center py-3 px-3">
                                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${RISK_COLOR[s.riskLevel]}`}>
                                            {RISK_LABEL[s.riskLevel]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function MetricCard({
    label,
    value,
    sub,
    color = 'text-gray-900',
}: {
    label: string
    value: string | number
    sub?: string
    color?: string
}) {
    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
            <div className="text-gray-500 text-xs font-medium mb-1">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        </div>
    )
}
