'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Presentation as PresentationIcon, FileDown, Copy, Check, RefreshCw, Loader2, Eye, Wand2, Users, Compass, Edit3,
} from 'lucide-react'
import PresentationSlideEditor, { type PresentationData as SlideEditorData } from '@/components/v2/PresentationSlideEditor'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { apiClient } from '@/lib/api/client'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Select } from '@/components/ui/v2/Select'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Tabs } from '@/components/ui/v2/Tabs'
import GenerationProgress from '@/components/workspace/GenerationProgress'
import AssignTaskButton from '@/components/AssignTaskButton'

/**
 * Презентации V2 — упрощённый просмотрщик.
 *
 * UI:
 *   ┌─────────────────────────────┬─────────────────────────────┐
 *   │ Левая колонка — форма       │ Правая — iframe-просмотр    │
 *   │  • Тема                     │  + кнопки PDF / PPTX        │
 *   │  • Тезисы                   │  + Назначить классу         │
 *   │  • Кол-во слайдов           │                             │
 *   │  • Аудитория                │                             │
 *   │  • Стиль (4 шаблона)        │                             │
 *   │  • Цветовая тема (5)        │                             │
 *   │  • Формат экспорта          │                             │
 *   │  • [Создать презентацию]    │                             │
 *   └─────────────────────────────┴─────────────────────────────┘
 *
 * Бэк возвращает outputData.content — HTML с встроенным просмотрщиком слайдов
 * (← →, Space, keyboard nav, MathJax). Мы только показываем его в iframe.
 *
 * Редактора слайдов больше нет (PPT/PDF в офисных программах редактируется).
 */

const STYLES = [
    { value: 'modern',     label: 'Современный' },
    { value: 'academic',   label: 'Академический' },
    { value: 'creative',   label: 'Креативный' },
    { value: 'corporate',  label: 'Корпоративный' },
] as const
type StyleKey = (typeof STYLES)[number]['value']

const COLORS = [
    { value: 'indigo',  label: 'Математика / IT',     hex: '#4F46E5' },
    { value: 'emerald', label: 'Биология',            hex: '#10B981' },
    { value: 'violet',  label: 'Гуманитарные',        hex: '#8B5CF6' },
    { value: 'blue',    label: 'Физика',              hex: '#2563EB' },
    { value: 'slate',   label: 'Универсальная',       hex: '#1E293B' },
] as const
type ColorKey = (typeof COLORS)[number]['value']

const AUDIENCES = [
    { value: 'Школьники',  backend: 'students' },
    { value: 'Студенты',   backend: 'university' },
    { value: 'Учителя',    backend: 'teachers' },
    { value: 'Родители',   backend: 'parents' },
    { value: 'Коллеги',    backend: 'colleagues' },
] as const

