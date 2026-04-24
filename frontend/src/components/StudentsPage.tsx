'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'
import Image from 'next/image'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'

/** Сравнивает ответы ученика с ключом ответов из HTML теста */
function computeQuizScore(html: string, formData: Record<string, any>): { correct: number; total: number } | null {
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const answerSection = doc.querySelector('.teacher-answers-only')
        if (!answerSection) return null

        // Collect all radio groups from the full HTML to know total question count
        const allRadios = Array.from(doc.querySelectorAll('input[type="radio"]'))
        const radioGroups = new Set(allRadios.map(r => (r as HTMLInputElement).name).filter(Boolean))
        if (radioGroups.size === 0) return null

        const answerText = answerSection.textContent || ''

        // Parse answer key - try multiple formats LLM might produce:
        // "1. B", "1) B", "1: B", "1 - B", "1 — B", "1 – B", "1  B"
        const answerMap: Record<string, string> = {}
        const patterns = [
            /(\d+)\s*[.)]\s*([A-Da-dА-Да-д])\b/g,   // 1. B  or  1) B
            /(\d+)\s*[-–—]\s*([A-Da-dА-Да-д])\b/g,   // 1 - B  or  1 — B
            /(\d+)\s*:\s*([A-Da-dА-Да-д])\b/g,        // 1: B
        ]
        for (const pat of patterns) {
            let m: RegExpExecArray | null
            pat.lastIndex = 0
            while ((m = pat.exec(answerText)) !== null) {
                answerMap[m[1]] = m[2].toUpperCase()
            }
            if (Object.keys(answerMap).length >= radioGroups.size) break
        }
        if (Object.keys(answerMap).length === 0) return null

        const total = Math.max(Object.keys(answerMap).length, radioGroups.size)
        let correct = 0

        for (const [qNum, correctAnswer] of Object.entries(answerMap)) {
            // Try common radio name patterns the LLM might have used
            const candidateKeys = [
                `r__q${qNum}`,
                `r__question${qNum}`,
                `r__q_${qNum}`,
            ]
            for (const key of candidateKeys) {
                const student = formData[key]
                if (student !== undefined) {
                    if (String(student).toUpperCase() === correctAnswer) correct++
                    break
                }
            }
        }

        return { correct, total: Object.keys(answerMap).length }
    } catch {
        return null
    }
}

interface Class {
    id: string
    name: string
    description?: string
    _count?: {
        students: number
    }
}

interface Student {
    id: string
    name: string
    email?: string
    avatar?: string
    accessCode?: string
    status?: 'active' | 'pending'
    class: {
        name: string
    }
    createdAt: string
}

interface Assignment {
    id: string
    createdAt: string
    dueDate?: string
    lesson: { title: string; topic: string }
    class?: { name: string } | null
    student?: { name: string } | null
    _count: { submissions: number }
}

interface StudentStatus {
    student: { id: string; name: string; avatar?: string }
    submission: {
        id: string
        grade: number | null
        feedback: string | null
        content: string | null
        attachments?: any[]
        formData?: Record<string, Record<string, any>> | null
        status: string
        createdAt: string
    } | null
    status: 'pending' | 'submitted' | 'graded'
}

interface AssignmentDetails {
    assignment: {
        id: string
        dueDate: string | null
        content?: string | null
        generations?: Array<{ id: string; type: string; outputData: any }>
    }
    studentStatuses: StudentStatus[]
    totalStudents: number
    submittedCount: number
    gradedCount: number
    notSubmittedCount: number
    avgGrade: number | null
}

