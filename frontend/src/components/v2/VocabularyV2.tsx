'use client'

import { useEffect, useRef, useState } from 'react'
import {
    BookMarked, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
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
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import AssignTaskButton from '@/components/AssignTaskButton'

const LANGUAGES = [
    { value: 'en', label: 'Английский',    flag: '🇬🇧' },
    { value: 'es', label: 'Испанский',     flag: '🇪🇸' },
    { value: 'zh', label: 'Китайский',     flag: '🇨🇳' },
    { value: 'de', label: 'Немецкий',      flag: '🇩🇪' },
    { value: 'fr', label: 'Французский',   flag: '🇫🇷' },
    { value: 'it', label: 'Итальянский',   flag: '🇮🇹' },
    { value: 'ja', label: 'Японский',      flag: '🇯🇵' },
    { value: 'ko', label: 'Корейский',     flag: '🇰🇷' },
    { value: 'pt', label: 'Португальский', flag: '🇵🇹' },
    { value: 'ar', label: 'Арабский',      flag: '🇸🇦' },
    { value: 'ru', label: 'Русский',       flag: '🇷🇺' },
    { value: 'hi', label: 'Хинди',         flag: '🇮🇳' },
    { value: 'tr', label: 'Турецкий',      flag: '🇹🇷' },
    { value: 'vi', label: 'Вьетнамский',   flag: '🇻🇳' },
    { value: 'pl', label: 'Польский',      flag: '🇵🇱' },
    { value: 'he', label: 'Иврит',         flag: '🇮🇱' },
]

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

const TOPIC_PRESETS = ['Еда', 'Спорт', 'Профессии', 'Эмоции']

export default function VocabularyV2() {
    // form
    const [language, setLanguage] = useState('en')
    const [topic, setTopic] = useState('Путешествия')
    const [level, setLevel] = useState<(typeof LEVELS)[number]>('A2')
    const [wordsCount, setWordsCount] = useState(15)
    const [withTranscription, setWithTranscription] = useState(true)
    const [withExample, setWithExample] = useState(true)
    const [withSynonyms, setWithSynonyms] = useState(false)

    // result
    const [localContent, setLocalContent] = useState('')
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent

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
            toast.error('Укажите тему словаря')
            return
        }
        try {
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Генерируем словарь…</p></div>')
            setEditMode(false)
            setMobileTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'vocabulary',
                params: {
                    userHash,
                    topic,
                    language,
                    level,
                    wordsCount,
                    transcription: withTranscription,
                    exampleSentence: withExample,
                    antonymsSynonyms: withSynonyms,
                },
            })
            const resultData = status.result?.content || status.result
            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space:pre-wrap">${finalHtml}</div>`
            }
            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
        } catch (e: any) {
            console.error('Vocabulary generation failed:', e)
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
    }, [topic, isGenerating, language, level, wordsCount, withTranscription, withExample, withSynonyms])

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
                            style={{ background: '#ECFDF5', color: '#047857' }}
                        >
                            <BookMarked className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Словарь</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Тематический словарь на 10 языков · ~25 секунд</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Language select */}
                        <div data-tour="language">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Язык</label>
                            <div className="relative">
                                <select
                                    value={language}
                                    onChange={e => setLanguage(e.target.value)}
                                    className="w-full h-10 pl-10 pr-9 appearance-none rounded-lg border border-ink-200 text-[13px] font-medium text-ink-900 bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/10 transition-all cursor-pointer"
                                >
                                    {LANGUAGES.map(l => (
                                        <option key={l.value} value={l.value}>{l.flag} {l.label}</option>
                                    ))}
                                </select>
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none leading-none">
                                    {LANGUAGES.find(l => l.value === language)?.flag}
                                </span>
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none w-2 h-2"
                                    style={{ borderRight: '1.5px solid var(--ink-400)', borderBottom: '1.5px solid var(--ink-400)', transform: 'translateY(-65%) rotate(45deg)' }} />
                            </div>
                        </div>

                        {/* Topic */}
                        <div data-tour="topic">
                            <Input
                                label="ТЕМА СЛОВАРЯ"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Путешествия"
                                hint="Слова будут подобраны по теме"
                            />
                            <div className="flex gap-1.5 flex-wrap mt-2.5">
                                {TOPIC_PRESETS.map(p => (
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
                        </div>

                        {/* Level chips */}
                        <div data-tour="level">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Уровень CEFR</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {LEVELS.map(l => (
                                    <ChipButton key={l} active={level === l} onClick={() => setLevel(l)}>
                                        {l}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Words count slider */}
                        <div data-tour="count">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Количество слов
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={10} max={50}
                                    value={wordsCount}
                                    onChange={e => setWordsCount(Number(e.target.value))}
                                    className="flex-1 accent-brand-500"
                                />
                                <div className="min-w-[36px] text-center bg-brand-50 text-brand-700 px-2.5 py-1 rounded-sm font-bold text-[13px] tnum">
                                    {wordsCount}
                                </div>
                            </div>
                        </div>

                        {/* Options */}
                        <div data-tour="options">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Включить для каждого слова
                            </label>
                            <div className="flex flex-col gap-2">
                                {([
                                    { key: 'transcription', val: withTranscription, set: setWithTranscription, label: 'Транскрипцию' },
                                    { key: 'example',       val: withExample,       set: setWithExample,       label: 'Пример в предложении' },
                                    { key: 'synonyms',      val: withSynonyms,      set: setWithSynonyms,      label: 'Антонимы и синонимы' },
                                ] as const).map(item => (
                                    <label key={item.key} className="flex items-center gap-2.5 cursor-pointer">
                                        <input type="checkbox" checked={item.val}
                                            onChange={e => item.set(e.target.checked)}
                                            className="w-[18px] h-[18px] accent-brand-500"
                                        />
                                        <span className="text-[13px] text-ink-700">{item.label}</span>
                                    </label>
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
                                            filename={`${topic || 'vocabulary'}.pdf`}
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

                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-hidden p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Генерируем словарь…" accentClassName="bg-brand-500" estimatedSeconds={25} />
                            </div>
                        ) : srcDoc ? (
                            <div className="h-full rounded-lg overflow-hidden bg-white border border-ink-200">
                                <iframe
                                    ref={iframeRef}
                                    srcDoc={srcDoc}
                                    className="w-full h-full bg-white"
                                    title="vocabulary-preview"
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
                                    <BookMarked className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Заполните настройки слева</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появится таблица слов с переводами, транскрипцией и примерами.
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
