'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import Image from 'next/image'
import DOMPurify from 'isomorphic-dompurify'
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
    Download
} from 'lucide-react'
import InteractiveHtmlViewer, { extractHtmlFromOutput } from '@/components/InteractiveHtmlViewer'

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

    const handleSelectStudentForGrading = (status: StudentStatus) => {
        setSelectedStudentStatus(status)
        setGradeInput(status.submission?.grade || '')
        setFeedbackInput(status.submission?.feedback || '')
    }

    const handleSubmitGrade = async () => {
        if (!selectedStudentStatus?.submission) return
        if (gradeInput === '' || gradeInput < 1 || gradeInput > 5) {
            alert('Оценка должна быть от 1 до 5')
            return
        }

        setSubmittingGrade(true)
        try {
            await apiClient.patch(`/submissions/${selectedStudentStatus.submission.id}/grade`, {
                grade: Number(gradeInput),
                feedback: feedbackInput
            })
            // Refresh details
            if (selectedAssignment) {
                await fetchAssignmentDetails(selectedAssignment.id)
            }
        } catch (error) {
            console.error('Failed to submit grade', error)
            alert('Ошибка при сохранении оценки')
        } finally {
            setSubmittingGrade(false)
        }
    }

    const handleGenerateAiFeedback = async () => {
        if (!selectedStudentStatus?.submission) return
        setGeneratingFeedback(true)
        try {
            const res = await apiClient.post(`/submissions/${selectedStudentStatus.submission.id}/ai-feedback`)
            setFeedbackInput((res.data?.feedback || '').trim())
        } catch (error) {
            console.error('Failed to generate AI feedback', error)
            alert('Ошибка при генерации комментария')
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
                                <div className="bg-white p-4 rounded-xl border border-indigo-100/50 text-gray-700 text-sm leading-relaxed max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(assignmentDetails.assignment.content || 'Текст задания не найден.') }} />
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
                                    <textarea
                                        value={feedbackInput}
                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                        className="w-full h-32 px-4 py-3 bg-white border border-gray-300 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition resize-none"
                                        placeholder="Напишите, что было сделано хорошо, а что нужно исправить..."
                                    />
                                </div>

                                <div className="flex justify-end pt-4 border-t border-gray-100">
                                    <button
                                        onClick={handleSubmitGrade}
                                        disabled={submittingGrade || gradeInput === ''}
                                        className="flex items-center gap-2 px-8 py-3.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                                    >
                                        {submittingGrade ? <><Loader2 size={18} className="animate-spin" /> Сохранение...</> : <><CheckCircle size={18} /> Сохранить оценку</>}
                                    </button>
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
