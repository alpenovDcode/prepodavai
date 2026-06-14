'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
    FileText, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
    Sparkles, Settings2, KeyRound,
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
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import AssignTaskButton from '@/components/AssignTaskButton'

const SUBJECTS = [
    'Математика', 'Физика', 'Химия', 'Биология', 'История',
    'Литература', 'Английский язык', 'География', 'Информатика', 'Обществознание',
]

const LEVELS = [
    { label: '5–6 класс', value: '5-6 класс' },
    { label: '7–8 класс', value: '7-8 класс' },
    { label: '9–11 класс', value: '9-11 класс' },
    { label: 'Подготовка к ЕГЭ', value: 'ЕГЭ' },
]

const TOPIC_PRESETS_BY_SUBJECT: Record<string, string[]> = {
    'Математика': ['Уравнения', 'Графики функций', 'Векторы', 'Стереометрия'],
    'Физика': ['Законы Ньютона', 'Электромагнетизм', 'Оптика', 'Термодинамика'],
    'Химия': ['Кислоты и основания', 'Органика', 'Электролиз', 'Периодическая таблица'],
    'Биология': ['Митоз', 'Фотосинтез', 'ДНК', 'Экосистема'],
    'История': ['Реформы Петра I', 'Великая Отечественная', 'Революция 1917', 'Холодная война'],
    'Литература': ['Лирика Пушкина', '«Война и мир»', 'Серебряный век', 'Достоевский'],
    'Английский язык': ['Past Simple', 'Conditionals', 'Phrasal verbs', 'Present Perfect'],
    'География': ['Климат России', 'Природные зоны', 'Население мира', 'Гидросфера'],
    'Информатика': ['Алгоритмы', 'Системы счисления', 'Логика', 'SQL'],
    'Обществознание': ['Конституция РФ', 'Социализация', 'Права человека', 'Экономика'],
}

const DEFAULT_PRESETS = ['Уравнения', 'Графики функций', 'Векторы', 'Стереометрия']

const INITIAL_HTML = ''

