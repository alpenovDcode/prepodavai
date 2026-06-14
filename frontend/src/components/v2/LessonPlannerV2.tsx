'use client'

import { useEffect, useRef, useState } from 'react'
import {
    ClipboardList, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
    Sparkles, Settings2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DOMPurify from 'isomorphic-dompurify'

import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { ensureMathJaxInHtml, stripMathJaxScripts } from '@/lib/utils/ensureMathJax'
import { apiClient } from '@/lib/api/client'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Select } from '@/components/ui/v2/Select'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import AssignTaskButton from '@/components/AssignTaskButton'

const INITIAL_HTML = ''

const SUBJECTS = [
    'История', 'Математика', 'Биология', 'Физика', 'Химия',
    'Литература', 'Английский язык', 'География', 'Информатика', 'Обществознание',
]

const LEVELS = ['5', '6', '7', '8', '9', '10', '11']

const DURATIONS = [
    { value: 30, label: '30 мин' },
    { value: 45, label: '45 мин' },
    { value: 90, label: '90 мин' },
]

const LESSON_TYPES = [
    'Комбинированный',
    'Изучение нового материала',
    'Закрепление знаний',
    'Обобщение и систематизация',
    'Контроль знаний',
    'Практическая работа',
    'Лабораторная работа',
    'Семинар',
    'Урок-проект',
]

const WORK_FORMATS = [
    'Индивидуальная работа',
    'Парная работа',
    'Групповая работа',
    'Фронтальная работа',
]

type LessonStyle = 'interactive' | 'lecture'

const PRESETS_BY_SUBJECT: Record<string, string[]> = {
    'История': ['Реформы Петра I', 'Великая Отечественная', 'Революция 1917'],
    'Математика': ['Квадратные уравнения', 'Тригонометрия', 'Производные'],
    'Биология': ['Фотосинтез', 'Митоз', 'ДНК'],
    'Физика': ['Законы Ньютона', 'Электромагнетизм', 'Термодинамика'],
    'Химия': ['Периодическая таблица', 'Кислоты и основания', 'Органика'],
    'Литература': ['«Война и мир»', 'Серебряный век', 'Лирика Пушкина'],
    'Английский язык': ['Past Simple', 'Conditionals', 'Phrasal verbs'],
    'География': ['Климат России', 'Природные зоны', 'Население мира'],
    'Информатика': ['Алгоритмы', 'Системы счисления', 'Логика'],
    'Обществознание': ['Конституция РФ', 'Социализация', 'Экономика'],
}

