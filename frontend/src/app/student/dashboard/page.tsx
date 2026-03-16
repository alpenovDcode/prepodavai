'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import StudentSidebar from '@/components/StudentSidebar'
import { FileText, PenTool, CheckCircle, Clock, BookOpen, Sparkles } from 'lucide-react'

interface Assignment {
    id: string
    status: string
    dueDate?: string
    lesson: {
        title: string
        topic: string
        generations: { generationType: string }[]
    }
    submissions: {
        status: string
        createdAt: string
    }[]
}

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

export default function StudentDashboard() {
    const router = useRouter()
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<StudentUser | null>(null)
    const [activeTab, setActiveTab] = useState('Все')

    useEffect(() => {
        // Check auth
        const userStr = localStorage.getItem('user')
        if (!userStr) {
            router.push('/student/login')
            return
        }
        const storedUser = JSON.parse(userStr) as StudentUser
        setUser(storedUser)

        const fetchData = async () => {
            try {
                // Fetch assignments and own profile in parallel
                const [assignmentsRes, profileRes] = await Promise.allSettled([
                    apiClient.get('/assignments/my'),
                    apiClient.get('/students/me'),
                ])

                if (assignmentsRes.status === 'fulfilled') {
                    setAssignments(assignmentsRes.value.data)
                }

                if (profileRes.status === 'fulfilled' && profileRes.value.data) {
                    const profile = profileRes.value.data
                    const enrichedUser: StudentUser = {
                        ...storedUser,
                        className: profile.className,
                    }
                    setUser(enrichedUser)
                    // Update stored user with class name
                    localStorage.setItem('user', JSON.stringify(enrichedUser))
                }
            } catch (error) {
                console.error('Failed to fetch data:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('user')
        router.push('/student/login')
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                    <p className="text-gray-500 font-medium">Загрузка заданий...</p>
                </div>
            </div>
        )
    }

    // Group assignments by status
    const pendingAssignments = assignments.filter(a => a.submissions.length === 0)
    const inProgressAssignments = assignments.filter(a =>
        a.submissions.length > 0 && a.submissions[0].status !== 'graded'
    )
    const completedAssignments = assignments.filter(a =>
        a.submissions.some(s => s.status === 'graded')
    )

    // "На этой неделе" — assignments due this week or recently added
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const dueThisWeek = pendingAssignments.filter(a =>
        !a.dueDate || new Date(a.dueDate) <= weekFromNow
    )
    const upcoming = pendingAssignments.filter(a =>
        a.dueDate && new Date(a.dueDate) > weekFromNow
    )

    const getFilteredAssignments = () => {
        switch (activeTab) {
            case 'К выполнению': return pendingAssignments
            case 'В процессе': return inProgressAssignments
            case 'Завершенные': return completedAssignments
            default: return assignments
        }
    }

    const AssignmentCard = ({ assignment, type }: { assignment: Assignment, type: 'due' | 'upcoming' | 'completed' | 'inprogress' }) => {
        const isQuiz = assignment.lesson.generations?.some(g => g.generationType === 'quiz')
        const isPresentation = assignment.lesson.generations?.some(g => g.generationType === 'presentation')

        let iconBg = 'bg-blue-100 text-blue-600'
        let Icon = FileText
        let btnText = 'Открыть материал'
        let btnStyle = 'bg-orange-100 text-orange-700 hover:bg-orange-200'

        if (type === 'completed') {
            iconBg = 'bg-green-100 text-green-600'
            Icon = CheckCircle
            btnText = 'Смотреть результаты'
            btnStyle = 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        } else if (type === 'inprogress') {
            iconBg = 'bg-yellow-100 text-yellow-600'
            Icon = Clock
            btnText = 'Сдано — ждём оценки'
            btnStyle = 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
        } else if (isQuiz) {
            iconBg = 'bg-red-100 text-red-500'
            Icon = PenTool
            btnText = 'Начать тест'
            btnStyle = 'bg-orange-500 text-white hover:bg-orange-600 shadow-md hover:shadow-lg'
        } else if (isPresentation) {
            iconBg = 'bg-purple-100 text-purple-600'
            Icon = Sparkles
            btnText = 'Смотреть материал'
            btnStyle = 'bg-orange-100 text-orange-700 hover:bg-orange-200'
        }

        return (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group cursor-pointer"
                onClick={() => router.push(`/student/assignments/${assignment.id}`)}>
                <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900 mb-0.5 group-hover:text-orange-600 transition-colors">
                            {assignment.lesson.title}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{assignment.lesson.topic}</span>
                            {assignment.dueDate && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-gray-300 inline-block"></span>
                                    <span>До: {new Date(assignment.dueDate).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}</span>
                                </>
                            )}
                            {type === 'completed' && assignment.submissions.length > 0 && (
                                <>
                                    <span className="w-1 h-1 rounded-full bg-gray-300 inline-block"></span>
                                    <span>Сдано: {new Date(assignment.submissions[0].createdAt).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    onClick={e => { e.stopPropagation(); router.push(`/student/assignments/${assignment.id}`) }}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm transition-all transform active:scale-95 whitespace-nowrap flex-shrink-0 ml-4 ${btnStyle}`}
                >
                    {btnText}
                </button>
            </div>
        )
    }

    const showAssignments = activeTab === 'Все'
        ? { dueThisWeek, upcoming, inProgress: inProgressAssignments, completed: completedAssignments }
        : activeTab === 'К выполнению'
            ? { dueThisWeek: pendingAssignments, upcoming: [], inProgress: [], completed: [] }
            : activeTab === 'В процессе'
                ? { dueThisWeek: [], upcoming: [], inProgress: inProgressAssignments, completed: [] }
                : { dueThisWeek: [], upcoming: [], inProgress: [], completed: completedAssignments }

    return (
        <div className="flex min-h-screen bg-[#F9FAFB]">
            <StudentSidebar user={user} onLogout={handleLogout} />

            <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-4xl font-black text-gray-900 mb-2">Мои задания</h1>
                        <p className="text-gray-500 text-lg">Здесь список ваших задач. У вас все получится!</p>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                        {['Все', 'К выполнению', 'В процессе', 'Завершенные'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-5 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${activeTab === tab
                                        ? 'bg-orange-100 text-orange-600'
                                        : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-8">
                        {/* Due This Week */}
                        {showAssignments.dueThisWeek.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-gray-700 mb-4">На этой неделе</h2>
                                <div className="space-y-3">
                                    {showAssignments.dueThisWeek.map(a => (
                                        <AssignmentCard key={a.id} assignment={a} type="due" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Upcoming */}
                        {showAssignments.upcoming.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-gray-700 mb-4">Предстоящие</h2>
                                <div className="space-y-3">
                                    {showAssignments.upcoming.map(a => (
                                        <AssignmentCard key={a.id} assignment={a} type="upcoming" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* In Progress */}
                        {showAssignments.inProgress.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-gray-700 mb-4">В процессе проверки</h2>
                                <div className="space-y-3">
                                    {showAssignments.inProgress.map(a => (
                                        <AssignmentCard key={a.id} assignment={a} type="inprogress" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Completed */}
                        {showAssignments.completed.length > 0 && (
                            <section>
                                <h2 className="text-lg font-bold text-gray-700 mb-4">Завершенные</h2>
                                <div className="space-y-3">
                                    {showAssignments.completed.map(a => (
                                        <AssignmentCard key={a.id} assignment={a} type="completed" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Empty state */}
                        {assignments.length === 0 && (
                            <div className="text-center py-24">
                                <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-orange-300 mx-auto mb-6">
                                    <BookOpen size={36} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Заданий пока нет</h3>
                                <p className="text-gray-500">Загляните позже — учитель скоро добавит задания.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
