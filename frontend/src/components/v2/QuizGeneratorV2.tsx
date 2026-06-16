'use client'

import { useEffect, useRef, useState } from 'react'
import {
    HelpCircle, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
    Sparkles, Settings2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DOMPurify from 'isomorphic-dompurify'

import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { ensureMathJaxInHtml, stripMathJaxScripts } from '@/lib/utils/ensureMathJax'
import { extractEditedBody, saveGenerationEdits } from '@/lib/utils/editGeneration'
import { apiClient } from '@/lib/api/client'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import AssignTaskButton from '@/components/AssignTaskButton'
import { DocumentRenderer } from '@/components/blocks/DocumentRenderer'
import { DocumentEditor } from '@/components/blocks/editor/DocumentEditor'
import { useV2Toggle } from '@/components/blocks/useV2Toggle'

const INITIAL_HTML = ''

const SUBJECTS = [
    'Биология', 'Математика', 'Физика', 'Химия', 'История',
    'Литература', 'Английский язык', 'География', 'Информатика', 'Обществознание',
]

const LEVELS = Array.from({ length: 11 }, (_, i) => ({ label: `${i + 1} класс`, value: `${i + 1} класс` }))

const ANSWERS_OPTIONS = [2, 3, 4]

// Простые тематические подсказки. Для биологии — как в прототипе; для остальных — нейтральный пример.
const PRESETS_BY_SUBJECT: Record<string, string[]> = {
    'Биология': ['Митоз', 'Фотосинтез', 'ДНК'],
    'Математика': ['Тригонометрия', 'Производные', 'Логарифмы'],
    'Физика': ['Законы Ньютона', 'Электромагнетизм', 'Термодинамика'],
    'Химия': ['Периодическая таблица', 'Кислоты и основания', 'Органика'],
    'История': ['Великая Отечественная', 'Реформы Петра I', 'Революция 1917'],
    'Литература': ['«Война и мир»', '«Преступление и наказание»', 'Серебряный век'],
    'Английский язык': ['Past Simple', 'Conditionals', 'Phrasal verbs'],
    'География': ['Климат России', 'Природные зоны', 'Население мира'],
    'Информатика': ['Алгоритмы', 'Системы счисления', 'Логика'],
    'Обществознание': ['Конституция РФ', 'Социализация', 'Экономика'],
}

export default function QuizGeneratorV2() {
    // form
    const [subject, setSubject] = useState('Биология')
    const [topic, setTopic] = useState('')
    const [level, setLevel] = useState('5 класс')
    const [questionsCount, setQuestionsCount] = useState(10)
    const [answersCount, setAnswersCount] = useState(4)

    // result
    const [localContent, setLocalContent] = useState(INITIAL_HTML)
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()

    // v2 JSON-формат
    const v2 = useV2Toggle('quiz_use_v2_format')
    const hasResult = !isGenerating && !!localContent && localContent !== INITIAL_HTML

    // mobile tabs
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    useEffect(() => {
        if (!localContent) return
        const key = `${editMode ? 'edit' : 'view'}|${localContent}`
        if (key === lastSrcDocRef.current) return
        lastSrcDocRef.current = key
        setSrcDoc(editMode ? stripMathJaxScripts(localContent) : ensureMathJaxInHtml(localContent))
    }, [localContent, editMode])

    const generate = async () => {
        if (!topic.trim()) {
            toast.error('Укажите тему теста')
            return
        }
        if (v2.useV2) {
            setMobileTab('preview')
            return v2.generateV2('/generate/v2/quiz', {
                topic, subject, grade: level, numQuestions: questionsCount, numAnswers: answersCount,
            })
        }
        try {
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Генерируем вопросы…</p></div>')
            setEditMode(false)
            setMobileTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'quiz',
                params: {
                    userHash,
                    subject,
                    topic,
                    level,
                    questionsCount,
                    answersCount,
                },
            })
            const resultData = status.result?.content || status.result
            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space:pre-wrap">${finalHtml}</div>`
            }
            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
        } catch (e: any) {
            console.error('Quiz generation failed:', e)
            setLocalContent(`<p style="color:#EF4444;padding:24px">Ошибка при генерации: ${e?.message || 'неизвестная'}</p>`)
        }
    }

    const toggleEditMode = async () => {
        if (!editMode) {
            setEditMode(true)
            return
        }

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
                  (_, bodyAttrs) => `<body${bodyAttrs}>${editedBody}</body>`,
              )
            : `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"></head><body>${editedBody}</body></html>`

        if (activeGenerationId) {
            setIsSaving(true)
            try {
                await saveGenerationEdits(activeGenerationId, editedBody)
                lastSrcDocRef.current = `edit|${localFullHtml}`
                setLocalContent(localFullHtml)
                toast.success('Сохранено')
                setEditMode(false)
            } catch (err: any) {
                const resp = err?.response?.data
                const msg = (Array.isArray(resp?.message) ? resp.message.join('; ') : resp?.message) || err?.message || 'Не удалось сохранить'
                toast.error(msg)
            } finally {
                setIsSaving(false)
            }
        } else {
            lastSrcDocRef.current = `edit|${localFullHtml}`
            setLocalContent(localFullHtml)
            setEditMode(false)
        }
    }

    const copyHtml = async () => {
        if (!localContent) return
        try {
            await navigator.clipboard.writeText(DOMPurify.sanitize(localContent, { USE_PROFILES: { html: true } }))
            setCopied(true)
            toast.success('HTML скопирован')
            setTimeout(() => setCopied(false), 1500)
        } catch { toast.error('Не удалось скопировать') }
    }

    // Cmd/Ctrl + Enter → старт генерации
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                if (!isGenerating && topic.trim()) generate()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topic, isGenerating, subject, level, questionsCount, answersCount])

    const presets = PRESETS_BY_SUBJECT[subject] ?? []

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile tabs */}
            <div className="lg:hidden border-b border-ink-200 bg-surface px-4 pt-2">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'config', label: 'Параметры', icon: <Settings2 className="w-4 h-4" /> },
                        { id: 'preview', label: 'Предпросмотр', icon: <Eye className="w-4 h-4" /> },
                    ]}
                    active={mobileTab}
                    onChange={(k) => setMobileTab(k as any)}
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-6 max-md:p-3 max-lg:grid-cols-1">
                {/* LEFT: params */}
                <Card padding="lg"
                      className={`col-span-4 max-lg:col-span-1 h-fit max-lg:${mobileTab === 'config' ? '' : 'hidden'}`}>
                    {/* tool-hero */}
                    <div className="flex items-center gap-3.5 pb-5 mb-1 border-b border-ink-100" data-tour="hero">
                        <span
                            className="w-11 h-11 rounded-md inline-flex items-center justify-center"
                            style={{ background: '#EFF6FF', color: '#1D4ED8' }}
                        >
                            <HelpCircle className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Тест</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Квиз с вариантами ответа · готов за ~30 секунд</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Subject */}
                        <div data-tour="subject">
                            <Input
                                label="ПРЕДМЕТ"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Биология, Математика, Физика…"
                            />
                        </div>

                        {/* Topic */}
                        <div data-tour="topic">
                            <Input
                                label="ТЕМА"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Строение клетки"
                                hint="По теме будут составлены вопросы"
                            />
                            {presets.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap mt-2.5">
                                    {presets.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setTopic(p)}
                                            className="px-2.5 py-1 bg-ink-100 hover:bg-ink-200 hover:text-ink-900 border-none rounded-sm text-[12px] text-ink-600 transition-colors"
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Level chips */}
                        <div data-tour="level">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Класс</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full h-10 px-3 rounded-md border border-ink-200 bg-surface text-[14px] text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 transition-colors"
                            >
                                {LEVELS.map(l => (
                                    <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Questions count slider */}
                        <div data-tour="count">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Количество вопросов
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={5} max={25}
                                    value={questionsCount}
                                    onChange={e => setQuestionsCount(Number(e.target.value))}
                                    className="flex-1 accent-brand-500"
                                />
                                <div className="min-w-[36px] text-center bg-brand-50 text-brand-700 px-2.5 py-1 rounded-sm font-bold text-[13px] tnum">
                                    {questionsCount}
                                </div>
                            </div>
                        </div>

                        {/* Answers count chips */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Вариантов ответа</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {ANSWERS_OPTIONS.map(n => (
                                    <ChipButton key={n} active={answersCount === n} onClick={() => setAnswersCount(n)}>
                                        {n}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-ink-100">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating || v2.v2IsGenerating}
                                disabled={!topic.trim()}
                                data-tour="generate"
                            >
                                {(isGenerating || v2.v2IsGenerating) ? 'В процессе…' : 'Сгенерировать'}
                            </Button>
                            <div className="text-center text-[11px] text-ink-500 mt-2.5 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                ⌘ + ↵ — горячая клавиша
                            </div>
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden max-lg:${mobileTab === 'preview' ? '' : 'hidden'}`}>
                    {/* preview-toolbar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Генерация…</>
                            ) : hasResult ? (
                                <><Eye className="w-4 h-4" /> Предпросмотр</>
                            ) : (
                                <><Eye className="w-4 h-4 text-ink-400" /> Готов к работе</>
                            )}
                            {hasResult && <Badge variant="success">готово</Badge>}
                        </div>

                        <div className="flex-1" />

                        {v2.useV2 && v2.hasV2Result && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => v2.setV2Mode('preview')}
                                    className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${v2.v2Mode === 'preview' ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}
                                >Превью</button>
                                <button
                                    type="button"
                                    onClick={() => v2.setV2Mode('answers')}
                                    className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${v2.v2Mode === 'answers' ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}
                                >С ответами</button>
                                <button
                                    type="button"
                                    onClick={() => v2.setV2Mode('edit')}
                                    data-tour="edit"
                                    className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${v2.v2Mode === 'edit' ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700'}`}
                                >Редактировать</button>
                            </div>
                        )}

                        {(hasResult || (v2.useV2 && v2.hasV2Result)) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {!v2.useV2 && editMode && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        leftIcon={<Save className="w-3.5 h-3.5" />}
                                        onClick={toggleEditMode}
                                        loading={isSaving}
                                    >
                                        Сохранить
                                    </Button>
                                )}
                                {!v2.useV2 && (
                                    <Button variant="ghost" size="sm" leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyHtml}>
                                        {copied ? 'Скопировано' : 'Копировать'}
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={generate} disabled={isGenerating || v2.v2IsGenerating}>
                                    Заново
                                </Button>
                                {!v2.useV2 && activeGenerationId && (
                                    <>
                                        <PdfDownloadButton
                                            generationId={activeGenerationId}
                                            filename={`${topic || 'quiz'}.pdf`}
                                            hasAnswers
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-md transition-colors"
                                        />
                                        <AssignTaskButton
                                            generationId={activeGenerationId}
                                            topic={topic}
                                            label="Выдать классу"
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                        />
                                    </>
                                )}
                                {v2.useV2 && v2.v2GenerationId && (
                                    <>
                                        <PdfDownloadButton
                                            generationId={v2.v2GenerationId}
                                            filename={`${topic || 'quiz'}.pdf`}
                                            hasAnswers
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-md transition-colors"
                                        />
                                        <AssignTaskButton
                                            generationId={v2.v2GenerationId}
                                            topic={topic}
                                            label="Выдать классу"
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* preview body */}
                    <div data-tour="preview" className="flex-1 min-h-0 overflow-auto bg-ink-50">
                        {(isGenerating || v2.v2IsGenerating) ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating || v2.v2IsGenerating} title="Генерируем тест…" accentClassName="bg-brand-500" estimatedSeconds={45} />
                            </div>
                        ) : v2.useV2 ? (
                            v2.v2Doc ? (
                                v2.v2Mode === 'edit' && v2.v2GenerationId ? (
                                    <DocumentEditor
                                        initialDoc={v2.v2Doc}
                                        saving={v2.v2IsSaving}
                                        onCancel={() => v2.setV2Mode('preview')}
                                        onSave={v2.saveV2}
                                    />
                                ) : (
                                    <DocumentRenderer doc={v2.v2Doc} showAnswers={v2.v2Mode === 'answers'} />
                                )
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-10 text-ink-500">
                                    <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                        <HelpCircle className="w-9 h-9" />
                                    </div>
                                    <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Готов к работе (новый формат)</h3>
                                    <p className="text-[13px]">Заполните настройки слева и нажмите «Сгенерировать».</p>
                                </div>
                            )
                        ) : srcDoc ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={srcDoc}
                                className="w-full h-full bg-white border-0"
                                title="quiz-preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                                style={editMode ? { boxShadow: 'inset 0 0 0 3px #FF7E58' } : undefined}
                                onLoad={() => {
                                    const doc = iframeRef.current?.contentDocument
                                    if (doc && editMode) doc.body.contentEditable = 'true'
                                }}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 text-ink-500">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <HelpCircle className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Заполните настройки слева</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появятся вопросы теста, варианты ответов и ключ для учителя.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

/* ── helpers ── */

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
                active
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'bg-surface border-ink-200 text-ink-700 hover:border-brand-300 hover:text-ink-900',
            ].join(' ')}
        >
            {children}
        </button>
    )
}
