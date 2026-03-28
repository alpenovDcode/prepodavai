'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

interface Student {
    id: string
    name: string
    email?: string
    avatar?: string
    class: { name: string }
    assignments: Assignment[]
    createdAt: string
}

interface Assignment {
    id: string
    status: string
    dueDate?: string
    lesson: { title: string; topic: string }
    submissions: { id: string; status: string; grade?: number; createdAt: string }[]
    createdAt: string
}

export default function StudentProfilePage({ params }: { params: { id: string } }) {
    const [student, setStudent] = useState<Student | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    // Password change state
    const [newPassword, setNewPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    useEffect(() => {
        const fetchStudent = async () => {
            try {
                const response = await apiClient.get(`/students/${params.id}`)
                setStudent(response.data)
            } catch (error) {
                console.error('Failed to fetch student:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchStudent()
    }, [params.id])

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword.length < 6) {
            setPasswordMsg({ type: 'err', text: 'Минимум 6 символов' })
            return
        }
        setSavingPassword(true)
        setPasswordMsg(null)
        try {
            await apiClient.put(`/students/${params.id}`, { password: newPassword })
            setPasswordMsg({ type: 'ok', text: 'Пароль успешно изменён' })
            setNewPassword('')
        } catch {
            setPasswordMsg({ type: 'err', text: 'Ошибка при сохранении пароля' })
        } finally {
            setSavingPassword(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!student) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900">Ученик не найден</h3>
                <button onClick={() => router.back()} className="text-primary-600 font-medium hover:text-primary-700 mt-4">
                    &larr; Вернуться назад
                </button>
            </div>
        )
    }

    const avgGrade = (() => {
        const grades = student.assignments
            .flatMap(a => a.submissions)
            .map(s => s.grade)
            .filter((g): g is number => g != null)
        return grades.length ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : null
    })()

    return (
        <div className="max-w-5xl mx-auto p-6">
            {/* Back */}
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-2">
                <i className="fas fa-arrow-left"></i> Назад к списку
            </button>

            {/* Header */}
            <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-3xl flex-shrink-0">
                    {student.avatar || student.name.charAt(0)}
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{student.name}</h1>
                    <div className="flex items-center gap-3 text-gray-600 flex-wrap">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                            {student.class.name}
                        </span>
                        {student.email && (
                            <span className="flex items-center gap-1.5 text-sm">
                                <i className="fas fa-envelope text-gray-400"></i>
                                {student.email}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm font-medium mb-1">Всего заданий</div>
                    <div className="text-3xl font-bold text-gray-900">{student.assignments?.length || 0}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm font-medium mb-1">Сдано</div>
                    <div className="text-3xl font-bold text-green-600">
                        {student.assignments?.filter(a => a.submissions?.length > 0).length || 0}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm font-medium mb-1">Средний балл</div>
                    <div className="text-3xl font-bold text-primary-600">{avgGrade ?? '—'}</div>
                </div>
            </div>

            {/* Password block */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Пароль для входа</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Ученик входит по адресу <span className="font-medium text-gray-700">{student.email}</span> и этому паролю.
                    Задайте новый пароль и сообщите его ученику.
                </p>
                <form onSubmit={handleChangePassword} className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Новый пароль</label>
                        <input
                            type="text"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Введите новый пароль (мин. 6 символов)"
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition text-gray-900"
                            minLength={6}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={savingPassword}
                        className="px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition disabled:opacity-50 whitespace-nowrap"
                    >
                        {savingPassword ? 'Сохранение...' : 'Сохранить пароль'}
                    </button>
                </form>
                {passwordMsg && (
                    <p className={`mt-3 text-sm font-medium ${passwordMsg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordMsg.type === 'ok' ? '✓ ' : '✗ '}{passwordMsg.text}
                    </p>
                )}
            </div>

            {/* Assignments */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">История заданий</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    {student.assignments?.map((assignment) => (
                        <div key={assignment.id} className="p-6 hover:bg-gray-50 transition">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-1">{assignment.lesson.title}</h4>
                                    <p className="text-sm text-gray-500">{assignment.lesson.topic}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    {assignment.dueDate && (
                                        <div className="text-sm text-gray-500">
                                            Срок: {new Date(assignment.dueDate).toLocaleDateString('ru-RU')}
                                        </div>
                                    )}
                                    {assignment.submissions?.length > 0 ? (
                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Сдано</span>
                                    ) : (
                                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">Назначено</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!student.assignments || student.assignments.length === 0) && (
                        <div className="p-8 text-center text-gray-500">
                            Ученику пока не выдано ни одного задания.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
