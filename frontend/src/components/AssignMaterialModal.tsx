'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface Class {
    id: string
    name: string
}

interface Student {
    id: string
    name: string
    class: { name: string }
}

interface AssignMaterialModalProps {
    isOpen: boolean
    onClose: () => void
    lessonId: string
    generationId?: string
    onAssignSuccess?: () => void
}

export default function AssignMaterialModal({ isOpen, onClose, lessonId, generationId, onAssignSuccess }: AssignMaterialModalProps) {
    const [classes, setClasses] = useState<Class[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [assignType, setAssignType] = useState<'class' | 'student'>('class')
    const [selectedTargetId, setSelectedTargetId] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchAssignmentTargets()
        }
    }, [isOpen])

    const fetchAssignmentTargets = async () => {
        try {
            const [classesRes, studentsRes] = await Promise.all([
                apiClient.get('/classes'),
                apiClient.get('/students')
            ])
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
        } catch (error) {
            console.error('Failed to fetch targets:', error)
        }
    }

    const handleAssignSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedTargetId) {
            alert('Выберите класс или ученика')
            return
        }

        setLoading(true)
        try {
            await apiClient.post('/assignments', {
                lessonId: lessonId,
                classId: assignType === 'class' ? selectedTargetId : undefined,
                studentId: assignType === 'student' ? selectedTargetId : undefined,
                dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
                generationId: generationId || undefined,
            })
            alert('Урок успешно выдан!')
            onClose()
            setSelectedTargetId('')
            setDueDate('')
            if (onAssignSuccess) {
                onAssignSuccess()
            }
        } catch (error) {
            console.error('Failed to assign lesson:', error)
            alert('Ошибка при выдаче урока')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    {generationId ? 'Выдать материал' : 'Выдать урок'}
                </h2>
                <form onSubmit={handleAssignSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Кому выдать?
                        </label>
                        <div className="flex gap-4 mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="assignType"
                                    checked={assignType === 'class'}
                                    onChange={() => setAssignType('class')}
                                    className="text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-gray-900">Классу</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="assignType"
                                    checked={assignType === 'student'}
                                    onChange={() => setAssignType('student')}
                                    className="text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-gray-900">Ученику</span>
                            </label>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            {assignType === 'class' ? 'Выберите класс' : 'Выберите ученика'}
                        </label>
                        <select
                            value={selectedTargetId}
                            onChange={(e) => setSelectedTargetId(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                            required
                        >
                            <option value="">Не выбрано</option>
                            {assignType === 'class' ? (
                                classes.map(cls => (
                                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                                ))
                            ) : (
                                students.map(student => (
                                    <option key={student.id} value={student.id}>
                                        {student.name} ({student.class.name})
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Срок сдачи (необязательно)
                        </label>
                        <input
                            type="datetime-local"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-gray-900"
                        />
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
                            disabled={loading}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? 'Выдача...' : 'Выдать'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
