'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    BookOpen, HelpCircle, Gamepad2, PenTool, MessageSquare, Image as ImageIcon, Video, Sparkles,
    ClipboardList, ChevronRight, FileEdit, MessageCircle, PackageOpen, LineChart, Camera, FileAudio,
    MonitorPlay, ClipboardCheck, GraduationCap, FileText, Mail, Wrench,
    Wand2, Zap, Compass,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { IconTile, IconTileColor } from '@/components/ui/v2/IconTile'
import { Badge } from '@/components/ui/v2/Badge'
import { SearchBar } from '@/components/ui/v2/SearchBar'
import { cn } from '@/lib/utils/cn'

interface ToolDef {
    id: string
    title: string
    description: string
    icon: React.ElementType
    color: IconTileColor
    path: string
    cost: number
    opKey: string
    /** Категория для табов. */
    cat: CategoryKey
    /** ~ ETA. */
    eta?: string
}

type CategoryKey = 'all' | 'materials' | 'assessment' | 'media' | 'comms' | 'other'

const CATEGORIES: { key: CategoryKey; label: string; icon: any }[] = [
    { key: 'all',         label: 'Все',         icon: null },
    { key: 'materials',   label: 'Материалы',   icon: FileText },
    { key: 'assessment',  label: 'Оценка',      icon: ClipboardCheck },
    { key: 'media',       label: 'Медиа',       icon: ImageIcon },
    { key: 'comms',       label: 'Общение',     icon: Mail },
    { key: 'other',       label: 'Другое',      icon: PackageOpen },
]