export default function LessonPlannerV2() {
    // form
    const [subject, setSubject] = useState('История')
    const [topic, setTopic] = useState('')
    const [level, setLevel] = useState('8')
    const [duration, setDuration] = useState(45)
    const [lessonType, setLessonType] = useState(LESSON_TYPES[0])
    const [workFormat, setWorkFormat] = useState(WORK_FORMATS[0])
    const [lessonStyle, setLessonStyle] = useState<LessonStyle>('interactive')
    const [objectives, setObjectives] = useState('')

    // result
    const [localContent, setLocalContent] = useState(INITIAL_HTML)
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
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
            toast.error('Укажите тему урока')
            return
        }
        try {
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Готовим план урока…</p></div>')
            setEditMode(false)
            setMobileTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'lessonPlan',
                params: {
                    userHash,
                    subject,
                    topic,
                    level: `${level} Класс`,
                    duration,
                    lessonType,
                    workFormat,
                    lessonStyle,
                    objectives,
                },
            })
            const resultData = status.result?.content || status.result
            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space:pre-wrap">${finalHtml}</div>`
            }
            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
        } catch (e: any) {
            console.error('Lesson plan generation failed:', e)
            setLocalContent(`<p style="color:#EF4444;padding:24px">Ошибка при генерации: ${e?.message || 'неизвестная'}</p>`)
        }
    }

    const toggleEditMode = async () => {
        if (!editMode) {
            setEditMode(true)
            return
        }

        const iframeDoc = iframeRef.current?.contentDocument
        let editedBodyHtml = iframeDoc?.body?.innerHTML ?? null
        let fullHtml = localContent

        if (editedBodyHtml !== null) {
            editedBodyHtml = editedBodyHtml
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
                .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')

            const textOnly = editedBodyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
            if (!textOnly) {
                toast.error('Пустой результат не сохранён')
                return
            }

            const hasBody = /<body[^>]*>[\s\S]*<\/body>/i.test(localContent)
            if (hasBody) {
                fullHtml = localContent.replace(
                    /<body([^>]*)>[\s\S]*<\/body>/i,
                    (_, bodyAttrs) => `<body${bodyAttrs}>${editedBodyHtml}</body>`,
                )
            } else {
                const headMatch = localContent.match(/<head[\s\S]*?<\/head>/i)
                const headFromIframe = (iframeDoc?.head?.innerHTML || '').replace(/<script[\s\S]*?<\/script>/gi, '')
                const head = headMatch ? headMatch[0] : `<head><meta charset="UTF-8">${headFromIframe}</head>`
                fullHtml = `<!DOCTYPE html><html lang="ru">${head}<body>${editedBodyHtml}</body></html>`
            }
        }

        if (activeGenerationId) {
            setIsSaving(true)
            try {
                await apiClient.patch(`/generate/${activeGenerationId}`, { outputData: { content: fullHtml } })
                lastSrcDocRef.current = `edit|${fullHtml}`
                setLocalContent(fullHtml)
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
            lastSrcDocRef.current = `edit|${fullHtml}`
            setLocalContent(fullHtml)
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
    }, [topic, isGenerating, subject, level, duration, objectives])

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
                            <ClipboardList className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">План урока</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Структура урока по ФГОС · готов за ~40 секунд</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Subject */}
                        <div data-tour="subject">
                            <Input
                                label="ПРЕДМЕТ"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Биология, Математика, История…"
                            />
                        </div>

                        {/* Topic */}
                        <div data-tour="topic">
                            <Input
                                label="ТЕМА УРОКА"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="напр. Реформы Петра I"
                                hint="Главная тема, по которой стройте план"
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
                            <div className="flex gap-1.5 flex-wrap">
                                {LEVELS.map(l => (
                                    <ChipButton key={l} active={level === l} onClick={() => setLevel(l)}>
                                        {l}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Duration chips */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Длительность</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {DURATIONS.map(d => (
                                    <ChipButton key={d.value} active={duration === d.value} onClick={() => setDuration(d.value)}>
                                        {d.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Тип урока */}
                        <Select
                            label="ТИП УРОКА"
                            value={lessonType}
                            onChange={e => setLessonType(e.target.value)}
                            options={LESSON_TYPES.map(t => ({ value: t, label: t }))}
                        />

                        {/* Формат работы */}
                        <Select
                            label="ФОРМАТ РАБОТЫ"
                            value={workFormat}
                            onChange={e => setWorkFormat(e.target.value)}
                            options={WORK_FORMATS.map(f => ({ value: f, label: f }))}
                        />

                        {/* Стиль */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Стиль урока</label>
                            <div className="flex flex-col gap-2">
                                {([
                                    { id: 'interactive' as LessonStyle, label: 'Интерактивный' },
                                    { id: 'lecture'     as LessonStyle, label: 'Лекция' },
                                ] as const).map(s => (
                                    <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                                        <input type="radio" name="lessonStyle" value={s.id}
                                            checked={lessonStyle === s.id}
                                            onChange={() => setLessonStyle(s.id)}
                                            className="w-4 h-4 accent-brand-500"
                                        />
                                        <span className="text-[13px] text-ink-700">{s.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Objectives textarea */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Цели урока (необязательно)</label>
                            <textarea
                                value={objectives}
                                onChange={e => setObjectives(e.target.value)}
                                rows={3}
                                placeholder={'2–3 цели, которых хотите достичь'}
                                className="w-full border border-ink-200 rounded-md px-3 py-2.5 text-[14px] bg-surface text-ink-900 font-inherit resize-y min-h-[60px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 transition-colors"
                            />
                            <div className="text-[11px] text-ink-500 mt-1.5">Если оставить пустым — ИИ предложит цели сам</div>
                        </div>

                        <div className="pt-2 border-t border-ink-100">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!topic.trim()}
                                data-tour="generate"
                            >
                                {isGenerating ? 'В процессе…' : 'Сгенерировать'}
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

                        {hasResult && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                    variant={editMode ? 'primary' : 'secondary'}
                                    size="sm"
                                    leftIcon={editMode ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    onClick={toggleEditMode}
                                    loading={isSaving}
                                >
                                    {editMode ? 'Сохранить' : 'Редактировать'}
                                </Button>
                                <Button variant="ghost" size="sm" leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyHtml}>
                                    {copied ? 'Скопировано' : 'Копировать'}
                                </Button>
                                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={generate} disabled={isGenerating}>
                                    Заново
                                </Button>
                                {activeGenerationId && (
                                    <>
                                        <PdfDownloadButton
                                            generationId={activeGenerationId}
                                            filename={`${topic || 'lesson-plan'}.pdf`}
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
                            </div>
                        )}
                    </div>

                    {/* preview body */}
                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-hidden p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Создаём план урока…" accentClassName="bg-brand-500" estimatedSeconds={45} />
                            </div>
                        ) : srcDoc ? (
                            <div className="h-full rounded-lg overflow-hidden bg-white border border-ink-200">
                                <iframe
                                    ref={iframeRef}
                                    srcDoc={srcDoc}
                                    className="w-full h-full bg-white"
                                    title="lesson-plan-preview"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                                    style={editMode ? { boxShadow: 'inset 0 0 0 3px #FF7E58' } : undefined}
                                    onLoad={() => {
                                        const doc = iframeRef.current?.contentDocument
                                        if (doc && editMode) doc.body.contentEditable = 'true'
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-ink-200 rounded-lg bg-surface text-ink-500 min-h-[400px]">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <ClipboardList className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Заполните настройки слева</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появится план с целями, этапами, временными рамками и активностями.
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
