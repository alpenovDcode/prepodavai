'use client'
 
import { useState, useEffect } from 'react'
import { BookOpen, HelpCircle, Gamepad2, PenTool, MessageSquare, Presentation, Image as ImageIcon, Video, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

export default function WorkspaceHub() {
    const router = useRouter()

    const [maintenanceStatus, setMaintenanceStatus] = useState<Record<string, boolean>>({})

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
        loadStatus()
    }, [])

    const opMap: Record<string, string> = {
        'lesson-planner': 'lesson_plan',
        'quiz': 'quiz',
        'games': 'game_generation',
        'worksheet': 'worksheet',
        'presentation': 'presentation',
        'assistant': 'assistant',
        'image': 'image_generation',
        'transcription': 'transcription'
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
            cost: 2
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
        <div className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto w-full">
            <div className="mb-10">
                <h1 className="text-3xl font-bold mb-2">Workspace Hub</h1>
                <p className="text-gray-500 text-lg">Выберите инструмент, чтобы начать создание учебных материалов.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {tools.map((tool) => {
                    const Icon = tool.icon
                    const isMaint = maintenanceStatus[opMap[tool.id]]
                    return (
                        <div
                            key={tool.id}
                            onClick={() => !isMaint && router.push(tool.path)}
                            className={`bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all group flex flex-col h-full relative ${isMaint ? 'cursor-not-allowed grayscale-[0.5] opacity-80' : 'cursor-pointer'}`}
                        >
                            {isMaint ? (
                                <div className="absolute top-6 right-6 flex items-center gap-1.5 text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-1 rounded-lg border border-yellow-200 uppercase tracking-wider animate-pulse">
                                    <i className="fas fa-wrench text-[9px]"></i>
                                    Тех. работы
                                </div>
                            ) : (
                                <div className="absolute top-6 right-6 flex items-center gap-1.5 text-xs font-semibold bg-gray-50 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-100">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                                    {tool.cost} {tool.cost === 1 ? 'токен' : (tool.cost >= 2 && tool.cost <= 4) ? 'токена' : 'токенов'}
                                </div>
                            )}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tool.color} ${!isMaint && 'group-hover:scale-110'} transition-transform`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold mb-2 pr-12">{tool.title}</h3>
                            <p className="text-sm text-gray-500 flex-1 leading-relaxed">
                                {tool.description}
                            </p>

                            <div className={`mt-4 flex items-center text-sm font-medium ${isMaint ? 'text-yellow-600' : 'text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0'}`}>
                                <span>{isMaint ? 'Временно недоступно' : 'Начать создание'}</span>
                                <Sparkles className="w-4 h-4 ml-1.5" />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
