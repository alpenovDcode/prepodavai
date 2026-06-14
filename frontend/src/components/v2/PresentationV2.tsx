'use client'

import { useEffect, useRef, useState, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    Presentation, Wand2, Sparkles, Settings2, Eye, Edit3, Copy, Check,
    Download, ArrowLeft, RefreshCw, Loader2, Trash2, Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DOMPurify from 'isomorphic-dompurify'

import { useGenerations } from '@/lib/hooks/useGenerations'
import { SlideDocEditor } from '@/components/SlideDocEditor'
import { SlideDoc, SLIDE_THEMES, SlideThemeId } from '@/types/slide-doc'
import { apiClient } from '@/lib/api/client'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Select } from '@/components/ui/v2/Select'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import AssignTaskButton from '@/components/AssignTaskButton'

type ImagesMode = 'ai' | 'unsplash' | 'none'
type ExportFmt = 'pptx' | 'pdf'
type PresentStyle = 'modern' | 'academic' | 'creative' | 'corporate'

const PRESENT_STYLES: { value: PresentStyle; label: string }[] = [
    { value: 'modern',    label: 'Современный' },
    { value: 'academic',  label: 'Академический' },
    { value: 'creative',  label: 'Креативный' },
    { value: 'corporate', label: 'Корпоративный' },
]

const AUDIENCES: { value: string; label: string; backend: 'students' | 'colleagues' | 'parents' | 'general' }[] = [
    { value: 'school',    label: 'Школьники',         backend: 'students' },
    { value: 'students',  label: 'Студенты',          backend: 'students' },
    { value: 'teachers',  label: 'Учителя',           backend: 'colleagues' },
    { value: 'parents',   label: 'Родители',          backend: 'parents' },
    { value: 'general',   label: 'Общая аудитория',   backend: 'general' },
]

const THEME_PRESETS: { id: SlideThemeId; label: string }[] = (Object.keys(SLIDE_THEMES) as SlideThemeId[])
    .map(id => ({ id, label: SLIDE_THEMES[id].label }))

const slidesToDuration = (n: number): string => {
    if (n <= 8) return '5'
    if (n <= 14) return '15'
    if (n <= 22) return '30'
    return '45'
}

interface SlideData {
    id: string
    html: string
    css: string
    js: string
}

const FALLBACK_SLIDE_CSS = `
  body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
  body > * { color: #fff; }
  h1, h2, h3 { font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.4); }
`

