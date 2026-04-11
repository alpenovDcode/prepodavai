'use client'

import { useState, useEffect, useMemo } from 'react'
import { BookOpen, HelpCircle, Gamepad2, PenTool, MessageSquare, Image as ImageIcon, Video, Sparkles, ClipboardList, ChevronRight, Search, FileEdit, MessageCircle, PackageOpen, LineChart, Camera, FileAudio, MonitorPlay, ClipboardCheck, GraduationCap, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { useSubscription } from '@/lib/hooks/useSubscription'
import PlanUpgradeModal from '@/components/PlanUpgradeModal'

interface DashboardData {
    totalPending: number
    byClass: Array<{ classId: string; className: string; pending: number }>
}

interface ToolDef {
    id: string
    title: string
    description: string
    icon: React.ElementType
    color: string
    path: string
    cost: number
    opKey: string
    category: string
}

const tools: ToolDef[] = [
    // Подготовка урока
    {
        id: 'lesson-planner', title: 'Конструктор Уроков',
        description: 'Генерируйте подробные планы уроков с целями, таймингом и материалами.',
        icon: BookOpen, color: 'bg-blue-50 text-blue-600',
        path: '/workspace/lesson-planner', cost: 3, opKey: 'lesson_plan', category: 'Подготовка урока'
    },
    {
        id: 'lesson-prep', title: 'Вау-урок',
        description: 'Подготовьте впечатляющий урок со структурой и интерактивными элементами.',
        icon: Sparkles, color: 'bg-orange-50 text-orange-600',
        path: '/workspace/lesson-prep', cost: 5, opKey: 'lesson_preparation', category: 'Подготовка урока'
    },
    {
        id: 'worksheet', title: 'Рабочие Листы',
        description: 'Генерируйте материалы для печати, домашние задания и тексты для чтения.',
        icon: PenTool, color: 'bg-yellow-50 text-yellow-600',
        path: '/workspace/worksheet', cost: 3, opKey: 'worksheet', category: 'Подготовка урока'
    },
    {
        id: 'vocabulary', title: 'Словарь',
        description: 'Создавайте словари терминов и определений по любой теме.',
        icon: BookOpen, color: 'bg-green-50 text-green-600',
        path: '/workspace/vocabulary', cost: 2, opKey: 'vocabulary', category: 'Подготовка урока'
    },
    {
        id: 'adaptation', title: 'Адаптация Текста',
        description: 'Адаптируйте учебный материал под уровень и возраст учеников.',
        icon: FileEdit, color: 'bg-teal-50 text-teal-600',
        path: '/workspace/adaptation', cost: 2, opKey: 'content_adaptation', category: 'Подготовка урока'
    },
    // Оценка знаний
    {
        id: 'quiz', title: 'Генератор Тестов',
        description: 'Создавайте интерактивные тесты и опросники на любую тему в один клик.',
        icon: HelpCircle, color: 'bg-green-50 text-green-600',
        path: '/workspace/quiz-generator', cost: 2, opKey: 'quiz', category: 'Оценка знаний'
    },
    {
        id: 'games', title: 'Обучающие Игры',
        description: 'Создавайте карточки memory, флэш-карты и другие интерактивные активности.',
        icon: Gamepad2, color: 'bg-purple-50 text-purple-600',
        path: '/workspace/games', cost: 15, opKey: 'game_generation', category: 'Оценка знаний'
    },
    {
        id: 'exam', title: 'Варианты ОГЭ/ЕГЭ',
        description: 'Генерируйте тренировочные варианты экзаменов по спецификациям ФИПИ.',
        icon: GraduationCap, color: 'bg-red-50 text-red-600',
        path: '/workspace/exam', cost: 20, opKey: 'exam_variant', category: 'Оценка знаний'
    },
    {
        id: 'homework', title: 'Проверка ДЗ',
        description: 'Проверяйте домашние задания учеников и выставляйте оценки с AI-помощью.',
        icon: ClipboardCheck, color: 'bg-amber-50 text-amber-600',
        path: '/workspace/homework', cost: 0, opKey: 'transcription', category: 'Оценка знаний'
    },
    {
        id: 'feedback', title: 'Фидбек',
        description: 'Генерируйте развёрнутую обратную связь для учеников по любой работе.',
        icon: MessageCircle, color: 'bg-pink-50 text-pink-600',
        path: '/workspace/feedback', cost: 2, opKey: 'feedback', category: 'Оценка знаний'
    },
    // Медиа-контент
    {
        id: 'presentation', title: 'Презентации',
        description: 'Создавайте визуально привлекательные слайды и экспортируйте в PDF/PPTX.',
        icon: MonitorPlay, color: 'bg-pink-50 text-pink-600',
        path: '/workspace/presentations', cost: 8, opKey: 'presentation', category: 'Медиа-контент'
    },
    {
        id: 'image', title: 'Генератор Изображений',
        description: 'Создавайте уникальные иллюстрации и визуал для учебных материалов.',
        icon: ImageIcon, color: 'bg-teal-50 text-teal-600',
        path: '/workspace/image', cost: 5, opKey: 'image_generation', category: 'Медиа-контент'
    },
    {
        id: 'photosession', title: 'AI Фотосессия',
        description: 'Создавайте серию изображений в едином профессиональном стиле.',
        icon: Camera, color: 'bg-indigo-50 text-indigo-600',
        path: '/workspace/photosession', cost: 10, opKey: 'photosession', category: 'Медиа-контент'
    },
    {
        id: 'transcription', title: 'Транскрибация Видео',
        description: 'Конвертируйте видео и живые лекции в структурированный текст.',
        icon: FileAudio, color: 'bg-red-50 text-red-600',
        path: '/workspace/transcription', cost: 15, opKey: 'transcription', category: 'Медиа-контент'
    },
    {
        id: 'video-analysis', title: 'Анализ Видео',
        description: 'Анализируйте видеоуроки, выделяйте ключевые моменты и получайте рекомендации.',
        icon: Video, color: 'bg-indigo-50 text-indigo-600',
        path: '/workspace/video-analysis', cost: 15, opKey: 'video_analysis', category: 'Медиа-контент'
    },
    // Другое
    {
        id: 'assistant', title: 'AI Ассистент',
        description: 'Общайтесь с умным помощником для мозгового штурма и сложных задач.',
        icon: MessageSquare, color: 'bg-orange-50 text-orange-600',
        path: '/workspace/assistant', cost: 3, opKey: 'message', category: 'Другое'
    },
    {
        id: 'unpacking', title: 'Распаковка Экспертности',
        description: 'Структурируйте и оформите ваши знания и экспертизу в понятный формат.',
        icon: PackageOpen, color: 'bg-cyan-50 text-cyan-600',
        path: '/workspace/unpacking', cost: 5, opKey: 'unpacking', category: 'Другое'
    },
    {
        id: 'sales-advisor', title: 'ИИ-Продажник',
        description: 'Анализируйте переписки с клиентами и получайте рекомендации по продажам.',
        icon: LineChart, color: 'bg-emerald-50 text-emerald-600',
        path: '/workspace/sales-advisor', cost: 10, opKey: 'sales_advisor', category: 'Другое'
    },
]

const categories = ['Подготовка урока', 'Оценка знаний', 'Медиа-контент', 'Другое']

// Какой минимальный план нужен для каждой операции
const OP_REQUIRED_PLAN: Record<string, string> = {
    lesson_plan: 'free',
    message: 'free',
    worksheet: 'free',
    quiz: 'free',
    vocabulary: 'free',
    feedback: 'free',
    content_adaptation: 'free',
    game_generation: 'starter',
    exam_variant: 'starter',
    unpacking: 'starter',
    video_analysis: 'starter',
    transcription: 'starter',
    presentation: 'starter',
    sales_advisor: 'starter',
    image_generation: 'pro',
    photosession: 'pro',
}

const PLAN_ORDER = ['free', 'starter', 'pro', 'business']

const PLAN_LABELS: Record<string, string> = {
    free: 'Бесплатный',
    starter: 'Стартер',
    pro: 'Про',
    business: 'Бизнес',
}

function getPlanIndex(planKey: string) {
    const idx = PLAN_ORDER.indexOf(planKey)
    return idx === -1 ? 0 : idx
}

function isToolLocked(opKey: string, currentPlanKey: string): { locked: boolean; requiredPlan: string } {
    const required = OP_REQUIRED_PLAN[opKey] ?? 'free'
    const locked = getPlanIndex(currentPlanKey) < getPlanIndex(required)
    return { locked, requiredPlan: required }
}

export default function WorkspaceHub() {
    const router = useRouter()
    const { subscription } = useSubscription()
    const currentPlanKey = (subscription as any)?.planKey || 'free'

    const [maintenanceStatus, setMaintenanceStatus] = useState<Record<string, boolean>>({})
    const [activeOps, setActiveOps] = useState<Set<string> | null>(null)
    const [dashboard, setDashboard] = useState<DashboardData | null>(null)
    const [query, setQuery] = useState('')
    const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; highlightPlanKey?: string }>({ open: false })

    useEffect(() => {
        const loadStatus = async () => {
            try {
                const response = await apiClient.get('/subscriptions/costs')
                if (response.data.success) {
                    const maintMap: Record<string, boolean> = {}
                    const active = new Set<string>()
                    response.data.costs.forEach((c: any) => {
                        maintMap[c.operationType] = c.isUnderMaintenance || false
                        active.add(c.operationType)
                    })
                    setMaintenanceStatus(maintMap)
                    setActiveOps(active)
                }
            } catch { /* ignore */ }
        }
        const loadDashboard = async () => {
            try {
                const res = await apiClient.get('/submissions/teacher-dashboard')
                setDashboard(res.data)
            } catch { /* ignore */ }
        }
        loadStatus()
        loadDashboard()
    }, [])

    const filteredTools = useMemo(() => {
        const q = query.toLowerCase().trim()
        const visible = tools.filter(t => !activeOps || activeOps.has(t.opKey))
        if (!q) return null
        return visible.filter(t =>
            t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
        )
    }, [query, activeOps])

    const renderCard = (tool: ToolDef) => {
        if (activeOps && !activeOps.has(tool.opKey)) return null
        const Icon = tool.icon
        const isMaint = maintenanceStatus[tool.opKey]
        const { locked, requiredPlan } = isToolLocked(tool.opKey, currentPlanKey)

        const handleClick = () => {
            if (isMaint) return
            if (locked) {
                setUpgradeModal({ open: true, highlightPlanKey: requiredPlan })
                return
            }
            router.push(tool.path)
        }

        return (
            <div
                key={tool.id}
                onClick={handleClick}
                className={`relative bg-white rounded-2xl p-4 border transition-all group flex flex-col gap-3 cursor-pointer ${
                    isMaint
                        ? 'border-gray-100 shadow-sm opacity-60 cursor-not-allowed'
                        : locked
                            ? 'border-gray-100 shadow-sm hover:border-amber-200 hover:shadow-md hover:-translate-y-0.5'
                            : 'border-gray-100 shadow-sm hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5'
                }`}
            >
                {/* Lock / Maintenance / Cost badge */}
                <div className="absolute top-3 right-3">
                    {isMaint ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-md border border-yellow-200 uppercase tracking-wide animate-pulse">
                            <i className="fas fa-wrench text-[8px]"></i> Тех.
                        </span>
                    ) : locked ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md border border-amber-200">
                            <Lock className="w-2.5 h-2.5" />
                            {PLAN_LABELS[requiredPlan]}
                        </span>
                    ) : tool.cost > 0 ? (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            {tool.cost}
                        </span>
                    ) : null}
                </div>

                {/* Icon + lock overlay */}
                <div className="relative w-10 h-10 flex-shrink-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tool.color} transition-transform ${!isMaint && !locked && 'group-hover:scale-105'} ${locked ? 'opacity-40' : ''}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    {locked && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm">
                            <Lock className="w-2.5 h-2.5 text-white" />
                        </div>
                    )}
                </div>

                {/* Text */}
                <div>
                    <h3 className={`text-sm font-bold leading-snug pr-6 mb-1 ${locked ? 'text-gray-400' : 'text-gray-900'}`}>
                        {tool.title}
                    </h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{tool.description}</p>
                </div>

                {/* Upgrade hint */}
                {locked && (
                    <div className="mt-auto pt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                        <Sparkles className="w-3 h-3" />
                        Доступно в {PLAN_LABELS[requiredPlan]}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-5 md:p-8 max-w-6xl mx-auto">
                {/* Header + Search */}
                <div className="mb-5 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-gray-900">Инструменты</h1>
                        <p className="text-gray-400 text-sm mt-0.5">Выберите инструмент для создания учебных материалов.</p>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Поиск инструментов..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                        />
                    </div>
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

                {/* Search results — flat grid */}
                {filteredTools !== null ? (
                    filteredTools.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {filteredTools.map(renderCard)}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Search className="w-10 h-10 mb-3 text-gray-200" />
                            <p className="font-bold text-gray-500">Ничего не найдено</p>
                            <p className="text-sm">Попробуйте другой запрос</p>
                        </div>
                    )
                ) : (
                    /* Categorized sections */
                    <div className="flex flex-col gap-8">
                        {categories.map(cat => {
                            const catTools = tools.filter(t => t.category === cat)
                            return (
                                <div key={cat}>
                                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{cat}</h2>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                        {catTools.map(renderCard)}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <PlanUpgradeModal
                open={upgradeModal.open}
                onClose={() => setUpgradeModal({ open: false })}
                highlightPlanKey={upgradeModal.highlightPlanKey}
            />
        </div>
    )
}
