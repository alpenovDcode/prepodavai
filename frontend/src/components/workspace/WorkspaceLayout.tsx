'use client'

import { ReactNode, useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useServiceCosts } from '@/lib/hooks/useServiceCosts'
import { useUser } from '@/lib/hooks/useUser'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { LOGO_BASE64 } from '@/constants/branding'
import { BookOpen, HelpCircle, Gamepad2, Settings, ArrowLeft, PenTool, LayoutTemplate, MessageSquare, FileEdit, MessageCircle, Sparkles, PackageOpen, Video, LineChart, Camera, Image as ImageIcon, FileAudio, MonitorPlay, ClipboardCheck, GraduationCap, X, Menu, Loader2, Zap, Lock } from 'lucide-react'
import PlanUpgradeModal from '@/components/PlanUpgradeModal'
import NotificationBell from '@/components/NotificationBell'
import { getCachedGenerations } from '@/lib/utils/generationsCache'
import { getCurrentUser } from '@/lib/utils/userIdentity'

// Map: generation type → tool nav id
const typeToToolId: Record<string, string> = {
    'lesson_plan': 'lesson-planner', 'lesson-plan': 'lesson-planner',
    'lesson_preparation': 'lesson-prep', 'lesson-preparation': 'lesson-prep', 'lessonPreparation': 'lesson-prep',
    'quiz': 'quiz-generator',
    'game_generation': 'games', 'game': 'games',
    'worksheet': 'worksheet',
    'exam_variant': 'exam', 'exam-variant': 'exam',
    'vocabulary': 'vocabulary',
    'content_adaptation': 'adaptation', 'content': 'adaptation',
    'feedback': 'feedback',
    'unpacking': 'unpacking',
    'video_analysis': 'video-analysis', 'videoAnalysis': 'video-analysis',
    'sales_advisor': 'sales-advisor', 'salesAdvisor': 'sales-advisor',
    'photosession': 'photosession',
    'image_generation': 'image', 'image': 'image',
    'transcription': 'transcription',
    'presentation': 'presentations',
    'message': 'assistant', 'assistant': 'assistant',
}

interface Tool {
    id: string
    label: string
    icon: React.ElementType
    path: string
}

interface ToolGroup {
    label: string
    tools: Tool[]
}

interface WorkspaceLayoutProps {
    children: ReactNode
}

// Минимальный план для каждой операции
const OP_REQUIRED_PLAN: Record<string, string> = {
    lesson_plan: 'free', message: 'free', worksheet: 'free', quiz: 'free',
    vocabulary: 'free', feedback: 'free', content_adaptation: 'free',
    game_generation: 'starter', exam_variant: 'starter', unpacking: 'starter',
    video_analysis: 'starter', transcription: 'starter', presentation: 'starter', sales_advisor: 'starter',
    image_generation: 'pro', photosession: 'pro',
}
const PLAN_ORDER_LAYOUT = ['free', 'starter', 'pro', 'business']

function isOpLocked(opKey: string | undefined, currentPlanKey: string): boolean {
    if (!opKey) return false
    const required = OP_REQUIRED_PLAN[opKey] ?? 'free'
    return PLAN_ORDER_LAYOUT.indexOf(currentPlanKey) < PLAN_ORDER_LAYOUT.indexOf(required)
}

