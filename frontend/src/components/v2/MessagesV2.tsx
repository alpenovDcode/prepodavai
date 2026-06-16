'use client'

import { useEffect, useRef, useState } from 'react'
import {
    Mail, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
    Sparkles, Settings2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DOMPurify from 'isomorphic-dompurify'

import { useGenerations } from '@/lib/hooks/useGenerations'
import { apiClient } from '@/lib/api/client'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import AssignTaskButton from '@/components/AssignTaskButton'

const INITIAL_HTML = ''

type OccasionId = 'success' | 'remarks' | 'discipline' | 'meeting' | 'congratulation'
type Tone = 'formal' | 'friendly'

const OCCASIONS: { id: OccasionId; label: string }[] = [
    { id: 'success',       label: 'Успехи' },
    { id: 'remarks',       label: 'Замечания' },
    { id: 'discipline',    label: 'Дисциплина' },
    { id: 'meeting',       label: 'Просьба о встрече' },
    { id: 'congratulation',label: 'Поздравление' },
]

const TONES: { id: Tone; label: string }[] = [
    { id: 'formal',   label: 'Формальный' },
    { id: 'friendly', label: 'Дружелюбный' },
]

const CONTEXT_PLACEHOLDERS: Record<OccasionId, string> = {
    success:        'Например: По математике стабильное «5», улучшилось решение текстовых задач.',
    remarks:        'Например: На последних двух уроках отвлекается, разговаривает с соседом.',
    discipline:     'Например: Сорвал урок — громко разговаривал, не реагировал на замечания учителя.',
    meeting:        'Например: Хочу обсудить успеваемость в третьей четверти. Удобно в пятницу после 17:00.',
    congratulation: 'Например: Занял 1 место на районной олимпиаде по биологии.',
}

type StudentOpt = { id: string; name: string }

export default function MessagesV2() {
    // form
    const [occasionId, setOccasionId] = useState<OccasionId>('success')
    const [students, setStudents] = useState<StudentOpt[]>([])
    const [studentName, setStudentName] = useState('')
    const [context, setContext] = useState('')
    const [tone, setTone] = useState<Tone>('formal')

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

    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    useEffect(() => {
        apiClient.get('/students')
            .then(r => {
                const list: StudentOpt[] = Array.isArray(r.data)
                    ? r.data.map((s: any) => ({ id: s.id, name: s.name }))
                    : []
                setStudents(list)
            })
            .catch(() => { /* без учеников — просто свободный ввод */ })
    }, [])

    useEffect(() => {
        if (!localContent) return
        const key = `${editMode ? 'edit' : 'view'}|${localContent}`
        if (key === lastSrcDocRef.current) return
        lastSrcDocRef.current = key
        setSrcDoc(localContent)
    }, [localContent, editMode])

    const generate = async () => {
        if (!context.trim()) {
            toast.error('Опишите контекст и детали ситуации')
            return
        }
        try {
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Генерируем сообщение…</p></div>')
            setEditMode(false)
            setMobileTab('preview')

            const status = await generateAndWait({
                type: 'message',
                params: {
                    templateId: occasionId,
                    studentName: studentName.trim() || null,
                    context: context.trim(),
                    tone,
                    channel: 'messenger',
                },
            })
            const resultData = status.result?.content || status.result
            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space:pre-wrap">${finalHtml}</div>`
            }
            setLocalContent(finalHtml || '<p>Не удалось сгенерировать сообщение.</p>')
        } catch (e: any) {
            console.error('Message generation failed:', e)
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
            editedBodyHtml = editedBodyHtml.replace(/<script[\s\S]*?<\/script>/gi, '')
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
                fullHtml = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"></head><body>${editedBodyHtml}</body></html>`
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

    const copyText = async () => {
        if (!localContent) return
        try {
            const tmp = document.createElement('div')
            tmp.innerHTML = DOMPurify.sanitize(localContent, { USE_PROFILES: { html: true } })
            const text = (tmp.querySelector('.message-content') as HTMLElement | null)?.innerText
                ?? tmp.innerText
                ?? ''
            await navigator.clipboard.writeText(text.trim())
            setCopied(true)
            toast.success('Текст скопирован')
            setTimeout(() => setCopied(false), 1500)
        } catch { toast.error('Не удалось скопировать') }
    }

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                if (!isGenerating && context.trim()) generate()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [context, isGenerating, occasionId, studentName, tone])

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile tabs */}
            <div className="lg:hidden border-b border-ink-200 bg-surface px-4 pt-2">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'config',  label: 'Параметры',     icon: <Settings2 className="w-4 h-4" /> },
                        { id: 'preview', label: 'Предпросмотр',  icon: <Eye className="w-4 h-4" /> },
                    ]}
                    active={mobileTab}
                    onChange={(k) => setMobileTab(k as any)}
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-6 max-md:p-3 max-lg:grid-cols-1">
                {/* LEFT: settings */}
                <Card padding="lg"
                      className={`col-span-4 max-lg:col-span-1 h-fit ${mobileTab === 'config' ? '' : 'max-lg:hidden'}`}>
                    {/* tool-hero */}
                    <div className="flex items-center gap-3.5 pb-5 mb-1 border-b border-ink-100" data-tour="hero">
                        <span
                            className="w-11 h-11 rounded-md inline-flex items-center justify-center bg-brand-50 text-brand-600"
                        >
                            <Mail className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Сообщение родителям</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Тактичное сообщение по любой ситуации · ~20 сек</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Повод */}
                        <div data-tour="occasion">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Повод
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                                {OCCASIONS.map(o => (
                                    <ChipButton key={o.id} active={occasionId === o.id} onClick={() => setOccasionId(o.id)}>
                                        {o.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Имя ученика */}
                        <div>
                            <Input
                                label="УЧЕНИК"
                                value={studentName}
                                onChange={e => setStudentName(e.target.value)}
                                placeholder={students.length ? 'Выберите из списка или введите имя' : 'Например: Алексей П.'}
                                list="student-list"
                                hint="Необязательно — если пустым, сообщение будет универсальным"
                            />
                            {students.length > 0 && (
                                <datalist id="student-list">
                                    {students.map(s => (
                                        <option key={s.id} value={s.name} />
                                    ))}
                                </datalist>
                            )}
                        </div>

                        {/* Тон */}
                        <div data-tour="tone">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Тон
                            </label>
                            <div className="flex flex-col gap-2">
                                {TONES.map(t => (
                                    <label key={t.id} className="flex items-center gap-2.5 cursor-pointer">
                                        <input type="radio" name="tone" value={t.id}
                                            checked={tone === t.id}
                                            onChange={() => setTone(t.id)}
                                            className="w-4 h-4 accent-brand-500"
                                        />
                                        <span className="text-[13px] text-ink-700">{t.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Детали */}
                        <div data-tour="details">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Детали
                            </label>
                            <textarea
                                value={context}
                                onChange={e => setContext(e.target.value)}
                                placeholder={CONTEXT_PLACEHOLDERS[occasionId]}
                                rows={4}
                                className="w-full border border-ink-200 rounded-md px-3 py-2.5 text-[14px] bg-surface text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors resize-y min-h-[80px]"
                            />
                            <p className="text-[11px] text-ink-500 mt-1.5">
                                Чем подробнее — тем лучше получится сообщение
                            </p>
                        </div>

                        <div className="pt-2 border-t border-ink-100">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!context.trim()}
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
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden ${mobileTab === 'preview' ? '' : 'max-lg:hidden'}`}>
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
{editMode && (
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
                                <Button variant="ghost" size="sm" leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyText}>
                                    {copied ? 'Скопировано' : 'Копировать'}
                                </Button>
                                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={generate} disabled={isGenerating}>
                                    Заново
                                </Button>
                                {activeGenerationId && (
                                    <AssignTaskButton
                                        generationId={activeGenerationId}
                                        topic="Сообщение родителям"
                                        label="Выдать классу"
                                        className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-hidden p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Пишем сообщение…" accentClassName="bg-brand-500" estimatedSeconds={20} />
                            </div>
                        ) : srcDoc ? (
                            <div className="h-full rounded-lg overflow-hidden bg-white border border-ink-200">
                                <iframe
                                    ref={iframeRef}
                                    srcDoc={srcDoc}
                                    className="w-full h-full bg-white"
                                    title="message-preview"
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
                                    <Mail className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Заполните настройки слева</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появится готовый текст сообщения. Можно отредактировать или сразу скопировать.
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