const TOOLS: ToolDef[] = [
    { id: 'lesson-planner',  title: 'Конструктор уроков',   description: 'Подробный план с целями, таймингом и материалами.',                icon: BookOpen,        color: 'info',    path: '/workspace/lesson-planner',  cost: 3,  opKey: 'lesson_plan',          cat: 'materials',  eta: '~40 сек' },
    { id: 'worksheet',       title: 'Рабочий лист',         description: 'Готовый PDF-лист с заданиями по теме и уровню класса.',           icon: PenTool,         color: 'brand',   path: '/workspace/worksheet',       cost: 3,  opKey: 'worksheet',            cat: 'materials',  eta: '~30 сек' },
    { id: 'vocabulary',      title: 'Словарь',              description: 'Тематический словарь на 10 языках с переводом и примерами.',      icon: BookOpen,        color: 'success', path: '/workspace/vocabulary',      cost: 2,  opKey: 'vocabulary',           cat: 'materials',  eta: '~20 сек' },
    { id: 'adaptation',      title: 'Адаптация текста',     description: 'Подстройка учебного материала под уровень и возраст.',            icon: FileEdit,        color: 'teal',    path: '/workspace/adaptation',      cost: 2,  opKey: 'content_adaptation',   cat: 'materials',  eta: '~30 сек' },
    { id: 'lesson-prep',     title: 'Вау-урок',             description: 'Комплект «под ключ»: план + рабочий лист + тест за минуту.',      icon: Sparkles,        color: 'warning', path: '/workspace/lesson-prep',     cost: 5,  opKey: 'lesson_preparation',   cat: 'materials',  eta: '~1 мин' },

    { id: 'quiz',            title: 'Генератор тестов',     description: 'Тест с выбором ответа: 5–25 вопросов, 2–4 варианта.',             icon: HelpCircle,      color: 'info',    path: '/workspace/quiz-generator',  cost: 2,  opKey: 'quiz',                 cat: 'assessment', eta: '~30 сек' },
    { id: 'games',           title: 'Обучающие игры',       description: 'Memory, флэш-карты и интерактивные активности.',                  icon: Gamepad2,        color: 'indigo',  path: '/workspace/games',           cost: 15, opKey: 'game_generation',      cat: 'assessment', eta: '~1 мин' },
    { id: 'exam',            title: 'Варианты ОГЭ/ЕГЭ',     description: 'Тренировочные варианты экзаменов по спецификациям ФИПИ.',         icon: GraduationCap,   color: 'danger',  path: '/workspace/exam',            cost: 20, opKey: 'exam_variant',         cat: 'assessment', eta: '~2 мин' },
    { id: 'homework',        title: 'Проверка ДЗ',          description: 'AI-помощь в проверке работ учеников и выставлении оценок.',       icon: ClipboardCheck,  color: 'warning', path: '/workspace/homework',        cost: 0,  opKey: 'transcription',        cat: 'assessment', eta: 'по работе' },
    { id: 'feedback',        title: 'Фидбек',               description: 'Развёрнутая обратная связь по любой работе ученика.',             icon: MessageCircle,   color: 'pink',    path: '/workspace/feedback',        cost: 2,  opKey: 'feedback',             cat: 'assessment', eta: '~20 сек' },

    { id: 'presentation',    title: 'Презентации',          description: 'Визуально привлекательные слайды + экспорт в PDF/PPTX.',          icon: MonitorPlay,     color: 'success', path: '/workspace/presentations',   cost: 8,  opKey: 'presentation',         cat: 'media',      eta: '~2 мин' },
    { id: 'image',           title: 'Генератор изображений', description: 'Уникальные иллюстрации и визуал для учебных материалов.',         icon: ImageIcon,       color: 'teal',    path: '/workspace/image',           cost: 5,  opKey: 'image_generation',     cat: 'media',      eta: '~40 сек' },
    { id: 'photosession',    title: 'AI-фотосессия',        description: 'Серия изображений в едином профессиональном стиле.',              icon: Camera,          color: 'indigo',  path: '/workspace/photosession',    cost: 10, opKey: 'photosession',         cat: 'media',      eta: '~2 мин' },
    { id: 'transcription',   title: 'Транскрибация видео',  description: 'Конвертация видео и лекций в структурированный текст.',           icon: FileAudio,       color: 'danger',  path: '/workspace/transcription',   cost: 15, opKey: 'transcription',        cat: 'media',      eta: '~3 мин' },
    { id: 'video-analysis',  title: 'Анализ видео',         description: 'Ключевые моменты видеоурока и рекомендации.',                     icon: Video,           color: 'indigo',  path: '/workspace/video-analysis',  cost: 15, opKey: 'video_analysis',       cat: 'media',      eta: '~3 мин' },

    { id: 'assistant',       title: 'AI-ассистент',         description: 'Умный помощник для мозгового штурма и сложных задач.',            icon: MessageSquare,   color: 'warning', path: '/workspace/assistant',       cost: 3,  opKey: 'message',              cat: 'comms',      eta: 'в реальном времени' },
    { id: 'messages',        title: 'Сообщения родителям',  description: 'Шаблонные тексты для общения с родителями учеников.',             icon: Mail,            color: 'info',    path: '/workspace/messages',        cost: 1,  opKey: 'parent_message',       cat: 'comms',      eta: '~10 сек' },

    { id: 'unpacking',       title: 'Распаковка экспертности', description: 'Структурировать знания в понятный формат.',                    icon: PackageOpen,     color: 'teal',    path: '/workspace/unpacking',       cost: 5,  opKey: 'unpacking',            cat: 'other',      eta: '~1 мин' },
    { id: 'sales-advisor',   title: 'ИИ-продажник',         description: 'Анализ переписок с клиентами и рекомендации по продажам.',        icon: LineChart,       color: 'success', path: '/workspace/sales-advisor',   cost: 10, opKey: 'sales_advisor',        cat: 'other',      eta: '~1 мин' },
]

