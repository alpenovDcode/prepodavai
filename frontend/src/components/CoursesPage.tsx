'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

interface Generation {
    id: string
    generationType: string
    status: string
    createdAt: string
}

interface Lesson {
    id: string
    title: string
    topic: string
    grade?: string
    duration?: number
    generations: Generation[]
    createdAt: string
    tags?: string[]
}

interface TagStat {
    tag: string
    count: number
}

export default function CoursesPage() {
    const [lessons, setLessons] = useState<Lesson[]>([])
    const [tags, setTags] = useState<TagStat[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [activeTag, setActiveTag] = useState<string | null>(null)
    const router = useRouter()

    // Debounce ввода поиска
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 250)
        return () => clearTimeout(t)
    }, [searchInput])

    useEffect(() => {
        const controller = new AbortController()
        const fetchLessons = async () => {
            setLoading(true)
            try {
                const params: Record<string, string> = {}
                if (search) params.search = search
                if (activeTag) params.tag = activeTag
                const response = await apiClient.get('/lessons', {
                    params,
                    signal: controller.signal,
                })
                const sortedLessons = response.data.sort((a: Lesson, b: Lesson) => {
                    if (a.title === 'ИИ генерации') return -1
                    if (b.title === 'ИИ генерации') return 1
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                })
                setLessons(sortedLessons)
            } catch (error: any) {
                // Отменённый запрос (устаревший фильтр) — не считаем ошибкой
                if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return
                console.error('Failed to fetch lessons:', error)
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchLessons()
        return () => controller.abort()
    }, [search, activeTag])

    // Перечитываем полный список тегов при изменении набора тегов в уроках
    // (используем сериализованное представление, а не просто length — чтобы
    // добавление/удаление тега к существующему уроку тоже триггерило refetch)
    const tagsSignature = useMemo(
        () => lessons.map(l => `${l.id}:${(l.tags || []).join(',')}`).join('|'),
        [lessons],
    )
    useEffect(() => {
        const controller = new AbortController()
        apiClient.get('/lessons/tags/all', { signal: controller.signal })
            .then(r => setTags(r.data || []))
            .catch(e => {
                if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
                console.error('Failed to load tags', e)
            })
        return () => controller.abort()
    }, [tagsSignature])

    const getIconForLesson = (lesson: Lesson) => {
        if (lesson.title === 'ИИ генерации') return 'fas fa-wand-magic-sparkles'
        return 'fas fa-book'
    }

    const getIconColor = (index: number, lesson: Lesson) => {
        if (lesson.title === 'ИИ генерации') {
            return { bg: 'bg-indigo-100', text: 'text-indigo-600', progress: 'bg-indigo-600' }
        }
        const colors = [
            { bg: 'bg-purple-100', text: 'text-course-purple', progress: 'bg-course-purple' },
            { bg: 'bg-orange-100', text: 'text-course-orange', progress: 'bg-course-orange' },
            { bg: 'bg-blue-100', text: 'text-course-blue', progress: 'bg-course-blue' },
            { bg: 'bg-pink-100', text: 'text-course-pink', progress: 'bg-red-500' },
            { bg: 'bg-green-100', text: 'text-course-green', progress: 'bg-course-green' },
        ]
        return colors[index % colors.length]
    }

    // Верхние N тегов для чипов + развёртываемый список остальных
    const { topTags, hasMore } = useMemo(() => {
        const top = tags.slice(0, 10)
        return { topTags: top, hasMore: tags.length > 10 }
    }, [tags])
    const [showAllTags, setShowAllTags] = useState(false)
    const visibleTags = showAllTags ? tags : topTags

    const totalGenerations = lessons.reduce((sum, l) => sum + l.generations.length, 0)
    const completedGenerations = lessons.reduce(
        (sum, l) => sum + l.generations.filter(g => g.status === 'completed').length, 0
    )

    const hasFilter = search || activeTag

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Библиотека материалов</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-gray-600">Все ваши уроки с тегами, поиском и фильтрами.</p>
                        {!loading && lessons.length > 0 && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span className="text-gray-300">·</span>
                                <span><span className="font-semibold text-gray-700">{lessons.length}</span> уроков</span>
                                <span className="text-gray-300">·</span>
                                <span><span className="font-semibold text-gray-700">{completedGenerations}</span> из {totalGenerations} готово</span>
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => router.push('/dashboard')}
                    className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 shadow-lg hover:shadow-xl"
                >
                    <i className="fas fa-plus-circle"></i>
                    Создать новый
                </button>
            </div>

            {/* Search + Filters */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 space-y-3">
                <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Поиск по названию или теме урока..."
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
                    />
                    {searchInput && (
                        <button
                            onClick={() => setSearchInput('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                            title="Очистить"
                        >
                            <i className="fas fa-times-circle"></i>
                        </button>
                    )}
                </div>

                {tags.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-1.5 shrink-0">
                            Теги:
                        </span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                            {activeTag && (
                                <button
                                    onClick={() => setActiveTag(null)}
                                    className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition flex items-center gap-1"
                                >
                                    <i className="fas fa-times text-[10px]"></i>
                                    Сбросить
                                </button>
                            )}
                            {visibleTags.map((t) => (
                                <button
                                    key={t.tag}
                                    onClick={() => setActiveTag(activeTag === t.tag ? null : t.tag)}
                                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition ${
                                        activeTag === t.tag
                                            ? 'bg-primary-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                    {t.tag}
                                    <span className={`ml-1 text-[10px] ${activeTag === t.tag ? 'opacity-80' : 'text-gray-400'}`}>
                                        {t.count}
                                    </span>
                                </button>
                            ))}
                            {hasMore && (
                                <button
                                    onClick={() => setShowAllTags(v => !v)}
                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-2 py-1"
                                >
                                    {showAllTags ? 'Свернуть' : `+${tags.length - topTags.length} ещё`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Lessons Grid */}
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
            ) : lessons.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-folder-open text-gray-400 text-2xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {hasFilter ? 'Ничего не найдено' : 'Нет материалов'}
                    </h3>
                    <p className="text-gray-500 mb-6">
                        {hasFilter
                            ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.'
                            : 'Вы ещё не создали ни одного урока.'}
                    </p>
                    {hasFilter ? (
                        <button
                            onClick={() => { setSearchInput(''); setActiveTag(null) }}
                            className="text-primary-600 font-medium hover:text-primary-700"
                        >
                            Сбросить фильтры &larr;
                        </button>
                    ) : (
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="text-primary-600 font-medium hover:text-primary-700"
                        >
                            Создать первый урок &rarr;
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {lessons.map((lesson, index) => {
                        const style = getIconColor(index, lesson)
                        const lessonCompletedGens = lesson.generations.filter(g => g.status === 'completed').length
                        const lessonTotalGens = lesson.generations.length
                        const progress = lessonTotalGens > 0 ? Math.round((lessonCompletedGens / lessonTotalGens) * 100) : 0
                        const isPinned = lesson.title === 'ИИ генерации'
                        const lessonTags = lesson.tags || []

                        return (
                            <div
                                key={lesson.id}
                                className={`dashboard-card cursor-pointer group relative ${isPinned ? 'ring-2 ring-indigo-100' : ''}`}
                                onClick={() => {
                                    router.push(`/dashboard/courses/${lesson.id}`)
                                }}
                            >
                                {isPinned && (
                                    <div className="absolute top-4 right-4 text-indigo-400">
                                        <i className="fas fa-thumbtack transform rotate-45"></i>
                                    </div>
                                )}
                                {/* Icon */}
                                <div className={`icon-circle ${style.bg} mb-4`}>
                                    <i className={`${getIconForLesson(lesson)} ${style.text}`}></i>
                                </div>

                                {/* Title & Description */}
                                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-primary-600 transition line-clamp-1">
                                    {lesson.title}
                                </h3>
                                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                                    {lesson.topic} {lesson.grade ? `• ${lesson.grade} класс` : ''}
                                </p>

                                {/* Tags */}
                                {lessonTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {lessonTags.slice(0, 4).map((t) => (
                                            <span
                                                key={t}
                                                className="text-[10px] font-medium text-primary-700 bg-primary-50 border border-primary-100 px-1.5 py-0.5 rounded"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setActiveTag(t)
                                                }}
                                            >
                                                #{t}
                                            </span>
                                        ))}
                                        {lessonTags.length > 4 && (
                                            <span className="text-[10px] text-gray-400 px-1">+{lessonTags.length - 4}</span>
                                        )}
                                    </div>
                                )}

                                {/* Progress */}
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600">Готовность материалов</span>
                                        <span className="font-semibold" style={{ color: style.text.replace('text-', '') }}>
                                            {progress}%
                                        </span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill ${style.progress}`}
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        {new Date(lesson.createdAt).toLocaleDateString('ru-RU')}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
