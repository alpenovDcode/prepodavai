'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import toast from 'react-hot-toast'
import Image from 'next/image'
import MathContent from '@/components/MathContent'
import {
    Users,
    ChevronRight,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ScrollText,
    Loader2,
    Paperclip,
    BarChart2,
    Sparkles,
    Download,
    Zap,
    Keyboard
} from 'lucide-react'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'

const FEEDBACK_TEMPLATES = [
    'Отличная работа, всё верно! Молодец!',
    'В целом хорошо, но есть пара недочётов — обрати внимание и исправь.',
    'Есть ошибки. Повтори тему и попробуй ещё раз.',
    'Требуется доработка — перечитай задание и сдай повторно.',
]

/** Сравнивает ответы ученика с ключом ответов из HTML теста */
function computeQuizScore(html: string, formData: Record<string, any>): { correct: number; total: number } | null {
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const answerSection = doc.querySelector('.teacher-answers-only')
        if (!answerSection) return null

        // Count total radio groups in the full document
        const allRadios = Array.from(doc.querySelectorAll('input[type="radio"]'))
        const radioGroups = Array.from(new Set(allRadios.map(r => (r as HTMLInputElement).name).filter(Boolean)))
        if (radioGroups.length === 0) return null

        const answerText = answerSection.textContent || ''
        // Try multiple answer key formats: "1. B", "1) B", "1 - B", "1: B"
        const answerMap: Record<string, string> = {}
        const patterns = [
            /(\d+)\s*[.)]\s*([A-Da-dА-Да-д])\b/g,
            /(\d+)\s*[-–—]\s*([A-Da-dА-Да-д])\b/g,
            /(\d+)\s*:\s*([A-Da-dА-Да-д])\b/g,
        ]
        for (const pat of patterns) {
            pat.lastIndex = 0
            let m: RegExpExecArray | null
            while ((m = pat.exec(answerText)) !== null) {
                answerMap[m[1]] = m[2].toUpperCase()
            }
            if (Object.keys(answerMap).length >= radioGroups.length) break
        }
        if (Object.keys(answerMap).length === 0) return null

        let correct = 0
        const total = Object.keys(answerMap).length
        for (const [qNum, correctAnswer] of Object.entries(answerMap)) {
            // Try radio key patterns the generated HTML might use
            for (const key of [`r__q${qNum}`, `r__question${qNum}`, `r__q_${qNum}`]) {
                if (formData[key] !== undefined) {
                    if (String(formData[key]).toUpperCase() === correctAnswer) correct++
                    break
                }
            }
        }
        return { correct, total }
    } catch {
        return null
    }
}

// Layout has 3 views: 
// 1. Classes List
// 2. Class Assignments (when class is selected)
// 3. Assignment Grading (when assignment is selected)

interface ClassObj {
    id: string
    name: string
    _count?: { students: number }
}

interface ClassAssignment {
    id: string
    dueDate: string | null
    status: string
    createdAt: string
    lesson: {
        id: string
        title: string
        topic: string
    }
    totalStudents: number
    submittedCount: number
    gradedCount: number
}

interface StudentStatus {
    student: {
        id: string
        name: string
        avatar?: string
    }
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
        title?: string
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

export default function HomeworkReviewPage() {
    const [view, setView] = useState<'classes' | 'assignments' | 'grading'>('classes')
    const [loading, setLoading] = useState(true)
    
    // Data states
    const [classes, setClasses] = useState<ClassObj[]>([])
    const [selectedClass, setSelectedClass] = useState<ClassObj | null>(null)
    const [assignments, setAssignments] = useState<ClassAssignment[]>([])
    const [selectedAssignment, setSelectedAssignment] = useState<ClassAssignment | null>(null)
    const [assignmentDetails, setAssignmentDetails] = useState<AssignmentDetails | null>(null)
    
    // Grading states
    const [selectedStudentStatus, setSelectedStudentStatus] = useState<StudentStatus | null>(null)
    const [gradeInput, setGradeInput] = useState<number | ''>('')
    const [feedbackInput, setFeedbackInput] = useState('')
    const [submittingGrade, setSubmittingGrade] = useState(false)
    const [generatingFeedback, setGeneratingFeedback] = useState(false)

    // AI draft cache: submissionId -> { grade, feedback }
    const [aiDrafts, setAiDrafts] = useState<Record<string, { grade: number | null; feedback: string }>>({})
    const [draftFetchingId, setDraftFetchingId] = useState<string | null>(null)
    const [showHotkeys, setShowHotkeys] = useState(false)
    const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null)