export default function StudentsPage() {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'students' | 'classes' | 'assignments'>('students')
    const [searchQuery, setSearchQuery] = useState('')
    const [students, setStudents] = useState<Student[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loading, setLoading] = useState(true)

    // Notification modal
    const [notification, setNotification] = useState<{ title: string; message: string; isLimit?: boolean } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null)
    const [copiedToast, setCopiedToast] = useState(false)

    const showError = (message: string) => {
        setNotification({ title: 'Ошибка', message })
    }
    const showLimitError = (message: string) => {
        setNotification({ title: 'Лимит тарифа', message, isLimit: true })
    }
    const showConfirm = (message: string, onConfirm: () => void) => {
        setConfirmModal({ message, onConfirm })
    }
    const copyLink = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopiedToast(true)
        setTimeout(() => setCopiedToast(false), 2000)
    }
    const handleApiError = (error: any, fallback = 'Произошла ошибка') => {
        const msg = error?.response?.data?.message || fallback
        if (error?.response?.status === 403) showLimitError(msg)
        else showError(msg)
    }

    // Modals state
    const [showAddClassModal, setShowAddClassModal] = useState(false)
    const [showAddStudentModal, setShowAddStudentModal] = useState(false)
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [inviteClassId, setInviteClassId] = useState<string>('')
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteCopied, setInviteCopied] = useState(false)

    const openInviteModal = () => {
        setInviteUrl(null)
        setInviteClassId('')
        setInviteCopied(false)
        setShowInviteModal(true)
    }

    const createInvite = async () => {
        setInviteLoading(true)
        try {
            const response = await apiClient.post<{ token: string }>('/student-invites', {
                classId: inviteClassId || undefined,
            })
            setInviteUrl(`${window.location.origin}/invite/${response.data.token}`)
        } catch (error: any) {
            handleApiError(error, 'Не удалось создать приглашение')
        } finally {
            setInviteLoading(false)
        }
    }

    const copyInviteUrl = async () => {
        if (!inviteUrl) return
        await navigator.clipboard.writeText(inviteUrl)
        setInviteCopied(true)
        setTimeout(() => setInviteCopied(false), 2000)
    }

    const approveStudent = async (studentId: string) => {
        try {
            await apiClient.post(`/students/${studentId}/approve`)
            setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: 'active' } : s)))
        } catch (error: any) {
            handleApiError(error, 'Не удалось принять ученика')
        }
    }

    const deleteStudent = async (studentId: string, studentName: string) => {
        showConfirm(`Удалить ученика «${studentName}»? Это действие нельзя отменить.`, async () => {
            try {
                await apiClient.delete(`/students/${studentId}`)
                setStudents((prev) => prev.filter((s) => s.id !== studentId))
            } catch (error: any) {
                handleApiError(error, 'Не удалось удалить ученика')
            }
        })
    }

    const rejectStudent = async (studentId: string) => {
        showConfirm('Отклонить заявку ученика? Его аккаунт будет удалён.', async () => {
            try {
                await apiClient.post(`/students/${studentId}/reject`)
                setStudents((prev) => prev.filter((s) => s.id !== studentId))
            } catch (error: any) {
                handleApiError(error, 'Не удалось отклонить')
            }
        })
    }

    // Review modal state
    const [reviewAssignment, setReviewAssignment] = useState<Assignment | null>(null)
    const [reviewDetails, setReviewDetails] = useState<AssignmentDetails | null>(null)
    const [reviewLoading, setReviewLoading] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState<StudentStatus | null>(null)
    const [gradeInput, setGradeInput] = useState<number | ''>('')
    const [feedbackInput, setFeedbackInput] = useState('')
    const [submittingGrade, setSubmittingGrade] = useState(false)
    const [generatingFeedback, setGeneratingFeedback] = useState(false)

    // M1: AI-черновик оценки. Кеш по submissionId.
    const [aiDrafts, setAiDrafts] = useState<Record<string, { grade: number | null; feedback: string }>>({})
    const [draftFetchingId, setDraftFetchingId] = useState<string | null>(null)

    // Form state
    const [newClassName, setNewClassName] = useState('')
    const [newStudentName, setNewStudentName] = useState('')
    const [newStudentEmail, setNewStudentEmail] = useState('')
    const [newStudentPhone, setNewStudentPhone] = useState('')
    const [newStudentPassword, setNewStudentPassword] = useState('')
    const [selectedClassId, setSelectedClassId] = useState('')

    const fetchData = async () => {
        setLoading(true)
        try {
            const [classesRes, studentsRes, assignmentsRes] = await Promise.all([
                apiClient.get('/classes'),
                apiClient.get('/students'),
                apiClient.get('/assignments'),
            ])
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
            setAssignments(assignmentsRes.data)
        } catch (error) {
            console.error('Failed to fetch data:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleCreateClass = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await apiClient.post('/classes', { name: newClassName })
            setNewClassName('')
            setShowAddClassModal(false)
            fetchData()
        } catch (error: any) {
            handleApiError(error, 'Не удалось создать класс')
        }
    }

    const handleCreateStudent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedClassId) {
            showError('Выберите класс')
            return
        }
        try {
            await apiClient.post('/students', {
                name: newStudentName,
                email: newStudentEmail || undefined,
                phone: newStudentPhone || undefined,
                password: newStudentPassword,
                classId: selectedClassId
            })
            setNewStudentName('')
            setNewStudentEmail('')
            setNewStudentPhone('')
            setNewStudentPassword('')
            setSelectedClassId('')
            setShowAddStudentModal(false)
            fetchData()
        } catch (error: any) {
            handleApiError(error, 'Ошибка при создании ученика')
        }
    }

    const handleOpenReview = async (assignment: Assignment) => {
        setReviewAssignment(assignment)
        setReviewLoading(true)
        setSelectedStudent(null)
        setGradeInput('')
        setFeedbackInput('')
        try {
            const res = await apiClient.get(`/submissions/assignment/${assignment.id}`)
            setReviewDetails(res.data)
            // Auto-select first student with a submission
            const firstSubmitted = (res.data as AssignmentDetails).studentStatuses.find(
                s => s.status === 'submitted' || s.status === 'graded'
            )
            if (firstSubmitted) {
                setSelectedStudent(firstSubmitted)
                setGradeInput(firstSubmitted.submission?.grade || '')
                setFeedbackInput(firstSubmitted.submission?.feedback || '')
            }
        } catch (error: any) {
            console.error('Failed to fetch assignment details:', error)
            handleApiError(error, 'Ошибка при загрузке данных задания')
            setReviewAssignment(null)
        } finally {
            setReviewLoading(false)
        }
    }

    const handleCloseReview = () => {
        setReviewAssignment(null)
        setReviewDetails(null)
        setSelectedStudent(null)
        setGradeInput('')
        setFeedbackInput('')
    }

    const fetchAiDraftFor = useCallback(async (submissionId: string) => {
        if (aiDrafts[submissionId] || draftFetchingId === submissionId) return
        setDraftFetchingId(submissionId)
        try {
            const res = await apiClient.post<{ grade: number | null; feedback: string }>(
                `/submissions/${submissionId}/ai-feedback`
            )
            setAiDrafts(prev => ({
                ...prev,
                [submissionId]: {
                    grade: typeof res.data?.grade === 'number' ? res.data.grade : null,
                    feedback: (res.data?.feedback || '').trim(),
                },
            }))
        } catch (error) {
            console.error('Failed to prefetch AI draft', error)
        } finally {
            setDraftFetchingId(prev => (prev === submissionId ? null : prev))
        }
    }, [aiDrafts, draftFetchingId])

    const handleSelectStudent = (status: StudentStatus) => {
        setSelectedStudent(status)
        setGradeInput(status.submission?.grade || '')
        setFeedbackInput(status.submission?.feedback || '')
        // Auto-prefetch AI draft для ещё не оценённых сдач
        if (status.status === 'submitted' && status.submission?.id) {
            fetchAiDraftFor(status.submission.id)
        }
    }

    const acceptAiDraft = () => {
        const submissionId = selectedStudent?.submission?.id
        if (!submissionId) return
        const draft = aiDrafts[submissionId]
        if (!draft) return
        if (draft.grade !== null) setGradeInput(draft.grade)
        if (draft.feedback) setFeedbackInput(draft.feedback)
    }

    const handleSubmitGrade = async () => {
        if (!selectedStudent?.submission) return
        if (gradeInput === '' || gradeInput < 1 || gradeInput > 5) {
            showError('Оценка должна быть от 1 до 5')
            return
        }
        setSubmittingGrade(true)
        try {
            await apiClient.patch(`/submissions/${selectedStudent.submission.id}/grade`, {
                grade: Number(gradeInput),
                feedback: feedbackInput
            })
            // Refresh details
            if (reviewAssignment) {
                const res = await apiClient.get(`/submissions/assignment/${reviewAssignment.id}`)
                setReviewDetails(res.data)
                // Update selected student
                const updated = (res.data as AssignmentDetails).studentStatuses.find(
                    s => s.student.id === selectedStudent.student.id
                )
                if (updated) {
                    setSelectedStudent(updated)
                    setGradeInput(updated.submission?.grade || '')
                    setFeedbackInput(updated.submission?.feedback || '')
                }
            }
            fetchData()
        } catch (error: any) {
            console.error('Failed to submit grade:', error)
            handleApiError(error, 'Ошибка при сохранении оценки')
        } finally {
            setSubmittingGrade(false)
        }
    }

    const handleGenerateAiFeedback = async () => {
        if (!selectedStudent?.submission) return
        const submissionId = selectedStudent.submission.id
        setGeneratingFeedback(true)
        try {
            const res = await apiClient.post<{ grade: number | null; feedback: string }>(
                `/submissions/${submissionId}/ai-feedback`
            )
            const feedback = (res.data?.feedback || '').trim()
            const grade = typeof res.data?.grade === 'number' ? res.data.grade : null
            setFeedbackInput(feedback)
            if (grade !== null) setGradeInput(grade)
            setAiDrafts(prev => ({ ...prev, [submissionId]: { grade, feedback } }))
        } catch (error: any) {
            console.error('Failed to generate AI feedback:', error)
            handleApiError(error, 'Ошибка при генерации AI комментария')
        } finally {
            setGeneratingFeedback(false)
        }
    }

    const filteredStudents = students.filter(
        (student) =>
            student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (student.email && student.email.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Ученики и Классы</h1>
                    <p className="text-gray-600 mt-1 text-sm sm:text-base">Управляйте своими классами и учениками.</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                        onClick={() => setShowAddClassModal(true)}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2 shadow-sm text-sm"
                    >
                        <i className="fas fa-layer-group"></i>
                        <span>Создать класс</span>
                    </button>
                    <button
                        onClick={openInviteModal}
                        className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-2 shadow-sm text-sm"
                    >
                        <i className="fas fa-link"></i>
                        <span>Пригласить</span>
                    </button>
                    <button
                        onClick={() => setShowAddStudentModal(true)}
                        className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-lg hover:shadow-xl text-sm"
                    >
                        <i className="fas fa-user-plus"></i>
                        <span>Добавить ученика</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-gray-200 mb-6">
                <button
                    onClick={() => setActiveTab('students')}
                    className={`pb-4 px-2 font-medium transition relative ${activeTab === 'students'
                        ? 'text-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Ученики
                    {activeTab === 'students' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 rounded-t-full"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('classes')}
                    className={`pb-4 px-2 font-medium transition relative ${activeTab === 'classes'
                        ? 'text-primary-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Классы
                    {activeTab === 'classes' && (
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
                    Домашние задания
                    {activeTab === 'assignments' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 rounded-t-full"></div>
                    )}
                </button>
            </div>

            {activeTab === 'students' ? (
                <>
                    {/* Search Bar */}
                    <div className="dashboard-card mb-6">
                        <div className="relative">
                            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Поиск учеников..."
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                            />
                        </div>
                    </div>

                    {/* Students — cards on mobile, table on sm+ */}
                    <div className="dashboard-card">
                        {filteredStudents.length === 0 ? (
                            <div className="text-center py-12">
                                <i className="fas fa-users text-6xl text-gray-200 mb-4"></i>
                                <p className="text-gray-500">Ученики не найдены</p>
                                <button
                                    onClick={() => setShowAddStudentModal(true)}
                                    className="text-primary-600 font-medium hover:text-primary-700 mt-2"
                                >
                                    Добавить первого ученика
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Mobile cards */}
                                <div className="sm:hidden divide-y divide-gray-50">
                                    {filteredStudents.map((student) => (
                                        <div key={student.id} className="py-4 px-2">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                                                    {student.avatar || student.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-semibold text-gray-900 truncate">{student.name}</p>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{student.class.name}</span>
                                                        {student.status === 'pending' && (
                                                            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Ожидает</span>
                                                        )}
                                                    </div>
                                                    {student.email && <p className="text-xs text-gray-400 mt-0.5 truncate">{student.email}</p>}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {student.status === 'pending' ? (
                                                    <>
                                                        <button onClick={() => approveStudent(student.id)} className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition">Принять</button>
                                                        <button onClick={() => rejectStudent(student.id)} className="flex-1 py-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition">Отклонить</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => window.location.href = `/dashboard/students/${student.id}`}
                                                            className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition"
                                                        >
                                                            Профиль
                                                        </button>
                                                        <button
                                                            onClick={() => copyLink(`${window.location.origin}/student/login`)}
                                                            className="px-3 py-2 bg-gray-100 text-gray-500 text-sm rounded-lg hover:bg-gray-200 transition"
                                                        >
                                                            <i className="fas fa-link"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => deleteStudent(student.id, student.name)}
                                                            className="px-3 py-2 bg-white border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition"
                                                        >
                                                            <i className="fas fa-trash-alt"></i>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop table */}
                                <div className="hidden sm:block overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-50">
                                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Имя ученика</th>
                                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Класс</th>
                                                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Email</th>
                                                <th className="text-right py-4 px-4 text-sm font-semibold text-gray-700">Действия</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredStudents.map((student) => (
                                                <tr key={student.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                                    <td className="py-4 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                                                                {student.avatar || student.name.charAt(0)}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-semibold text-gray-900">{student.name}</p>
                                                                {student.status === 'pending' && (
                                                                    <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Ожидает подтверждения</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">{student.class.name}</span>
                                                    </td>
                                                    <td className="py-4 px-4 text-sm text-gray-500">
                                                        {student.email || <span className="text-gray-300 italic">не указан</span>}
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {student.status === 'pending' ? (
                                                                <>
                                                                    <button onClick={() => approveStudent(student.id)} className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition">Принять</button>
                                                                    <button onClick={() => rejectStudent(student.id)} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition">Отклонить</button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button onClick={() => copyLink(`${window.location.origin}/student/login`)} className="p-2 text-gray-400 hover:text-primary-600 transition" title="Копировать ссылку для входа"><i className="fas fa-link"></i></button>
                                                                    <button onClick={() => window.location.href = `/dashboard/students/${student.id}`} className="p-2 text-gray-400 hover:text-primary-600 transition"><i className="fas fa-user-circle"></i></button>
                                                                    <button onClick={() => deleteStudent(student.id, student.name)} className="p-2 text-gray-400 hover:text-red-600 transition"><i className="fas fa-trash-alt"></i></button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </>
            ) : activeTab === 'classes' ? (
                <div className="grid md:grid-cols-3 gap-6">
                    {classes.map((cls) => (
                        <div key={cls.id} className="dashboard-card hover:shadow-lg transition cursor-pointer group"
                            onClick={() => router.push(`/dashboard/classes/${cls.id}`)}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 text-xl">
                                    <i className="fas fa-layer-group"></i>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button className="p-2 text-gray-400 hover:text-primary-600"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            // Handle edit
                                        }}
                                    >
                                        <i className="fas fa-edit"></i>
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1">{cls.name}</h3>
                            <p className="text-gray-500 text-sm mb-4">{cls.description || 'Нет описания'}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                <i className="fas fa-user-graduate"></i>
                                <span>{cls._count?.students || 0} учеников</span>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={() => setShowAddClassModal(true)}
                        className="dashboard-card border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 transition min-h-[200px]"
                    >
                        <i className="fas fa-plus-circle text-3xl mb-3"></i>
                        <span className="font-medium">Создать новый класс</span>
                    </button>
                </div>
            ) : (
                <div className="dashboard-card overflow-hidden">
                    {assignments.length === 0 ? (
                        <div className="py-12 text-center text-gray-400">Вы ещё не выдали ни одного задания</div>
                    ) : (
                        <>
                            {/* Mobile cards */}
                            <div className="sm:hidden divide-y divide-gray-50">
                                {assignments.map((a) => (
                                    <div key={a.id} className="py-4 px-2">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{a.lesson.title}</p>
                                                <p className="text-xs text-gray-400 truncate">{a.lesson.topic}</p>
                                            </div>
                                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                a._count.submissions > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {a._count.submissions > 0 ? `${a._count.submissions} работ` : 'Нет'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                {a.student ? (
                                                    <span>{a.student.name} · инд.</span>
                                                ) : a.class ? (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">{a.class.name}</span>
                                                ) : null}
                                                {a.dueDate && (
                                                    <span>до {new Date(a.dueDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                                                )}
                                            </div>
                                            <button onClick={() => handleOpenReview(a)} className="text-sm text-primary-600 font-semibold hover:text-primary-700">
                                                Проверить →
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop table */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Задание</th>
                                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Ученик / Класс</th>
                                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Срок сдачи</th>
                                            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Сдано</th>
                                            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-700">Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignments.map((a) => (
                                            <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                                <td className="py-4 px-4">
                                                    <p className="font-semibold text-gray-900">{a.lesson.title}</p>
                                                    <p className="text-sm text-gray-400">{a.lesson.topic}</p>
                                                </td>
                                                <td className="py-4 px-4">
                                                    {a.student ? (
                                                        <div><p className="font-medium text-gray-800">{a.student.name}</p><span className="text-xs text-gray-400">индивидуальное</span></div>
                                                    ) : a.class ? (
                                                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">{a.class.name}</span>
                                                    ) : '—'}
                                                </td>
                                                <td className="py-4 px-4 text-sm text-gray-500">
                                                    {a.dueDate ? new Date(a.dueDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : <span className="text-gray-300">не задан</span>}
                                                </td>
                                                <td className="py-4 px-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${a._count.submissions > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                        {a._count.submissions > 0 ? `${a._count.submissions} работ` : 'Нет'}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <button onClick={() => handleOpenReview(a)} className="text-sm text-primary-600 font-medium hover:text-primary-700">Проверить →</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Add Class Modal */}
            {showAddClassModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-fade-in p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-gray-900 mb-5">Создать класс</h2>
                        <form onSubmit={handleCreateClass}>
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Название класса
                                </label>
                                <input
                                    type="text"
                                    value={newClassName}
                                    onChange={(e) => setNewClassName(e.target.value)}
                                    placeholder="например, 5А Математика"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowAddClassModal(false)}
                                    className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition"
                                >
                                    Создать
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Student Modal */}
            {showAddStudentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-fade-in p-0 sm:p-4">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 sm:p-8 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-gray-900 mb-5">Добавить ученика</h2>
                        <form onSubmit={handleCreateStudent}>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Имя и Фамилия
                                </label>
                                <input
                                    type="text"
                                    value={newStudentName}
                                    onChange={(e) => setNewStudentName(e.target.value)}
                                    placeholder="Иван Иванов"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Email <span className="text-gray-400 font-normal">(необязательно)</span>
                                </label>
                                <input
                                    type="email"
                                    value={newStudentEmail}
                                    onChange={(e) => setNewStudentEmail(e.target.value)}
                                    placeholder="ivan@example.com"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Номер телефона <span className="text-gray-400 font-normal">(необязательно)</span>
                                </label>
                                <input
                                    type="tel"
                                    value={newStudentPhone}
                                    onChange={(e) => setNewStudentPhone(e.target.value)}
                                    placeholder="+7 999 123-45-67"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Пароль
                                </label>
                                <input
                                    type="password"
                                    value={newStudentPassword}
                                    onChange={(e) => setNewStudentPassword(e.target.value)}
                                    placeholder="Придумайте пароль для ученика"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                    required
                                    minLength={6}
                                />
                                <p className="text-xs text-gray-400 mt-1">Минимум 6 символов. Сообщите ученику этот пароль.</p>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Класс
                                </label>
                                <select
                                    value={selectedClassId}
                                    onChange={(e) => setSelectedClassId(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                    required
                                >
                                    <option value="">Выберите класс</option>
                                    {classes.map(cls => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowAddStudentModal(false)}
                                    className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition"
                                >
                                    Добавить
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Student Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">Пригласить ученика</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Создайте ссылку-приглашение. Ученик зарегистрируется по ней и будет закреплён за вами.
                        </p>

                        {!inviteUrl ? (
                            <>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Класс (необязательно)</label>
                                <select
                                    value={inviteClassId}
                                    onChange={(e) => setInviteClassId(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 mb-4"
                                >
                                    <option value="">Без привязки к классу</option>
                                    {classes.map((cls) => (
                                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                </select>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowInviteModal(false)}
                                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        onClick={createInvite}
                                        disabled={inviteLoading}
                                        className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-60"
                                    >
                                        {inviteLoading ? 'Создаём...' : 'Создать ссылку'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex gap-2 mb-4">
                                    <input
                                        type="text"
                                        readOnly
                                        value={inviteUrl}
                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-mono"
                                    />
                                    <button
                                        onClick={copyInviteUrl}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition"
                                    >
                                        {inviteCopied ? 'Скопировано' : 'Копировать'}
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowInviteModal(false)}
                                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                                >
                                    Закрыть
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Review Assignment Modal */}
            {reviewAssignment && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl sm:mx-4 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 shrink-0">
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base sm:text-xl font-bold text-gray-900 truncate">{reviewAssignment.lesson.title}</h2>
                                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{reviewAssignment.lesson.topic}</p>
                            </div>
                            <button
                                onClick={handleCloseReview}
                                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition shrink-0 ml-2"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        {reviewLoading ? (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>
                            </div>
                        ) : reviewDetails ? (
                            <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
                                {/* Students list — horizontal scroll on mobile, sidebar on desktop */}
                                <div className="sm:w-64 sm:flex-shrink-0 sm:border-r border-b sm:border-b-0 border-gray-100 flex flex-col overflow-hidden">
                                    <div className="p-2 sm:p-3 bg-gray-50 border-b border-gray-100">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                                            <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Ждут: {reviewDetails.submittedCount - reviewDetails.gradedCount}</span>
                                            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Оценено: {reviewDetails.gradedCount}</span>
                                        </div>
                                    </div>
                                    {/* Mobile: horizontal scroll; Desktop: vertical scroll */}
                                    <div className="flex sm:flex-col overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto p-2 gap-2 sm:gap-0">
                                        {reviewDetails.studentStatuses.map(status => (
                                            <button
                                                key={status.student.id}
                                                onClick={() => handleSelectStudent(status)}
                                                className={`shrink-0 sm:shrink text-left p-2 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3 sm:mb-1 transition-colors ${
                                                    selectedStudent?.student.id === status.student.id
                                                        ? 'bg-primary-50 border border-primary-200 ring-1 ring-primary-500'
                                                        : 'hover:bg-gray-50 border border-transparent'
                                                }`}
                                            >
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-200 flex flex-shrink-0 items-center justify-center text-gray-600 font-bold text-xs">
                                                    {status.student.avatar || status.student.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-xs sm:text-sm text-gray-900 truncate max-w-[90px] sm:max-w-none">{status.student.name}</p>
                                                    <p className={`text-xs font-medium hidden sm:block ${
                                                        status.status === 'graded' ? 'text-green-600' :
                                                        status.status === 'submitted' ? 'text-yellow-600' : 'text-gray-400'
                                                    }`}>
                                                        {status.status === 'graded' ? `Оценка: ${status.submission?.grade}` :
                                                         status.status === 'submitted' ? 'Ожидает' : 'Не сдано'}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Right: Student work + grading */}
                                <div className="flex-1 overflow-y-auto">
                                    {!selectedStudent ? (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                            <p className="text-lg font-bold text-gray-800 mb-1">Выберите ученика</p>
                                            <p className="text-sm">Нажмите на ученика слева, чтобы проверить работу</p>
                                        </div>
                                    ) : selectedStudent.status === 'pending' ? (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-50"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                            <p className="text-lg font-bold text-gray-800 mb-1">Работа не сдана</p>
                                            <p className="text-sm">Ученик пока не отправил ответ</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            {/* Student's answer */}
                                            <div className="p-6 border-b border-gray-100 bg-gray-50">
                                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Ответ ученика</h3>

                                                {/* Interactive HTML forms */}
                                                {(() => {
                                                    const generations = reviewDetails.assignment.generations || []
                                                    const formData = selectedStudent.submission?.formData || {}
                                                    const interactiveBlocks = generations
                                                        .map(gen => ({ gen, html: extractHtmlFromOutput(gen.outputData), prefill: formData[gen.id] }))
                                                        .filter(item => item.html && item.prefill && Object.keys(item.prefill).length > 0)

                                                    if (interactiveBlocks.length > 0) {
                                                        return (
                                                            <div className="space-y-4 mb-4">
                                                                {interactiveBlocks.map(({ gen, html, prefill }) => (
                                                                    <InteractiveHtmlViewer
                                                                        key={gen.id}
                                                                        html={html!}
                                                                        generationId={gen.id}
                                                                        readOnly
                                                                        prefillData={prefill}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )
                                                    }
                                                    return null
                                                })()}

                                                {/* Text answer */}
                                                {(selectedStudent.submission?.content || !reviewDetails.assignment.generations?.some(gen => {
                                                    const formData = selectedStudent.submission?.formData || {}
                                                    const html = extractHtmlFromOutput(gen.outputData)
                                                    return html && formData[gen.id] && Object.keys(formData[gen.id]).length > 0
                                                })) && (
                                                    <div className="bg-white p-4 rounded-xl border border-gray-200 text-gray-800 text-sm leading-relaxed">
                                                        <div className="whitespace-pre-wrap">
                                                            {selectedStudent.submission?.content || 'Пустой ответ'}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Attachments */}
                                                {selectedStudent.submission?.attachments && selectedStudent.submission.attachments.length > 0 && (
                                                    <div className="mt-4">
                                                        <p className="text-sm font-semibold text-gray-500 mb-2">Прикрепленные файлы:</p>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {selectedStudent.submission.attachments.map((file: any, index: number) => (
                                                                <div key={index} className="rounded-xl overflow-hidden border border-gray-200 bg-white relative min-h-[150px]">
                                                                    <Image
                                                                        src={file.url}
                                                                        alt={`Файл ${index + 1}`}
                                                                        fill
                                                                        className="object-contain p-2"
                                                                        unoptimized
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <p className="text-xs text-gray-400 mt-3">
                                                    Отправлено: {new Date(selectedStudent.submission!.createdAt).toLocaleString('ru-RU')}
                                                </p>
                                            </div>

                                            {/* Grading section */}
                                            <div className="p-6">
                                                {(() => {
                                                    const generations = reviewDetails.assignment.generations || []
                                                    const rawFormData = selectedStudent.submission?.formData || {}
                                                    // formData may be keyed by generationId or be a flat dict
                                                    const scores = generations
                                                        .map(gen => {
                                                            const html = extractHtmlFromOutput(gen.outputData)
                                                            if (!html) return null
                                                            // Try gen.id key first, then flat formData
                                                            const studentData: Record<string, any> =
                                                                (rawFormData as any)[gen.id] ||
                                                                (typeof rawFormData === 'object' && !Object.values(rawFormData).some(v => typeof v === 'object' && v !== null)
                                                                    ? rawFormData as Record<string, any>
                                                                    : null)
                                                            if (!studentData || Object.keys(studentData).length === 0) {
                                                                console.log('[QuizScore] no studentData for gen', gen.id, 'formData keys:', Object.keys(rawFormData))
                                                                return null
                                                            }
                                                            console.log('[QuizScore] studentData:', studentData)
                                                            return computeQuizScore(html, studentData)
                                                        })
                                                        .filter(Boolean) as { correct: number; total: number }[]
                                                    if (scores.length === 0) return null
                                                    const totalCorrect = scores.reduce((s, r) => s + r.correct, 0)
                                                    const totalQuestions = scores.reduce((s, r) => s + r.total, 0)
                                                    const pct = Math.round((totalCorrect / totalQuestions) * 100)
                                                    const color = pct >= 80 ? 'bg-green-50 border-green-200 text-green-800' : pct >= 50 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'
                                                    return (
                                                        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-5 ${color}`}>
                                                            <div className="text-2xl font-black">{totalCorrect}/{totalQuestions}</div>
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Правильных ответов</p>
                                                                <p className="text-sm font-bold">{pct}%</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })()}
                                                {/* M1: AI DRAFT BANNER — автогенерируется при выборе ученика */}
                                                {(() => {
                                                    const submissionId = selectedStudent.submission?.id
                                                    if (!submissionId) return null
                                                    const draft = aiDrafts[submissionId]
                                                    const isDraftLoading = draftFetchingId === submissionId

                                                    if (isDraftLoading) {
                                                        return (
                                                            <div className="mb-5 p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center gap-3">
                                                                <span className="animate-spin inline-block w-4 h-4 border-2 border-purple-300 border-t-purple-700 rounded-full" />
                                                                <div>
                                                                    <p className="text-sm font-bold text-purple-900">ИИ проверяет работу...</p>
                                                                    <p className="text-xs text-purple-700">Черновик оценки и комментарий появятся через пару секунд.</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    }

                                                    if (!draft) return null

                                                    return (
                                                        <div className="mb-5 p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
                                                                            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
                                                                        </svg>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">ИИ предлагает</p>
                                                                        <p className="text-sm font-bold text-gray-900">
                                                                            Оценка: {draft.grade !== null
                                                                                ? <span className="text-lg">{draft.grade}</span>
                                                                                : <span className="text-gray-400 text-xs">не определена</span>}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={acceptAiDraft}
                                                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition shadow-sm"
                                                                    title="Принять черновик"
                                                                >
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>
                                                                    Принять
                                                                </button>
                                                            </div>
                                                            {draft.feedback && (
                                                                <p className="text-xs text-gray-700 bg-white/60 rounded-lg p-2.5 leading-relaxed mt-2">
                                                                    {draft.feedback}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )
                                                })()}

                                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Оценка и комментарий</h3>

                                                <div className="mb-5">
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Оценка (1-5)</label>
                                                    <div className="flex gap-2">
                                                        {[1, 2, 3, 4, 5].map(num => (
                                                            <button
                                                                key={num}
                                                                onClick={() => setGradeInput(num)}
                                                                className={`w-11 h-11 rounded-xl font-black text-lg transition-transform active:scale-95 ${
                                                                    gradeInput === num
                                                                        ? 'bg-primary-600 text-white shadow-md'
                                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                                }`}
                                                            >
                                                                {num}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="mb-5">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-sm font-semibold text-gray-700">Комментарий</label>
                                                        <button
                                                            onClick={handleGenerateAiFeedback}
                                                            disabled={generatingFeedback || !selectedStudent?.submission}
                                                            className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {generatingFeedback
                                                                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-purple-300 border-t-purple-700 rounded-full"></span> Генерирую...</>
                                                                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg> AI проверка</>
                                                            }
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={feedbackInput}
                                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                                        className="w-full h-28 px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition resize-none text-sm"
                                                        placeholder="Напишите комментарий или нажмите AI проверка..."
                                                    />
                                                </div>

                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={handleSubmitGrade}
                                                        disabled={submittingGrade || gradeInput === ''}
                                                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {submittingGrade ? (
                                                            <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span> Сохранение...</>
                                                        ) : (
                                                            <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Сохранить оценку</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
            {/* Notification Modal (error / limit) */}
            {notification && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${notification.isLimit ? 'bg-amber-100' : 'bg-red-100'}`}>
                            {notification.isLimit
                                ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                            }
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{notification.title}</h3>
                        <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">{notification.message}</p>
                        <div className={`flex gap-3 ${notification.isLimit ? 'flex-col' : ''}`}>
                            {notification.isLimit && (
                                <button
                                    onClick={() => { setNotification(null); router.push('/dashboard/settings') }}
                                    className="w-full py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition text-sm"
                                >
                                    Улучшить тариф
                                </button>
                            )}
                            <button
                                onClick={() => setNotification(null)}
                                className="w-full py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition text-sm"
                            >
                                {notification.isLimit ? 'Закрыть' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </div>
                        <p className="text-sm text-gray-700 text-center mb-6 leading-relaxed">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition text-sm"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
                                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition text-sm"
                            >
                                Подтвердить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Copied toast */}
            {copiedToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Ссылка скопирована
                </div>
            )}
        </div>
    )
}
