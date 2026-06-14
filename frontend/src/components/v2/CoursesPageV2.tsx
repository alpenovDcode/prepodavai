'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, BookOpen, FileText, HelpCircle, Presentation, ImageIcon, Wand2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { SearchBar } from '@/components/ui/v2/SearchBar'
import { IconTile } from '@/components/ui/v2/IconTile'
import { cn } from '@/lib/utils/cn'

interface Lesson {
    id: string
    title: string
    topic: string
    grade?: string
    duration?: number
    generations: { id: string; generationType: string; status: string; createdAt: string }[]
    createdAt: string
    tags?: string[]
}

export default function CoursesPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const [lessons, setLessons] = useState<Lesson[]>([])
    const [query, setQuery] = useState('')
    const [activeTag, setActiveTag] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const ctl = new AbortController()
        apiClient.get('/lessons', { signal: ctl.signal })
            .then((res: any) => {
                const sorted = (res.data || []).sort((a: Lesson, b: Lesson) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                setLessons(sorted)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
        return () => ctl.abort()
    }, [])

    const tags = useMemo(() => {
        const counts = new Map<string, number>()
        lessons.forEach(l => (l.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
    }, [lessons])

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim()
        return lessons.filter(l => {
            if (activeTag && !l.tags?.includes(activeTag)) return false
            if (!q) return true
            return l.title.toLowerCase().includes(q) || l.topic.toLowerCase().includes(q)
        })
    }, [lessons, query, activeTag])

    return (
        <>
            <Topbar
                title="Материалы"
                subtitle={`${lessons.length} ${pluralizeRu(lessons.length, 'урок', 'урока', 'уроков')} в библиотеке`}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/workspace')}>
                        Новый материал
                    </Button>
                }
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* Search + tags */}
                <div className="mb-5 flex flex-col gap-3">
                    <SearchBar
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Найти урок по названию или теме…"
                        className="w-full sm:w-[420px]"
                    />
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setActiveTag(null)}
                                className={cn(
                                    'h-7 px-3 rounded-full text-[12px] font-semibold border transition-colors',
                                    activeTag === null
                                        ? 'bg-ink-900 text-white border-ink-900'
                                        : 'bg-transparent text-ink-600 border-ink-200 hover:bg-ink-100',
                                )}
                            >
                                Все
                            </button>
                            {tags.map(([tag, count]) => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setActiveTag(t => t === tag ? null : tag)}
                                    className={cn(
                                        'h-7 px-3 rounded-full text-[12px] font-semibold border transition-colors',
                                        activeTag === tag
                                            ? 'bg-ink-900 text-white border-ink-900'
                                            : 'bg-transparent text-ink-600 border-ink-200 hover:bg-ink-100',
                                    )}
                                >
                                    #{tag} · {count}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="text-center py-16 text-ink-500">Загрузка…</div>
                ) : filtered.length === 0 ? (
                    <Card padding="lg" className="text-center">
                        <BookOpen className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                        <h3 className="font-display font-bold text-ink-900 mb-1">
                            {lessons.length === 0 ? 'Здесь будут ваши материалы' : 'Ничего не найдено'}
                        </h3>
                        <p className="text-[13px] text-ink-500 mb-4">
                            {lessons.length === 0
                                ? 'Создайте первый урок в ИИ-Генераторе.'
                                : 'Попробуйте сбросить фильтры.'}
                        </p>
                        <Button variant="primary" leftIcon={<Wand2 className="w-4 h-4" />} onClick={() => router.push('/workspace')}>
                            К инструментам
                        </Button>
                    </Card>
                ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                        {filtered.map(lesson => <LessonCard key={lesson.id} lesson={lesson} onClick={() => router.push(`/dashboard/courses/${lesson.id}`)} />)}
                    </div>
                )}
            </div>
        </>
    )
}

function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
    const genCounts = lesson.generations.reduce<Record<string, number>>((acc, g) => {
        acc[g.generationType] = (acc[g.generationType] || 0) + 1
        return acc
    }, {})
    const types = Object.entries(genCounts)
    return (
        <Card interactive padding="md" onClick={onClick} className="flex flex-col gap-3 h-full hover:border-brand-300 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start gap-3">
                <IconTile color="brand" size="md"><BookOpen className="w-[18px] h-[18px]" /></IconTile>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-ink-900 leading-snug line-clamp-2">{lesson.title}</h3>
                    <p className="text-[11px] text-ink-500 mt-0.5 truncate">{lesson.topic}</p>
                </div>
            </div>
            {types.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {types.map(([t, n]) => (
                        <Badge key={t} variant="neutral">
                            {prettyTypeLabel(t)}{n > 1 ? ` · ${n}` : ''}
                        </Badge>
                    ))}
                </div>
            )}
            {lesson.tags && lesson.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                    {lesson.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded">#{t}</span>
                    ))}
                </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-ink-100 text-[11px] text-ink-500">
                <span>{new Date(lesson.createdAt).toLocaleDateString('ru-RU')}</span>
                {lesson.grade && <span>{lesson.grade} класс</span>}
            </div>
        </Card>
    )
}

function prettyTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        worksheet: 'Лист',
        quiz: 'Тест',
        presentation: 'Презентация',
        image: 'Картинка',
        image_generation: 'Картинка',
        lesson_plan: 'План',
        'lesson-plan': 'План',
        vocabulary: 'Словарь',
        content_adaptation: 'Адаптация',
        'content-adaptation': 'Адаптация',
    }
    return labels[type] || type
}

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
