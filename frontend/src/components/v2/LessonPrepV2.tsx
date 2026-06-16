'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Sparkles, Loader2, Copy, RefreshCw, ChevronLeft, ChevronRight,
    BookOpen, FileText, HelpCircle, Wand2, Check,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { ensureMathJaxInHtml, stripMathJaxScripts } from '@/lib/utils/ensureMathJax'
import { extractEditedBody, saveGenerationEdits } from '@/lib/utils/editGeneration'
import { apiClient } from '@/lib/api/client'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'
import { cn } from '@/lib/utils/cn'
import AssignTaskButton from '@/components/AssignTaskButton'
import DownloadPdfModal from '@/components/workspace/DownloadPdfModal'

const SECTIONS_WITH_ANSWERS = new Set(['Рабочий лист', 'Тест'])

type Depth = 'short' | 'standard' | 'deep'

const GEN_TYPES = [
    { value: 'lesson-plan',       label: 'План урока',      icon: BookOpen },
    { value: 'worksheet',         label: 'Рабочий лист',    icon: FileText },
    { value: 'content-adaptation', label: 'Учебный материал', icon: Wand2 },
    { value: 'quiz',              label: 'Тест',            icon: HelpCircle },
]

const DEPTHS: { value: Depth; label: string; hint: string }[] = [
    { value: 'short',    label: 'Кратко',     hint: 'Быстро, по сути' },
    { value: 'standard', label: 'Стандарт',   hint: 'Сбалансировано' },
    { value: 'deep',     label: 'Подробно',   hint: 'Максимум деталей' },
]

const sectionFilenameSlug = (label: string | null | undefined): string => {
    if (!label) return 'section'
    const map: Record<string, string> = {
        'План урока': 'plan-uroka',
        'Рабочий лист': 'rabochiy-list',
        'Учебный материал': 'uchebnyy-material',
        'Тест': 'test',
    }
    return map[label] || label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').slice(0, 40) || 'section'
}

