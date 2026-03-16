'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
    MonitorPlay, RefreshCw, Loader2, Download, ArrowLeft, Plus,
    Edit3, Eye, Bold, Italic, Type, Sparkles, Trash2, Trash,
    PlusSquare, X, Upload, Image as ImageIcon
} from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface SlideData {
    id: string;
    html: string;
    css: string;
    js: string;
}

const FALLBACK_SLIDE_CSS = `
  body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
  body > * { color: #fff; }
  h1, h2, h3 { font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.4); }
`;

function buildSlideSrcDoc(slide: SlideData): string {
    const css = slide.css?.trim() || FALLBACK_SLIDE_CSS
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
${css}
</style>
</head>
<body>
${slide.html}
<script>
try { ${slide.js || ''} } catch(e) { console.warn('slide js error', e); }
</script>
</body>
</html>`;
}

function SlideThumbnail({ slide, index, isActive, onClick }: {
    slide: SlideData; index: number; isActive: boolean; onClick: () => void;
}) {
    return (
        <div
            onClick={onClick}
            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${isActive ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-blue-300'}`}
            style={{ width: '100%', aspectRatio: '16/9' }}
        >
            <iframe
                srcDoc={buildSlideSrcDoc(slide)}
                className="w-full h-full border-0 pointer-events-none"
                style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%' }}
                sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                title={`Slide ${index + 1}`}
            />
            <div className="absolute bottom-1 left-2 text-[9px] font-bold text-white/80 bg-black/30 rounded px-1">
                {index + 1}
            </div>
        </div>
    );
}

