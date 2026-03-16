'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { functions } from './InputComposer/config'
import { useGenerations } from '@/lib/hooks/useGenerations'

export default function DashboardHome() {
    const router = useRouter()
    const [lessonTopic, setLessonTopic] = useState('')
    const [gradeLevel, setGradeLevel] = useState('middle')
    const [duration, setDuration] = useState('45')

    // Default selected types
    const [selectedTypes, setSelectedTypes] = useState<string[]>(['presentation', 'quiz'])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const { generateBundle, isGenerating } = useGenerations()

    // Extended metadata for cards (colors, descriptions)
    const typeMetadata: Record<string, { iconBg: string, iconColor: string, description: string }> = {
        lessonPlan: {
            iconBg: 'bg-purple-100',
            iconColor: 'text-primary-600',
            description: 'Создайте полный план урока с целями, заданиями и оценкой.'
        },
        presentation: {
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-500',
            description: 'Создайте увлекательные слайды для вашего урока.'
        },
        quiz: {
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            description: 'Сгенерируйте тест с вопросами и вариантами ответов.'
        },
        worksheet: {
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            description: 'Рабочий лист с заданиями для учеников.'
        },
        vocabulary: {
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            description: 'Словарь терминов и определений по теме.'
        },
        content: {
            iconBg: 'bg-indigo-100',
            iconColor: 'text-indigo-600',
            description: 'Адаптация учебного материала под уровень учеников.'
        },
        feedback: {
            iconBg: 'bg-pink-100',
            iconColor: 'text-pink-600',
            description: 'Генерация обратной связи для ученика.'
        },
        image: {
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            description: 'Генерация изображений по описанию.'
        },
        photosession: {
            iconBg: 'bg-teal-100',
            iconColor: 'text-teal-600',
            description: 'Создание серии изображений в едином стиле.'
        },
        message: {
            iconBg: 'bg-gray-100',
            iconColor: 'text-gray-600',
            description: 'Генерация сообщений для родителей или коллег.'
        },
        game: {
            iconBg: 'bg-cyan-100',
            iconColor: 'text-cyan-600',
            description: 'Создание обучающих игр.'
        }
    }

    const handleGenerate = async () => {
        if (!lessonTopic) {
            alert('Пожалуйста, введите тему урока')
            return
        }

        if (selectedTypes.length === 0) {
            alert('Пожалуйста, выберите хотя бы один тип генерации')
            return
        }

        const types = selectedTypes.map((type: string) => type === 'lessonPlan' ? 'lesson-plan' : type)

        try {
            await generateBundle(types, {
                topic: lessonTopic,
                grade: gradeLevel,
                duration: parseInt(duration),
            })

            router.push('/dashboard/courses')
        } catch (error) {
            console.error('Generation failed:', error)
            alert('Ошибка при запуске генерации. Пожалуйста, попробуйте снова.')
        }
    }

    const toggleType = (id: string) => {
        setSelectedTypes(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        )
    }

    const addType = (id: string) => {
        if (!selectedTypes.includes(id)) {
            setSelectedTypes(prev => [...prev, id])
        }
        setIsModalOpen(false)
    }

    const getCardData = (id: string) => {
        const meta = typeMetadata[id] || {
            iconBg: 'bg-gray-100',
            iconColor: 'text-gray-600',
            description: 'Генерация контента.'
        }
        const func = functions.find(f => f.id === id)
        return {
            ...meta,
            title: func?.title || id,
            icon: func?.icon || 'fas fa-star'
        }
    }

    return (
        <div className="max-w-7xl mx-auto relative">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Главная</h1>
                        <p className="text-gray-600 mt-1">С возвращением! Давайте создадим что-то удивительное!</p>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-lg hover:shadow-xl ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                        {isGenerating ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Создаем...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-plus-circle"></i>
                                Создать
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Form Card */}
            <div className="dashboard-card mb-6">
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Lesson Topic */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Тема урока
                        </label>
                        <input
                            type="text"
                            value={lessonTopic}
                            onChange={(e) => setLessonTopic(e.target.value)}
                            placeholder="например, Фотосинтез"
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white text-gray-900 transition"
                        />
                    </div>

                    {/* Grade Level */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Класс
                        </label>
                        <div className="flex gap-2">
                            {['elementary', 'middle', 'high'].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setGradeLevel(level)}
                                    className={`flex-1 py-3 rounded-xl font-medium transition ${gradeLevel === level
                                        ? 'bg-primary-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {level === 'elementary' && 'Начальный'}
                                    {level === 'middle' && 'Средний'}
                                    {level === 'high' && 'Старший'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Длительность (минуты)
                        </label>
                        <input
                            type="number"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="45"
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white text-gray-900 transition"
                        />
                    </div>
                </div>
            </div>

            {/* Generation Types */}
            <div className="grid md:grid-cols-3 gap-6">
                {selectedTypes.map((typeId) => {
                    const data = getCardData(typeId)
                    return (
                        <div
                            key={typeId}
                            className="dashboard-card relative group"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`icon-circle ${data.iconBg}`}>
                                    <i className={`${data.icon} ${data.iconColor}`}></i>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={() => toggleType(typeId)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 mb-2">{data.title}</h3>
                            <p className="text-sm text-gray-600">{data.description}</p>
                        </div>
                    )
                })}

                {/* Add Button Card */}
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="dashboard-card border-2 border-dashed border-gray-300 flex flex-col items-center justify-center min-h-[200px] hover:border-primary-500 hover:bg-primary-50 transition-all group cursor-pointer"
                >
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 group-hover:bg-primary-100 transition-colors">
                        <i className="fas fa-plus text-2xl text-gray-400 group-hover:text-primary-600"></i>
                    </div>
                    <span className="font-semibold text-gray-500 group-hover:text-primary-600">Добавить генерацию</span>
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid md:grid-cols-4 gap-4 mt-8">
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                            <i className="fas fa-file-alt text-primary-600"></i>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">24</p>
                            <p className="text-xs text-gray-600">Материалов</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                            <i className="fas fa-check-circle text-green-600"></i>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">156</p>
                            <p className="text-xs text-gray-600">Генераций</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                            <i className="fas fa-coins text-blue-600"></i>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">1,250</p>
                            <p className="text-xs text-gray-600">Кредитов</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                            <i className="fas fa-clock text-orange-600"></i>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">48h</p>
                            <p className="text-xs text-gray-600">Сэкономлено</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900">Выберите тип генерации</h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
                            >
                                <i className="fas fa-times text-gray-500"></i>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <div className="grid sm:grid-cols-2 gap-4">
                                {functions.map((func) => {
                                    const isSelected = selectedTypes.includes(func.id)
                                    const meta = typeMetadata[func.id] || { iconBg: 'bg-gray-100', iconColor: 'text-gray-600' }

                                    return (
                                        <button
                                            key={func.id}
                                            onClick={() => addType(func.id)}
                                            disabled={isSelected}
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${isSelected
                                                ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                                                : 'bg-white border-gray-200 hover:border-primary-500 hover:shadow-md cursor-pointer'
                                                }`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                                                <i className={`${func.icon} ${meta.iconColor} text-xl`}></i>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">{func.title}</h3>
                                                {isSelected && <span className="text-xs text-green-600 font-medium">Уже добавлено</span>}
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