export default function PresentationV2() {
    // form
    const [topic, setTopic] = useState('')
    const [thesis, setThesis] = useState('')
    const [slidesCount, setSlidesCount] = useState(12)
    const [audience, setAudience] = useState<typeof AUDIENCES[number]['value']>('Школьники')
    const [style, setStyle] = useState<StyleKey>('modern')
    const [color, setColor] = useState<ColorKey>('indigo')
    // result
    const [presentationId, setPresentationId] = useState<string | null>(null)
    const [content, setContent] = useState<string | null>(null)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [pptxUrl, setPptxUrl] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string>('')
    // structured data for editor
    const [presentationData, setPresentationData] = useState<SlideEditorData | null>(null)
    const [editing, setEditing] = useState(false)
    const [savingEdit, setSavingEdit] = useState(false)

    const { generate: startGeneration, pollStatus, isGenerating } = useGenerations()
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [copied, setCopied] = useState(false)

    const hasResult = !!content && !isGenerating

    const generate = async () => {
        if (!topic.trim()) { toast.error('Укажите тему презентации'); return }
        setErrorMsg('')
        setContent(null)
        setPdfUrl(null)
        setPptxUrl(null)
        setPresentationData(null)
        setEditing(false)
        setMobileTab('preview')

        try {
            const backendAudience = AUDIENCES.find(a => a.value === audience)?.backend ?? 'students'
            const params = {
                topic: topic.trim(),
                text: thesis.trim() || undefined,
                slidesCount,
                style,
                color,
                targetAudience: backendAudience,
            }
            const requestId = await startGeneration({ type: 'presentation', params })
            if (!requestId) throw new Error('Не удалось создать запрос')
            setPresentationId(requestId)

            const status = await pollStatus(requestId, 300)
            const r = status.result

            // pollStatus отдаёт `outputData` из БД, но иногда бэк/контроллер
            // оборачивает его дополнительным слоем — пробуем все возможные пути.
            // `html` — fallback для старых генераций, где поле называлось иначе.
            const candidates = [
                r?.content,
                r?.html,
                r?.outputData?.content,
                r?.outputData?.html,
                r?.result?.content,
                r?.result?.html,
                r?.data?.content,
            ]
            // Принимаем любую достаточно длинную строку — HTML может не начинаться
            // с <!DOCTYPE если шаблон рендерится без декларации.
            const html = candidates.find(c => typeof c === 'string' && c.length > 100)

            // pdfUrl / pptxUrl тоже могут быть на разных уровнях.
            const pdfUrlFound = r?.pdfUrl ?? r?.outputData?.pdfUrl ?? r?.result?.pdfUrl ?? r?.exportUrl ?? null
            const pptxUrlFound = r?.pptxUrl ?? r?.outputData?.pptxUrl ?? r?.result?.pptxUrl ?? null

            if (!html) {
                // Диагностика: логируем структуру r чтобы понять откуда идёт фолбэк
                console.warn('[PresentationV2] html not found. r keys:', Object.keys(r ?? {}),
                    '| candidates types/lengths:', candidates.map(c =>
                        c == null ? 'null' : typeof c === 'string' ? `str(${c.length})` : typeof c
                    ),
                    '| pptxUrlFound:', pptxUrlFound,
                )
            }

            // Структурные данные для редактора (если есть)
            const pdata =
                r?.presentationData ??
                r?.outputData?.presentationData ??
                r?.result?.presentationData ??
                null
            if (pdata && Array.isArray(pdata.slides) && pdata.slides.length > 0) {
                setPresentationData(pdata as SlideEditorData)
            }

            if (html) {
                setContent(html)
                setPdfUrl(pdfUrlFound)
                setPptxUrl(pptxUrlFound)
            } else if (pptxUrlFound || pdfUrlFound) {
                // HTML не пришёл, но файлы есть — показываем минимальный fallback
                setContent(`
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{margin:0;padding:40px;font-family:Inter,system-ui,sans-serif;background:#FAFAFA;color:#0F172A;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.box{max-width:480px}
h2{font-size:22px;margin:0 0 12px}
p{color:#475569;margin:0 0 24px;line-height:1.5}
a{display:inline-block;background:#FF7E58;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;margin:4px}
</style></head><body><div class="box">
<h2>Презентация готова 🎉</h2>
<p>Предпросмотр недоступен, но вы можете скачать файл.</p>
${pptxUrlFound ? `<a href="${pptxUrlFound}" target="_blank">Скачать PPTX</a>` : ''}
</div></body></html>`)
                setPdfUrl(pdfUrlFound)
                setPptxUrl(pptxUrlFound)
            } else {
                // Полное падение — логируем что пришло, чтобы было понятно
                console.error('Presentation result without content/files:', r)
                const reason = r?.error || r?.errorMessage || 'формат ответа не распознан'
                setErrorMsg(`Презентация сгенерирована, но файл не получен (${reason}). Попробуйте ещё раз.`)
                toast.error('Что-то пошло не так с рендерингом')
            }
        } catch (e: any) {
            const msg = e?.message || 'неизвестная ошибка'
            setErrorMsg(msg)
            toast.error(msg)
        }
    }

    // Cmd/Ctrl + Enter
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
    }, [topic, isGenerating])

    const downloadFile = async (format: 'pdf' | 'pptx') => {
        if (!presentationId) return
        // Всегда качаем через endpoint экспорта (с JWT-авторизацией).
        // window.open без auth-header не работает с /api/files/:hash.
        // Endpoint сам проверяет закешированный файл, при необходимости пересобирает.
        try {
            const res = await apiClient.post(
                `/generate/${presentationId}/presentation/${format}`,
                {},
                { responseType: 'blob' },
            )
            const url = window.URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            a.href = url
            a.download = `${topic || 'presentation'}.${format}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (e: any) {
            toast.error(`Не удалось скачать ${format.toUpperCase()}: ${e?.message || ''}`)
        }
    }

    const saveEdits = async (next: SlideEditorData) => {
        if (!presentationId) {
            toast.error('Нет presentationId — нечего сохранять')
            return
        }
        setSavingEdit(true)
        try {
            const res = await apiClient.patch(`/generate/${presentationId}`, {
                presentationData: next,
            })
            const newOutput = res?.data?.outputData ?? res?.data?.result ?? {}
            const newHtml = newOutput.content ?? newOutput.html
            if (newHtml) setContent(newHtml)
            setPresentationData(next)
            setEditing(false)
            // Сбрасываем кэшированные URL'ы — backend их обнулил, перескачивание соберёт заново.
            setPdfUrl(null)
            setPptxUrl(null)
            toast.success('Презентация обновлена')
        } catch (e: any) {
            const resp = e?.response?.data
            const msg = (Array.isArray(resp?.message) ? resp.message.join('; ') : resp?.message) || e?.message || 'Не удалось сохранить'
            console.error('[PresentationV2] saveEdits failed:', { status: e?.response?.status, data: resp, error: e })
            toast.error(`Не удалось сохранить: ${msg}`)
        } finally {
            setSavingEdit(false)
        }
    }

    const copyHtml = async () => {
        if (!content) return
        try {
            await navigator.clipboard.writeText(content)
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
                        { id: 'config',  label: 'Параметры',     icon: <Wand2 className="w-4 h-4" /> },
                        { id: 'preview', label: 'Предпросмотр',  icon: <Eye className="w-4 h-4" /> },
                    ]}
                    active={mobileTab}
                    onChange={(k) => setMobileTab(k as any)}
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-6 max-md:p-3 max-lg:grid-cols-1">
                {/* LEFT: params */}
                <Card data-tour="hero" padding="lg" className={`col-span-4 max-lg:col-span-1 h-fit ${mobileTab === 'config' ? '' : 'max-lg:hidden'}`}>
                    <div className="flex items-center gap-2 mb-5">
                        <IconTile color="success" size="md"><PresentationIcon className="w-[18px] h-[18px]" /></IconTile>
                        <div>
                            <h2 className="font-display font-bold text-[16px] text-ink-900">Презентация</h2>
                            <p className="text-[11px] text-ink-500">PDF · ~60 секунд</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div data-tour="topic">
                        <Input
                            label="Тема презентации *"
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            placeholder="Эволюция животного мира"
                            hint="Главная тема или название"
                        />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">
                                Тезисы или текст
                            </label>
                            <textarea
                                value={thesis}
                                onChange={e => setThesis(e.target.value)}
                                rows={3}
                                placeholder="Происхождение и развитие животных от простейших до млекопитающих"
                                className="w-full p-3 rounded-md border border-ink-200 text-[14px] bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-none"
                            />
                        </div>

                        <div data-tour="style">
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">
                                Количество слайдов: <span className="text-brand-600 tnum">{slidesCount}</span>
                            </label>
                            <input
                                type="range"
                                min={5} max={24}
                                value={slidesCount}
                                onChange={e => setSlidesCount(Number(e.target.value))}
                                className="w-full accent-brand-500"
                            />
                            <div className="flex justify-between text-[10px] text-ink-400 tnum mt-1">
                                <span>5</span><span>12</span><span>24</span>
                            </div>
                        </div>

                        <Select
                            label="Аудитория"
                            value={audience}
                            onChange={e => setAudience(e.target.value as any)}
                            options={AUDIENCES.map(a => ({ value: a.value, label: a.value }))}
                        />

                        {/* Style */}
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">Стиль</label>
                            <Select
                                value={style}
                                onChange={e => setStyle(e.target.value as StyleKey)}
                                options={STYLES.map(s => ({ value: s.value, label: s.label }))}
                            />
                        </div>

                        {/* Color swatches */}
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">Цветовая тема</label>
                            <div className="flex gap-2 flex-wrap">
                                {COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setColor(c.value)}
                                        title={c.label}
                                        className={`w-14 h-14 rounded-md transition-all relative ${
                                            color === c.value
                                                ? 'ring-2 ring-offset-2 ring-brand-500 scale-95'
                                                : 'hover:scale-105 ring-1 ring-ink-200'
                                        }`}
                                        style={{ background: c.hex }}
                                    >
                                        {color === c.value && (
                                            <Check className="w-5 h-5 text-white absolute inset-0 m-auto" strokeWidth={3} />
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className="text-[11px] text-ink-500 mt-1.5">
                                {COLORS.find(c => c.value === color)?.label}
                            </div>
                        </div>

                        {/* Generate button */}
                        <div data-tour="generate" className="pt-2 border-t border-ink-100">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!topic.trim() || isGenerating}
                            >
                                Создать презентацию
                            </Button>
                            <p className="text-center text-[11px] text-ink-400 mt-2">
                                ⌘/Ctrl + Enter — быстрый запуск
                            </p>
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card data-tour="preview" padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden ${mobileTab === 'preview' ? '' : 'max-lg:hidden'}`}>
                    {/* Preview toolbar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Создаём презентацию…</>
                            ) : hasResult ? (
                                <><Eye className="w-4 h-4" /> Готовая презентация</>
                            ) : (
                                <><Eye className="w-4 h-4 text-ink-400" /> Готов к работе</>
                            )}
                            {hasResult && <Badge variant="success">готово</Badge>}
                        </div>

                        <div className="flex-1" />

                        {hasResult && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {presentationData && !editing && (
                                    <Button variant="secondary" size="sm" leftIcon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => {
                                        console.log('[PresentationV2] Edit clicked. presentationData slides:', presentationData?.slides?.length)
                                        setEditing(true)
                                    }}>
                                        Редактировать
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyHtml} disabled={editing}>
                                    {copied ? 'Скопировано' : 'HTML'}
                                </Button>
                                <Button variant="ghost" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={generate} disabled={isGenerating || editing}>
                                    Заново
                                </Button>
                                <Button variant="primary" size="sm" leftIcon={<FileDown className="w-3.5 h-3.5" />} onClick={() => downloadFile('pdf')} disabled={editing}>
                                    PDF
                                </Button>
                                {presentationId && (
                                    <AssignTaskButton
                                        generationId={presentationId}
                                        topic={topic}
                                        label="Назначить"
                                        className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-md transition-colors"
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Preview area */}
                    <div className="flex-1 min-h-0 bg-ink-100 overflow-hidden">
                        {isGenerating ? (
                            <div className="h-full p-6 flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Создаём презентацию…" accentClassName="bg-brand-500" estimatedSeconds={60} />
                            </div>
                        ) : editing && presentationData ? (
                            <div className="h-full bg-surface">
                                <PresentationSlideEditor
                                    initialData={presentationData}
                                    saving={savingEdit}
                                    onCancel={() => setEditing(false)}
                                    onSave={saveEdits}
                                />
                            </div>
                        ) : content ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={content}
                                className="w-full h-full bg-white"
                                title="presentation-preview"
                                sandbox="allow-scripts allow-same-origin allow-forms"
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center text-center px-8">
                                <div>
                                    <IconTile color="success" size="lg" className="mx-auto mb-4">
                                        <PresentationIcon className="w-6 h-6" />
                                    </IconTile>
                                    <h3 className="font-display font-bold text-[18px] text-ink-900 mb-1">Заполните настройки слева</h3>
                                    <p className="text-[13px] text-ink-500 max-w-[360px] mx-auto">
                                        После генерации здесь появится презентация — можно листать стрелками ← → или скачать.
                                        {errorMsg && <span className="block text-danger-600 mt-2">{errorMsg}</span>}
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