export default function WorksheetGeneratorV2(): React.ReactElement {
    // form
    const [topic, setTopic] = useState('')
    const [subject, setSubject] = useState('Математика')
    const [level, setLevel] = useState(LEVELS[2].value)
    const [questionsCount, setQuestionsCount] = useState(10)

    // result
    const [localContent, setLocalContent] = useState(INITIAL_HTML)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && !localContent.startsWith('<div style="padding:40px')

    // mobile tab switch
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')
    // canvas tab: preview / answers / edit
    const [canvasTab, setCanvasTab] = useState<'preview' | 'answers' | 'edit'>('preview')

    useEffect(() => {
        if (!localContent) return
        const isEdit = canvasTab === 'edit'
        const key = `${isEdit ? 'edit' : 'view'}|${localContent}`
        if (key === lastSrcDocRef.current) return
        lastSrcDocRef.current = key
        setSrcDoc(isEdit ? stripMathJaxScripts(localContent) : ensureMathJaxInHtml(localContent))
    }, [localContent, canvasTab])

    const editMode = canvasTab === 'edit'

    const generate = async () => {
        if (!topic.trim()) {
            toast.error('Укажите тему урока')
            return
        }
        try {
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Генерируем рабочий лист…</p></div>')
            setCanvasTab('preview')
            setMobileTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'worksheet',
                params: { userHash, subject, topic, level, questionsCount },
            })
            const resultData = status.result?.content || status.result
            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space:pre-wrap">${finalHtml}</div>`
            }
            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p style="color:#EF4444">Ошибка при генерации: ${e?.message || 'неизвестная'}</p>`)
        }
    }

    const saveEdit = async () => {

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
                setCanvasTab('preview')
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
            setCanvasTab('preview')
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
                {/* LEFT: settings */}
                <Card padding="lg"
                      className={`col-span-4 max-lg:col-span-1 h-fit max-lg:${mobileTab === 'config' ? '' : 'hidden'}`}>
                    {/* tool-hero */}
                    <div className="flex items-center gap-3.5 pb-5 mb-1 border-b border-ink-100" data-tour="hero">
                        <span className="w-11 h-11 rounded-md inline-flex items-center justify-center bg-brand-50 text-brand-600">
                            <FileText className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Рабочий лист</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">PDF с заданиями · готов за ~30 секунд</div>
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
                                label="ТЕМА"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Тригонометрия: формулы приведения"
                                hint="Чем точнее тема — тем точнее задания"
                            />
                            <div className="flex gap-1.5 flex-wrap mt-2.5">
                                {(TOPIC_PRESETS_BY_SUBJECT[subject] ?? DEFAULT_PRESETS).map(p => (
                                    <button key={p} type="button" onClick={() => setTopic(p)}
                                        className="px-2.5 py-1 bg-ink-100 hover:bg-ink-200 border-none rounded-sm text-[12px] text-ink-600 transition-colors">
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Level chip-group */}
                        <div data-tour="level">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Уровень</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {LEVELS.map(l => (
                                    <ChipButton key={l.value} active={level === l.value} onClick={() => setLevel(l.value)}>
                                        {l.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Questions count */}
                        <div data-tour="count">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Количество заданий</label>
                            <div className="flex items-center gap-3">
                                <input type="range" min={5} max={25} value={questionsCount}
                                    onChange={e => setQuestionsCount(Number(e.target.value))}
                                    className="flex-1 accent-brand-500"
                                />
                                <div className="min-w-[36px] text-center bg-brand-50 text-brand-700 px-2.5 py-1 rounded-sm font-bold text-[13px] tnum">
                                    {questionsCount}
                                </div>
                            </div>
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
                            <div className="text-center text-[11px] text-ink-500 mt-2 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                ⌘ + ↵ — горячая клавиша
                            </div>
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden max-lg:${mobileTab === 'preview' ? '' : 'hidden'}`}>
                    {/* Preview toolbar: 3 tabs + actions */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-100 flex-wrap" data-tour="preview-tabs">
                        {/* Tab buttons */}
                        {hasResult && (
                            <div className="flex items-center gap-1">
                                <TabBtn active={canvasTab === 'preview'} onClick={() => setCanvasTab('preview')}>
                                    <Eye className="w-3.5 h-3.5" /> Превью
                                </TabBtn>
                                <TabBtn active={canvasTab === 'answers'} onClick={() => setCanvasTab('answers')}>
                                    <KeyRound className="w-3.5 h-3.5" /> С ответами
                                </TabBtn>
                                <TabBtn active={canvasTab === 'edit'} onClick={() => setCanvasTab('edit')}>
                                    <Edit3 className="w-3.5 h-3.5" /> Редактировать
                                </TabBtn>
                            </div>
                        )}
                        {!hasResult && !isGenerating && (
                            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-500">
                                <Eye className="w-4 h-4" /> Готов к работе
                            </div>
                        )}

                        <div className="flex-1" />

                        {/* Action buttons */}
                        {hasResult && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {canvasTab === 'edit' && (
                                    <Button variant="primary" size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} onClick={saveEdit} loading={isSaving}>
                                        Сохранить
                                    </Button>
                                )}
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
                                            filename={`${topic || 'worksheet'}.pdf`}
                                            hasAnswers={canvasTab === 'answers'}
                                            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-md transition-colors"
                                        />
                                        <AssignTaskButton
                                            generationId={activeGenerationId}
                                            topic={topic}
                                            label="Выдать классу"
                                            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Preview area */}
                    <div className="flex-1 min-h-0 overflow-hidden" data-tour="preview">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Создаём рабочий лист…" accentClassName="bg-brand-500" estimatedSeconds={30} />
                            </div>
                        ) : srcDoc ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={srcDoc}
                                className="w-full h-full bg-white border-0"
                                title="worksheet-preview"
                                sandbox="allow-scripts allow-same-origin allow-forms"
                                style={editMode ? { boxShadow: 'inset 0 0 0 3px #FF7E58' } : undefined}
                                onLoad={() => {
                                    const doc = iframeRef.current?.contentDocument
                                    if (doc && editMode) doc.body.contentEditable = 'true'
                                }}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 text-ink-500">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <FileText className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Готов к работе</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    Введите тему и нажмите «Сгенерировать» — рабочий лист появится здесь.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={['px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
                active ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-surface border-ink-200 text-ink-700 hover:border-brand-300 hover:text-ink-900',
            ].join(' ')}>
            {children}
        </button>
    )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick}
            className={['inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100',
            ].join(' ')}>
            {children}
        </button>
    )
}
