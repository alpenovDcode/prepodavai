'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import {
    Plus, Trash2, Loader2, CheckCircle2, AlertTriangle,
    Sparkles, Link as LinkIcon, X, ExternalLink, Calendar,
    BookOpen, Users, Target, ListChecks, Home, FileText,
    ChevronDown, ChevronUp,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { ensureMathJaxInHtml } from '@/lib/utils/ensureMathJax'

interface DiaryEntry {
    id: string
    date: string
    classId: string | null
    studentId: string | null
    topic: string | null
    goals: string | null
    covered: string | null
    homework: string | null
    notes: string | null
    recordingUrl: string | null
    analysisGenerationId: string | null
    analysisStatus: 'pending' | 'completed' | 'failed' | null
    analysisError: string | null
    /** Какие поля заполнил AI после видеоанализа — для подсветки «✨ из анализа» */
    aiFilledFields?: string[] | null
    class?: { id: string; name: string } | null
    student?: { id: string; name: string } | null
}

interface ClassOption { id: string; name: string }
interface StudentOption { id: string; name: string; class: { id?: string; name: string }; classId?: string }

const YANDEX_RE = /^https?:\/\/(disk\.yandex\.[a-z.]+|yadi\.sk)\//i

export default function TeacherDiaryTab() {
    const [entries, setEntries] = useState<DiaryEntry[]>([])
    const [classes, setClasses] = useState<ClassOption[]>([])
    const [students, setStudents] = useState<StudentOption[]>([])
    const [loading, setLoading] = useState(true)
    const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
    const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
    const [viewerHtml, setViewerHtml] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    const fetchAll = useCallback(async () => {
        try {
            const [diaryRes, classesRes, studentsRes] = await Promise.all([
                apiClient.get<DiaryEntry[]>('/teacher-diary'),
                apiClient.get<ClassOption[]>('/classes'),
                apiClient.get<StudentOption[]>('/students'),
            ])
            setEntries(diaryRes.data)
            setClasses(classesRes.data)
            setStudents(studentsRes.data)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Не удалось загрузить дневник')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAll()
    }, [fetchAll])

    // Авто-создание записи по query ?student=&date=. Триггерится с
    // CTA в модалке прошедшего события календаря. Защита от повтора —
    // ref, чтобы при ре-рендере не дублировать.
    const searchParams = useSearchParams()
    const prefilledRef = useRef(false)
    useEffect(() => {
        if (prefilledRef.current) return
        if (loading) return
        const studentId = searchParams?.get('student')
        const dateIso = searchParams?.get('date')
        if (!studentId && !dateIso) return
        // Если на этот день+ученика запись уже есть — открываем её, а
        // не плодим дубликат.
        if (studentId && dateIso) {
            const target = new Date(dateIso)
            const same = entries.find((e) => {
                if (e.studentId !== studentId) return false
                const d = new Date(e.date)
                return d.getFullYear() === target.getFullYear()
                    && d.getMonth() === target.getMonth()
                    && d.getDate() === target.getDate()
            })
            if (same) {
                prefilledRef.current = true
                setExpandedIds(prev => new Set(prev).add(same.id))
                // Скроллим к записи через минимальный таймаут (после рендера)
                setTimeout(() => {
                    document.getElementById(`diary-entry-${same.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
                // Чистим query чтобы не сработало повторно при навигации
                if (typeof window !== 'undefined') {
                    window.history.replaceState(null, '', window.location.pathname)
                }
                return
            }
        }
        // Иначе — создаём новую с прокинутыми полями.
        prefilledRef.current = true
        ;(async () => {
            try {
                const payload: Record<string, any> = {
                    date: dateIso || new Date().toISOString(),
                }
                if (studentId) {
                    payload.studentId = studentId
                    // Класс ученика тоже подставим, чтобы запись была полная.
                    const stu = students.find((s) => s.id === studentId)
                    const classId = stu?.classId || stu?.class?.id
                    if (classId) payload.classId = classId
                }
                const res = await apiClient.post<DiaryEntry>('/teacher-diary', payload)
                setExpandedIds(prev => new Set(prev).add(res.data.id))
                await fetchAll()
                setTimeout(() => {
                    document.getElementById(`diary-entry-${res.data.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 200)
                if (typeof window !== 'undefined') {
                    window.history.replaceState(null, '', window.location.pathname)
                }
            } catch (e: any) {
                setError(e?.response?.data?.message || 'Не удалось создать запись')
            }
        })()
    }, [loading, searchParams, entries, students, fetchAll])

    // Авто-поллинг, пока есть pending-анализы
    useEffect(() => {
        const hasPending = entries.some(e => e.analysisStatus === 'pending')
        if (!hasPending) return
        const t = setInterval(() => {
            apiClient.get<DiaryEntry[]>('/teacher-diary').then(r => setEntries(r.data)).catch(() => { })
        }, 8000)
        return () => clearInterval(t)
    }, [entries])

    const handleCreate = async () => {
        try {
            const res = await apiClient.post<DiaryEntry>('/teacher-diary', { date: new Date().toISOString() })
            // Новую запись разворачиваем сразу — учитель её будет заполнять
            setExpandedIds(prev => new Set(prev).add(res.data.id))
            await fetchAll()
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Не удалось создать запись')
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Удалить эту запись?')) return
        try {
            await apiClient.delete(`/teacher-diary/${id}`)
            setEntries(prev => prev.filter(e => e.id !== id))
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Не удалось удалить')
        }
    }

    const handleAnalyze = async (entry: DiaryEntry) => {
        if (!entry.recordingUrl || !YANDEX_RE.test(entry.recordingUrl)) {
            setError('Сначала вставь ссылку с Яндекс.Диска')
            return
        }
        setAnalyzingIds(prev => new Set(prev).add(entry.id))
        try {
            await apiClient.post(`/teacher-diary/${entry.id}/analyze`)
            await fetchAll()
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Не удалось запустить анализ')
        } finally {
            setAnalyzingIds(prev => {
                const next = new Set(prev)
                next.delete(entry.id)
                return next
            })
        }
    }

    const handleOpenResult = async (entry: DiaryEntry) => {
        if (!entry.analysisGenerationId) return
        try {
            const res = await apiClient.get(`/generate/${entry.analysisGenerationId}`)
            const r = res.data as any
            const html = r?.result?.htmlResult || r?.result?.html || r?.result?.content || ''
            setViewerHtml(typeof html === 'string' && html.trim()
                ? html
                : '<div style="padding:40px;font-family:sans-serif;color:#666;">Результат пуст — анализ ещё формируется или не вернул HTML.</div>')
        } catch (e: any) {
            setError('Не удалось загрузить результат')
        }
    }

    const AI_FILLABLE: ReadonlyArray<keyof DiaryEntry> = ['topic', 'goals', 'covered', 'homework', 'notes']

    const updateField = useCallback((id: string, field: keyof DiaryEntry, value: any) => {
        // Если учитель руками изменил поле, заполненное AI — снимаем с него значок ✨.
        setEntries(prev => prev.map(e => {
            if (e.id !== id) return e
            const next: DiaryEntry = { ...e, [field]: value }
            if (AI_FILLABLE.includes(field) && e.aiFilledFields?.includes(field as string)) {
                next.aiFilledFields = e.aiFilledFields.filter(f => f !== field)
            }
            return next
        }))

        const prevTimer = debounceTimers.current.get(id)
        if (prevTimer) clearTimeout(prevTimer)
        const timer = setTimeout(async () => {
            setSavingIds(prev => new Set(prev).add(id))
            try {
                await apiClient.patch(`/teacher-diary/${id}`, { [field]: value })
            } catch (e: any) {
                setError(e?.response?.data?.message || 'Не удалось сохранить')
            } finally {
                setSavingIds(prev => {
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
                debounceTimers.current.delete(id)
            }
        }, 600)
        debounceTimers.current.set(id, timer)
    }, [])

    const studentsForClass = useCallback(
        (classId: string | null) => students.filter(s => !classId || s.classId === classId || s.class?.id === classId),
        [students],
    )

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (loading) {
        return <div className="dashboard-card text-center py-12 text-gray-400 text-sm">Загружаем дневник…</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{entries.length}</span> {pluralize(entries.length, ['запись', 'записи', 'записей'])} в дневнике
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition shadow text-sm w-full sm:w-auto justify-center"
                >
                    <Plus className="w-4 h-4" /> Новая запись
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-2 rounded-xl text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {entries.length === 0 ? (
                <div className="dashboard-card text-center py-16">
                    <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <div className="text-gray-700 text-base font-semibold mb-2">Дневник пока пуст</div>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        Каждая запись — это один проведённый урок: тема, цели, ДЗ, заметки.
                        Прикрепите ссылку на запись с Яндекс.Диска — Преподавай сам проведёт методический анализ.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {entries.map(entry => (
                        <DiaryCard
                            key={entry.id}
                            entry={entry}
                            classes={classes}
                            studentsForClass={studentsForClass}
                            saving={savingIds.has(entry.id)}
                            analyzing={analyzingIds.has(entry.id)}
                            expanded={expandedIds.has(entry.id)}
                            onToggle={() => toggleExpand(entry.id)}
                            onUpdate={updateField}
                            onDelete={handleDelete}
                            onAnalyze={handleAnalyze}
                            onOpenResult={handleOpenResult}
                        />
                    ))}
                </div>
            )}

            {viewerHtml !== null && (
                <ResultModal html={viewerHtml} onClose={() => setViewerHtml(null)} />
            )}
        </div>
    )
}

interface CardProps {
    entry: DiaryEntry
    classes: ClassOption[]
    studentsForClass: (classId: string | null) => StudentOption[]
    saving: boolean
    analyzing: boolean
    expanded: boolean
    onToggle: () => void
    onUpdate: (id: string, field: keyof DiaryEntry, value: any) => void
    onDelete: (id: string) => void
    onAnalyze: (entry: DiaryEntry) => void
    onOpenResult: (entry: DiaryEntry) => void
}

function DiaryCard({
    entry, classes, studentsForClass,
    saving, analyzing, expanded,
    onToggle, onUpdate, onDelete, onAnalyze, onOpenResult,
}: CardProps) {
    const dateStr = useMemo(() => {
        try { return new Date(entry.date).toISOString().slice(0, 10) } catch { return '' }
    }, [entry.date])

    const dateLabel = useMemo(() => {
        try {
            return new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        } catch { return '—' }
    }, [entry.date])

    const urlValid = !entry.recordingUrl || YANDEX_RE.test(entry.recordingUrl)
    const status = entry.analysisStatus
    const className = classes.find(c => c.id === entry.classId)?.name
    const studentName = studentsForClass(entry.classId).find(s => s.id === entry.studentId)?.name
    const aiFilled = new Set(entry.aiFilledFields || [])

    return (
        <div id={`diary-entry-${entry.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-20">
            {/* Шапка карточки — кликабельна для сворачивания/разворачивания */}
            <div
                onClick={onToggle}
                className="flex items-center justify-between px-4 sm:px-5 py-3 cursor-pointer hover:bg-gray-50 transition"
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                            {entry.topic?.trim() || <span className="text-gray-400 italic">Без темы</span>}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                            <span>{dateLabel}</span>
                            {className && <><span>·</span><span>{className}</span></>}
                            {studentName && <><span>·</span><span>{studentName}</span></>}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge entry={entry} compact onOpen={(e) => { e.stopPropagation(); onOpenResult(entry) }} />
                    {saving && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
                        className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Удалить запись"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-gray-100 p-4 sm:p-5 space-y-4 bg-gray-50/40">
                    {/* Ряд 1 — дата + класс + ученик */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Дата" icon={<Calendar className="w-3.5 h-3.5" />}>
                            <input
                                type="date"
                                value={dateStr}
                                onChange={e => onUpdate(entry.id, 'date', e.target.value)}
                                className="diary-input"
                            />
                        </Field>
                        <Field label="Класс" icon={<Users className="w-3.5 h-3.5" />}>
                            <select
                                value={entry.classId || ''}
                                onChange={e => onUpdate(entry.id, 'classId', e.target.value || null)}
                                className="diary-input"
                            >
                                <option value="">— не выбран —</option>
                                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Ученик (если индивидуально)" icon={<Users className="w-3.5 h-3.5" />}>
                            <select
                                value={entry.studentId || ''}
                                onChange={e => onUpdate(entry.id, 'studentId', e.target.value || null)}
                                className="diary-input"
                            >
                                <option value="">— не выбран —</option>
                                {studentsForClass(entry.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </Field>
                    </div>

                    {/* Ряд 2 — Тема + Цели */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Тема урока" icon={<BookOpen className="w-3.5 h-3.5" />} aiFilled={aiFilled.has('topic')}>
                            <textarea
                                value={entry.topic || ''}
                                onChange={e => onUpdate(entry.id, 'topic', e.target.value)}
                                placeholder="Например: Сложение дробей с разными знаменателями"
                                rows={2}
                                className="diary-input resize-y"
                            />
                        </Field>
                        <Field label="Цели урока" icon={<Target className="w-3.5 h-3.5" />} aiFilled={aiFilled.has('goals')}>
                            <textarea
                                value={entry.goals || ''}
                                onChange={e => onUpdate(entry.id, 'goals', e.target.value)}
                                placeholder="Чему ученик должен научиться к концу"
                                rows={2}
                                className="diary-input resize-y"
                            />
                        </Field>
                    </div>

                    {/* Ряд 3 — Что пройдено + ДЗ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Что пройдено" icon={<ListChecks className="w-3.5 h-3.5" />} aiFilled={aiFilled.has('covered')}>
                            <textarea
                                value={entry.covered || ''}
                                onChange={e => onUpdate(entry.id, 'covered', e.target.value)}
                                placeholder="Какие темы и упражнения разобрали"
                                rows={3}
                                className="diary-input resize-y"
                            />
                        </Field>
                        <Field label="Домашнее задание" icon={<Home className="w-3.5 h-3.5" />} aiFilled={aiFilled.has('homework')}>
                            <textarea
                                value={entry.homework || ''}
                                onChange={e => onUpdate(entry.id, 'homework', e.target.value)}
                                placeholder="Что задать к следующему уроку"
                                rows={3}
                                className="diary-input resize-y"
                            />
                        </Field>
                    </div>

                    {/* Ряд 4 — Заметки на всю ширину */}
                    <Field label="Заметки и наблюдения" icon={<FileText className="w-3.5 h-3.5" />} aiFilled={aiFilled.has('notes')}>
                        <textarea
                            value={entry.notes || ''}
                            onChange={e => onUpdate(entry.id, 'notes', e.target.value)}
                            placeholder="Что получилось, на что обратить внимание, как ученик реагирует"
                            rows={3}
                            className="diary-input resize-y"
                        />
                    </Field>

                    {/* Блок «Запись урока + анализ» */}
                    <div className="rounded-xl border border-dashed border-pink-200 bg-pink-50/40 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-4 h-4 text-pink-600" />
                            <h4 className="text-sm font-bold text-gray-900">Запись урока и методический анализ</h4>
                        </div>
                        <div className="flex flex-col lg:flex-row gap-3">
                            <div className="flex-1 min-w-0">
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                                    Ссылка на запись с Яндекс.Диска
                                </label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                    <input
                                        type="url"
                                        value={entry.recordingUrl || ''}
                                        onChange={e => onUpdate(entry.id, 'recordingUrl', e.target.value || null)}
                                        placeholder="https://disk.yandex.ru/i/..."
                                        className={`w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border bg-white outline-none focus:ring-2 transition ${entry.recordingUrl && !urlValid
                                            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                            : 'border-gray-200 focus:border-primary-400 focus:ring-primary-100'}`}
                                    />
                                </div>
                                {entry.recordingUrl && !urlValid && (
                                    <p className="text-[11px] text-red-600 mt-1.5">
                                        ⚠️ Ссылка должна быть с Яндекс.Диска (disk.yandex.ru или yadi.sk)
                                    </p>
                                )}
                                {!entry.recordingUrl && (
                                    <p className="text-[11px] text-gray-500 mt-1.5">
                                        Подсказка: загрузите видео урока на Яндекс.Диск, скопируйте публичную ссылку и вставьте сюда.
                                    </p>
                                )}
                            </div>

                            <div className="lg:w-64 flex-shrink-0 flex flex-col gap-2 lg:pt-[26px]">
                                <button
                                    onClick={() => onAnalyze(entry)}
                                    disabled={!entry.recordingUrl || !urlValid || analyzing || status === 'pending'}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-pink-600 text-white text-sm font-bold rounded-lg hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                                >
                                    {analyzing
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Запускаем…</>
                                        : status === 'completed'
                                            ? <><Sparkles className="w-4 h-4" /> Перезапустить</>
                                            : <><Sparkles className="w-4 h-4" /> Запустить анализ</>}
                                </button>
                                <StatusBadge entry={entry} onOpen={() => onOpenResult(entry)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Field({ label, icon, children, aiFilled }: {
    label: string
    icon?: React.ReactNode
    children: React.ReactNode
    aiFilled?: boolean
}) {
    return (
        <label className="block">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                {icon}
                <span>{label}</span>
                {aiFilled && (
                    <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[9px] tracking-wide normal-case"
                        title="Поле заполнено автоматически из методического анализа — проверьте и при необходимости поправьте"
                    >
                        <Sparkles className="w-2.5 h-2.5" /> из анализа
                    </span>
                )}
            </div>
            {children}
            <style jsx>{`
                :global(.diary-input) {
                    display: block;
                    width: 100%;
                    padding: 0.55rem 0.75rem;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    color: #111827;
                    outline: none;
                    transition: border-color .15s, box-shadow .15s;
                }
                :global(.diary-input::placeholder) {
                    color: #9ca3af;
                }
                :global(.diary-input:focus) {
                    border-color: rgb(99 102 241 / 0.6);
                    box-shadow: 0 0 0 3px rgb(99 102 241 / 0.12);
                }
            `}</style>
        </label>
    )
}

function StatusBadge({ entry, compact, onOpen }: { entry: DiaryEntry; compact?: boolean; onOpen: (e: React.MouseEvent) => void }) {
    if (!entry.analysisGenerationId) {
        if (compact) return null
        return <span className="text-xs text-gray-400 text-center">Анализ ещё не запущен</span>
    }
    const base = compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs justify-center'
    if (entry.analysisStatus === 'pending') {
        return (
            <span className={`inline-flex items-center gap-1.5 ${base} bg-blue-50 text-blue-700 rounded-md font-bold whitespace-nowrap`}>
                <Loader2 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} animate-spin`} /> Анализируется…
            </span>
        )
    }
    if (entry.analysisStatus === 'failed') {
        return (
            <span className={`inline-flex items-center gap-1.5 ${base} bg-red-50 text-red-700 rounded-md font-bold whitespace-nowrap`} title={entry.analysisError || ''}>
                <AlertTriangle className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} /> Ошибка
            </span>
        )
    }
    if (entry.analysisStatus === 'completed') {
        return (
            <button
                onClick={onOpen}
                className={`inline-flex items-center gap-1.5 ${base} bg-green-50 text-green-700 rounded-md font-bold hover:bg-green-100 transition whitespace-nowrap`}
            >
                <CheckCircle2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} /> Открыть отчёт
            </button>
        )
    }
    return <span className={`inline-flex items-center gap-1.5 ${base} bg-gray-100 text-gray-600 rounded-md font-bold whitespace-nowrap`}>В очереди…</span>
}

function ResultModal({ html, onClose }: { html: string; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col"
                style={{ height: 'min(90vh, 900px)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ExternalLink className="w-5 h-5 text-pink-600" />
                        Методический анализ урока
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Закрыть">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="flex-1 min-h-0 bg-gray-50">
                    <iframe
                        srcDoc={ensureMathJaxInHtml(DOMPurify.sanitize(html, { ADD_TAGS: ['iframe', 'style'], ADD_ATTR: ['target'] }))}
                        className="w-full h-full border-0 block"
                        sandbox="allow-scripts allow-popups allow-same-origin"
                        title="Анализ урока"
                    />
                </div>
            </div>
        </div>
    )
}

function pluralize(n: number, forms: [string, string, string]) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return forms[0]
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
    return forms[2]
}
