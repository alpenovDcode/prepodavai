'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

interface Generation {
    id: string
    generationType: string
    status: string
    createdAt: string
}

interface Lesson {
    id: string
    title: string
    topic: string
    grade?: string
    duration?: number
    generations: Generation[]
    createdAt: string
}

export default function CoursesPage() {
    const [lessons, setLessons] = useState<Lesson[]>([])
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        const fetchLessons = async () => {
            try {
                const response = await apiClient.get('/lessons')
                const sortedLessons = response.data.sort((a: Lesson, b: Lesson) => {
                    if (a.title === 'ИИ генерации') return -1
                    if (b.title === 'ИИ генерации') return 1
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                })
                setLessons(sortedLessons)
            } catch (error) {
                console.error('Failed to fetch lessons:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchLessons()
    }, [])

    const getIconForLesson = (lesson: Lesson) => {
        if (lesson.title === 'ИИ генерации') return 'fas fa-wand-magic-sparkles'
        return 'fas fa-book'
    }

    const getIconColor = (index: number, lesson: Lesson) => {
        if (lesson.title === 'ИИ генерации') {
            return { bg: 'bg-indigo-100', text: 'text-indigo-600', progress: 'bg-indigo-600' }
        }
        const colors = [
            { bg: 'bg-purple-100', text: 'text-course-purple', progress: 'bg-course-purple' },
            { bg: 'bg-orange-100', text: 'text-course-orange', progress: 'bg-course-orange' },
            { bg: 'bg-blue-100', text: 'text-course-blue', progress: 'bg-course-blue' },
            { bg: 'bg-pink-100', text: 'text-course-pink', progress: 'bg-red-500' },
            { bg: 'bg-green-100', text: 'text-course-green', progress: 'bg-course-green' },
        ]
        return colors[index % colors.length]
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Мои материалы</h1>
                    <p className="text-gray-600 mt-1">Список ваших созданных уроков и материалов.</p>
                </div>
                <button
                    onClick={() => router.push('/dashboard')}
                    className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-lg hover:shadow-xl"
                >
                    <i className="fas fa-plus-circle"></i>
                    Создать новый
                </button>
            </div>

            {/* Lessons Grid */}
            {lessons.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-folder-open text-gray-400 text-2xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Нет материалов</h3>
                    <p className="text-gray-500 mb-6">Вы еще не создали ни одного урока.</p>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-primary-600 font-medium hover:text-primary-700"
                    >
                        Создать первый урок &rarr;
                    </button>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {lessons.map((lesson, index) => {
                        const style = getIconColor(index, lesson)
                        const completedGenerations = lesson.generations.filter(g => g.status === 'completed').length
                        const totalGenerations = lesson.generations.length
                        const progress = totalGenerations > 0 ? Math.round((completedGenerations / totalGenerations) * 100) : 0
                        const isPinned = lesson.title === 'ИИ генерации'

                        return (
                            <div
                                key={lesson.id}
                                className={`dashboard-card cursor-pointer group relative ${isPinned ? 'ring-2 ring-indigo-100' : ''}`}
                                onClick={() => {
                                    router.push(`/dashboard/courses/${lesson.id}`)
                                }}
                            >
                                {isPinned && (
                                    <div className="absolute top-4 right-4 text-indigo-400">
                                        <i className="fas fa-thumbtack transform rotate-45"></i>
                                    </div>
                                )}
                                {/* Icon */}
                                <div className={`icon-circle ${style.bg} mb-4`}>
                                    <i className={`${getIconForLesson(lesson)} ${style.text}`}></i>
                                </div>

                                {/* Title & Description */}
                                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition line-clamp-1">
                                    {lesson.title}
                                </h3>
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                    {lesson.topic} {lesson.grade ? `• ${lesson.grade} класс` : ''}
                                </p>

                                {/* Progress */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600">Готовность материалов</span>
                                        <span className="font-semibold" style={{ color: style.text.replace('text-', '') }}>
                                            {progress}%
                                        </span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill ${style.progress}`}
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        {new Date(lesson.createdAt).toLocaleDateString('ru-RU')}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
