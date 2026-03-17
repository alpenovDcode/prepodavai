'use client'

import { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useServiceCosts } from '@/lib/hooks/useServiceCosts'
import { LOGO_BASE64 } from '@/constants/branding'
import { BookOpen, HelpCircle, Gamepad2, Settings, ArrowLeft, PenTool, LayoutTemplate, MessageSquare, FileEdit, MessageCircle, Sparkles, PackageOpen, Video, LineChart, Camera, Image as ImageIcon, FileAudio, MonitorPlay, ClipboardCheck, GraduationCap } from 'lucide-react'

interface WorkspaceLayoutProps {
    children: ReactNode
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
    const pathname = usePathname()
    const router = useRouter()

    const tools = [
        { id: 'hub', label: 'Главная панель', icon: LayoutTemplate, path: '/workspace' },
        { id: 'homework', label: 'Проверка ДЗ', icon: ClipboardCheck, path: '/workspace/homework' },
        { id: 'lesson-planner', label: 'Конструктор Уроков', icon: LayoutTemplate, path: '/workspace/lesson-planner' },
        { id: 'lesson-prep', label: 'Вау-урок', icon: Sparkles, path: '/workspace/lesson-prep' },
        { id: 'quiz-generator', label: 'Генератор Тестов', icon: HelpCircle, path: '/workspace/quiz-generator' },
        { id: 'games', label: 'Обучающие Игры', icon: Gamepad2, path: '/workspace/games' },
        { id: 'worksheet', label: 'Рабочие Листы', icon: PenTool, path: '/workspace/worksheet' },
        { id: 'exam', label: 'Варианты ОГЭ/ЕГЭ', icon: GraduationCap, path: '/workspace/exam' },
        { id: 'vocabulary', label: 'Словарь', icon: BookOpen, path: '/workspace/vocabulary' },
        { id: 'adaptation', label: 'Адаптация Текста', icon: FileEdit, path: '/workspace/adaptation' },
        { id: 'feedback', label: 'Фидбек', icon: MessageCircle, path: '/workspace/feedback' },
        { id: 'unpacking', label: 'Распаковка Экспертности', icon: PackageOpen, path: '/workspace/unpacking' },
        { id: 'video-analysis', label: 'Анализ Видео', icon: Video, path: '/workspace/video-analysis' },
        { id: 'sales-advisor', label: 'ИИ-Продажник', icon: LineChart, path: '/workspace/sales-advisor' },
        { id: 'photosession', label: 'AI Фотосессия', icon: Camera, path: '/workspace/photosession' },
        { id: 'image', label: 'Генератор Изображений', icon: ImageIcon, path: '/workspace/image' },
        { id: 'transcription', label: 'Транскрибация', icon: FileAudio, path: '/workspace/transcription' },
        { id: 'presentations', label: 'Презентации', icon: MonitorPlay, path: '/workspace/presentations' },
        { id: 'assistant', label: 'AI Ассистент', icon: MessageSquare, path: '/workspace/assistant' },
    ]

    const { costs } = useServiceCosts()

    const opMap: Record<string, string> = {
        'lesson-planner': 'lesson_plan',
        'lesson-prep': 'lesson_plan', // Mapping for Wow-lesson
        'quiz-generator': 'quiz',
        'games': 'game_generation',
        'worksheet': 'worksheet',
        'exam': 'exam_variant',
        'vocabulary': 'vocabulary',
        'adaptation': 'content_adaptation',
        'feedback': 'feedback',
        'unpacking': 'unpacking',
        'video-analysis': 'video_analysis',
        'sales-advisor': 'sales_advisor',
        'photosession': 'photosession',
        'image': 'image_generation',
        'transcription': 'transcription',
        'presentations': 'presentation',
        'assistant': 'message',
        'homework': 'transcription'
    }

    const isActive = (path: string) => {
        if (path === '/workspace' && pathname !== '/workspace') return false;
        return pathname.startsWith(path)
    }

    return (
        <div className="flex bg-[#F9FAFB] min-h-screen h-screen overflow-hidden">
            {/* Global AI Tools Sidebar */}
            <aside className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full z-20">
                {/* Header/Brand */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="PrepodavAI" className="w-8 h-8 object-contain rounded-md" />
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                                <span className="text-white font-bold text-sm">P</span>
                            </div>
                        )}
                        <span className="font-bold text-gray-900">Prepodavai.ru</span>
                    </div>
                </div>

                {/* Back to Dashboard Button */}
                <div className="p-3">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Вернуться в Dashboard</span>
                    </button>
                </div>

                {/* Tools Navigation */}
                <div className="px-3 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3 mt-4">Инструменты</p>
                    <nav className="flex flex-col gap-1 pb-4">
                        {tools.map((tool) => {
                            const Icon = tool.icon
                            const active = isActive(tool.path)
                            const opType = opMap[tool.id]
                            const isUnderMaintenance = costs?.find(c => c.operationType === opType)?.isUnderMaintenance || false

                            return (
                                <button
                                    key={tool.id}
                                    onClick={() => !isUnderMaintenance && router.push(tool.path)}
                                    title={isUnderMaintenance ? 'Временно недоступно (тех. работы)' : ''}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group relative ${active
                                        ? 'bg-primary-50 text-primary-700'
                                        : isUnderMaintenance 
                                            ? 'text-gray-300 cursor-not-allowed'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`w-4 h-4 ${active ? 'text-primary-600' : isUnderMaintenance ? 'text-gray-200' : 'text-gray-400'}`} />
                                    <span className="flex-1 text-left">{tool.label}</span>
                                    {isUnderMaintenance && (
                                        <PenTool className="w-3 h-3 text-amber-400 animate-pulse" />
                                    )}
                                </button>
                            )
                        })}
                    </nav>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* User Profile Hook (Mock for now, should connect to real user context) */}
                <div className="p-4 border-t border-gray-100">
                    <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 cursor-pointer transition">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shrink-0">
                            U
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">Преподаватель</p>
                            <p className="text-xs text-gray-500 truncate">Pro План</p>
                        </div>
                        <Settings className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full bg-[#F9FAFB] min-w-0 overflow-hidden relative">
                {children}
            </main>
        </div>
    )
}