function buildSlideSrcDoc(slide: SlideData): string {
    const css = slide.css?.trim() || FALLBACK_SLIDE_CSS
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
${css}
</style>
</head><body>${slide.html}</body></html>`
}

function PresentationV2Inner() {
    // form
    const [topic, setTopic] = useState('Эволюция животного мира')
    const [thesis, setThesis] = useState('Происхождение и развитие животных от простейших до млекопитающих')
    const [slidesCount, setSlidesCount] = useState(12)
    const [audience, setAudience] = useState(AUDIENCES[0].value)
    const [presentStyle, setPresentStyle] = useState<PresentStyle>('modern')
    const [imagesMode, setImagesMode] = useState<ImagesMode>('ai')
    const [exportFmt, setExportFmt] = useState<ExportFmt>('pptx')
    const [themeId, setThemeId] = useState<SlideThemeId>('indigo')

    // result
    const [slideDoc, setSlideDoc] = useState<SlideDoc | null>(null)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [slides, setSlides] = useState<SlideData[]>([])
    const [activeSlideIdx, setActiveSlideIdx] = useState(0)
    const [editorOpen, setEditorOpen] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [copied, setCopied] = useState(false)

    // ui
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    const presentationIdRef = useRef<string | null>(null)
    const { generate: startGeneration, pollStatus, generateAndWait, isGenerating } = useGenerations()
    const searchParams = useSearchParams()

    // Load from session storage when redirected from MaterialViewer (parity with legacy)
    useEffect(() => {
        if (searchParams?.get('loadFromSession') !== '1') return
        try {
            const raw = sessionStorage.getItem('pendingPresentationSlides')
            const title = sessionStorage.getItem('pendingPresentationTitle')
            if (raw) {
                const loaded = JSON.parse(raw)
                if (Array.isArray(loaded) && loaded.length > 0) {
                    setSlides(loaded)
                    setEditorOpen(true)
                    if (title) setTopic(title)
                }
            }
            sessionStorage.removeItem('pendingPresentationSlides')
            sessionStorage.removeItem('pendingPresentationTitle')
        } catch { /* ignore */ }
    }, [searchParams])

    const generate = async () => {
        if (!topic.trim()) {
            toast.error('Укажите тему презентации')
            return
        }
        setErrorMsg('')
        setSlides([])
        setSlideDoc(null)
        setPdfUrl(null)
        setEditMode(false)
        setEditorOpen(false)
        setMobileTab('preview')

        try {
            const backendAudience = AUDIENCES.find(a => a.value === audience)?.backend ?? 'students'
            const fullTopic = thesis.trim() ? `${topic.trim()}\n\nТезисы: ${thesis.trim()}` : topic.trim()

            const params = {
                topic: fullTopic,
                duration: slidesToDuration(slidesCount),
                style: presentStyle,
                targetAudience: backendAudience,
                themeId,
                imagesMode,
            }

            const requestId = await startGeneration({ type: 'presentation', params })
            if (!requestId) throw new Error('Не удалось создать запрос')
            presentationIdRef.current = requestId

            const status = await pollStatus(requestId, 300)
            const r = status.result

            if (r?.slideDoc?.slides?.length > 0) {
                setSlideDoc(r.slideDoc)
                setPdfUrl(r.pdfUrl || null)
                setActiveSlideIdx(0)
                setEditorOpen(true)
                return
            }

            const resultData = r?.slides || r
            let parsed: SlideData[] = []
            if (Array.isArray(resultData) && resultData.length > 0 && resultData[0]?.html) {
                parsed = resultData
            } else if (typeof resultData === 'string') {
                try {
                    const arr = JSON.parse(resultData)
                    if (Array.isArray(arr) && arr[0]?.html) parsed = arr
                } catch { /* ignore */ }
            }

            if (parsed.length > 0) {
                setSlides(parsed)
                setActiveSlideIdx(0)
                setEditorOpen(true)
            } else {
                setErrorMsg('Не удалось получить слайды. Попробуйте ещё раз.')
                toast.error('Не удалось получить слайды')
            }
        } catch (e: any) {
            const msg = e?.message || 'неизвестная ошибка'
            setErrorMsg(`Ошибка: ${msg}`)
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
    }, [topic, thesis, slidesCount, audience, imagesMode, exportFmt, themeId, isGenerating])

    // ---- Slide capture (re-used in legacy-slides path)
    const captureSlideAsImage = useCallback(async (slide: SlideData): Promise<string> => {
        const h2c = (await import('html2canvas')).default
        const W = 1280, H = 720
        const container = document.createElement('div')
        container.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;z-index:-9999;`
        const styleEl = document.createElement('style')
        styleEl.textContent = `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}${slide.css?.trim() || FALLBACK_SLIDE_CSS}`
        container.appendChild(styleEl)
        const tmp = document.createElement('div')
        tmp.innerHTML = DOMPurify.sanitize(slide.html, { FORBID_TAGS: ['script'] })
        tmp.style.cssText = `width:${W}px;height:${H}px;overflow:hidden;`
        container.appendChild(tmp)
        document.body.appendChild(container)
        await new Promise(r => setTimeout(r, 150))
        try {
            const canvas = await h2c(container, {
                width: W, height: H, scale: 1, useCORS: true, allowTaint: true,
                windowWidth: W, windowHeight: H, logging: false, imageTimeout: 5000,
            })
            return canvas.toDataURL('image/jpeg', 0.88)
        } finally { try { document.body.removeChild(container) } catch {} }
    }, [])

    const downloadLegacySlides = async (format: ExportFmt) => {
        if (slides.length === 0) return
        setIsExporting(true)
        try {
            const images = await Promise.all(slides.map(s => captureSlideAsImage(s)))
            if (format === 'pdf') {
                const { jsPDF } = await import('jspdf')
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 167.25] })
                images.forEach((img, i) => {
                    if (i > 0) pdf.addPage([297, 167.25], 'landscape')
                    pdf.addImage(img, 'JPEG', 0, 0, 297, 167.25)
                })
                pdf.save(`${topic || 'presentation'}.pdf`)
            } else {
                const PptxGenJS = (await import('pptxgenjs')).default
                const prs = new PptxGenJS()
                prs.layout = 'LAYOUT_16x9'
                images.forEach(img => {
                    const slide = prs.addSlide()
                    slide.addImage({ data: img, x: 0, y: 0, w: 10, h: 5.625 })
                })
                await prs.writeFile({ fileName: `${topic || 'presentation'}.pptx` })
            }
            toast.success(`Экспортировано в ${format.toUpperCase()}`)
        } catch (e: any) {
            console.error('Export failed', e)
            toast.error(`Ошибка экспорта: ${e?.message || 'неизвестно'}`)
        } finally {
            setIsExporting(false)
        }
    }

    // ── SlideDoc editor exports ────────────────────
    const downloadDocExport = async (format: ExportFmt) => {
        const id = presentationIdRef.current
        if (!id) return
        setIsExporting(true)
        try {
            const res = await apiClient.post(`/generate/${id}/presentation/${format}`, {}, { responseType: 'blob' })
            const blob = res.data as Blob
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${slideDoc?.topic || topic || 'presentation'}.${format}`
            a.click()
            URL.revokeObjectURL(url)
            toast.success(`Скачано: ${format.toUpperCase()}`)
        } catch (e: any) {
            console.error(`${format.toUpperCase()} export failed`, e)
            toast.error(`Ошибка экспорта: ${e?.message || 'неизвестно'}`)
        } finally {
            setIsExporting(false)
        }
    }

    const saveDoc = async (next: SlideDoc) => {
        const id = presentationIdRef.current
        if (!id) return
        await apiClient.patch(`/generate/${id}`, {
            outputData: {
                slideDoc: next, pdfUrl, exportUrl: pdfUrl,
                topic: next.topic, provider: 'Replicate', mode: 'presentation',
            },
        })
        setSlideDoc(next)
    }

    const regenerateImage = async (_idx: number, prompt: string): Promise<string | null> => {
        try {
            const status = await generateAndWait({
                type: 'image',
                params: { prompt, style: 'illustration', model: 'black-forest-labs/flux-2-pro' },
            })
            const r = status.result
            const imageData: string =
                (typeof r === 'string' ? r : null) ?? r?.content ?? r?.imageUrl ?? ''
            if (imageData && (imageData.startsWith('http') || imageData.startsWith('data:image'))) return imageData
            toast.error('Модель вернула пустой ответ')
            return null
        } catch (e: any) {
            toast.error(`Не удалось создать картинку: ${e?.message || 'неизвестно'}`)
            return null
        }
    }

    const copyTopic = async () => {
        try {
            await navigator.clipboard.writeText(`${topic}\n\n${thesis}`)
            setCopied(true)
            toast.success('Скопировано')
            setTimeout(() => setCopied(false), 1500)
        } catch { toast.error('Не удалось скопировать') }
    }

    const presentationId = presentationIdRef.current

    // ───── Full-screen SlideDoc editor view ─────
    if (editorOpen && slideDoc) {
        return (
            <div className="flex-1 min-h-0 flex flex-col bg-ink-50 overflow-hidden">
                <div className="h-14 bg-surface border-b border-ink-200 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <button
                            onClick={() => { setEditorOpen(false); setSlideDoc(null) }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-sm border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors flex-shrink-0"
                            aria-label="Назад к настройкам"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="overflow-hidden">
                            <h1 className="font-display font-bold text-[15px] text-ink-900 leading-tight truncate">
                                {slideDoc.topic || 'Презентация'}
                            </h1>
                            <p className="text-[11px] text-ink-500">
                                {slideDoc.slides.length} слайдов · {SLIDE_THEMES[slideDoc.themeId]?.label}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                            variant="secondary" size="sm"
                            leftIcon={isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            onClick={() => downloadDocExport('pdf')} disabled={isExporting || !presentationId}
                        >PDF</Button>
                        <Button
                            variant="secondary" size="sm"
                            leftIcon={isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            onClick={() => downloadDocExport('pptx')} disabled={isExporting || !presentationId}
                        >PPTX</Button>
                        <Button
                            variant="ghost" size="sm"
                            leftIcon={isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            onClick={generate} disabled={isGenerating}
                        >Заново</Button>
                        {presentationId && !isGenerating && (
                            <AssignTaskButton
                                generationId={presentationId}
                                topic={slideDoc.topic}
                                label="Выдать классу"
                                className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                            />
                        )}
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <SlideDocEditor
                        initialDoc={slideDoc}
                        onSave={saveDoc}
                        onRegenerateImage={regenerateImage}
                    />
                </div>
            </div>
        )
    }

    // ───── Legacy slides[] editor view (упрощённая V2-сетка миниатюр) ─────
    if (editorOpen && slides.length > 0) {
        const activeSlide = slides[activeSlideIdx]
        return (
            <div className="flex-1 min-h-0 flex flex-col bg-ink-50 overflow-hidden">
                <div className="h-14 bg-surface border-b border-ink-200 flex items-center justify-between px-4 flex-shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <button
                            onClick={() => { setEditorOpen(false); setSlides([]) }}
                            className="w-8 h-8 inline-flex items-center justify-center rounded-sm border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 hover:text-ink-900 transition-colors flex-shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="overflow-hidden">
                            <h1 className="font-display font-bold text-[15px] text-ink-900 leading-tight truncate">
                                {topic || 'Презентация'}
                            </h1>
                            <p className="text-[11px] text-ink-500">{slides.length} слайдов</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="secondary" size="sm"
                            leftIcon={isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            onClick={() => downloadLegacySlides('pdf')} disabled={isExporting}
                        >PDF</Button>
                        <Button
                            variant="secondary" size="sm"
                            leftIcon={isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            onClick={() => downloadLegacySlides('pptx')} disabled={isExporting}
                        >PPTX</Button>
                        <Button
                            variant="ghost" size="sm"
                            leftIcon={isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            onClick={generate} disabled={isGenerating}
                        >Заново</Button>
                        {presentationId && !isGenerating && (
                            <AssignTaskButton
                                generationId={presentationId}
                                topic={topic}
                                label="Выдать"
                                className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                            />
                        )}
                    </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
                    {/* Thumbnails */}
                    <div className="w-full lg:w-[220px] lg:h-full lg:border-r border-ink-200 bg-surface flex flex-col flex-shrink-0">
                        <div className="px-3 py-2.5 border-b border-ink-100 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">Слайды</span>
                            <span className="text-[11px] text-ink-400 tnum">{slides.length}</span>
                        </div>
                        <div className="flex-1 overflow-auto p-3 grid grid-cols-1 gap-2 max-lg:grid-cols-3">
                            {slides.map((s, i) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSlideIdx(i)}
                                    className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all ${i === activeSlideIdx ? 'border-brand-400 shadow-sm' : 'border-ink-200 hover:border-brand-300'}`}
                                >
                                    <iframe
                                        srcDoc={buildSlideSrcDoc(s)}
                                        className="w-full h-full border-0 pointer-events-none"
                                        style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%' }}
                                        sandbox="allow-popups allow-modals"
                                        title={`Slide ${i + 1}`}
                                    />
                                    <div className="absolute bottom-1 left-1.5 text-[10px] font-bold text-white bg-black/50 rounded px-1.5 py-0.5">
                                        {i + 1}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Active slide preview */}
                    <div className="flex-1 flex items-center justify-center p-6 max-md:p-3 overflow-auto">
                        {activeSlide && (
                            <div className="w-full max-w-[960px]">
                                <div
                                    className="w-full rounded-lg overflow-hidden border border-ink-200 shadow-md bg-white"
                                    style={{ aspectRatio: '16/9' }}
                                >
                                    <iframe
                                        srcDoc={buildSlideSrcDoc(activeSlide)}
                                        className="w-full h-full border-0"
                                        sandbox="allow-scripts allow-popups allow-modals"
                                        title={`Slide ${activeSlideIdx + 1}`}
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-3 mt-4">
                                    <Button
                                        variant="secondary" size="sm"
                                        onClick={() => setActiveSlideIdx(Math.max(0, activeSlideIdx - 1))}
                                        disabled={activeSlideIdx === 0}
                                    >← Назад</Button>
                                    <span className="text-[13px] text-ink-600 font-medium tnum">
                                        {activeSlideIdx + 1} / {slides.length}
                                    </span>
                                    <Button
                                        variant="secondary" size="sm"
                                        onClick={() => setActiveSlideIdx(Math.min(slides.length - 1, activeSlideIdx + 1))}
                                        disabled={activeSlideIdx === slides.length - 1}
                                    >Вперёд →</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ───── Configurator view (по прототипу) ─────
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
                {/* LEFT: params */}
                <Card padding="lg"
                      className={`col-span-4 max-lg:col-span-1 h-fit max-lg:${mobileTab === 'config' ? '' : 'hidden'}`}>
                    {/* tool-hero */}
                    <div className="flex items-center gap-3.5 pb-5 mb-1 border-b border-ink-100" data-tour="hero">
                        <span
                            className="w-11 h-11 rounded-md inline-flex items-center justify-center"
                            style={{ background: '#ECFDF5', color: '#047857' }}
                        >
                            <Presentation className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Презентация</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">
                                PPTX-презентация со слайдами · ~60 секунд
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Topic + Thesis */}
                        <div data-tour="topic">
                        <Input
                            label="ТЕМА ПРЕЗЕНТАЦИИ"
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            placeholder="Эволюция животного мира"
                            hint="Главная тема или название"
                        />
                        </div>

                        {/* Thesis */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Тезисы или текст
                            </label>
                            <textarea
                                value={thesis}
                                onChange={e => setThesis(e.target.value)}
                                rows={3}
                                placeholder="Опишите кратко, о чём презентация. ИИ возьмёт это за основу."
                                className="w-full px-3 py-2.5 bg-surface border border-ink-200 rounded-md text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors resize-y min-h-[60px]"
                            />
                        </div>

                        {/* Slides count slider */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Количество слайдов
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={3} max={30}
                                    value={slidesCount}
                                    onChange={e => setSlidesCount(Number(e.target.value))}
                                    className="flex-1 accent-brand-500"
                                />
                                <div className="min-w-[36px] text-center bg-brand-50 text-brand-700 px-2.5 py-1 rounded-sm font-bold text-[13px] tnum">
                                    {slidesCount}
                                </div>
                            </div>
                        </div>

                        {/* Audience */}
                        <Select
                            label="АУДИТОРИЯ"
                            value={audience}
                            onChange={e => setAudience(e.target.value)}
                            options={AUDIENCES.map(a => ({ value: a.value, label: a.label }))}
                        />

                        {/* Style */}
                        <div data-tour="style">
                            <Select
                                label="СТИЛЬ"
                                value={presentStyle}
                                onChange={e => setPresentStyle(e.target.value as PresentStyle)}
                                options={PRESENT_STYLES.map(s => ({ value: s.value, label: s.label }))}
                            />
                        </div>

                        {/* Images mode */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Изображения</label>
                            <div className="flex gap-1.5 flex-wrap">
                                <ChipButton active={imagesMode === 'ai'} onClick={() => setImagesMode('ai')}>AI генерация</ChipButton>
                                <ChipButton active={imagesMode === 'unsplash'} onClick={() => setImagesMode('unsplash')}>Unsplash</ChipButton>
                                <ChipButton active={imagesMode === 'none'} onClick={() => setImagesMode('none')}>Без картинок</ChipButton>
                            </div>
                        </div>

                        {/* Color theme */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Цветовая тема
                            </label>
                            <div className="grid grid-cols-6 gap-1.5">
                                {THEME_PRESETS.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setThemeId(t.id)}
                                        title={t.label}
                                        aria-label={t.label}
                                        className={`aspect-square rounded-sm border-2 transition-all ${themeId === t.id ? 'border-ink-900 shadow-sm scale-110' : 'border-ink-200 hover:border-ink-400'}`}
                                        style={{ background: SLIDE_THEMES[t.id].accent }}
                                    />
                                ))}
                            </div>
                            <div className="text-[11px] text-ink-500 mt-1.5">{SLIDE_THEMES[themeId].label}</div>
                        </div>

                        {/* Export format */}
                        <div>
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Формат экспорта</label>
                            <div className="flex gap-1.5 flex-wrap">
                                <ChipButton active={exportFmt === 'pptx'} onClick={() => setExportFmt('pptx')}>PPTX</ChipButton>
                                <ChipButton active={exportFmt === 'pdf'} onClick={() => setExportFmt('pdf')}>PDF</ChipButton>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-ink-100" data-tour="generate">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!topic.trim()}
                            >
                                Сгенерировать
                            </Button>
                            <div className="text-center text-[11px] text-ink-500 mt-2.5 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                ⌘ + ↵ — горячая клавиша
                            </div>
                            {errorMsg && (
                                <p className="mt-2 text-[12px] text-center text-danger-700 font-medium">{errorMsg}</p>
                            )}
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
                                <><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Создаём презентацию…</>
                            ) : (
                                <><Eye className="w-4 h-4 text-ink-400" /> Готов к работе</>
                            )}
                        </div>

                        <div className="flex-1" />

                        <Button
                            variant="ghost" size="sm"
                            leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            onClick={copyTopic}
                            disabled={!topic && !thesis}
                        >
                            {copied ? 'Скопировано' : 'Копировать'}
                        </Button>
                    </div>

                    {/* preview body */}
                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-hidden p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress
                                    active={isGenerating}
                                    title="Создаём презентацию…"
                                    accentClassName="bg-brand-500"
                                    estimatedSeconds={120}
                                />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-ink-200 rounded-lg bg-surface text-ink-500 min-h-[400px]">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <Presentation className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">
                                    Заполните настройки слева
                                </h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появится сетка слайдов. Каждый слайд можно открыть,
                                    отредактировать или скачать всю презентацию.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default function PresentationV2() {
    return (
        <Suspense fallback={
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
        }>
            <PresentationV2Inner />
        </Suspense>
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
