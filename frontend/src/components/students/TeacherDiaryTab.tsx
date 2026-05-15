'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import {
    Plus, Trash2, Loader2, CheckCircle2, AlertTriangle,
    Sparkles, Link as LinkIcon, X, ExternalLink,
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
    class?: { id: string; name: string } | null
    student?: { id: string; name: string } | null
}

interface ClassOption { id: string; name: string }
interface StudentOption { id: string; name: string; class: { name: string } }

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

    // Авто-поллинг записей с pending-анализами, пока они не завершатся
    useEffect(() => {
        const hasPending = entries.some(e => e.analysisStatus === 'pending')
        if (!hasPending) return
        const t = setInterval(() => {
            apiClient.get<DiaryEntry[]>('/teacher-diary').then(r => setEntries(r.data)).catch(() => {})
        }, 8000)
        return () => clearInterval(t)
    }, [entries])

    const handleCreate = async () => {
        try {
            await apiClient.post<DiaryEntry>('/teacher-diary', {
                date: new Date().toISOString(),
            })
            fetchAll()
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
            setViewerHtml(html || '<p>Результат пуст.</p>')
        } catch (e: any) {
            setError('Не удалось загрузить результат')
        }
    }

    const updateField = useCallback((id: string, field: keyof DiaryEntry, value: any) => {
        setEntries(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)))

        // Debounce: одна запись = один таймер. Перебиваем предыдущий.
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
        (classId: string | null) => students.filter(s => !classId || (s as any).class?.id === classId || (s as any).classId === classId),
        [students],
    )

    if (loading) {
        return <div className="dashboard-card text-center py-12 text-gray-400 text-sm">Загружаем дневник…</div>
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{entries.length}</span> {entries.length === 1 ? 'запись' : 'записей'} в дневнике
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
                    <div className="text-gray-400 text-sm mb-3">Дневник пока пуст</div>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                        Каждая запись — это один проведённый урок: тема, цели, ДЗ, заметки.
                        Прикрепите ссылку на запись с Яндекс.Диска — и Преподавай сам проведёт методический анализ.
                    </p>
                </div>
            ) : (
                <div className="dashboard-card overflow-x-auto p-0">
                    <table className="w-full text-sm min-w-[1200px]">
                        <thead>
                            <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                                <th className="px-3 py-3 w-28">Дата</th>
                                <th className="px-3 py-3 w-40">Класс / Ученик</th>
                                <th className="px-3 py-3 w-44">Тема</th>
                                <th className="px-3 py-3 w-44">Цели</th>
                                <th className="px-3 py-3 w-44">Что пройдено</th>
                                <th className="px-3 py-3 w-44">Домашнее задание</th>
                                <th className="px-3 py-3 w-44">Заметки</th>
                                <th className="px-3 py-3 w-56">
                                    Ссылка на запись
                                    <div className="text-[10px] normal-case text-gray-400 font-normal mt-0.5">
                                        Только Яндекс.Диск
                                    </div>
                                </th>
                                <th className="px-3 py-3 w-40">Результат анализа</th>
                                <th className="px-2 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <DiaryRow
                                    key={entry.id}
                                    entry={entry}
                                    classes={classes}
                                    studentsForClass={studentsForClass}
                                    saving={savingIds.has(entry.id)}
                                    analyzing={analyzingIds.has(entry.id)}
                                    onUpdate={updateField}
                                    onDelete={handleDelete}
                                    onAnalyze={handleAnalyze}
                                    onOpenResult={handleOpenResult}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {viewerHtml !== null && (
                <ResultModal html={viewerHtml} onClose={() => setViewerHtml(null)} />
            )}
        </div>
    )
}

interface RowProps {
    entry: DiaryEntry
    classes: ClassOption[]
    studentsForClass: (classId: string | null) => StudentOption[]
    saving: boolean
    analyzing: boolean
    onUpdate: (id: string, field: keyof DiaryEntry, value: any) => void
    onDelete: (id: string) => void
    onAnalyze: (entry: DiaryEntry) => void
    onOpenResult: (entry: DiaryEntry) => void
}

