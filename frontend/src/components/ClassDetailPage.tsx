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

interface ClassDetailPageProps {
    id: string
}

export default function ClassDetailPage({ id }: ClassDetailPageProps) {
    const [classData, setClassData] = useState<ClassDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'students' | 'assignments'>('students')
    const router = useRouter()

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
                        <button className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition flex items-center gap-2 shadow-md">
                            <i className="fas fa-user-plus"></i>
                            Добавить ученика
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
                                                <p className="font-semibold text-gray-900">{student.name}</p>
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
