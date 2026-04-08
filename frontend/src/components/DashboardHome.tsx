'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { functions } from './InputComposer/config'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useSubscription } from '@/lib/hooks/useSubscription'
import OnboardingQuestBanner from './OnboardingQuestBanner'
import useSWR from 'swr'

const fetcher = (url: string) => apiClient.get(url).then((res: any) => res.data)

export default function DashboardHome() {
    const router = useRouter()
    const [lessonTopic, setLessonTopic] = useState('')
    const [gradeLevel, setGradeLevel] = useState('middle')
    const [duration, setDuration] = useState('45')
    const { data: statsData } = useSWR('/analytics/live-stats', fetcher, {
        refreshInterval: 10000
    })
    const { data: dashboardData } = useSWR('/analytics/dashboard', fetcher)
    const { totalCredits } = useSubscription()

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
            toast.error('Введите тему урока')
            return
        }

        if (selectedTypes.length === 0) {
            toast.error('Выберите хотя бы один тип генерации')
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
            toast.error('Ошибка при запуске генерации. Попробуйте снова.')
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
            {/* Онбординг-квест — показывается только новым пользователям */}
            <OnboardingQuestBanner />

            {/* Header */}
            <div className="mb-6 md:mb-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Главная</h1>
                        <p className="text-gray-600 mt-1 text-sm md:text-base max-w-2xl">
                            Добро пожаловать в экосистему «Прорыв»! Профессиональный инструмент для учителей, который ускорит подготовку к урокам, поможет структурировать учебные материалы и эффективно отслеживать прогресс ваших учеников.
                        </p>
                    </div>
                    <div className="flex items-center md:flex-col md:items-end gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className={`px-5 md:px-6 py-2.5 md:py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-lg hover:shadow-xl text-sm md:text-base ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''}`}
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
                        {selectedTypes.length > 0 && !isGenerating && (
                            <div className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1.5">
                                <i className="fas fa-coins text-yellow-600"></i>
                                {selectedTypes.length <= 2
                                    ? '50 кредитов'
                                    : `${50 + (selectedTypes.length - 2) * 5} кредитов`}
                            </div>
                        )}
                    </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                {selectedTypes.map((typeId) => {
                    const data = getCardData(typeId)
                    return (
                        <div
                            key={typeId}
                            className="dashboard-card relative group !p-4 md:!p-6"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className={`icon-circle ${data.iconBg} !w-9 !h-9 md:!w-11 md:!h-11`}>
                                    <i className={`${data.icon} ${data.iconColor} text-sm md:text-base`}></i>
                                </div>
                                <button
                                    onClick={() => toggleType(typeId)}
                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                            <h3 className="text-sm md:text-lg font-bold text-gray-900 mb-1 leading-tight">{data.title}</h3>
                            <p className="text-xs md:text-sm text-gray-600 hidden md:block">{data.description}</p>
                        </div>
                    )
                })}

                {/* Add Button Card */}
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="dashboard-card !p-4 md:!p-6 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center min-h-[120px] md:min-h-[200px] hover:border-primary-500 hover:bg-primary-50 transition-all group cursor-pointer"
                >
                    <div className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-gray-100 flex items-center justify-center mb-2 md:mb-4 group-hover:bg-primary-100 transition-colors">
                        <i className="fas fa-plus text-lg md:text-2xl text-gray-400 group-hover:text-primary-600"></i>
                    </div>
                    <span className="text-xs md:text-sm font-semibold text-gray-500 group-hover:text-primary-600">Добавить</span>
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mt-6 md:mt-8">
                {/* Live global counter */}
                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm overflow-hidden relative">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-check-circle text-green-600 text-sm"></i>
                        </div>
                        <div>
                            <div className="flex items-baseline gap-1">
                                <p className="text-xl md:text-2xl font-bold text-gray-900 tabular-nums">
                                    {(statsData?.globalGenerationsCount ?? '—').toLocaleString()}
                                </p>
                                {statsData && (
                                    <span className="flex h-2 w-2 relative -top-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Генераций</p>
                        </div>
                    </div>
                </div>

                {/* User's own generations */}
                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-wand-magic-sparkles text-indigo-600 text-sm"></i>
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-gray-900">
                                {statsData?.generationsCount ?? '—'}
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Моих генераций</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-users text-primary-600 text-sm"></i>
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-gray-900">
                                {dashboardData?.stats?.totalStudents ?? '—'}
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Учеников</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-star text-yellow-500 text-sm"></i>
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-gray-900">
                                {dashboardData?.stats?.avgScore ? `${dashboardData.stats.avgScore}%` : '—'}
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Ср. балл</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-coins text-blue-600 text-sm"></i>
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-gray-900">
                                {totalCredits > 0 ? totalCredits.toLocaleString() : '—'}
                            </p>
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Кредитов</p>
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
                                {functions
                                    .filter(f => ['worksheet', 'quiz', 'vocabulary', 'lessonPlan', 'presentation', 'game'].includes(f.id))
                                    .map((func) => {
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
