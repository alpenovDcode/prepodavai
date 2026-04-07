'use client'
 
import { useState, useEffect } from 'react'
import { BookOpen, HelpCircle, Gamepad2, PenTool, MessageSquare, Presentation, Image as ImageIcon, Video, Sparkles, ClipboardList, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

interface DashboardData {
    totalPending: number
    byClass: Array<{ classId: string; className: string; pending: number }>
}

export default function WorkspaceHub() {
    const router = useRouter()

    const [maintenanceStatus, setMaintenanceStatus] = useState<Record<string, boolean>>({})
    const [dashboard, setDashboard] = useState<DashboardData | null>(null)

    useEffect(() => {
        const loadStatus = async () => {
            try {
                const response = await apiClient.get('/subscriptions/costs')
                if (response.data.success) {
                    const maintMap: Record<string, boolean> = {}
                    response.data.costs.forEach((c: any) => {
                        maintMap[c.operationType] = c.isUnderMaintenance || false
                    })
                    setMaintenanceStatus(maintMap)
                }
            } catch (e) {
                // ignore
            }
        }
        const loadDashboard = async () => {
            try {
                const res = await apiClient.get('/submissions/teacher-dashboard')
                setDashboard(res.data)
            } catch (e) {
                // ignore — not a teacher or no classes yet
            }
        }
        loadStatus()
        loadDashboard()
    }, [])

    const opMap: Record<string, string> = {
        'lesson-planner': 'lesson_plan',
        'quiz': 'quiz',
        'games': 'game_generation',
        'worksheet': 'worksheet',
        'presentation': 'presentation',
        'assistant': 'assistant',
        'image': 'image_generation',
        'transcription': 'transcription',
        'video-analysis': 'video_analysis',
        'sales-advisor': 'sales_advisor',
        'exam': 'exam_variant',
        'unpacking': 'unpacking'
    }

    const tools = [
        {
            id: 'lesson-planner',
            title: 'Конструктор Уроков',
            description: 'Генерируйте подробные планы уроков с целями, таймингом и материалами.',
            icon: BookOpen,
            color: 'bg-blue-50 text-blue-600',
            path: '/workspace/lesson-planner',
            cost: 3
        },
        {
            id: 'quiz',
            title: 'Генератор Тестов',
            description: 'Создавайте интерактивные тесты и опросники на любую тему в один клик.',
            icon: HelpCircle,
            color: 'bg-green-50 text-green-600',
            path: '/workspace/quiz-generator',
            cost: 2
        },
        {
            id: 'games',
            title: 'Обучающие Игры',
            description: 'Создавайте карточки memory, флэш-карты и другие интерактивные активности.',
            icon: Gamepad2,
            color: 'bg-purple-50 text-purple-600',
            path: '/workspace/games',
            cost: 15
        },
        {
            id: 'worksheet',
            title: 'Рабочие Листы',
            description: 'Генерируйте материалы для печати, домашние задания и тексты для чтения.',
            icon: PenTool,
            color: 'bg-yellow-50 text-yellow-600',
            path: '/workspace/worksheet',
            cost: 3
        },
        {
            id: 'video-analysis',
            title: 'Анализ Видео',
            description: 'Анализируйте видеоуроки, выделяйте ключевые моменты и получайте рекомендации.',
            icon: Video,
            color: 'bg-indigo-50 text-indigo-600',
            path: '/workspace/video-analysis',
            cost: 15
        },
        {
            id: 'exam',
            title: 'Варианты ОГЭ/ЕГЭ',
            description: 'Генерируйте полноценные тренировочные варианты экзаменов по спецификациям ФИПИ.',
            icon: Sparkles,
            color: 'bg-orange-50 text-orange-600',
            path: '/workspace/exam',
            cost: 20
        },
        {
            id: 'presentation',
            title: 'Презентации',
            description: 'Создавайте визуально привлекательные слайды и экспортируйте их в PDF/PPTX.',
            icon: Presentation,
            color: 'bg-pink-50 text-pink-600',
            path: '/workspace/presentations',
            cost: 8
        },
        {
            id: 'assistant',
            title: 'AI Ассистент',
            description: 'Общайтесь с умным помощником для мозгового штурма и решения сложных задач.',
            icon: MessageSquare,
            color: 'bg-orange-50 text-orange-600',
            path: '/workspace/assistant',
            cost: 3
        },
        {
            id: 'image',
            title: 'Генератор Изображений',
            description: 'Создавайте уникальные иллюстрации и визуал для ваших учебных материалов.',
            icon: ImageIcon,
            color: 'bg-teal-50 text-teal-600',
            path: '/workspace/image',
            cost: 5
        },
        {
            id: 'transcription',
            title: 'Транскрибация Видео',
            description: 'Конвертируйте обучающие видео и живые лекции в структурированный текст.',
            icon: Video,
            color: 'bg-red-50 text-red-600',
            path: '/workspace/transcription',
            cost: 15
        }
    ]

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-5 md:p-8 max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-5 md:mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Инструменты</h1>
                    <p className="text-gray-400 text-sm mt-0.5">Выберите инструмент для создания учебных материалов.</p>
                </div>

                {/* Homework alert */}
                {dashboard && dashboard.totalPending > 0 && (
                    <div
                        onClick={() => router.push('/workspace/homework')}
                        className="mb-5 flex items-center justify-between gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl px-4 py-3 cursor-pointer hover:shadow-md transition-shadow group"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                                <ClipboardList className="w-4 h-4 text-amber-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-gray-900 text-sm">
                                    {dashboard.totalPending} {dashboard.totalPending === 1 ? 'работа ждёт' : dashboard.totalPending < 5 ? 'работы ждут' : 'работ ждут'} проверки
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {dashboard.byClass.map(c => `${c.className}: ${c.pending}`).join(' · ')}
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    </div>
                )}

                {/* Tools grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {tools.map((tool) => {
                        const Icon = tool.icon
                        const isMaint = maintenanceStatus[opMap[tool.id]]
                        return (
                            <div
                                key={tool.id}
                                onClick={() => !isMaint && router.push(tool.path)}
                                className={`relative bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all group flex flex-col gap-3 ${
                                    isMaint
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'cursor-pointer hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5'
                                }`}
                            >
                                {/* Cost / maintenance badge */}
                                <div className="absolute top-3 right-3">
                                    {isMaint ? (
                                        <span className="flex items-center gap-1 text-[9px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-md border border-yellow-200 uppercase tracking-wide animate-pulse">
                                            <i className="fas fa-wrench text-[8px]"></i> Тех.
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                                            {tool.cost}
                                        </span>
                                    )}
                                </div>

                                {/* Icon */}
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tool.color} transition-transform ${!isMaint && 'group-hover:scale-105'}`}>
                                    <Icon className="w-5 h-5" />
                                </div>

                                {/* Text */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 leading-snug pr-6 mb-1">{tool.title}</h3>
                                    <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{tool.description}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
