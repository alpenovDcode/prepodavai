'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import AssignMaterialModal from './AssignMaterialModal'
import { useRouter } from 'next/navigation'
import { getGenerationTypeLabel, getGenerationTypeIcon } from '@/lib/utils/translations'

function getImageUrl(result: any): string | null {
    if (!result) return null
    if (typeof result === 'string' && (result.startsWith('http') || result.startsWith('data:image'))) return result
    if (result?.imageUrl) return result.imageUrl
    if (result?.imageUrls?.[0]) return result.imageUrls[0]
    if (typeof result?.content === 'string' && (result.content.startsWith('http') || result.content.startsWith('data:image'))) return result.content
    if (result?.content?.imageUrl) return result.content.imageUrl
    return null
}

/** Извлекает читаемый HTML из outputData любого формата (аналог extractHtmlFromOutput) */
function extractHtml(outputData: any): string | null {
    if (!outputData) return null
    let raw: string
    if (typeof outputData === 'string') {
        raw = outputData
    } else if (typeof outputData === 'object') {
        raw = outputData.content || outputData.htmlResult || outputData.html || outputData.text || ''
        if (typeof raw !== 'string') return null
    } else {
        return null
    }
    raw = raw.trim()
    if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
    }
    return raw || null
}

async function downloadGeneration(generation: Generation, typeLabel: string) {
    const outputData = generation.outputData as any
    if (!outputData) return

    // Audio
    const audioUrl = outputData?.audioUrl || outputData?.content?.audioUrl
    if (audioUrl) {
        const a = document.createElement('a')
        a.href = audioUrl
        a.download = `audio-${generation.id}.mp3`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        return
    }

    // Image
    const imageUrl = getImageUrl(outputData)
    if (imageUrl) {
        try {
            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl; a.download = `image-${generation.id}.png`
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            window.URL.revokeObjectURL(blobUrl)
        } catch {
            const a = document.createElement('a')
            a.href = imageUrl; a.download = `image-${generation.id}.png`; a.target = '_blank'
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }
        return
    }

    // HTML — открываем в новом окне и вызываем печать (сохранение в PDF)
    const content = extractHtml(outputData)
    if (content) {
        const safeName = typeLabel.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const hasHead = /<\/head>/i.test(content)
        const html = hasHead
            ? content.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeName}</title>${autoPrint}</head><body>${content}</body></html>`
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    }
}

interface Generation {
    id: string
    generationType: string
    status: string
    createdAt: string
    outputData?: any
    inputParams?: any
}

function getGenerationSubtitle(g: Generation): string {
    const p = g.inputParams || {}
    const raw =
        p.topic ||
        p.themeName ||
        p.subject ||
        p.title ||
        p.prompt ||
        p.userPrompt ||
        p.text ||
        p.inputText ||
        p.description ||
        ''
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!s) return ''
    return s.length > 80 ? s.slice(0, 80) + '…' : s
}

interface Lesson {
    id: string
    title: string
    topic: string
    grade?: string
    duration?: number
    generations: Generation[]
    createdAt: string
    // M3: расписание
    scheduledAt?: string | null
    durationMinutes?: number | null
    classId?: string | null
    notes?: string | null
    class?: { id: string; name: string } | null
    // M4: теги
    tags?: string[]
}

interface Class {
    id: string
    name: string
}

interface Student {
    id: string
    name: string
    class: { name: string }
}

// Преобразует Date/ISO в формат для <input type="datetime-local"> (YYYY-MM-DDTHH:mm в локальной зоне)
function toDatetimeLocal(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface CourseDetailPageProps {
    id: string
}

export default function CourseDetailPage({ id }: CourseDetailPageProps) {
    const [lesson, setLesson] = useState<Lesson | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    // Assignment Modal State
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [assignGenerationId, setAssignGenerationId] = useState<string | undefined>(undefined)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)

    // M3: schedule editing
    const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
    const [scheduleOpen, setScheduleOpen] = useState(false)
    const [scheduleSaving, setScheduleSaving] = useState(false)
    const [scheduledAtInput, setScheduledAtInput] = useState('')
    const [durationMinutesInput, setDurationMinutesInput] = useState<number | ''>('')
    const [classIdInput, setClassIdInput] = useState('')
    const [notesInput, setNotesInput] = useState('')

    // M4: tags editing
    const [tagInput, setTagInput] = useState('')
    const [tagsSaving, setTagsSaving] = useState(false)
    const [autoTagsLoading, setAutoTagsLoading] = useState(false)
    const [autoTagsSuggested, setAutoTagsSuggested] = useState<string[] | null>(null)

    useEffect(() => {
        const fetchLesson = async () => {
            try {
                const response = await apiClient.get(`/lessons/${id}`)
                setLesson(response.data)
                setScheduledAtInput(toDatetimeLocal(response.data?.scheduledAt))
                setDurationMinutesInput(response.data?.durationMinutes ?? '')
                setClassIdInput(response.data?.classId ?? '')
                setNotesInput(response.data?.notes ?? '')
            } catch (error) {
                console.error('Failed to fetch lesson:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchLesson()
    }, [id])

    // Подгружаем классы при первом открытии панели расписания
    useEffect(() => {
        if (!scheduleOpen || classes.length > 0) return
        apiClient.get('/classes')
            .then(r => setClasses(r.data || []))
            .catch(e => console.error('Failed to load classes', e))
    }, [scheduleOpen, classes.length])

    const saveSchedule = async () => {
        // Валидация перед отправкой
        let scheduledAtIso: string | null = null
        if (scheduledAtInput) {
            const d = new Date(scheduledAtInput)
            if (isNaN(d.getTime())) {
                alert('Введите корректную дату и время')
                return
            }
            scheduledAtIso = d.toISOString()
        }
        let durationMinutesValue: number | null = null
        if (durationMinutesInput !== '') {
            const m = Number(durationMinutesInput)
            if (!Number.isInteger(m) || m < 5 || m > 480) {
                alert('Длительность должна быть от 5 до 480 минут')
                return
            }
            durationMinutesValue = m
        }

        setScheduleSaving(true)
        try {
            const body = {
                scheduledAt: scheduledAtIso,
                durationMinutes: durationMinutesValue,
                classId: classIdInput || null,
                notes: notesInput || null,
            }
            const res = await apiClient.patch(`/lessons/${id}/schedule`, body)
            setLesson(prev => prev ? { ...prev, ...res.data } : prev)
            setScheduleOpen(false)
        } catch (error: any) {
            console.error('Failed to save schedule', error)
            alert(error?.response?.data?.message || 'Не удалось сохранить расписание')
        } finally {
            setScheduleSaving(false)
        }
    }

    const saveTags = async (newTags: string[]) => {
        setTagsSaving(true)
        try {
            const res = await apiClient.patch<{ id: string; tags: string[] }>(`/lessons/${id}/tags`, {
                tags: newTags,
            })
            setLesson(prev => prev ? { ...prev, tags: res.data.tags } : prev)
        } catch (error: any) {
            console.error('Failed to save tags', error)
            alert(error?.response?.data?.message || 'Не удалось сохранить теги')
        } finally {
            setTagsSaving(false)
        }
    }

    const addTag = async (raw: string) => {
        const t = raw.trim().toLowerCase().slice(0, 40)
        if (!t) return
        const current = lesson?.tags || []
        if (current.includes(t)) {
            setTagInput('')
            return
        }
        if (current.length >= 20) {
            alert('Максимум 20 тегов на урок')
            return
        }
        await saveTags([...current, t])
        setTagInput('')
    }

    const removeTag = async (tag: string) => {
        const current = lesson?.tags || []
        await saveTags(current.filter(t => t !== tag))
    }

    const requestAutoTags = async () => {
        setAutoTagsLoading(true)
        setAutoTagsSuggested(null)
        try {
            const res = await apiClient.post<{ suggested: string[] }>(`/lessons/${id}/auto-tags`)
            const existing = new Set(lesson?.tags || [])
            const fresh = (res.data.suggested || []).filter(t => !existing.has(t))
            setAutoTagsSuggested(fresh)
        } catch (error: any) {
            console.error('Failed to get auto tags', error)
            alert(error?.response?.data?.message || 'Не удалось получить предложения')
        } finally {
            setAutoTagsLoading(false)
        }
    }

    const applySuggestedTag = async (tag: string) => {
        await addTag(tag)
        setAutoTagsSuggested(prev => prev?.filter(t => t !== tag) ?? null)
    }

    const applyAllSuggestedTags = async () => {
        const suggested = autoTagsSuggested || []
        const current = lesson?.tags || []
        const merged: string[] = [...current]
        for (const s of suggested) {
            if (merged.length >= 20) break
            if (!merged.includes(s)) merged.push(s)
        }
        await saveTags(merged)
        setAutoTagsSuggested(null)
    }

    const clearSchedule = async () => {
        if (!confirm('Убрать урок из расписания?')) return
        setScheduleSaving(true)
        try {
            const res = await apiClient.patch(`/lessons/${id}/schedule`, { scheduledAt: null })
            setLesson(prev => prev ? { ...prev, ...res.data, scheduledAt: null } : prev)
            setScheduledAtInput('')
        } catch (error) {
            console.error('Failed to clear schedule', error)
        } finally {
            setScheduleSaving(false)
        }
    }

    const handleAssignClick = () => {
        setAssignGenerationId(undefined)
        setShowAssignModal(true)
    }

    const handleAssignGeneration = (e: React.MouseEvent, generationId: string) => {
        e.stopPropagation()
        setAssignGenerationId(generationId)
        setShowAssignModal(true)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!lesson) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-black-900">Урок не найден</h3>
                <button
                    onClick={() => router.back()}
                    className="text-primary-600 font-medium hover:text-primary-700 mt-4"
                >
                    &larr; Вернуться назад
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.back()}
                    className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-2"
                >
                    <i className="fas fa-arrow-left"></i>
                    Назад к списку
                </button>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{lesson.title}</h1>
                        <div className="flex items-center gap-4 text-gray-600">
                            {lesson.grade && (
                                <span className="flex items-center gap-1">
                                    <i className="fas fa-graduation-cap"></i>
                                    {lesson.grade} класс
                                </span>
                            )}
                            {lesson.duration && (
                                <span className="flex items-center gap-1">
                                    <i className="fas fa-clock"></i>
                                    {lesson.duration} мин
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <i className="fas fa-calendar"></i>
                                {new Date(lesson.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleAssignClick}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition flex items-center gap-2 shadow-md"
                        >
                            <i className="fas fa-paper-plane"></i>
                            Выдать ученикам
                        </button>
                        <button
                            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            onClick={async () => {
                                if (confirm('Вы уверены, что хотите удалить этот урок?')) {
                                    try {
                                        await apiClient.delete(`/lessons/${lesson.id}`)
                                        router.push('/dashboard/courses')
                                    } catch (error) {
                                        console.error('Failed to delete lesson:', error)
                                    }
                                }
                            }}
                        >
                            <i className="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tags widget (M4) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <i className="fas fa-tags text-primary-600"></i>
                        Теги
                        {(lesson.tags?.length || 0) > 0 && (
                            <span className="text-xs font-medium text-gray-400">({lesson.tags!.length}/20)</span>
                        )}
                    </h2>
                    <button
                        onClick={requestAutoTags}
                        disabled={autoTagsLoading || tagsSaving}
                        className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        title="ИИ проанализирует материалы и предложит теги"
                    >
                        {autoTagsLoading
                            ? <><i className="fas fa-spinner fa-spin text-xs"></i> Подбираем...</>
                            : <><i className="fas fa-wand-magic-sparkles text-xs"></i> Предложить теги ИИ</>}
                    </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                    {(lesson.tags || []).map(t => (
                        <span
                            key={t}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100 px-2 py-1 rounded-md"
                        >
                            #{t}
                            <button
                                onClick={() => removeTag(t)}
                                disabled={tagsSaving}
                                className="text-primary-400 hover:text-red-500 transition disabled:opacity-50"
                                title="Убрать тег"
                            >
                                <i className="fas fa-times text-[10px]"></i>
                            </button>
                        </span>
                    ))}
                    {(lesson.tags?.length || 0) === 0 && !autoTagsSuggested && (
                        <span className="text-xs text-gray-400 italic">
                            Тегов пока нет — добавьте свои или попросите ИИ.
                        </span>
                    )}
                </div>

                {/* Add tag input */}
                {(lesson.tags?.length || 0) < 20 && (
                    <form
                        onSubmit={(e) => { e.preventDefault(); addTag(tagInput) }}
                        className="flex gap-2"
                    >
                        <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            placeholder="Добавить тег (Enter)"
                            maxLength={40}
                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition"
                        />
                        <button
                            type="submit"
                            disabled={!tagInput.trim() || tagsSaving}
                            className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                        >
                            Добавить
                        </button>
                    </form>
                )}

                {/* AI-suggested tags */}
                {autoTagsSuggested && autoTagsSuggested.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                            <p className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                                <i className="fas fa-wand-magic-sparkles"></i>
                                ИИ предлагает
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={applyAllSuggestedTags}
                                    disabled={tagsSaving}
                                    className="text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                                >
                                    Добавить все
                                </button>
                                <button
                                    onClick={() => setAutoTagsSuggested(null)}
                                    className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2"
                                >
                                    Скрыть
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {autoTagsSuggested.map(t => (
                                <button
                                    key={t}
                                    onClick={() => applySuggestedTag(t)}
                                    disabled={tagsSaving}
                                    className="text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-md transition flex items-center gap-1 disabled:opacity-50"
                                    title="Добавить тег"
                                >
                                    <i className="fas fa-plus text-[10px]"></i>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {autoTagsSuggested && autoTagsSuggested.length === 0 && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-500">
                        ИИ не смог предложить новых тегов — возможно, уже все покрыты.
                    </div>
                )}
            </div>

            {/* Schedule widget */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
                            <i className="fas fa-calendar-check text-primary-600"></i>
                            Расписание урока
                        </h2>
                        {lesson.scheduledAt ? (
                            <p className="text-sm text-gray-700">
                                <span className="font-semibold">
                                    {new Date(lesson.scheduledAt).toLocaleString('ru-RU', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'long',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </span>
                                {lesson.durationMinutes ? <span className="text-gray-500"> · {lesson.durationMinutes} мин</span> : null}
                                {lesson.class?.name ? <span className="text-gray-500"> · {lesson.class.name}</span> : null}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500">Урок ещё не запланирован. Поставьте дату — появится в календаре.</p>
                        )}
                        {lesson.notes && !scheduleOpen && (
                            <p className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 max-w-2xl">
                                <span className="font-semibold">Заметки: </span>{lesson.notes}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {lesson.scheduledAt && !scheduleOpen && (
                            <button
                                onClick={clearSchedule}
                                disabled={scheduleSaving}
                                className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                            >
                                Снять с расписания
                            </button>
                        )}
                        <button
                            onClick={() => setScheduleOpen(v => !v)}
                            className="px-4 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
                        >
                            <i className={`fas ${scheduleOpen ? 'fa-times' : 'fa-calendar-plus'}`}></i>
                            {scheduleOpen ? 'Отмена' : lesson.scheduledAt ? 'Изменить' : 'Запланировать'}
                        </button>
                    </div>
                </div>

                {scheduleOpen && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Дата и время</label>
                            <input
                                type="datetime-local"
                                value={scheduledAtInput}
                                onChange={e => setScheduledAtInput(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Длительность (мин)</label>
                            <input
                                type="number"
                                min={5}
                                max={480}
                                value={durationMinutesInput}
                                onChange={e => setDurationMinutesInput(e.target.value === '' ? '' : Number(e.target.value))}
                                placeholder="45"
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Класс</label>
                            <select
                                value={classIdInput}
                                onChange={e => setClassIdInput(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900"
                            >
                                <option value="">Не привязан</option>
                                {classes.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Заметки к уроку</label>
                            <textarea
                                value={notesInput}
                                onChange={e => setNotesInput(e.target.value)}
                                rows={2}
                                placeholder="Что обсудить, на что обратить внимание..."
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 resize-none"
                            />
                        </div>
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <button
                                onClick={() => setScheduleOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={saveSchedule}
                                disabled={scheduleSaving}
                                className="px-5 py-2 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                            >
                                {scheduleSaving ? 'Сохранение...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Generations List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-black-900">Материалы урока</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    {lesson.generations.map((generation) => (
                        <div
                            key={generation.id}
                            className="p-6 hover:bg-gray-50 transition cursor-pointer"
                            onClick={() => {
                                if (generation.status === 'completed') {
                                    router.push(`/dashboard/courses/${lesson.id}/materials/${generation.id}`)
                                }
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${generation.status === 'completed' ? 'bg-green-100 text-green-600' :
                                        generation.status === 'failed' ? 'bg-red-100 text-red-600' :
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                        {generation.status === 'completed' && (generation.generationType === 'photosession' || generation.generationType === 'image' || generation.generationType === 'image_generation') ? (
                                            <img 
                                                src={generation.outputData?.imageUrl || generation.outputData?.imageUrls?.[0]}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <i className={`fas ${getGenerationTypeIcon(generation.generationType)}`}></i>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-medium text-gray-900 hover:text-primary-600 transition">
                                            {getGenerationTypeLabel(generation.generationType)}
                                        </h4>
                                        {getGenerationSubtitle(generation) && (
                                            <p className="text-sm text-gray-700 truncate" title={getGenerationSubtitle(generation)}>
                                                {getGenerationSubtitle(generation)}
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-400">
                                            {new Date(generation.createdAt).toLocaleString('ru-RU')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {generation.status === 'completed' ? (
                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                            Готово
                                        </span>
                                    ) : generation.status === 'failed' ? (
                                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                                            Ошибка
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium flex items-center gap-2">
                                            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
                                            В процессе
                                        </span>
                                    )}

                                    {generation.status === 'completed' && (
                                        <>
                                            <button
                                                className="p-2 text-gray-400 hover:text-primary-600 transition"
                                                title="Просмотреть"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    router.push(`/dashboard/courses/${lesson.id}/materials/${generation.id}`)
                                                }}
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                            <button
                                                className="p-2 text-gray-400 hover:text-blue-600 transition disabled:opacity-40"
                                                title="Скачать"
                                                disabled={downloadingId === generation.id}
                                                onClick={async (e) => {
                                                    e.stopPropagation()
                                                    setDownloadingId(generation.id)
                                                    try {
                                                        await downloadGeneration(generation, getGenerationTypeLabel(generation.generationType))
                                                    } finally {
                                                        setDownloadingId(null)
                                                    }
                                                }}
                                            >
                                                <i className={`fas ${downloadingId === generation.id ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                                            </button>
                                            <button
                                                className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 hover:bg-primary-50 rounded-lg transition flex items-center gap-1.5"
                                                title="Выдать этот материал ученику или классу"
                                                onClick={(e) => handleAssignGeneration(e, generation.id)}
                                            >
                                                <i className="fas fa-paper-plane text-xs"></i>
                                                Выдать
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {lesson.generations.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            Нет сгенерированных материалов для этого урока.
                        </div>
                    )}
                </div>
            </div>

            {/* Assign Modal */}
            {lesson && (
                <AssignMaterialModal
                    isOpen={showAssignModal}
                    onClose={() => { setShowAssignModal(false); setAssignGenerationId(undefined) }}
                    lessonId={lesson.id}
                    generationId={assignGenerationId}
                />
            )}
        </div>
    )
}
