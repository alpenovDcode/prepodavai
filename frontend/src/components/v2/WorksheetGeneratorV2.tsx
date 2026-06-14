'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    PenTool, Copy, Check, RefreshCw, Loader2, Edit3, Eye, Save, Wand2,
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
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import AssignTaskButton from '@/components/AssignTaskButton'

const INITIAL_HTML = '<div style="padding:24px;color:#64748B;text-align:center"><p>Заполни форму слева и нажми «Создать рабочий лист»</p></div>'

export default function WorksheetGeneratorV2() {
    const router = useRouter()

    // form
    const [topic, setTopic] = useState('')
    const [subject, setSubject] = useState('')
    const [level, setLevel] = useState('Средняя школа')
    const [questionsCount, setQuestionsCount] = useState(10)
    const [preferences, setPreferences] = useState('')

    // result
    const [localContent, setLocalContent] = useState(INITIAL_HTML)
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && localContent !== INITIAL_HTML && !localContent.startsWith('<p>Генерируем')

    // mobile tab switch
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
            setLocalContent('<div style="padding:40px;text-align:center;color:#FF7E58"><p>Генерируем рабочий лист…</p></div>')
            setEditMode(false)
            setMobileTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'worksheet',
                params: { userHash, subject, topic, level, questionsCount, preferences, format: 'HTML' },
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
                    <div className="flex items-center gap-2 mb-5">
                        <IconTile color="brand" size="md"><PenTool className="w-[18px] h-[18px]" /></IconTile>
                        <h2 className="font-display font-bold text-[16px] text-ink-900">Параметры</h2>
                    </div>

                    <div className="flex flex-col gap-4">
                        <Input
                            label="Тема урока *"
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            placeholder="Тригонометрические уравнения"
                        />
                        <Input
                            label="Предмет"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            placeholder="Математика"
                        />
                        <Select
                            label="Уровень / класс"
                            value={level}
                            onChange={e => setLevel(e.target.value)}
                            options={[
                                { value: 'Начальная школа', label: 'Начальная школа' },
                                { value: 'Средняя школа',   label: 'Средняя школа' },
                                { value: 'Старшая школа',   label: 'Старшая школа' },
                                { value: '5 класс', label: '5 класс' },
                                { value: '6 класс', label: '6 класс' },
                                { value: '7 класс', label: '7 класс' },
                                { value: '8 класс', label: '8 класс' },
                                { value: '9 класс', label: '9 класс' },
                                { value: '10 класс', label: '10 класс' },
                                { value: '11 класс', label: '11 класс' },
                                { value: 'ОГЭ', label: 'ОГЭ' },
                                { value: 'ЕГЭ', label: 'ЕГЭ' },
                            ]}
                        />
                        <div>
                            <label className="block text-[13px] font-semibold text-ink-700 mb-1.5">
                                Количество заданий: <span className="text-brand-600 tnum">{questionsCount}</span>
                            </label>
                            <input
                                type="range"
                                min={3} max={25}
                                value={questionsCount}
                                onChange={e => setQuestionsCount(Number(e.target.value))}
                                className="w-full accent-brand-500"
                            />
                            <div className="flex justify-between text-[10px] text-ink-400 tnum mt-1">
                                <span>3</span><span>15</span><span>25</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-semibold text-ink-700 mb-1.5">
                                Пожелания
                            </label>
                            <textarea
                                value={preferences}
                                onChange={e => setPreferences(e.target.value)}
                                rows={3}
                                placeholder="Сделай с уклоном на практику, добавь графики…"
                                className="w-full p-3 rounded-md border border-ink-200 text-[14px] bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-none"
                            />
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
                            >
                                Создать рабочий лист
                            </Button>
                            <div className="text-center text-[11px] text-ink-500 mt-2 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                Обычно занимает ~30 секунд
                            </div>
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden max-lg:${mobileTab === 'preview' ? '' : 'hidden'}`}>
                    {/* Preview toolbar */}
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

                        {/* Actions */}
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
                                    {copied ? 'Скопировано' : 'HTML'}
                                </Button>
                                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={generate} disabled={isGenerating}>
                                    Заново
                                </Button>
                                {activeGenerationId && (
                                    <>
                                        <PdfDownloadButton
                                            generationId={activeGenerationId}
                                            filename={`${topic || 'worksheet'}.pdf`}
                                            hasAnswers
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-md transition-colors"
                                        />
                                        <AssignTaskButton
                                            generationId={activeGenerationId}
                                            topic={topic}
                                            label="Назначить классу"
                                            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Preview area */}
                    <div className="flex-1 min-h-0 bg-ink-100 overflow-hidden">
                        {isGenerating ? (
                            <div className="h-full p-6 flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Создаём рабочий лист…" accentClassName="bg-brand-500" />
                            </div>
                        ) : srcDoc ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={srcDoc}
                                className="w-full h-full bg-white"
                                title="worksheet-preview"
                                sandbox="allow-scripts allow-same-origin allow-forms"
                                style={editMode ? { boxShadow: 'inset 0 0 0 3px #FF7E58' } : undefined}
                                onLoad={() => {
                                    const doc = iframeRef.current?.contentDocument
                                    if (doc && editMode) doc.body.contentEditable = 'true'
                                }}
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center text-center px-8">
                                <div>
                                    <IconTile color="brand" size="lg" className="mx-auto mb-4">
                                        <PenTool className="w-6 h-6" />
                                    </IconTile>
                                    <h3 className="font-display font-bold text-[18px] text-ink-900 mb-1">Готов к работе</h3>
                                    <p className="text-[13px] text-ink-500 max-w-[320px] mx-auto">
                                        Заполните параметры слева, нажмите «Создать» — рабочий лист появится здесь.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}
