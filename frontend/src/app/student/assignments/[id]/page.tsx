'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import MaterialViewer from '@/components/MaterialViewer'
import { ChevronDown, FileText, MonitorPlay, PenTool, BookOpen, ArrowLeft, CheckCircle, AlertCircle, Send, Loader2, Paperclip, X, Image as ImageIcon } from 'lucide-react'
import StudentSidebar from '@/components/StudentSidebar'

interface Assignment {
    id: string
    status: string
    lesson: {
        id: string
        title: string
        topic: string
        generations: any[]
    }
    submissions: any[]
}

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

export default function StudentAssignmentPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const [assignment, setAssignment] = useState<Assignment | null>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [submissionText, setSubmissionText] = useState('')
    const [attachments, setAttachments] = useState<Array<{ url: string; name: string; type: string }>>([])
    const [uploadingImage, setUploadingImage] = useState(false)
    const [expandedItems, setExpandedItems] = useState<string[]>([])
    const [user, setUser] = useState<StudentUser | null>(null)

    useEffect(() => {
        const userStr = localStorage.getItem('user')
        if (!userStr) {
            router.push('/student/login')
            return
        }
        setUser(JSON.parse(userStr))

        const fetchAssignment = async () => {
            try {
                const response = await apiClient.get(`/assignments/${params.id}`)
                setAssignment(response.data)
                // Expand the first item by default
                if (response.data.lesson.generations.length > 0) {
                    setExpandedItems([response.data.lesson.generations[0].id])
                }
            } catch (error) {
                console.error('Failed to fetch assignment:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchAssignment()
    }, [params.id, router])

    const toggleAccordion = (id: string) => {
        setExpandedItems(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        )
    }

    const handleSubmit = async () => {
        if (!submissionText.trim() && attachments.length === 0) return

        setSubmitting(true)
        try {
            await apiClient.post('/submissions', {
                assignmentId: params.id,
                content: submissionText,
                attachments: attachments
            })
            // Refresh assignment to show submitted state
            const response = await apiClient.get(`/assignments/${params.id}`)
            setAssignment(response.data)
        } catch (error) {
            console.error('Failed to submit:', error)
        } finally {
            setSubmitting(false)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        const file = e.target.files[0]
        if (!file.type.startsWith('image/')) {
            alert('Пожалуйста, выберите изображение (JPG, PNG)')
            return
        }

        setUploadingImage(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            // Using the existing upload endpoint
            const res = await apiClient.post('/files/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            
            if (res.data && res.data.url) {
                setAttachments(prev => [...prev, {
                    url: res.data.url,
                    name: file.name,
                    type: 'image'
                }])
            }
        } catch (error) {
            console.error('Failed to upload image:', error)
            alert('Не удалось загрузить изображение')
        } finally {
            setUploadingImage(false)
            // Reset input so the same file can be selected again if removed
            e.target.value = ''
        }
    }

    const removeAttachment = (indexToRemove: number) => {
        setAttachments(prev => prev.filter((_, index) => index !== indexToRemove))
    }

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('user')
        router.push('/student/login')
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                    <p className="text-gray-500 font-medium">Загрузка задания...</p>
                </div>
            </div>
        )
    }

    if (!assignment) {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Задание не найдено</h2>
                    <button onClick={() => router.push('/student/dashboard')} className="mt-4 text-orange-600 hover:underline font-medium">
                        Вернуться к заданиям
                    </button>
                </div>
            </div>
        )
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'plan': return <FileText className="w-5 h-5 text-blue-500" />
            case 'presentation': return <MonitorPlay className="w-5 h-5 text-orange-500" />
            case 'quiz': return <PenTool className="w-5 h-5 text-purple-500" />
            default: return <BookOpen className="w-5 h-5 text-gray-500" />
        }
    }

    const getTitle = (type: string) => {
        switch (type) {
            case 'plan': return 'План урока'
            case 'lesson-plan': return 'План урока'
            case 'presentation': return 'Презентация'
            case 'quiz': return 'Тест'
            case 'worksheet': return 'Рабочий лист'
            case 'vocabulary': return 'Словарь'
            default: return 'Учебный материал'
        }
    }

    const isSubmitted = assignment.submissions && assignment.submissions.length > 0
    const submission = assignment.submissions?.[0]

    return (
        <div className="flex min-h-screen bg-[#F9FAFB]">
            <StudentSidebar user={user} onLogout={handleLogout} />

            <div className="flex-1 flex flex-col">
                {/* Header */}
                <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
                    <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">{assignment.lesson.title}</h1>
                            <p className="text-sm text-gray-500">{assignment.lesson.topic}</p>
                        </div>
                    </div>
                </header>

                <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
                    {/* Materials Section */}
                    {assignment.lesson.generations.length > 0 ? (
                        <div className="space-y-3">
                            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Учебные материалы</h2>
                            {assignment.lesson.generations.map((gen) => {
                                const isExpanded = expandedItems.includes(gen.id)
                                return (
                                    <div key={gen.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                        <button
                                            onClick={() => toggleAccordion(gen.id)}
                                            className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-gray-50 rounded-xl">
                                                    {getIcon(gen.generationType)}
                                                </div>
                                                <h3 className="text-base font-bold text-gray-900">
                                                    {getTitle(gen.generationType)}
                                                </h3>
                                            </div>
                                            <ChevronDown className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-gray-100">
                                                <MaterialViewer
                                                    type={gen.generationType}
                                                    content={gen.outputData}
                                                    isEditable={false}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                            <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-500">Материалы к заданию появятся здесь</p>
                        </div>
                    )}

                    {/* Submission Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-5">Ваш ответ</h2>

                        {isSubmitted ? (
                            <div>
                                {submission.grade !== null && submission.grade !== undefined ? (
                                    // Graded submission
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
                                            <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                                            <div>
                                                <p className="font-bold text-green-800">Работа проверена</p>
                                                <p className="text-sm text-green-600">
                                                    Оценка: <span className="font-bold text-lg">{submission.grade}</span>
                                                </p>
                                            </div>
                                        </div>
                                        {submission.feedback && (
                                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                                <p className="text-sm font-semibold text-blue-800 mb-1">Комментарий учителя:</p>
                                                <p className="text-blue-700">{submission.feedback}</p>
                                            </div>
                                        )}
                                        <div className="p-4 bg-gray-50 rounded-xl">
                                            <p className="text-sm font-semibold text-gray-500 mb-1">Ваш ответ:</p>
                                            <p className="text-gray-800 whitespace-pre-wrap">{submission.content}</p>
                                            
                                            {submission.attachments && submission.attachments.length > 0 && (
                                                <div className="mt-4 space-y-3">
                                                    <p className="text-sm font-semibold text-gray-500">Прикрепленные файлы:</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {submission.attachments.map((file: any, index: number) => (
                                                            <div key={index} className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                                                                <img src={file.url} alt={`Прикрепление ${index + 1}`} className="w-full h-auto object-contain max-h-80" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // Submitted, awaiting grade
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                                            <CheckCircle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                                            <div>
                                                <p className="font-bold text-yellow-800">Ответ отправлен</p>
                                                <p className="text-sm text-yellow-600">
                                                    Отправлено: {new Date(submission.createdAt).toLocaleString('ru-RU')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-xl">
                                            <p className="text-sm font-semibold text-gray-500 mb-1">Ваш ответ:</p>
                                            <p className="text-gray-800 whitespace-pre-wrap">{submission.content}</p>
                                            
                                            {submission.attachments && submission.attachments.length > 0 && (
                                                <div className="mt-4 space-y-3">
                                                    <p className="text-sm font-semibold text-gray-500">Прикрепленные файлы:</p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {submission.attachments.map((file: any, index: number) => (
                                                            <div key={index} className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                                                                <img src={file.url} alt={`Прикрепление ${index + 1}`} className="w-full h-auto object-contain max-h-80" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <textarea
                                    value={submissionText}
                                    onChange={(e) => setSubmissionText(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:bg-white transition min-h-[160px] text-base resize-y outline-none"
                                    placeholder="Введите ваш ответ здесь..."
                                />
                                
                                {attachments.length > 0 && (
                                    <div className="flex gap-4 overflow-x-auto py-2">
                                        {attachments.map((attachment, index) => (
                                            <div key={index} className="relative group flex-shrink-0">
                                                <img 
                                                    src={attachment.url} 
                                                    alt="Preview" 
                                                    className="h-24 w-24 object-cover rounded-xl border border-gray-200" 
                                                />
                                                <button 
                                                    onClick={() => removeAttachment(index)}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                                    disabled={submitting}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <div className="relative">
                                        <input 
                                            type="file" 
                                            accept="image/png, image/jpeg, image/jpg" 
                                            onChange={handleFileChange} 
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                            disabled={uploadingImage || submitting}
                                        />
                                        <button 
                                            type="button"
                                            disabled={uploadingImage || submitting}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {uploadingImage ? (
                                                <Loader2 size={18} className="animate-spin text-orange-500" />
                                            ) : (
                                                <ImageIcon size={18} />
                                            )}
                                            {uploadingImage ? 'Загрузка...' : 'Прикрепить картинку'}
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting || (!submissionText.trim() && attachments.length === 0) || uploadingImage}
                                        className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0"
                                    >
                                        {submitting ? (
                                            <><Loader2 size={18} className="animate-spin" /> Отправка...</>
                                        ) : (
                                            <><Send size={18} /> Отправить ответ</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    )
}
