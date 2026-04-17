'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { functions } from './InputComposer/config'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useSubscription } from '@/lib/hooks/useSubscription'
import OnboardingQuestBanner from './OnboardingQuestBanner'
import useSWR from 'swr'

const fetcher = (url: string) => apiClient.get(url).then((res: any) => res.data)

const typeMetadata: Record<string, { iconBg: string; iconColor: string; description: string }> = {
    lessonPlan:   { iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600', iconColor: 'text-white', description: 'Создайте полный план урока с целями, заданиями и оценкой.' },
    presentation: { iconBg: 'bg-gradient-to-br from-orange-400 to-red-500',   iconColor: 'text-white', description: 'Создайте увлекательные слайды для вашего урока.' },
    quiz:         { iconBg: 'bg-gradient-to-br from-amber-400 to-yellow-500',  iconColor: 'text-white', description: 'Сгенерируйте тест с вопросами и вариантами ответов.' },
    worksheet:    { iconBg: 'bg-gradient-to-br from-blue-400 to-indigo-500',   iconColor: 'text-white', description: 'Рабочий лист с заданиями для учеников.' },
    vocabulary:   { iconBg: 'bg-gradient-to-br from-emerald-400 to-green-500', iconColor: 'text-white', description: 'Словарь терминов и определений по теме.' },
    content:      { iconBg: 'bg-gradient-to-br from-indigo-400 to-blue-600',   iconColor: 'text-white', description: 'Адаптация учебного материала под уровень учеников.' },
    feedback:     { iconBg: 'bg-gradient-to-br from-pink-400 to-rose-500',     iconColor: 'text-white', description: 'Генерация обратной связи для ученика.' },
    image:        { iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600',     iconColor: 'text-white', description: 'Генерация изображений по описанию.' },
    photosession: { iconBg: 'bg-gradient-to-br from-teal-400 to-cyan-500',     iconColor: 'text-white', description: 'Создание серии изображений в едином стиле.' },
    message:      { iconBg: 'bg-gradient-to-br from-slate-400 to-gray-600',    iconColor: 'text-white', description: 'Генерация сообщений для родителей или коллег.' },
    game:         { iconBg: 'bg-gradient-to-br from-cyan-400 to-teal-500',     iconColor: 'text-white', description: 'Создание обучающих игр.' },
}

export default function DashboardHome() {
    const router = useRouter()
    const [lessonTopic, setLessonTopic] = useState('')
    const [subject, setSubject] = useState('')
    const [gradeLevel, setGradeLevel] = useState('5')
    const [duration, setDuration] = useState('45')
    const [selectedTypes, setSelectedTypes] = useState<string[]>(['presentation', 'quiz'])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [progressValue, setProgressValue] = useState(0)
    const [progressText, setProgressText] = useState('')
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const { data: statsData } = useSWR('/analytics/live-stats', fetcher, {
        refreshInterval: 30000,
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
            if (error?.status === 429) return
            if (retryCount >= 3) return
            setTimeout(() => revalidate({ retryCount }), 5000)
        },
    })
    const { data: dashboardData } = useSWR('/analytics/dashboard', fetcher)
    const { totalCredits } = useSubscription()
    const { generateBundle, isGenerating } = useGenerations()

    const PROGRESS_MESSAGES = [
        'Анализируем тему урока...',
        'Подбираем методические материалы...',
        'Генерируем структуру контента...',
        'Формируем задания для учеников...',
        'Проверяем соответствие возрасту...',
        'Создаём вопросы и ответы...',
        'Добавляем интерактивные элементы...',
        'Оптимизируем под формат урока...',
        'Применяем педагогические методики...',
        'Собираем финальный материал...',
        'Форматируем результат...',
        'Почти готово...',
    ]

    useEffect(() => {
        if (isGenerating) {
            setProgressValue(0)
            setProgressText(PROGRESS_MESSAGES[0])
            let current = 0
            progressIntervalRef.current = setInterval(() => {
                current += Math.random() * 4 + 1
                if (current >= 92) current = 92
                setProgressValue(Math.round(current))
                setProgressText(PROGRESS_MESSAGES[Math.floor(Math.random() * PROGRESS_MESSAGES.length)])
            }, 1200)
        } else {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
            }
            if (progressValue > 0) {
                setProgressValue(100)
                setProgressText('Готово!')
                setTimeout(() => { setProgressValue(0); setProgressText('') }, 800)
            }
        }
        return () => {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGenerating])

    const tokenCost = selectedTypes.length <= 2 ? 50 : 50 + (selectedTypes.length - 2) * 5

    const handleGenerate = async () => {
        if (!lessonTopic) { toast.error('Введите тему урока'); return }
        if (selectedTypes.length === 0) { toast.error('Выберите хотя бы один тип генерации'); return }

        const typeMap: Record<string, string> = {
            lessonPlan: 'lesson-plan',
            lessonPreparation: 'lesson_preparation',
            game: 'game_generation',
            image: 'image_generation',
            content: 'content-adaptation',
            videoAnalysis: 'video-analysis',
            salesAdvisor: 'sales_advisor',
            examVariant: 'exam-variant',
        }
        const types = selectedTypes.map((t) => typeMap[t] ?? t)
        try {
            await generateBundle(types, {
                topic: lessonTopic,
                subject,
                grade: gradeLevel,
                duration: parseInt(duration),
            })
            router.push('/dashboard/courses')
        } catch {
            toast.error('Ошибка при запуске генерации. Попробуйте снова.')
        }
    }

    const toggleType = (id: string) => {
        setSelectedTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
    }

    const addType = (id: string) => {
        if (!selectedTypes.includes(id)) setSelectedTypes(prev => [...prev, id])
        setIsModalOpen(false)
    }

    const getCardData = (id: string) => {
        const meta = typeMetadata[id] || { iconBg: 'bg-gray-100', iconColor: 'text-gray-600', description: 'Генерация контента.' }
        const func = functions.find(f => f.id === id)
        return { ...meta, title: func?.title || id, icon: func?.icon || 'fas fa-star' }
    }

    return (
        <div className="max-w-7xl mx-auto relative">
            <OnboardingQuestBanner />

            {/* Header */}
            <div className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Главная</h1>
                <p className="text-gray-600 mt-1 text-sm md:text-base max-w-2xl">
                    Готовьтесь к урокам быстрее, создавайте материалы и отслеживайте прогресс учеников — всё в одном месте.
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
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

                <div className="bg-white rounded-2xl p-4 md:p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-wand-magic-sparkles text-indigo-600 text-sm"></i>
                        </div>
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-gray-900">{statsData?.generationsCount ?? '—'}</p>
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
                            <p className="text-xl md:text-2xl font-bold text-gray-900">{dashboardData?.stats?.totalStudents ?? '—'}</p>
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
                            <p className="text-[11px] md:text-xs text-gray-600 font-medium">Токенов</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Form Card */}
            <div className="dashboard-card mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* Тема урока */}
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Тема урока</label>
                        <input
                            type="text"
                            value={lessonTopic}
                            onChange={(e) => setLessonTopic(e.target.value)}
                            placeholder="например, Фотосинтез"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none text-gray-900 transition"
                        />
                    </div>

                    {/* Предмет */}
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Предмет</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="например, Биология"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none text-gray-900 transition"
                        />
                    </div>

                    {/* Класс */}
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Класс</label>
                        <select
                            value={gradeLevel}
                            onChange={(e) => setGradeLevel(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none text-gray-900 transition appearance-none cursor-pointer"
                        >
                            {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={String(n)}>{n} класс</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Длительность */}
                <div className="w-full md:w-48">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Длительность</label>
                    <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none text-gray-900 transition appearance-none cursor-pointer"
                    >
                        <option value="30">30 минут</option>
                        <option value="45">45 минут</option>
                        <option value="60">60 минут</option>
                    </select>
                </div>
            </div>

            {/* Generation Type Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-4">
                {selectedTypes.map((typeId) => {
                    const data = getCardData(typeId)
                    return (
                        <div key={typeId} className="dashboard-card relative group !p-4 md:!p-6">
                            <div className="flex items-start justify-between mb-3">
                                <div className={`icon-circle ${data.iconBg} !w-9 !h-9 md:!w-11 md:!h-11`}>
                                    <i className={`${data.icon} ${data.iconColor} text-sm md:text-base`}></i>
                                </div>
                                <button onClick={() => toggleType(typeId)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
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

            {/* Create Button + Progress Bar */}
            <div className="dashboard-card mb-6 !p-4 md:!p-5">
                <div className="flex items-center gap-4 mb-3">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className={`px-6 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-md hover:shadow-lg text-sm ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                        {isGenerating ? (
                            <><i className="fas fa-spinner fa-spin"></i> Создаём...</>
                        ) : (
                            <><i className="fas fa-plus-circle"></i> Создать</>
                        )}
                    </button>
                    {selectedTypes.length > 0 && (
                        <div className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                            <i className="fas fa-coins text-yellow-500"></i>
                            {tokenCost} токенов
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="w-full">
                    <div className="flex items-center justify-between mb-1.5">
                        <p className={`text-xs font-medium transition-all duration-500 ${progressValue > 0 ? 'text-primary-600' : 'text-gray-400'}`}>
                            {progressValue > 0 ? progressText : 'Нажмите «Создать» для запуска генерации'}
                        </p>
                        {progressValue > 0 && (
                            <span className="text-xs font-bold text-primary-600 tabular-nums">{progressValue}%</span>
                        )}
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                progressValue >= 100 ? 'bg-green-500' : 'bg-primary-500'
                            }`}
                            style={{ width: `${progressValue}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Add Type Modal */}
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
                                                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                                                    isSelected
                                                        ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                                                        : 'bg-white border-gray-200 hover:border-primary-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer'
                                                }`}
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${meta.iconBg}`}>
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
        </div>
    )
}
