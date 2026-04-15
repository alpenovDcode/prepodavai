'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

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
    const [activeTab, setActiveTab] = useState<'students' | 'assignments'>('students')
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
            </div>

            {/* Content */}
            {activeTab === 'students' ? (
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