export default function WorkspaceHubV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const [query, setQuery] = useState('')
    const [activeCat, setActiveCat] = useState<CategoryKey>('all')
    const [maintenance, setMaintenance] = useState<Record<string, boolean>>({})
    const [activeOps, setActiveOps] = useState<Set<string> | null>(null)

    useEffect(() => {
        apiClient.get('/subscriptions/costs').then((res: any) => {
            if (res.data?.success) {
                const maint: Record<string, boolean> = {}
                const active = new Set<string>()
                res.data.costs.forEach((c: any) => {
                    maint[c.operationType] = c.isUnderMaintenance || false
                    active.add(c.operationType)
                })
                setMaintenance(maint)
                setActiveOps(active)
            }
        }).catch(() => {})
    }, [])

    const visibleTools = useMemo(() => {
        const q = query.toLowerCase().trim()
        return TOOLS.filter(t => {
            if (activeOps && !activeOps.has(t.opKey)) return false
            if (activeCat !== 'all' && t.cat !== activeCat) return false
            if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
            return true
        })
    }, [query, activeCat, activeOps])

    const countByCat = useMemo(() => {
        const counts: Record<CategoryKey, number> = { all: 0, materials: 0, assessment: 0, media: 0, comms: 0, other: 0 }
        TOOLS.forEach(t => {
            if (activeOps && !activeOps.has(t.opKey)) return
            counts.all += 1
            counts[t.cat] += 1
        })
        return counts
    }, [activeOps])

    return (
        <>
            <Topbar
                title="ИИ Генератор"
                subtitle={`${countByCat.all} ${pluralizeRu(countByCat.all, 'инструмент', 'инструмента', 'инструментов')} для подготовки урока за минуты`}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={(
                    <Button variant="ghost" size="sm" leftIcon={<Compass className="w-4 h-4" />}>Тур</Button>
                )}
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Hero — Вау-урок */}
                <Card
                    interactive
                    onClick={() => router.push('/workspace/lesson-prep')}
                    className="mb-6 p-7 cursor-pointer hover:border-brand-300 transition-colors"
                    style={{ background: 'linear-gradient(135deg, #FFF4F0 0%, #FFFFFF 70%)', borderColor: 'var(--brand-200)' }}
                >
                    <div className="flex gap-6 items-center max-md:flex-col max-md:items-start">
                        <span className="w-16 h-16 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}>
                            <Zap className="w-7 h-7" />
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-100 text-brand-700 rounded-full text-[11px] font-bold uppercase tracking-wide mb-2">
                                <Sparkles className="w-3 h-3" />
                                Главный инструмент
                            </div>
                            <h2 className="font-display font-bold text-[22px] text-ink-900 leading-tight">Вау-урок</h2>
                            <p className="text-[14px] text-ink-600 mt-1 max-w-[560px]">
                                Один запрос — комплект «под ключ»: план урока, рабочий лист, тест и адаптация под интересы ученика. Готово за минуту.
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            size="lg"
                            leftIcon={<Wand2 className="w-4 h-4" />}
                            className="flex-shrink-0 max-md:w-full"
                            onClick={(e) => { e.stopPropagation(); router.push('/workspace/lesson-prep') }}
                        >
                            Создать вау-урок
                        </Button>
                    </div>
                </Card>

                {/* Search + filters row */}
                <div className="mb-5 flex items-center gap-3 flex-wrap">
                    <SearchBar
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Найти инструмент…"
                        className="w-full sm:w-[320px]"
                    />
                </div>

                {/* Category tabs */}
                <div className="mb-6 pb-4 border-b border-ink-200 flex gap-1.5 flex-wrap">
                    {CATEGORIES.map(c => {
                        const Icon = c.icon
                        const isActive = activeCat === c.key
                        return (
                            <button
                                key={c.key}
                                type="button"
                                onClick={() => setActiveCat(c.key)}
                                className={cn(
                                    'h-9 px-3.5 rounded-full font-semibold text-[13px] inline-flex items-center gap-1.5 transition-colors border',
                                    isActive
                                        ? 'bg-ink-900 text-white border-ink-900'
                                        : 'bg-transparent text-ink-600 border-ink-200 hover:bg-ink-100 hover:text-ink-900',
                                )}
                            >
                                {Icon && <Icon className="w-3.5 h-3.5" />}
                                {c.label}
                                <span className={cn(
                                    'rounded-full px-1.5 py-px text-[11px]',
                                    isActive ? 'bg-white/15' : 'bg-ink-100',
                                )}>
                                    {countByCat[c.key]}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Tools grid */}
                {visibleTools.length === 0 ? (
                    <div className="text-center py-16 text-ink-500">
                        Не нашли инструмент по запросу «{query}»
                    </div>
                ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                        {visibleTools.map(t => (
                            <ToolCard key={t.id} tool={t} maintenance={!!maintenance[t.opKey]} onClick={() => router.push(t.path)} />
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}

function ToolCard({ tool, maintenance, onClick }: { tool: ToolDef; maintenance: boolean; onClick: () => void }) {
    const Icon = tool.icon
    return (
        <Card
            interactive={!maintenance}
            padding="md"
            onClick={maintenance ? undefined : onClick}
            className={cn(
                'flex flex-col gap-3 relative h-full transition-all',
                maintenance ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-brand-300 hover:-translate-y-0.5',
            )}
        >
            {maintenance && (
                <Badge variant="warning" className="absolute top-3 right-3" icon={<Wrench className="w-3 h-3" />}>
                    тех. работы
                </Badge>
            )}
            <IconTile color={tool.color} size="md"><Icon className="w-[18px] h-[18px]" /></IconTile>
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[14px] text-ink-900 leading-snug pr-6">{tool.title}</h3>
                <p className="text-[12px] text-ink-500 leading-relaxed mt-1 line-clamp-2">{tool.description}</p>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-ink-100 text-[12px]">
                <span className="text-ink-500">{tool.eta}</span>
            </div>
        </Card>
    )
}

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