const opMap: Record<string, string> = {
    'lesson-planner': 'lesson_plan',
    'lesson-prep': 'lesson_plan',
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

const toolGroups: ToolGroup[] = [
    {
        label: 'Подготовка урока',
        tools: [
            { id: 'hub', label: 'Главная панель', icon: LayoutTemplate, path: '/workspace' },
            { id: 'lesson-planner', label: 'Конструктор Уроков', icon: LayoutTemplate, path: '/workspace/lesson-planner' },
            { id: 'lesson-prep', label: 'Вау-урок', icon: Sparkles, path: '/workspace/lesson-prep' },
            { id: 'worksheet', label: 'Рабочие Листы', icon: PenTool, path: '/workspace/worksheet' },
            { id: 'vocabulary', label: 'Словарь', icon: BookOpen, path: '/workspace/vocabulary' },
            { id: 'adaptation', label: 'Адаптация Текста', icon: FileEdit, path: '/workspace/adaptation' },
        ]
    },
    {
        label: 'Оценка знаний',
        tools: [
            { id: 'quiz-generator', label: 'Генератор Тестов', icon: HelpCircle, path: '/workspace/quiz-generator' },
            { id: 'games', label: 'Обучающие Игры', icon: Gamepad2, path: '/workspace/games' },
            { id: 'exam', label: 'Варианты ОГЭ/ЕГЭ', icon: GraduationCap, path: '/workspace/exam' },
            { id: 'homework', label: 'Проверка ДЗ', icon: ClipboardCheck, path: '/workspace/homework' },
            { id: 'feedback', label: 'Фидбек', icon: MessageCircle, path: '/workspace/feedback' },
        ]
    },
    {
        label: 'Медиа-контент',
        tools: [
            { id: 'presentations', label: 'Презентации', icon: MonitorPlay, path: '/workspace/presentations' },
            { id: 'image', label: 'Генератор Изображений', icon: ImageIcon, path: '/workspace/image' },
            { id: 'photosession', label: 'AI Фотосессия', icon: Camera, path: '/workspace/photosession' },
            { id: 'transcription', label: 'Транскрибация', icon: FileAudio, path: '/workspace/transcription' },
            { id: 'video-analysis', label: 'Анализ Видео', icon: Video, path: '/workspace/video-analysis' },
        ]
    },
    {
        label: 'Другое',
        tools: [
            { id: 'assistant', label: 'AI Ассистент', icon: MessageSquare, path: '/workspace/assistant' },
            { id: 'unpacking', label: 'Распаковка Экспертности', icon: PackageOpen, path: '/workspace/unpacking' },
            { id: 'sales-advisor', label: 'ИИ-Продажник', icon: LineChart, path: '/workspace/sales-advisor' },
        ]
    },
]

const allTools = toolGroups.flatMap(g => g.tools)

function getCreditsLabel(value: number): string {
    if (value === 0) return 'токенов'
    const lastDigit = value % 10
    const lastTwoDigits = value % 100
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'токенов'
    if (lastDigit === 1) return 'токен'
    if (lastDigit >= 2 && lastDigit <= 4) return 'токена'
    return 'токенов'
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { user, fullName, initials, loading: userLoading } = useUser()
    const { subscription, totalCredits, loading: subLoading } = useSubscription()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [avatarError, setAvatarError] = useState(false)
    const [planModalOpen, setPlanModalOpen] = useState(false)

    const { isMobile, isMiniApp } = useIsMobile()
    const { costs } = useServiceCosts()

    const topToolIds = useMemo(() => {
        const user = getCurrentUser()
        const gens = getCachedGenerations().filter(g => g.userId === user.userHash && g.status === 'completed')
        const counts: Record<string, number> = {}
        for (const g of gens) {
            const toolId = typeToToolId[g.type]
            if (toolId) counts[toolId] = (counts[toolId] || 0) + 1
        }
        return new Set(
            Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id)
        )
    }, [])

    const topTools = useMemo(
        () => allTools.filter(t => topToolIds.has(t.id)),
        [topToolIds]
    )

    const isActive = (path: string) => {
        if (path === '/workspace' && pathname !== '/workspace') return false
        return pathname.startsWith(path)
    }

    const currentPlanKey = (subscription as any)?.planKey || 'free'

    const renderToolButton = (tool: Tool, showStar = false) => {
        const Icon = tool.icon
        const active = isActive(tool.path)
        const opType = opMap[tool.id]
        const costEntry = costs?.find(c => c.operationType === opType)
        const isHidden = costs !== undefined && opType !== undefined && !costEntry
        const isUnderMaintenance = costEntry?.isUnderMaintenance || false
        const locked = isOpLocked(opType, currentPlanKey)

        if (isHidden) return null

        const handleClick = () => {
            if (isUnderMaintenance) return
            if (locked) { setPlanModalOpen(true); return }
            router.push(tool.path)
            setMobileMenuOpen(false)
        }

        return (
            <button
                key={tool.id}
                onClick={handleClick}
                title={isUnderMaintenance ? 'Временно недоступно (тех. работы)' : locked ? 'Недоступно на вашем тарифе' : ''}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group relative w-full ${
                    active
                        ? 'bg-primary-50 text-primary-700'
                        : isUnderMaintenance
                            ? 'text-gray-300 cursor-not-allowed'
                            : locked
                                ? 'text-gray-300 hover:bg-amber-50 hover:text-amber-600 cursor-pointer'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
            >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary-600' : isUnderMaintenance ? 'text-gray-200' : locked ? 'text-gray-300 group-hover:text-amber-400' : 'text-gray-400'}`} />
                <span className="flex-1 text-left">{tool.label}</span>
                {isUnderMaintenance ? (
                    <PenTool className="w-3 h-3 text-amber-400 animate-pulse" />
                ) : locked ? (
                    <Lock className="w-3 h-3 text-gray-300 group-hover:text-amber-400 transition-colors" />
                ) : showStar ? (
                    <span className="text-[10px] text-amber-400">★</span>
                ) : null}
            </button>
        )
    }

    const renderToolNav = () => (
        <nav className="flex flex-col pb-4">
            {/* Часто используемые */}
            {topTools.length > 0 && (
                <div className="mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 px-3 pt-4 pb-1.5">
                        Часто используемые
                    </p>
                    <div className="flex flex-col gap-1">
                        {topTools.map(tool => renderToolButton(tool, true))}
                    </div>
                </div>
            )}

            {/* Группы инструментов */}
            {toolGroups.map((group, groupIndex) => (
                <div key={group.label}>
                    {(groupIndex > 0 || topTools.length > 0) && (
                        <div className="border-t border-gray-100 mt-2 mb-2" />
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 px-3 pt-2 pb-1.5">
                        {group.label}
                    </p>
                    <div className="flex flex-col gap-1">
                        {group.tools.map(tool => renderToolButton(tool))}
                    </div>
                </div>
            ))}
        </nav>
    )

    // ===== MOBILE / MINI APP LAYOUT =====
    if (isMobile || isMiniApp) {
        const mobileNavItems = [
            { id: 'dashboard', label: 'Главная', icon: 'fa-solid fa-house', path: '/dashboard' },
            { id: 'ai', label: 'ИИ', icon: 'fas fa-wand-magic-sparkles', path: '/workspace' },
            { id: 'courses', label: 'Материалы', icon: 'fas fa-book', path: '/dashboard/courses' },
            { id: 'students', label: 'Ученики', icon: 'fas fa-users', path: '/dashboard/students' },
            { id: 'settings', label: 'Ещё', icon: 'fas fa-ellipsis', path: '/dashboard/settings' },
        ]

        return (
            <div className="h-screen bg-[#F9FAFB] flex flex-col overflow-hidden">
                {/* Mobile header */}
                <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-30">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition shadow-sm active:scale-95"
                    >
                        <Menu className="w-5 h-5 text-gray-700" />
                    </button>
                    <div className="flex items-center gap-2">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="Преподавай" className="w-7 h-7 object-contain" />
                        ) : (
                            <LayoutTemplate className="w-5 h-5 text-primary-600" />
                        )}
                        <span className="font-bold text-gray-900 text-sm">ИИ Инструменты</span>
                    </div>
                    <div className="w-10" />
                </div>

                {/* Slide-over tools menu */}
                {mobileMenuOpen && (
                    <div className="fixed inset-0 z-[60]">
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-300 ease-out">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-2">
                                    <LayoutTemplate className="w-5 h-5 text-primary-600" />
                                    <span className="font-bold text-gray-900">Инструменты</span>
                                </div>
                                <button
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center active:scale-95"
                                >
                                    <X className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>

                            {/* User Context */}
                            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                                    {initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 truncate">{fullName}</p>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                        {subscription?.planName || 'Базовый План'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto px-1 py-1 custom-scrollbar">
                                <div className="px-3 py-2">
                                    {renderToolNav()}
                                </div>
                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                                <button
                                    onClick={() => { router.push('/dashboard'); setMobileMenuOpen(false) }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition active:scale-[0.98]"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span>В панель управления</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <main className="flex-1 overflow-hidden relative">
                    {children}
                </main>

                {/* Bottom Tab Bar */}
                <nav className="flex-shrink-0 bg-white/95 backdrop-blur-md border-t border-gray-100 z-50 safe-area-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                    <div className="flex justify-around items-center h-16 px-2">
                        {mobileNavItems.map((item) => {
                            const active = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
                            return (
                                <Link
                                    key={item.id}
                                    href={item.path}
                                    className={`flex flex-col items-center justify-center flex-1 h-full transition-all relative ${active ? 'text-primary-600' : 'text-gray-400'}`}
                                >
                                    {active && (
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary-600 rounded-b-full shadow-[0_2px_4px_rgba(37,99,235,0.2)]" />
                                    )}
                                    <i className={`${item.icon} text-lg mb-1 ${active ? 'scale-110' : ''} transition-transform`}></i>
                                    <span className={`text-[10px] font-bold tracking-tight ${active ? 'opacity-100' : 'opacity-70'}`}>
                                        {item.label}
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                </nav>
            </div>
        )
    }

    // ===== DESKTOP LAYOUT =====
    return (
        <div className="flex bg-[#F9FAFB] min-h-screen h-screen overflow-hidden">
            {/* Sidebar */}
            <aside className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                {/* Header/Brand */}
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="Преподавай" className="w-9 h-9 object-contain rounded-lg" />
                        ) : (
                            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-200">
                                <span className="text-white font-bold text-sm">P</span>
                            </div>
                        )}
                        <span className="font-bold text-gray-900 tracking-tight">Prepodavai.ru</span>
                    </div>
                </div>

                {/* Back to Dashboard */}
                <div className="p-4">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-primary-700 hover:bg-primary-50 rounded-xl transition-all border border-transparent hover:border-primary-100"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Вернуться в Dashboard</span>
                    </button>
                </div>

                {/* Tools Navigation */}
                <div className="px-4 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200">
                    {renderToolNav()}
                </div>

                {/* Balance + Upgrade */}
                <div className="px-4 pb-3 flex flex-col gap-2">
                    <div
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50 border border-purple-100"
                        title="Токены — внутренняя валюта для генерации материалов"
                    >
                        <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        {subLoading ? (
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        ) : (
                            <span className="text-sm font-bold text-gray-800">
                                {totalCredits ?? 0}{' '}
                                <span className="font-normal text-gray-500 text-xs">
                                    {getCreditsLabel(totalCredits ?? 0)}
                                </span>
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setPlanModalOpen(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Улучшить тариф
                    </button>
                </div>

                <PlanUpgradeModal open={planModalOpen} onClose={() => setPlanModalOpen(false)} />

                {/* User Profile */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <NotificationBell userType="teacher" />
                        <button
                            onClick={() => router.push('/dashboard/settings')}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-100 transition-all"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                    <div
                        onClick={() => router.push('/dashboard/settings')}
                        className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 cursor-pointer transition-all group"
                    >
                        {user?.avatar && !avatarError ? (
                            <img
                                src={user.avatar}
                                alt={fullName}
                                onError={() => setAvatarError(true)}
                                className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-gray-50 group-hover:ring-primary-50 transition-all"
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md">
                                {initials}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">
                                {userLoading ? 'Загрузка...' : fullName}
                            </p>
                            <p className="text-[10px] text-gray-500 font-medium truncate">
                                {subLoading ? '...' : (subscription?.planName || 'Базовый План')}
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full bg-[#fcfcfc] min-w-0 overflow-hidden">
                {children}
            </main>
        </div>
    )
}