export default function LessonPrepV2() {
    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()

    const [subject, setSubject] = useState('')
    const [topic, setTopic] = useState('')
    const [level, setLevel] = useState('5')
    const [interests, setInterests] = useState('')
    const [genTypes, setGenTypes] = useState<string[]>(['lesson-plan'])
    const [depth, setDepth] = useState<Depth>('standard')
    const [worksheetQuestions, setWorksheetQuestions] = useState(7)
    const [questionsCount, setQuestionsCount] = useState(10)

    const [results, setResults] = useState<Array<{ type: string; content: string }>>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [localContent, setLocalContent] = useState('')
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showPdfModal, setShowPdfModal] = useState(false)
    const [srcDoc, setSrcDoc] = useState('')
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef('')

    const hasResult = !isGenerating && !!localContent

    const currentResultType = useMemo(() => {
        if (!results.length) return null
        const typeValue = results[currentIndex].type
        return GEN_TYPES.find(t => t.value === typeValue)?.label || typeValue
    }, [results, currentIndex])

    useEffect(() => {
        if (!localContent) return
        const key = `${editMode ? 'edit' : 'view'}|${localContent}`
        if (key === lastSrcDocRef.current) return
        lastSrcDocRef.current = key
        setSrcDoc(editMode ? stripMathJaxScripts(localContent) : ensureMathJaxInHtml(localContent))
    }, [localContent, editMode])

    useEffect(() => {
        if (editMode && results.length > 0) {
            setResults(prev => {
                const updated = [...prev]
                if (updated[currentIndex].content !== localContent) {
                    updated[currentIndex] = { ...updated[currentIndex], content: localContent }
                }
                return updated
            })
        }
    }, [localContent, editMode, currentIndex, results.length])

    const toggleType = (value: string) => {
        setGenTypes(prev => prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value])
    }

    const generate = async () => {
        if (!subject.trim() || !topic.trim() || genTypes.length === 0) {
            toast.error('Заполните предмет, тему и выберите хотя бы один тип')
            return
        }
        setResults([])
        setCurrentIndex(0)
        setLocalContent('<p style="padding:40px;text-align:center;color:var(--ink-500)">Генерируем материалы…</p>')
        setEditMode(false)
        setMobileTab('preview')

        try {
            const response = await generateAndWait({
                type: 'lessonPreparation',
                params: {
                    subject, topic, level, interests, generationTypes: genTypes, depth,
                    worksheetQuestions: genTypes.includes('worksheet') ? worksheetQuestions : undefined,
                    questionsCount: genTypes.includes('quiz') ? questionsCount : undefined,
                },
            })

            const resultData = response.result
            if (resultData?.sections?.length > 0) {
                const newResults = resultData.sections.map((s: any) => ({ type: s.title, content: s.content }))
                setResults(newResults)
                setCurrentIndex(0)
                setLocalContent(newResults[0].content)
            } else {
                setLocalContent('<p>Не удалось сгенерировать контент.</p>')
            }
        } catch (e: any) {
            setLocalContent(`<p style="color:#EF4444;padding:24px">Ошибка: ${e.message}</p>`)
        }
    }

    const goTo = (idx: number) => {
        setCurrentIndex(idx)
        setLocalContent(results[idx].content)
        setEditMode(false)
    }

    const handleCopy = () => {
        const div = document.createElement('div')
        div.innerHTML = DOMPurify.sanitize(localContent)
        navigator.clipboard.writeText(div.innerText || div.textContent || '')
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    const saveEdit = async () => {
        // Вариант A: PATCH ТОЛЬКО editedBody, оригинал в content не трогаем.
        const iframeDoc = iframeRef.current?.contentDocument
        const editedBody = extractEditedBody(iframeDoc)
        if (!editedBody) {
            toast.error('Пустой результат не сохранён')
            return
        }

        const hasBody = /<body[^>]*>[\s\S]*<\/body>/i.test(localContent)
        const localFullHtml = hasBody
            ? localContent.replace(
                  /<body([^>]*)>[\s\S]*<\/body>/i,
                  (_, a) => `<body${a}>${editedBody}</body>`,
              )
            : `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"></head><body>${editedBody}</body></html>`

        if (activeGenerationId) {
            setIsSaving(true)
            try {
                await saveGenerationEdits(activeGenerationId, editedBody)
                lastSrcDocRef.current = `edit|${localFullHtml}`
                setLocalContent(localFullHtml)
                setResults(prev => { const u = [...prev]; u[currentIndex] = { ...u[currentIndex], content: localFullHtml }; return u })
                toast.success('Сохранено')
                setEditMode(false)
            } catch (err: any) {
                toast.error(err?.response?.data?.message || err?.message || 'Не удалось сохранить')
            } finally {
                setIsSaving(false)
            }
        } else {
            setLocalContent(localFullHtml)
            setEditMode(false)
        }
    }

    const currentSectionHasAnswers = useMemo(() => SECTIONS_WITH_ANSWERS.has(currentResultType || ''), [currentResultType])

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile tabs */}
            <div className="lg:hidden border-b border-ink-200 bg-surface px-4 pt-2">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'config',  label: 'Настройка' },
                        { id: 'preview', label: 'Результат' },
                    ]}
                    active={mobileTab}
                    onChange={id => setMobileTab(id as 'config' | 'preview')}
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-6 max-md:p-3 max-lg:grid-cols-1">
                {/* ─── Config card ─── */}
                <Card padding="none" className={cn('col-span-4 max-lg:col-span-1 flex flex-col overflow-hidden', mobileTab !== 'config' && 'max-lg:hidden')}>
                    <div className="flex items-center gap-3.5 px-5 py-4 border-b border-ink-100 flex-shrink-0">
                        <span className="w-11 h-11 rounded-md inline-flex items-center justify-center flex-shrink-0" style={{ background: '#FFF7ED', color: '#C2410C' }}>
                            <Sparkles className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Вау-урок</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Полный комплект сразу · ~60 секунд</div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* Предмет */}
                        <div data-tour="subject">
                        <Field label="Предмет">
                            <input
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Биология, Математика…"
                                className={fieldCls}
                            />
                        </Field>
                        </div>

                        {/* Тема */}
                        <div data-tour="topic">
                        <Field label="Тема урока">
                            <input
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Фотосинтез, Интегралы…"
                                className={fieldCls}
                            />
                        </Field>
                        </div>

                        {/* Класс */}
                        <div data-tour="level">
                        <Field label="Класс">
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className={fieldCls}
                            >
                                {['1','2','3','4','5','6','7','8','9','10','11'].map(v => (
                                    <option key={v} value={v}>{v} класс</option>
                                ))}
                            </select>
                        </Field>
                        </div>

                        {/* Интересы */}
                        <div data-tour="interests">
                        <Field label="Интересы учеников (необяз.)">
                            <input
                                value={interests}
                                onChange={e => setInterests(e.target.value)}
                                placeholder="спорт, игры, музыка…"
                                className={fieldCls}
                            />
                        </Field>
                        </div>

                        {/* Типы генерации */}
                        <div data-tour="gen-types">
                        <Field label="Что генерировать">
                            <div className="grid grid-cols-2 gap-2">
                                {GEN_TYPES.map(gt => {
                                    const Icon = gt.icon
                                    const active = genTypes.includes(gt.value)
                                    return (
                                        <button
                                            key={gt.value}
                                            type="button"
                                            onClick={() => toggleType(gt.value)}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-[13px] font-semibold transition-all text-left',
                                                active
                                                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                                                    : 'bg-surface border-ink-200 text-ink-600 hover:border-ink-300',
                                            )}
                                        >
                                            {active
                                                ? <Check className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />
                                                : <Icon className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />}
                                            {gt.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </Field>
                        </div>

                        {/* Детализация */}
                        <div data-tour="depth">
                        <Field label="Детализация">
                            <div className="flex bg-ink-100 rounded-full p-[3px]">
                                {DEPTHS.map(d => (
                                    <button
                                        key={d.value}
                                        type="button"
                                        onClick={() => setDepth(d.value)}
                                        title={d.hint}
                                        className={cn(
                                            'flex-1 h-8 rounded-full text-[12px] font-semibold transition-all',
                                            depth === d.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                                        )}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                        </div>

                        {/* Количество вопросов для листа/теста */}
                        {genTypes.includes('worksheet') && (
                            <Field label={`Заданий в рабочем листе: ${worksheetQuestions}`}>
                                <input
                                    type="range"
                                    min={3} max={20} step={1}
                                    value={worksheetQuestions}
                                    onChange={e => setWorksheetQuestions(+e.target.value)}
                                    className="w-full accent-brand-500"
                                />
                            </Field>
                        )}
                        {genTypes.includes('quiz') && (
                            <Field label={`Вопросов в тесте: ${questionsCount}`}>
                                <input
                                    type="range"
                                    min={5} max={25} step={5}
                                    value={questionsCount}
                                    onChange={e => setQuestionsCount(+e.target.value)}
                                    className="w-full accent-brand-500"
                                />
                            </Field>
                        )}

                        <div data-tour="generate">
                        <Button
                            variant="primary"
                            className="w-full"
                            leftIcon={isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            disabled={isGenerating || !subject.trim() || !topic.trim() || genTypes.length === 0}
                            onClick={generate}
                        >
                            {isGenerating ? 'Создаём…' : 'Сгенерировать'}
                        </Button>
                        </div>
                    </div>
                </Card>

                {/* ─── Preview card ─── */}
                <Card data-tour="preview" padding="none" className={cn('col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden', mobileTab !== 'preview' && 'max-lg:hidden')}>
                    {/* Toolbar */}
                    {hasResult && (
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-200 bg-surface flex-wrap flex-shrink-0">
                            {/* Section navigation */}
                            {results.length > 1 && (
                                <div className="flex items-center gap-1.5 mr-2">
                                    <button
                                        type="button"
                                        disabled={currentIndex === 0}
                                        onClick={() => goTo(currentIndex - 1)}
                                        className="w-7 h-7 rounded flex items-center justify-center text-ink-500 hover:bg-ink-100 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <div className="flex gap-1">
                                        {results.map((r, i) => {
                                            const gt = GEN_TYPES.find(g => g.value === r.type || g.label === r.type)
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => goTo(i)}
                                                    className={cn(
                                                        'px-2.5 py-1 rounded text-[12px] font-semibold transition-all',
                                                        i === currentIndex
                                                            ? 'bg-brand-50 text-brand-700 border border-brand-200'
                                                            : 'text-ink-500 hover:bg-ink-100',
                                                    )}
                                                >
                                                    {gt?.label || r.type}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={currentIndex === results.length - 1}
                                        onClick={() => goTo(currentIndex + 1)}
                                        className="w-7 h-7 rounded flex items-center justify-center text-ink-500 hover:bg-ink-100 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            <div className="ml-auto flex items-center gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    onClick={handleCopy}
                                >
                                    {copied ? 'Скопировано' : 'Копировать'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={generate}
                                    disabled={isGenerating}
                                >
                                    Пересоздать
                                </Button>
                                {editMode && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={isSaving}
                                        onClick={saveEdit}
                                    >
                                        {isSaving ? 'Сохраняем…' : 'Сохранить'}
                                    </Button>
                                )}
                                {activeGenerationId && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setShowPdfModal(true)}
                                    >
                                        PDF
                                    </Button>
                                )}
                                {activeGenerationId && (
                                    <AssignTaskButton generationId={activeGenerationId} />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Iframe / empty / progress */}
                    <div className="flex-1 overflow-hidden">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center p-8">
                                <WowProgress />
                            </div>
                        ) : !localContent ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mb-4">
                                    <Sparkles className="w-8 h-8 text-brand-500" />
                                </div>
                                <h3 className="font-display font-bold text-ink-900 text-lg mb-2">Ваш вау-урок появится здесь</h3>
                                <p className="text-[14px] text-ink-500 max-w-[340px]">
                                    Заполните форму слева и нажмите «Сгенерировать» — получите готовый комплект материалов.
                                </p>
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={srcDoc}
                                className="w-full h-full border-0"
                                style={editMode ? { cursor: 'text' } : undefined}
                                title="Предпросмотр"
                                onLoad={() => {
                                    const doc = iframeRef.current?.contentDocument
                                    if (doc && editMode) doc.body.contentEditable = 'true'
                                }}
                            />
                        )}
                    </div>
                </Card>
            </div>

            {showPdfModal && activeGenerationId && results.length > 0 && (
                <DownloadPdfModal
                    isOpen={showPdfModal}
                    generationId={activeGenerationId}
                    filename={`vau-urok-${currentIndex + 1}-${sectionFilenameSlug(currentResultType)}.pdf`}
                    hasAnswers={currentSectionHasAnswers}
                    sectionIndex={currentIndex}
                    onClose={() => setShowPdfModal(false)}
                />
            )}
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-ink-600 uppercase tracking-wide">{label}</label>
            {children}
        </div>
    )
}

const fieldCls = 'h-10 px-3.5 rounded-lg border border-ink-200 text-sm text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/10 transition-all w-full'

const PROGRESS_STAGES = [
    { until: 15,  title: 'Анализируем тему',       hint: 'Подбираем структуру' },
    { until: 35,  title: 'Готовим план урока',     hint: 'Цели, этапы, тайминг' },
    { until: 55,  title: 'Создаём рабочий лист',   hint: 'Проверяем соответствие' },
    { until: 75,  title: 'Адаптируем материал',    hint: 'Под класс и интересы' },
    { until: 90,  title: 'Собираем тест',          hint: 'Проверяем правильность' },
    { until: 100, title: 'Финальная сборка',       hint: 'Ещё чуть-чуть' },
]

function WowProgress() {
    const [progress, setProgress] = useState(0)
    useEffect(() => {
        const totalMs = 35_000
        const step = 200
        const inc = 90 / (totalMs / step)
        const t = setInterval(() => setProgress(p => p >= 90 ? 90 : p + inc), step)
        return () => clearInterval(t)
    }, [])
    const stage = PROGRESS_STAGES.find(s => progress < s.until) ?? PROGRESS_STAGES[PROGRESS_STAGES.length - 1]
    return (
        <div className="w-full max-w-[520px]">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[15px] font-semibold text-ink-900">{stage.title}…</span>
                <span className="text-[14px] font-bold text-ink-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full bg-ink-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <p className="text-center text-[13px] text-ink-500 mt-4">{stage.hint}…</p>
        </div>
    )
}
