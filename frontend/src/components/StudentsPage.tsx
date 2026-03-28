'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import HomeworkReviewPage from '@/app/workspace/homework/page'

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
    class: {
        name: string
    }
    createdAt: string
}

export default function StudentsPage() {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'students' | 'classes' | 'assignments'>('students')
    const [searchQuery, setSearchQuery] = useState('')
    const [students, setStudents] = useState<Student[]>([])
    const [classes, setClasses] = useState<Class[]>([])
    const [loading, setLoading] = useState(true)

    // Modals state
    const [showAddClassModal, setShowAddClassModal] = useState(false)
    const [showAddStudentModal, setShowAddStudentModal] = useState(false)

    // Form state
    const [newClassName, setNewClassName] = useState('')
    const [newStudentName, setNewStudentName] = useState('')
    const [newStudentEmail, setNewStudentEmail] = useState('')
    const [newStudentPassword, setNewStudentPassword] = useState('')
    const [selectedClassId, setSelectedClassId] = useState('')

    const fetchData = async () => {
        setLoading(true)
        try {
            const [classesRes, studentsRes] = await Promise.all([
                apiClient.get('/classes'),
                apiClient.get('/students')
            ])
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
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
        } catch (error) {
            alert('Failed to create class')
        }
    }

    const handleCreateStudent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedClassId) {
            alert('Выберите класс')
            return
        }
        try {
            await apiClient.post('/students', {
                name: newStudentName,
                email: newStudentEmail,
                password: newStudentPassword,
                classId: selectedClassId
            })
            setNewStudentName('')
            setNewStudentEmail('')
            setNewStudentPassword('')
            setSelectedClassId('')
            setShowAddStudentModal(false)
            fetchData()
        } catch (error: any) {
            alert(error?.response?.data?.message || 'Ошибка при создании ученика')
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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Ученики и Классы</h1>
                    <p className="text-gray-600 mt-1">Управляйте своими классами и учениками.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowAddClassModal(true)}
                        className="px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition flex items-center gap-2 shadow-sm"
                    >
                        <i className="fas fa-layer-group"></i>
                        Создать класс
                    </button>
                    <button
                        onClick={() => setShowAddStudentModal(true)}
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-lg hover:shadow-xl"
                    >
                        <i className="fas fa-user-plus"></i>
                        Добавить ученика
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

                    {/* Students Table */}
                    <div className="dashboard-card">
                        <div className="overflow-x-auto">
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
                                                    <p className="font-semibold text-gray-900">{student.name}</p>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                                                    {student.class.name}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-sm text-gray-500">
                                                {student.email || <span className="text-gray-300 italic">не указан</span>}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const link = `${window.location.origin}/student/login`
                                                            navigator.clipboard.writeText(link)
                                                            alert('Ссылка для входа скопирована!')
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-primary-600 transition"
                                                        title="Копировать ссылку для входа"
                                                    >
                                                        <i className="fas fa-link"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => window.location.href = `/dashboard/students/${student.id}`}
                                                        className="p-2 text-gray-400 hover:text-primary-600 transition"
                                                    >
                                                        <i className="fas fa-user-circle"></i>
                                                    </button>
                                                    <button className="p-2 text-gray-400 hover:text-red-600 transition">
                                                        <i className="fas fa-trash-alt"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {filteredStudents.length === 0 && (
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
                            )}
                        </div>
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
                <div className="-mx-8 -my-8 px-2 py-2">
                     <HomeworkReviewPage />
                </div>
            )}

            {/* Add Class Modal */}
            {showAddClassModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Создать класс</h2>
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Добавить ученика</h2>
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
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={newStudentEmail}
                                    onChange={(e) => setNewStudentEmail(e.target.value)}
                                    placeholder="ivan@example.com"
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                                    required
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
        </div>
    )
}