function DiaryRow({ entry, classes, studentsForClass, saving, analyzing, onUpdate, onDelete, onAnalyze, onOpenResult }: RowProps) {
    const dateStr = useMemo(() => {
        try {
            return new Date(entry.date).toISOString().slice(0, 10)
        } catch {
            return ''
        }
    }, [entry.date])

    const urlValid = !entry.recordingUrl || YANDEX_RE.test(entry.recordingUrl)
    const status = entry.analysisStatus

    return (
        <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/30 transition-colors align-top">
            <td className="px-3 py-2.5">
                <input
                    type="date"
                    value={dateStr}
                    onChange={e => onUpdate(entry.id, 'date', e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none"
                />
            </td>
            <td className="px-3 py-2.5">
                <select
                    value={entry.classId || ''}
                    onChange={e => onUpdate(entry.id, 'classId', e.target.value || null)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 mb-1 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none"
                >
                    <option value="">— Класс —</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                    value={entry.studentId || ''}
                    onChange={e => onUpdate(entry.id, 'studentId', e.target.value || null)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none"
                >
                    <option value="">— Ученик —</option>
                    {studentsForClass(entry.classId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </td>
            <CellTextarea value={entry.topic} onChange={v => onUpdate(entry.id, 'topic', v)} placeholder="Тема урока" />
            <CellTextarea value={entry.goals} onChange={v => onUpdate(entry.id, 'goals', v)} placeholder="Цели" />
            <CellTextarea value={entry.covered} onChange={v => onUpdate(entry.id, 'covered', v)} placeholder="Что пройдено" />
            <CellTextarea value={entry.homework} onChange={v => onUpdate(entry.id, 'homework', v)} placeholder="Домашнее задание" />
            <CellTextarea value={entry.notes} onChange={v => onUpdate(entry.id, 'notes', v)} placeholder="Наблюдения" />

            {/* Ссылка на запись */}
            <td className="px-3 py-2.5">
                <div className="relative">
                    <LinkIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                        type="url"
                        value={entry.recordingUrl || ''}
                        onChange={e => onUpdate(entry.id, 'recordingUrl', e.target.value || null)}
                        placeholder="https://disk.yandex.ru/i/..."
                        className={`w-full text-xs pl-7 pr-2 py-1.5 rounded-lg border outline-none focus:ring-1 ${entry.recordingUrl && !urlValid
                            ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                            : 'border-gray-200 focus:border-primary-400 focus:ring-primary-200'}`}
                    />
                </div>
                {entry.recordingUrl && !urlValid && (
                    <p className="text-[10px] text-red-600 mt-1">Нужна ссылка с Яндекс.Диска</p>
                )}
                {entry.recordingUrl && urlValid && (
                    <button
                        onClick={() => onAnalyze(entry)}
                        disabled={analyzing || status === 'pending'}
                        className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1 bg-pink-50 text-pink-700 rounded-md text-[11px] font-bold hover:bg-pink-100 disabled:opacity-50 transition"
                    >
                        {analyzing
                            ? <><Loader2 className="w-3 h-3 animate-spin" /> Запускаем…</>
                            : <><Sparkles className="w-3 h-3" /> {status === 'completed' ? 'Перезапустить анализ' : 'Запустить анализ'}</>}
                    </button>
                )}
            </td>

            {/* Результат анализа */}
            <td className="px-3 py-2.5">
                <StatusCell entry={entry} onOpen={() => onOpenResult(entry)} />
            </td>

            <td className="px-2 py-2.5">
                <div className="flex flex-col gap-1 items-center">
                    {saving && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
                    <button
                        onClick={() => onDelete(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition"
                        title="Удалить запись"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </td>
        </tr>
    )
}

function CellTextarea({ value, onChange, placeholder }: { value: string | null; onChange: (v: string) => void; placeholder: string }) {
    return (
        <td className="px-3 py-2.5">
            <textarea
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 resize-y focus:border-primary-400 focus:ring-1 focus:ring-primary-200 outline-none"
            />
        </td>
    )
}

function StatusCell({ entry, onOpen }: { entry: DiaryEntry; onOpen: () => void }) {
    if (!entry.analysisGenerationId) {
        return <span className="text-[11px] text-gray-400">Не запущен</span>
    }
    if (entry.analysisStatus === 'pending') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] font-bold">
                <Loader2 className="w-3 h-3 animate-spin" /> Анализируется…
            </span>
        )
    }
    if (entry.analysisStatus === 'failed') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-700 rounded-md text-[11px] font-bold" title={entry.analysisError || ''}>
                <AlertTriangle className="w-3 h-3" /> Ошибка
            </span>
        )
    }
    if (entry.analysisStatus === 'completed') {
        return (
            <button
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-md text-[11px] font-bold hover:bg-green-100 transition"
            >
                <CheckCircle2 className="w-3 h-3" /> Открыть отчёт
            </button>
        )
    }
    return <span className="text-[11px] text-gray-400">В очереди…</span>
}

function ResultModal({ html, onClose }: { html: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ExternalLink className="w-5 h-5 text-pink-600" />
                        Методический анализ урока
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-hidden">
                    <iframe
                        srcDoc={ensureMathJaxInHtml(DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'] }))}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-popups"
                        title="Анализ урока"
                    />
                </div>
            </div>
        </div>
    )
}