    // Initial load classes
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await apiClient.get('/classes')
                setClasses(res.data)
            } catch (error) {
                console.error('Failed to fetch classes', error)
            } finally {
                setLoading(false)
            }
        }
        fetchClasses()
    }, [])

    const handleSelectClass = async (cls: ClassObj) => {
        setSelectedClass(cls)
        setView('assignments')
        setLoading(true)
        try {
            const res = await apiClient.get(`/assignments/class/${cls.id}`)
            setAssignments(res.data)
        } catch (error) {
            console.error('Failed to fetch assignments', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSelectAssignment = async (assignment: ClassAssignment) => {
        setSelectedAssignment(assignment)
        setView('grading')
        setLoading(true)
        await fetchAssignmentDetails(assignment.id)
    }

    const fetchAssignmentDetails = async (assignmentId: string) => {
        try {
            const res = await apiClient.get(`/submissions/assignment/${assignmentId}`)
            setAssignmentDetails(res.data)
            setSelectedStudentStatus(null)
        } catch (error) {
            console.error('Failed to fetch submissions', error)
        } finally {
            setLoading(false)
        }
    }

    const handleBackToClasses = () => {
        setView('classes')
        setSelectedClass(null)
    }

    const handleBackToAssignments = () => {
        setView('assignments')
        setSelectedAssignment(null)
        setSelectedStudentStatus(null)
        // Refresh assignments to update counts
        if (selectedClass) handleSelectClass(selectedClass)
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

    const handleSelectStudentForGrading = (status: StudentStatus) => {
        setSelectedStudentStatus(status)
        setGradeInput(status.submission?.grade || '')
        setFeedbackInput(status.submission?.feedback || '')
        // Auto-prefetch AI draft for submitted but not-yet-graded work
        if (status.status === 'submitted' && status.submission?.id) {
            fetchAiDraftFor(status.submission.id)
        }
    }

    const acceptAiDraft = useCallback(() => {
        const submissionId = selectedStudentStatus?.submission?.id
        if (!submissionId) return
        const draft = aiDrafts[submissionId]
        if (!draft) {
            toast('ИИ-черновик ещё готовится...', { icon: '⏳' })
            return
        }
        if (draft.grade !== null) setGradeInput(draft.grade)
        if (draft.feedback) setFeedbackInput(draft.feedback)
    }, [selectedStudentStatus, aiDrafts])

    const navigateStudent = useCallback((delta: 1 | -1) => {
        if (!assignmentDetails) return
        const list = assignmentDetails.studentStatuses
        if (list.length === 0) return
        const currentIdx = selectedStudentStatus
            ? list.findIndex(s => s.student.id === selectedStudentStatus.student.id)
            : -1
        const nextIdx = currentIdx === -1
            ? (delta === 1 ? 0 : list.length - 1)
            : (currentIdx + delta + list.length) % list.length
        handleSelectStudentForGrading(list[nextIdx])
    }, [assignmentDetails, selectedStudentStatus])

    const insertFeedbackTemplate = useCallback((tpl: string) => {
        setFeedbackInput(prev => (prev.trim() ? `${prev.trim()}\n${tpl}` : tpl))
    }, [])

    // Global keyboard shortcuts for grading view
    useEffect(() => {
        if (view !== 'grading') return
        const isEditableTarget = (el: EventTarget | null) => {
            if (!(el instanceof HTMLElement)) return false
            const tag = el.tagName
            return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
        }

        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return
            const inEditable = isEditableTarget(e.target)

            // Allow Escape from textarea to blur
            if (e.key === 'Escape' && inEditable) {
                (e.target as HTMLElement).blur()
                return
            }

            // Hotkeys that should work only outside text inputs
            if (inEditable) return

            if (!selectedStudentStatus) return

            if (e.key >= '1' && e.key <= '5') {
                e.preventDefault()
                setGradeInput(Number(e.key))
                return
            }
            if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') {
                e.preventDefault()
                acceptAiDraft()
                return
            }
            if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') {
                e.preventDefault()
                feedbackTextareaRef.current?.focus()
                return
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                if (gradeInput !== '' && !submittingGrade) {
                    handleSubmitGrade({ advance: true })
                }
                return
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                navigateStudent(1)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                navigateStudent(-1)
                return
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [view, selectedStudentStatus, gradeInput, submittingGrade, acceptAiDraft, navigateStudent])


    const handleSubmitGrade = async (opts?: { advance?: boolean }) => {
        if (!selectedStudentStatus?.submission) return
        if (gradeInput === '' || gradeInput < 1 || gradeInput > 5) {
            toast.error('Оценка должна быть от 1 до 5')
            return
        }

        const currentStudentId = selectedStudentStatus.student.id
        setSubmittingGrade(true)
        try {
            await apiClient.patch(`/submissions/${selectedStudentStatus.submission.id}/grade`, {
                grade: Number(gradeInput),
                feedback: feedbackInput
            })
            toast.success('Оценка сохранена')
            // Refresh details
            if (selectedAssignment) {
                const res = await apiClient.get(`/submissions/assignment/${selectedAssignment.id}`)
                const details: AssignmentDetails = res.data
                setAssignmentDetails(details)

                if (opts?.advance) {
                    const list = details.studentStatuses
                    const currentIdx = list.findIndex(s => s.student.id === currentStudentId)
                    // find next submitted-not-graded, starting from currentIdx + 1
                    let next: StudentStatus | null = null
                    for (let i = 1; i <= list.length; i++) {
                        const candidate = list[(currentIdx + i + list.length) % list.length]
                        if (candidate.status === 'submitted') {
                            next = candidate
                            break
                        }
                    }
                    if (next) {
                        handleSelectStudentForGrading(next)
                    } else {
                        // all graded — clear selection, celebrate
                        setSelectedStudentStatus(null)
                        toast.success('Все работы этого задания проверены! 🎉')
                    }
                } else {
                    // keep selection in sync with updated submission (grade/feedback persist)
                    const updated = details.studentStatuses.find(s => s.student.id === currentStudentId)
                    if (updated) setSelectedStudentStatus(updated)
                }
            }
        } catch (error) {
            console.error('Failed to submit grade', error)
            toast.error('Ошибка при сохранении оценки')
        } finally {
            setSubmittingGrade(false)
        }
    }

    const handleGenerateAiFeedback = async () => {
        if (!selectedStudentStatus?.submission) return
        const submissionId = selectedStudentStatus.submission.id
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
        } catch (error) {
            console.error('Failed to generate AI feedback', error)
            toast.error('Ошибка при генерации комментария')
        } finally {
            setGeneratingFeedback(false)
        }
    }

    const handleExportCsv = () => {
        if (!assignmentDetails || !selectedAssignment) return
        const rows = [
            ['Ученик', 'Статус', 'Оценка', 'Дата сдачи', 'Комментарий учителя'],
            ...assignmentDetails.studentStatuses.map(s => [
                s.student.name,
                s.status === 'graded' ? 'Оценено' : s.status === 'submitted' ? 'Сдано' : 'Не сдано',
                s.submission?.grade ?? '',
                s.submission ? new Date(s.submission.createdAt).toLocaleDateString('ru-RU') : '',
                s.submission?.feedback ?? '',
            ])
        ]
        const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedAssignment.lesson.title}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    // --- RENDER HELPERS ---

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'graded':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><CheckCircle size={14}/> Оценено</span>
            case 'submitted':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200"><Clock size={14}/> Ожидает оценки</span>
            case 'pending':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200"><XCircle size={14}/> Не сдано</span>
            default:
                return null
        }
    }

    // --- VIEWS ---

    const renderClassesView = () => (
        <div className="max-w-5xl mx-auto w-full">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Проверка Домашних Заданий</h1>
            <p className="text-gray-500 mb-8">Выберите класс, чтобы просмотреть выданные задания и работы учеников.</p>
            
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
            ) : classes.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">У вас пока нет классов</h3>
                    <p className="text-gray-500">Добавьте классы в разделе &quot;Ученики&quot;, чтобы выдавать им задания.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {classes.map(cls => (
                        <div 
                            key={cls.id} 
                            onClick={() => handleSelectClass(cls)}
                            className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                                    <Users size={24} />
                                </div>
                                <span className="flex items-center text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1 rounded-lg">
                                    {cls._count?.students || 0} учеников
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-primary-600 transition-colors">{cls.name}</h3>
                            <div className="mt-4 flex items-center text-sm font-semibold text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                Проверить работы <ChevronRight className="w-4 h-4 ml-1" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )

    const renderAssignmentsView = () => (
        <div className="max-w-5xl mx-auto w-full">
            <button 
                onClick={handleBackToClasses}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors font-medium"
            >
                <ChevronLeft size={20} /> К списку классов
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Задания: {selectedClass?.name}</h1>
            <p className="text-gray-500 mb-8">Выберите задание для проверки.</p>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
            ) : assignments.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                    <ScrollText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Этому классу не выдавались задания</h3>
                    <p className="text-gray-500">Зайдите в любой материал и нажмите &quot;Назначить домашнее задание&quot;.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {assignments.map(assign => (
                        <div 
                            key={assign.id}
                            onClick={() => handleSelectAssignment(assign)}
                            className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 transition-all cursor-pointer flex items-center justify-between"
                        >
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">{assign.lesson.title}</h3>
                                <p className="text-sm text-gray-500 mb-4">{assign.lesson.topic}</p>
                                <div className="flex items-center gap-4 text-sm font-medium">
                                    <span className={`px-2 py-1 rounded-md ${assign.submittedCount - assign.gradedCount > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-600'}`}>
                                        Ожидают проверки: {assign.submittedCount - assign.gradedCount}
                                    </span>
                                    <span className="text-green-600">
                                        Проверено: {assign.gradedCount}
                                    </span>
                                    <span className="text-gray-400">
                                        Всего сдач: {assign.submittedCount} / {assign.totalStudents}
                                    </span>
                                </div>
                            </div>
                            <ChevronRight className="text-gray-400" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )

    const renderGradingView = () => {
        if (loading || !assignmentDetails) return <div className="flex justify-center py-20 w-full"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>

        const statuses = assignmentDetails.studentStatuses

        return (
            <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl mx-auto h-[calc(100vh-80px)]">
                {/* Left Panel: Student List */}
                <div className="w-full md:w-1/3 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={handleBackToAssignments}
                                className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-medium text-sm"
                            >
                                <ChevronLeft size={16} /> Назад
                            </button>
                            <button
                                onClick={handleExportCsv}
                                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                title="Скачать оценки в CSV"
                            >
                                <Download size={13} /> CSV
                            </button>
                        </div>
                        <h2 className="font-bold text-gray-900">{selectedAssignment?.lesson.title}</h2>
                        <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-semibold">Ждут: {assignmentDetails.submittedCount - assignmentDetails.gradedCount}</span>
                            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-semibold">Оценено: {assignmentDetails.gradedCount}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">Не сдали: {assignmentDetails.notSubmittedCount}</span>
                        </div>
                        {/* Grading progress */}
                        {assignmentDetails.submittedCount > 0 && (
                            <div className="mt-3">
                                <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold mb-1">
                                    <span>Проверено работ</span>
                                    <span>{assignmentDetails.gradedCount} / {assignmentDetails.submittedCount}</span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                                        style={{ width: `${Math.round((assignmentDetails.gradedCount / assignmentDetails.submittedCount) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setShowHotkeys(v => !v)}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2 py-1.5 rounded-lg transition-colors"
                            title="Показать горячие клавиши"
                        >
                            <Keyboard size={12} /> Горячие клавиши
                        </button>
                        {showHotkeys && (
                            <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 space-y-1">
                                <div className="flex justify-between"><kbd className="font-mono font-bold">1–5</kbd><span>Поставить оценку</span></div>
                                <div className="flex justify-between"><kbd className="font-mono font-bold">A</kbd><span>Принять ИИ-черновик</span></div>
                                <div className="flex justify-between"><kbd className="font-mono font-bold">Enter</kbd><span>Сохранить и к следующему</span></div>
                                <div className="flex justify-between"><kbd className="font-mono font-bold">↑ / ↓</kbd><span>Предыдущий / следующий</span></div>
                                <div className="flex justify-between"><kbd className="font-mono font-bold">E</kbd><span>Фокус на комментарий</span></div>
                            </div>
                        )}
                        {/* Analytics block */}
                        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <BarChart2 size={12} /> Статистика
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                                <div>
                                    <p className="text-lg font-black text-gray-900">
                                        {assignmentDetails.totalStudents > 0
                                            ? Math.round((assignmentDetails.submittedCount / assignmentDetails.totalStudents) * 100)
                                            : 0}%
                                    </p>
                                    <p className="text-[10px] text-gray-400 leading-tight">Сдали</p>
                                </div>
                                <div>
                                    <p className={`text-lg font-black ${assignmentDetails.avgGrade ? (assignmentDetails.avgGrade >= 4 ? 'text-green-600' : assignmentDetails.avgGrade >= 3 ? 'text-yellow-600' : 'text-red-500') : 'text-gray-400'}`}>
                                        {assignmentDetails.avgGrade ?? '—'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 leading-tight">Средний балл</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {statuses.map(status => (
                            <button
                                key={status.student.id}
                                onClick={() => handleSelectStudentForGrading(status)}
                                className={`w-full text-left p-3 rounded-xl flex items-center justify-between mb-1 transition-colors ${selectedStudentStatus?.student.id === status.student.id ? 'bg-primary-50 border border-primary-100 ring-1 ring-primary-500' : 'hover:bg-gray-50 border border-transparent'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex flex-shrink-0 items-center justify-center text-gray-600 font-bold text-xs">
                                        {status.student.avatar || status.student.name.charAt(0)}
                                    </div>
                                    <span className="font-semibold text-sm text-gray-900 truncate">{status.student.name}</span>
                                </div>
                                {getStatusBadge(status.status)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Grading Area */}
                <div className="w-full md:w-2/3 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden overflow-y-auto">
                    {!selectedStudentStatus ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <Users size={64} className="mb-4 opacity-50" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Выберите ученика</h3>
                            <p>Нажмите на ученика в списке слева, чтобы проверить его работу.</p>
                        </div>
                    ) : selectedStudentStatus.status === 'pending' ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <XCircle size={64} className="mb-4 opacity-50" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Работа не сдана</h3>
                            <p>Ученик пока ничего не отправил на проверку.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* ASSIGNMENT TASK HEADER */}
                            <div className="p-6 border-b border-gray-100 bg-indigo-50/50">
                                <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <ScrollText size={16} /> Текст задания
                                </h3>
                                <MathContent
                                    html={assignmentDetails.assignment.content || 'Текст задания не найден.'}
                                    className="bg-white p-4 rounded-xl border border-indigo-100/50 text-gray-700 text-sm leading-relaxed max-h-48 overflow-y-auto"
                                />
                            </div>

                            <div className="p-6 border-b border-gray-100 bg-gray-50 flex-1">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Users size={16} /> Ответ ученика
                                </h3>

                                {/* Interactive HTML generations filled by student */}
                                {(() => {
                                    const generations = assignmentDetails.assignment.generations || []
                                    const formData = selectedStudentStatus.submission?.formData || {}
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
                                {(selectedStudentStatus.submission?.content || !assignmentDetails.assignment.generations?.some(gen => {
                                    const formData = selectedStudentStatus.submission?.formData || {}
                                    const html = extractHtmlFromOutput(gen.outputData)
                                    return html && formData[gen.id] && Object.keys(formData[gen.id]).length > 0
                                })) && (
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 text-gray-800 text-base leading-relaxed min-h-[100px]">
                                        <div className="whitespace-pre-wrap">
                                            {selectedStudentStatus.submission?.content || 'Пустой ответ'}
                                        </div>
                                    </div>
                                )}

                                {/* Attachments */}
                                {selectedStudentStatus.submission?.attachments && selectedStudentStatus.submission.attachments.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
                                            <Paperclip size={14} /> Прикрепленные файлы:
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {selectedStudentStatus.submission.attachments.map((file: any, index: number) => (
                                                <div key={index} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center p-2 relative min-h-[200px]">
                                                    <Image
                                                        src={file.url}
                                                        alt={`Прикрепление ${index + 1}`}
                                                        fill
                                                        className="object-contain rounded-lg p-2"
                                                        unoptimized
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs text-gray-400 mt-3 flex items-baseline gap-1">
                                    <Clock size={12} /> Отправлено: {new Date(selectedStudentStatus.submission!.createdAt).toLocaleString('ru-RU')}
                                </p>
                            </div>

                            <div className="p-6">
                                {(() => {
                                    const generations = assignmentDetails.assignment.generations || []
                                    const rawFormData = selectedStudentStatus.submission?.formData || {}
                                    const scores = generations.map(gen => {
                                        const html = extractHtmlFromOutput(gen.outputData)
                                        if (!html) return null
                                        const studentData: Record<string, any> =
                                            (rawFormData as any)[gen.id] ||
                                            (Object.values(rawFormData).every(v => typeof v !== 'object' || v === null)
                                                ? rawFormData as Record<string, any>
                                                : null)
                                        if (!studentData || Object.keys(studentData).length === 0) return null
                                        return computeQuizScore(html, studentData)
                                    }).filter(Boolean) as { correct: number; total: number }[]

                                    if (scores.length === 0) return null
                                    const totalCorrect = scores.reduce((s, r) => s + r.correct, 0)
                                    const totalQ = scores.reduce((s, r) => s + r.total, 0)
                                    const pct = Math.round((totalCorrect / totalQ) * 100)
                                    const colorClass = pct >= 80
                                        ? 'bg-green-50 border-green-200 text-green-800'
                                        : pct >= 50
                                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                                        : 'bg-red-50 border-red-200 text-red-800'
                                    const wrong = totalQ - totalCorrect
                                    return (
                                        <div className={`flex items-center gap-4 px-5 py-4 rounded-xl border mb-5 ${colorClass}`}>
                                            <div className="text-3xl font-black">{totalCorrect}/{totalQ}</div>
                                            <div className="flex-1">
                                                <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Результат теста</p>
                                                <div className="flex items-center gap-3 text-sm font-bold">
                                                    <span className="flex items-center gap-1">
                                                        <CheckCircle size={14} className="text-green-600" />
                                                        {totalCorrect} верно
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <XCircle size={14} className="text-red-500" />
                                                        {wrong} неверно
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-2xl font-black opacity-80">{pct}%</div>
                                        </div>
                                    )
                                })()}
                                {/* AI DRAFT BANNER */}
                                {(() => {
                                    const submissionId = selectedStudentStatus.submission?.id
                                    if (!submissionId) return null
                                    const draft = aiDrafts[submissionId]
                                    const isDraftLoading = draftFetchingId === submissionId

                                    if (isDraftLoading) {
                                        return (
                                            <div className="mb-5 p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center gap-3">
                                                <Loader2 size={18} className="animate-spin text-purple-600" />
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
                                                        <Sparkles size={16} className="text-purple-600" />
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
                                                    title="Принять черновик (A)"
                                                >
                                                    <Zap size={13} /> Принять
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

                                <h3 className="text-lg font-bold text-gray-900 mb-4">Оценка и комментарий</h3>

                                <div className="mb-6">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Оценка (1-5)</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setGradeInput(num)}
                                                className={`w-12 h-12 rounded-xl font-black text-lg transition-transform active:scale-95 ${gradeInput === num ? 'bg-primary-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="mb-6 flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-gray-700">Комментарий к работе (необязательно)</label>
                                        <button
                                            onClick={handleGenerateAiFeedback}
                                            disabled={generatingFeedback || !selectedStudentStatus?.submission}
                                            className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {generatingFeedback
                                                ? <><Loader2 size={12} className="animate-spin" /> Генерирую...</>
                                                : <><Sparkles size={12} /> AI комментарий</>
                                            }
                                        </button>
                                    </div>
                                    {/* Quick templates */}
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {FEEDBACK_TEMPLATES.map((tpl, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => insertFeedbackTemplate(tpl)}
                                                className="text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2 py-1 rounded-md transition"
                                                title="Вставить шаблон"
                                            >
                                                {tpl.length > 35 ? tpl.slice(0, 34) + '…' : tpl}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea
                                        ref={feedbackTextareaRef}
                                        value={feedbackInput}
                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                        className="w-full h-32 px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition resize-none"
                                        placeholder="Напишите, что было сделано хорошо, а что нужно исправить..."
                                    />
                                </div>

                                <div className="flex justify-between items-center pt-4 border-t border-gray-100 gap-2">
                                    <button
                                        onClick={() => navigateStudent(-1)}
                                        className="px-3 py-2.5 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm font-semibold transition flex items-center gap-1"
                                        title="Предыдущий ученик (↑)"
                                    >
                                        <ChevronLeft size={16} /> Пред.
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSubmitGrade()}
                                            disabled={submittingGrade || gradeInput === ''}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-green-200 text-green-700 font-semibold rounded-lg hover:bg-green-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <CheckCircle size={16} /> Сохранить
                                        </button>
                                        <button
                                            onClick={() => handleSubmitGrade({ advance: true })}
                                            disabled={submittingGrade || gradeInput === ''}
                                            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Сохранить и к следующему (Enter)"
                                        >
                                            {submittingGrade
                                                ? <><Loader2 size={16} className="animate-spin" /> Сохранение...</>
                                                : <>Сохранить и далее <ChevronRight size={16} /></>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="w-full h-full p-6 lg:p-8 overflow-y-auto">
            {view === 'classes' && renderClassesView()}
            {view === 'assignments' && renderAssignmentsView()}
            {view === 'grading' && renderGradingView()}
        </div>
    )
}
