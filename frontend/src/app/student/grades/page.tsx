'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import StudentSidebar from '@/components/StudentSidebar'
import { GraduationCap, CheckCircle, Clock, Star, BookOpen } from 'lucide-react'

interface Submission {
    id: string
    content: string
    grade: number | null
    feedback: string | null
    status: string
    createdAt: string
    assignment: {
        lesson: {
            title: string
            topic: string
        }
    }
}

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

export default function StudentGradesPage() {
    const router = useRouter()
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<StudentUser | null>(null)

    useEffect(() => {
        const userStr = localStorage.getItem('user')
        if (!userStr) {
            router.push('/student/login')
            return
        }
        setUser(JSON.parse(userStr))

        const fetchSubmissions = async () => {
            try {
                const response = await apiClient.get('/submissions/my')
                setSubmissions(response.data)
            } catch (error) {
                console.error('Failed to fetch submissions:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchSubmissions()
    }, [router])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_authenticated')
        localStorage.removeItem('user')
        router.push('/student/login')
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
        )
    }

    const gradedSubmissions = submissions.filter(s => s.grade !== null)
    const pendingSubmissions = submissions.filter(s => s.grade === null)

    const avgGrade = gradedSubmissions.length > 0
        ? Math.round(gradedSubmissions.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSubmissions.length * 10) / 10
        : null

    const getGradeColor = (grade: number) => {
        if (grade >= 4) return 'text-green-600 bg-green-50 border-green-100'
        if (grade >= 3) return 'text-yellow-600 bg-yellow-50 border-yellow-100'
        return 'text-red-600 bg-red-50 border-red-100'
    }

    return (
        <div className="flex min-h-screen bg-[#F9FAFB]">
            <StudentSidebar user={user} onLogout={handleLogout} />

            <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
                <div className="max-w-4xl mx-auto">

                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-4xl font-black text-gray-900 mb-2">Мои оценки</h1>
                        <p className="text-gray-500 text-lg">Результаты ваших работ и комментарии учителя</p>
                    </div>

                    {/* Stats */}
                    {submissions.length > 0 && (
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                                <p className="text-3xl font-black text-orange-500">{submissions.length}</p>
                                <p className="text-sm text-gray-500 mt-1">Сдано работ</p>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                                <p className="text-3xl font-black text-green-600">{gradedSubmissions.length}</p>
                                <p className="text-sm text-gray-500 mt-1">Проверено</p>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
                                <p className="text-3xl font-black text-blue-600">{avgGrade ?? '—'}</p>
                                <p className="text-sm text-gray-500 mt-1">Средняя оценка</p>
                            </div>
                        </div>
                    )}

                    {/* Graded submissions */}
                    {gradedSubmissions.length > 0 && (
                        <section className="mb-8">
                            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                                <CheckCircle size={20} className="text-green-500" /> Оцененные работы
                            </h2>
                            <div className="space-y-3">
                                {gradedSubmissions.map(sub => (
                                    <div key={sub.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-gray-900 text-base mb-0.5">
                                                    {sub.assignment.lesson.title}
                                                </h3>
                                                <p className="text-sm text-gray-500 mb-3">{sub.assignment.lesson.topic}</p>
                                                {sub.content && (
                                                    <div className="p-3 bg-gray-50 rounded-xl mb-3 text-sm text-gray-700">
                                                        <span className="font-semibold text-gray-500 block mb-1">Ваш ответ:</span>
                                                        {sub.content.length > 200 ? sub.content.slice(0, 200) + '...' : sub.content}
                                                    </div>
                                                )}
                                                {sub.feedback && (
                                                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
                                                        <span className="font-semibold block mb-1">💬 Комментарий учителя:</span>
                                                        {sub.feedback}
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center font-black text-2xl flex-shrink-0 ${getGradeColor(sub.grade!)}`}>
                                                {sub.grade}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-3">
                                            Сдано: {new Date(sub.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Pending submissions */}
                    {pendingSubmissions.length > 0 && (
                        <section className="mb-8">
                            <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                                <Clock size={20} className="text-yellow-500" /> На проверке
                            </h2>
                            <div className="space-y-3">
                                {pendingSubmissions.map(sub => (
                                    <div key={sub.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm opacity-75">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-bold text-gray-900">{sub.assignment.lesson.title}</h3>
                                                <p className="text-sm text-gray-500">{sub.assignment.lesson.topic}</p>
                                            </div>
                                            <span className="px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-bold border border-yellow-100">
                                                Ждём оценки
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Empty state */}
                    {submissions.length === 0 && (
                        <div className="text-center py-24">
                            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-orange-300 mx-auto mb-6">
                                <GraduationCap size={36} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Оценок пока нет</h3>
                            <p className="text-gray-500">Сдайте задания, чтобы получить оценки</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