function PresentationGeneratorContent() {
    const [topic, setTopic] = useState('')
    const [duration, setDuration] = useState('15')
    const [style, setStyle] = useState('modern')
    const [targetAudience, setTargetAudience] = useState('students')
    const [errorMsg, setErrorMsg] = useState('')

    const [slides, setSlides] = useState<SlideData[]>([])
    const [activeSlideIndex, setActiveSlideIndex] = useState(0)
    const [isEditorMode, setIsEditorMode] = useState(false)
    const [editMode, setEditMode] = useState(false)
    // Local loading covers the FULL generate+poll cycle (hook's isGenerating resets too early)
    const [isLoading, setIsLoading] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)

    // AI Image Modal
    const [showAiImageModal, setShowAiImageModal] = useState(false)
    const [aiImagePrompt, setAiImagePrompt] = useState('')
    const [aiImageUrl, setAiImageUrl] = useState<string | null>(null)
    const [isGeneratingImage, setIsGeneratingImage] = useState(false)

    const canvasIframeRef = useRef<HTMLIFrameElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { generateAndWait, isGenerating } = useGenerations()
    const searchParams = useSearchParams()

    // Load slides from sessionStorage when redirected from MaterialViewer
    useEffect(() => {
        if (searchParams?.get('loadFromSession') !== '1') return
        try {
            const raw = sessionStorage.getItem('pendingPresentationSlides')
            const title = sessionStorage.getItem('pendingPresentationTitle')
            if (raw) {
                const loaded = JSON.parse(raw)
                if (Array.isArray(loaded) && loaded.length > 0) {
                    setSlides(loaded)
                    setIsEditorMode(true)
                    if (title) setTopic(title)
                }
            }
            sessionStorage.removeItem('pendingPresentationSlides')
            sessionStorage.removeItem('pendingPresentationTitle')
        } catch (e) {
            console.error('Failed to load slides from sessionStorage:', e)
        }
    }, [])

    // Listen for HTML updates from injected iframe scripts (drag-drop, etc.)
    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === 'slide-html') {
                setSlides(prev => prev.map((s, i) =>
                    i === activeSlideIndex ? { ...s, html: e.data.html } : s
                ))
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [activeSlideIndex])

    // --- Helper: get iframe document safely ---
    const getIframeDoc = useCallback(() => {
        try {
            return canvasIframeRef.current?.contentDocument ?? null
        } catch { return null }
    }, [])

    // --- Inject drag script directly INTO iframe (runs in iframe's JS context with capture:true) ---
    const injectDragScript = useCallback((doc: Document) => {
        if (doc.getElementById('__drag-script__')) return
        const s = doc.createElement('script')
        s.id = '__drag-script__'
        s.textContent = `
        (function () {
            var active = null, isDragging = false, startX, startY;
            var tx = 0, ty = 0, baseTx = 0, baseTy = 0;

            function getTransform(el) {
                var m = el.style.transform.match(/translate\\(([-0-9.]+)px,\\s*([-0-9.]+)px\\)/);
                return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
            }

            function onDown(e) {
                if (e.button !== 0) return;
                var target = e.target.closest('[data-edit], img');
                if (!target) return;

                active = target;
                isDragging = false;
                startX = e.clientX;
                startY = e.clientY;

                var t = getTransform(active);
                baseTx = t.x;
                baseTy = t.y;

                // DO NOT preventDefault here, so contentEditable can still be focused/clicked
            }

            function onMove(e) {
                if (!active) return;
                var dx = e.clientX - startX;
                var dy = e.clientY - startY;

                // If we moved > 5px, we consider it a drag (not a click to edit)
                if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    isDragging = true;
                    // Blur if it was focused for editing
                    if (document.activeElement === active) active.blur();
                    // Optional styling during drag
                    active.style.cursor = 'grabbing';
                    active.style.zIndex = '9999';
                    active.style.outline = '2px solid rgba(99,102,241,0.85)';
                }

                if (isDragging) {
                    e.preventDefault(); // prevent text selection
                    tx = baseTx + dx;
                    ty = baseTy + dy;
                    active.style.transform = 'translate(' + tx + 'px, ' + ty + 'px)';
                }
            }

            function onUp(e) {
                if (!active) return;
                if (isDragging) {
                    active.style.cursor = '';
                    active.style.zIndex = '';
                    active.style.outline = '';
                    // Prevent click from focusing the element immediately after draging
                    e.preventDefault();
                    e.stopPropagation();
                    window.parent.postMessage({ type: 'slide-html', html: document.body.innerHTML }, '*');
                }
                active = null;
                isDragging = false;
            }

            // Capture phase to intercept before contentEditable selection
            document.addEventListener('mousedown', onDown, true);
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);

            // Hover states for drag hints
            document.addEventListener('mouseover', function (e) {
                var target = e.target.closest('[data-edit], img');
                if (target && target !== active && !isDragging) {
                    target.style.outline = '1px dashed rgba(99,102,241,0.6)';
                    target.style.cursor = target.isContentEditable ? 'text' : 'grab';
                }
            }, true);
            document.addEventListener('mouseout', function (e) {
                var target = e.target.closest('[data-edit], img');
                if (target && target !== active) {
                    target.style.outline = '';
                }
            }, true);
        })();
    `
        doc.body.appendChild(s)
    }, [])

    // --- Enable contenteditable on ALL visible text-bearing elements ---
    const enableEditing = useCallback(() => {
        const doc = getIframeDoc()
        if (!doc) return

        // Add inline styles so the user sees editable hints
        const style = doc.createElement('style')
        style.id = '__edit-styles__'
        style.textContent = `
    [data - edit] {
        outline: 2px dashed rgba(99, 102, 241, 0.45);
        outline - offset: 2px;
        cursor: text;
        border - radius: 3px;
        min - height: 1em;
    }
    [data - edit]:hover { outline - color: rgba(99, 102, 241, 0.85); }
    [data - edit]:focus { outline: 2px solid #6366f1; }
    `
        doc.head.appendChild(style)

        // Make EVERY element that has direct text content editable
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
        const textParents = new Set<Element>()
        let node: Node | null
        while ((node = walker.nextNode())) {
            if (node.textContent?.trim() && node.parentElement && node.parentElement !== doc.body) {
                textParents.add(node.parentElement)
            }
        }
        textParents.forEach(el => {
            const htmlEl = el as HTMLElement
            htmlEl.contentEditable = 'true'
            htmlEl.setAttribute('data-edit', '1')
            htmlEl.spellcheck = false
        })

        // Sync changes back to state
        const handler = () => {
            const html = doc.body.innerHTML
            setSlides(prev => prev.map((s, i) =>
                i === activeSlideIndex ? { ...s, html } : s
            ))
        }
        doc.body.addEventListener('input', handler)
            ; (doc as any).__editHandler = handler

        // Enable drag for any images already on the slide (script injected into iframe)
        injectDragScript(doc)
    }, [getIframeDoc, activeSlideIndex, injectDragScript])

    const disableEditing = useCallback(() => {
        const doc = getIframeDoc()
        if (!doc) return
        // Remove edit styles
        doc.getElementById('__edit-styles__')?.remove()
        // Remove contenteditable markers
        doc.querySelectorAll('[data-edit]').forEach(el => {
            (el as HTMLElement).removeAttribute('contenteditable')
            el.removeAttribute('data-edit')
        })
        if ((doc as any).__editHandler) {
            doc.body.removeEventListener('input', (doc as any).__editHandler)
            delete (doc as any).__editHandler
        }
        // NOTE: we do NOT capture HTML here — input events already saved it in real time
    }, [getIframeDoc])

    // Enable editing when slide loads (if editMode is on), or enable when editMode toggles on
    // IMPORTANT: never call disableEditing on slide switch — that would read blank iframe and wipe data
    useEffect(() => {
        if (!isEditorMode) return
        const iframe = canvasIframeRef.current
        if (!iframe) return

        if (!editMode) return // nothing to do — just let the iframe render normally

        // editMode is true: enable editing once the iframe is loaded
        const activate = () => enableEditing()

        if (iframe.contentDocument?.readyState === 'complete') {
            activate()
        } else {
            iframe.addEventListener('load', activate, { once: true })
        }

        return () => {
            iframe.removeEventListener('load', activate)
        }
    }, [editMode, isEditorMode, activeSlideIndex])

    // ---- Toolbar commands (direct DOM) ----
    const execCmd = (cmd: string) => {
        const doc = getIframeDoc()
        if (!doc) return
        doc.execCommand(cmd)
        // execCommand does NOT fire input events — save explicitly
        const html = doc.body.innerHTML
        setSlides(prev => prev.map((s, i) =>
            i === activeSlideIndex ? { ...s, html } : s
        ))
    }

    const addTextBlock = () => {
        const doc = getIframeDoc()
        if (!doc) return
        const p = doc.createElement('p')
        p.textContent = 'Новый текст'
        p.contentEditable = 'true'
        p.setAttribute('data-edit', '1')
        p.spellcheck = false
        p.style.cssText = 'margin: 8px; font-size: 1.1rem; cursor: text;'
        doc.body.appendChild(p)
        // Save
        setSlides(prev => prev.map((s, i) =>
            i === activeSlideIndex ? { ...s, html: doc.body.innerHTML } : s
        ))
        p.focus()
    }

    const deleteSelectedBlock = () => {
        const doc = getIframeDoc()
        if (!doc) return
        const sel = doc.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const node = sel.getRangeAt(0).commonAncestorContainer
        const target = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null
        if (target && target !== doc.body && target.tagName !== 'HTML' && target.tagName !== 'BODY') {
            target.remove()
            setSlides(prev => prev.map((s, i) =>
                i === activeSlideIndex ? { ...s, html: doc.body.innerHTML } : s
            ))
        }
    }

    const insertImageIntoSlide = (url: string) => {
        const doc = getIframeDoc()
        if (!doc) return

        // Ensure body has relative positioning so absolute children work
        if (!doc.body.style.position || doc.body.style.position === 'static') {
            doc.body.style.position = 'relative'
        }

        const img = doc.createElement('img')
        img.src = url
        // Place in center of slide, absolutely positioned so user can drag it
        img.style.cssText = [
            'position: absolute',
            'left: 50%',
            'top: 50%',
            'transform: translate(-50%, -50%)',
            'max-width: 40%',
            'max-height: 40vh',
            'object-fit: contain',
            'border-radius: 8px',
            'cursor: grab',
            'z-index: 100',
            'box-shadow: 0 4px 20px rgba(0,0,0,0.3)',
        ].join(';')
        doc.body.appendChild(img)

        // Set up drag immediately (script injected into iframe's own context)
        injectDragScript(doc)

        setSlides(prev => prev.map((s, i) =>
            i === activeSlideIndex ? { ...s, html: doc.body.innerHTML } : s
        ))
    }

    const handleFileImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ev => {
            const url = ev.target?.result as string
            insertImageIntoSlide(url)
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    const generateAiImage = async () => {
        if (!aiImagePrompt) return
        setIsGeneratingImage(true)
        try {
            const status = await generateAndWait({ type: 'image', params: { prompt: aiImagePrompt, style: 'illustration' } })
            const r = status.result
            // Backend returns { content: base64DataUrl, imageUrl: ..., ... } or plain string
            const imageData: string =
                (typeof r === 'string' ? r : null) ??
                r?.content ??
                r?.imageUrl ??
                ''
            if (imageData && (imageData.startsWith('http') || imageData.startsWith('data:image'))) {
                setAiImageUrl(imageData)
            } else {
                const kw = aiImagePrompt.split(' ').filter((w: string) => w.length > 3).slice(0, 2).join(',')
                setAiImageUrl(`https://picsum.photos/seed/${encodeURIComponent(kw || 'education')}/800/450`)
            }
        } catch (e: any) {
            console.warn('AI image failed, using fallback:', e?.message)
            const kw = aiImagePrompt.split(' ').filter((w: string) => w.length > 3).slice(0, 2).join('-')
            setAiImageUrl(`https://picsum.photos/seed/${encodeURIComponent(kw || 'education')}/800/450`)
        }
        setIsGeneratingImage(false)
    }


    const insertAiImage = () => {
        if (!aiImageUrl) return
        insertImageIntoSlide(aiImageUrl)
        setShowAiImageModal(false)
        setAiImageUrl(null)
    }

    // ---- Slide capture for export ----
    // Script-free srcDoc: strips ALL <script> tags so broken AI JS can't crash capture
    const buildCaptureSrcDoc = (slide: SlideData): string => {
        const tmp = document.createElement('div')
        tmp.innerHTML = slide.html
        tmp.querySelectorAll('script, #__drag-script__, #__edit-styles__').forEach(el => el.remove())
        const cleanHtml = tmp.innerHTML
        const css = slide.css?.trim() || FALLBACK_SLIDE_CSS
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
${css}
</style></head><body>${cleanHtml}</body></html>`
    }

    const captureSlideAsImage = (slide: SlideData): Promise<string> => {
        return new Promise(async (resolve, reject) => {
            const h2c = (await import('html2canvas')).default
            const W = 1280, H = 720
            const frame = document.createElement('iframe')
            frame.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px;height:${H}px;border:none;pointer-events:none;z-index:-1`
            frame.setAttribute('sandbox', 'allow-same-origin')  // no allow-scripts: JS not needed for visual capture
            frame.srcdoc = buildCaptureSrcDoc(slide)
            document.body.appendChild(frame)
            const cleanup = () => { try { document.body.removeChild(frame) } catch (_) { } }
            const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')) }, 15000)
            frame.onload = async () => {
                try {
                    await new Promise(r => setTimeout(r, 400)) // Let CSS/animations settle
                    const body = frame.contentDocument?.body
                    if (!body) throw new Error('No body')
                    const canvas = await h2c(body, {
                        width: W, height: H,
                        scale: 1,
                        useCORS: true,
                        allowTaint: true,
                        windowWidth: W,
                        windowHeight: H,
                        logging: false,
                        imageTimeout: 8000,
                    })
                    clearTimeout(timeout)
                    cleanup()
                    resolve(canvas.toDataURL('image/jpeg', 0.92))
                } catch (e) { clearTimeout(timeout); cleanup(); reject(e) }
            }
        })
    }

    const downloadPDF = async () => {
        setIsExporting(true)
        setShowDownloadMenu(false)
        try {
            const { jsPDF } = await import('jspdf')
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 167.25] })
            for (let i = 0; i < slides.length; i++) {
                if (i > 0) pdf.addPage([297, 167.25], 'landscape')
                const imgData = await captureSlideAsImage(slides[i])
                pdf.addImage(imgData, 'JPEG', 0, 0, 297, 167.25)
            }
            pdf.save(`${topic || 'presentation'}.pdf`)
        } catch (e) { console.error('PDF export failed', e) }
        setIsExporting(false)
    }

    const downloadPPTX = async () => {
        setIsExporting(true)
        setShowDownloadMenu(false)
        try {
            const PptxGenJS = (await import('pptxgenjs')).default
            const prs = new PptxGenJS()
            prs.layout = 'LAYOUT_16x9'
            for (const slide of slides) {
                const imgData = await captureSlideAsImage(slide)
                const prsSlide = prs.addSlide()
                prsSlide.addImage({ data: imgData, x: 0, y: 0, w: 10, h: 5.625 })
            }
            await prs.writeFile({ fileName: `${topic || 'presentation'}.pptx` })
        } catch (e) { console.error('PPTX export failed', e) }
        setIsExporting(false)
    }

    const deleteActiveSlide = () => {
        if (slides.length <= 1) return
        const newSlides = slides.filter((_, i) => i !== activeSlideIndex)
        setSlides(newSlides)
        setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))
        setEditMode(false)
    }

    const handleAddSlide = () => {
        const newSlide: SlideData = {
            id: `slide_${Date.now()}`,
            html: `<div class="s"><h1>Новый слайд</h1><p>Добавьте содержание</p></div>`,
            css: `.s { background: #1A202C; color: white; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; padding:2rem; overflow:hidden; } h1 { font-size:2.5rem; margin-bottom:1rem; } p { font-size:1.2rem; opacity:0.8; }`,
            js: ''
        }
        if (editMode) {
            disableEditing()
            setEditMode(false)
        }
        setSlides(prev => [...prev, newSlide])
        setActiveSlideIndex(slides.length)
    }

    const switchSlide = (index: number) => {
        if (editMode) {
            disableEditing()
            setEditMode(false)
        }
        setActiveSlideIndex(index)
    }

    const generate = async () => {
        if (!topic || isLoading) return;
        setIsLoading(true)
        try {
            setErrorMsg('')
            setIsEditorMode(false)
            setSlides([])
            setEditMode(false)

            const params = { topic, duration, style, targetAudience }
            const status = await generateAndWait({ type: 'presentation', params })
            const resultData = status.result?.slides || status.result

            let parsed: SlideData[] = []
            if (Array.isArray(resultData) && resultData.length > 0 && resultData[0]?.html) {
                parsed = resultData
            } else if (typeof resultData === 'string') {
                try {
                    const arr = JSON.parse(resultData)
                    if (Array.isArray(arr) && arr[0]?.html) parsed = arr
                } catch (_) { }
            }

            if (parsed.length > 0) {
                setSlides(parsed)
                setActiveSlideIndex(0)
                setIsEditorMode(true)
            } else {
                setErrorMsg('Не удалось получить слайды. Попробуйте ещё раз.')
            }
        } catch (e: any) {
            setErrorMsg(`Ошибка: ${e.message}`)
        } finally {
            setIsLoading(false)
        }
    }

    const durations = [
        { value: '5', label: '5 минут (~5 слайдов)' },
        { value: '15', label: '15 минут (~10 слайдов)' },
        { value: '30', label: '30 минут (~20 слайдов)' },
        { value: '45', label: '45+ минут (~30 слайдов)' }
    ]
    const styles = [
        { value: 'modern', label: 'Современный (Минимализм)' },
        { value: 'academic', label: 'Академический (Строгий)' },
        { value: 'creative', label: 'Креативный (Яркий)' },
        { value: 'corporate', label: 'Корпоративный (Деловой)' }
    ]
    const audiences = [
        { value: 'students', label: 'Школьники / Студенты' },
        { value: 'colleagues', label: 'Коллеги / Учителя' },
        { value: 'parents', label: 'Родители' },
        { value: 'general', label: 'Широкая аудитория' }
    ]

    if (isEditorMode) {
        const activeSlide = slides[activeSlideIndex]
        return (
            <div className="flex flex-col w-full h-full bg-[#F9FAFB]">
                {/* Header */}
                <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 flex-shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { disableEditing(); setIsEditorMode(false); setEditMode(false); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="font-bold text-sm text-gray-900 leading-tight">{topic || 'Презентация'}</h1>
                            <p className="text-xs text-gray-400">{slides.length} слайдов</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEditMode(m => !m)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {editMode ? <><Eye className="w-3.5 h-3.5" /> Просмотр</> : <><Edit3 className="w-3.5 h-3.5" /> Редактировать</>}
                        </button>
                        {/* Download dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowDownloadMenu(m => !m)}
                                disabled={isExporting}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                {isExporting ? 'Экспорт...' : 'Скачать ▾'}
                            </button>
                            {showDownloadMenu && !isExporting && (
                                <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[160px]" onMouseLeave={() => setShowDownloadMenu(false)}>
                                    <button onClick={downloadPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors">
                                        <Download className="w-4 h-4" /> Скачать PDF
                                    </button>
                                    <button onClick={downloadPPTX} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                                        <Download className="w-4 h-4" /> Скачать PPTX
                                    </button>
                                </div>
                            )}
                        </div>
                        <button onClick={generate} disabled={isLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-40">
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Регенерировать
                        </button>
                    </div>
                </div>

                {/* Full-screen export overlay */}
                {isExporting && (
                    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                            <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                            <p className="font-bold text-gray-800">Экспортируем слайды...</p>
                            <p className="text-sm text-gray-500">Это займёт несколько секунд</p>
                        </div>
                    </div>
                )}


                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-[200px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
                        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                            <span className="font-bold text-xs text-gray-500 uppercase tracking-wider">SLIDES</span>
                            <button onClick={handleAddSlide} className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-200">
                            {slides.map((slide, index) => (
                                <SlideThumbnail key={slide.id} slide={slide} index={index} isActive={activeSlideIndex === index} onClick={() => switchSlide(index)} />
                            ))}
                        </div>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 flex flex-col bg-gray-100 h-full overflow-hidden">
                        {editMode && (
                            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-shrink-0 flex-wrap">
                                {/* Formatting */}
                                <button onClick={() => execCmd('bold')} title="Жирный" className="p-2 hover:bg-gray-100 rounded text-gray-700 transition-colors font-bold text-sm">B</button>
                                <button onClick={() => execCmd('italic')} title="Курсив" className="p-2 hover:bg-gray-100 rounded text-gray-700 transition-colors italic text-sm">I</button>
                                <button onClick={() => execCmd('removeFormat')} title="Обычный" className="p-2 hover:bg-gray-100 rounded text-gray-700 transition-colors">
                                    <Type className="w-4 h-4" />
                                </button>
                                <div className="w-px h-6 bg-gray-200 mx-1" />
                                {/* Block */}
                                <button onClick={addTextBlock} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-green-50 rounded text-green-700 text-xs font-medium border border-green-200 transition-colors">
                                    <PlusSquare className="w-3.5 h-3.5" /> Добавить блок
                                </button>
                                <button onClick={deleteSelectedBlock} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-red-50 rounded text-red-600 text-xs font-medium border border-red-200 transition-colors">
                                    <Trash className="w-3.5 h-3.5" /> Удалить блок
                                </button>
                                <div className="w-px h-6 bg-gray-200 mx-1" />
                                {/* Images */}
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-blue-50 rounded text-blue-700 text-xs font-medium border border-blue-200 transition-colors">
                                    <Upload className="w-3.5 h-3.5" /> Картинка
                                </button>
                                <button onClick={() => { setAiImagePrompt(`Educational illustration: ${slides[activeSlideIndex]?.html.match(/<h\d[^>]*>([^<]+)/)?.[1] || topic}`); setShowAiImageModal(true); }} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-purple-50 rounded text-purple-700 text-xs font-medium border border-purple-200 transition-colors">
                                    <Sparkles className="w-3.5 h-3.5" /> ИИ Картинка
                                </button>
                                <div className="w-px h-6 bg-gray-200 mx-1" />
                                {/* Delete slide */}
                                <button onClick={deleteActiveSlide} disabled={slides.length <= 1} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-red-50 rounded text-red-600 text-xs font-medium border border-red-200 transition-colors disabled:opacity-40">
                                    <Trash2 className="w-3.5 h-3.5" /> Удалить слайд
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileImage} className="hidden" />
                            </div>
                        )}

                        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
                            {activeSlide && (
                                <div className="w-full max-w-[960px] flex flex-col gap-4">
                                    <div
                                        className={`w-full rounded-2xl overflow-hidden border-2 transition-all ${editMode ? 'border-indigo-400 shadow-lg shadow-indigo-100' : 'border-gray-200 shadow-xl'}`}
                                        style={{ aspectRatio: '16/9' }}
                                    >
                                        {/* Single iframe, no key flipping — we manipulate DOM directly */}
                                        <iframe
                                            ref={canvasIframeRef}
                                            key={activeSlide.id}
                                            srcDoc={buildSlideSrcDoc(activeSlide)}
                                            className="w-full h-full border-0"
                                            sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                                            title={`Slide ${activeSlideIndex + 1}`}
                                        />
                                    </div>
                                    <div className="flex items-center justify-center gap-4">
                                        <button onClick={() => switchSlide(Math.max(0, activeSlideIndex - 1))} disabled={activeSlideIndex === 0} className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium">← Назад</button>
                                        <span className="text-sm text-gray-500 font-medium">{activeSlideIndex + 1} / {slides.length}</span>
                                        <button onClick={() => switchSlide(Math.min(slides.length - 1, activeSlideIndex + 1))} disabled={activeSlideIndex === slides.length - 1} className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium">Вперёд →</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AI Image Modal */}
                {showAiImageModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" /> ИИ Картинка для слайда</h3>
                                <button onClick={() => { setShowAiImageModal(false); setAiImageUrl(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
                            </div>
                            <textarea value={aiImagePrompt} onChange={e => setAiImagePrompt(e.target.value)} rows={3} placeholder="Опишите желаемое изображение..." className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 resize-none mb-3" />
                            {aiImageUrl && (
                                <div className="mb-3 rounded-xl overflow-hidden border border-gray-200 aspect-video">
                                    <img src={aiImageUrl} alt="AI generated" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={generateAiImage} disabled={isGeneratingImage || !aiImagePrompt.trim()} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm">
                                    {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {aiImageUrl ? 'Регенерировать' : 'Создать'}
                                </button>
                                {aiImageUrl && (
                                    <button onClick={insertAiImage} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm">
                                        <ImageIcon className="w-4 h-4" /> Вставить на слайд
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }
    // --- Configurator ---
    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                        <MonitorPlay className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Презентации</h2>
                            <GenerationCostBadge operationType="presentation" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема презентации</label>
                            <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="Строение Солнечной системы, планеты земной группы..." rows={4} className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 resize-none text-gray-900 placeholder-gray-400" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Целевая аудитория</label>
                            <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)} className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-gray-900">
                                {audiences.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Длительность</label>
                            <select value={duration} onChange={e => setDuration(e.target.value)} className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-gray-900">
                                {durations.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Стиль дизайна</label>
                            <select value={style} onChange={e => setStyle(e.target.value)} className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 text-gray-900">
                                {styles.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="p-5 border-t border-gray-100 bg-white">
                    <button onClick={generate} disabled={isLoading || !topic.trim()} className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50">
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-[11px] text-white">
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isLoading ? 'Создаём...' : 'Создать презентацию'}</span>
                        </div>
                    </button>
                    {errorMsg && <p className="mt-3 text-xs text-center text-red-500 font-medium">{errorMsg}</p>}
                </div>
            </div>
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                                    <MonitorPlay className="w-10 h-10 text-purple-500 animate-pulse" />
                                </div>
                                <p className="text-lg font-bold text-gray-800">Создаём презентацию...</p>
                                <p className="text-sm text-gray-500 mt-2">ИИ генерирует материалы для каждого слайда</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center opacity-40">
                                <MonitorPlay className="w-16 h-16 mb-4 text-gray-400" />
                                <h3 className="text-xl font-bold mb-2">Создание AI презентаций</h3>
                                <p className="text-gray-500 max-w-[400px]">Введите тему и получите красивую презентацию с редактором, где можно менять текст, добавлять блоки и изображения.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function PresentationGenerator() {
    return (
        <Suspense fallback={
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Загрузка редактора...</p>
                </div>
            </div>
        }>
            <PresentationGeneratorContent />
        </Suspense>
    )
}    
