'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import { getGenerationTypeLabel } from '@/lib/utils/translations'
import PresentationEditor, { PresentationEditorRef } from './PresentationEditor'
import PresentationPlayer from './PresentationPlayer'
import { Save, Download, ChevronLeft, ChevronRight, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react'
import AssignTaskButton from './AssignTaskButton'
import Image from 'next/image'
import DOMPurify from 'isomorphic-dompurify'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { downloadPdfById } from '@/lib/utils/downloadPdf'
import DownloadPdfModal from './workspace/DownloadPdfModal'

interface MaterialViewerProps {
    lessonId?: string
    generationId?: string
    type?: string
    content?: any
    isEditable?: boolean
}

// Drag script injected into each slide iframe — transform-based, preserves CSS layout & backgrounds
const DRAG_SCRIPT = `<script>(function(){
  var active=null,ox=0,oy=0;
  function init(el){
    if(el.dataset.mv)return;el.dataset.mv='1';
    var tx=0,ty=0;
    el.style.cursor='grab';el.style.userSelect='none';
    el.addEventListener('mousedown',function(e){
      if(e.button!==0)return;
      active=el;ox=e.clientX-tx;oy=e.clientY-ty;
      el.style.cursor='grabbing';el.style.zIndex='9999';el.style.outline='2px solid rgba(99,179,237,0.8)';
      e.preventDefault();e.stopPropagation();
    },true);
    document.addEventListener('mousemove',function(e){
      if(active!==el)return;
      tx=e.clientX-ox;ty=e.clientY-oy;
      el.style.transform='translate('+tx+'px,'+ty+'px)';
    });
    document.addEventListener('mouseup',function(){
      if(active===el){active=null;el.style.cursor='grab';el.style.zIndex='';el.style.outline='';
        window.parent.postMessage({type:'slide-html',html:document.body.innerHTML},'*');
      }
    });
    el.addEventListener('mouseover',function(){if(active!==el)el.style.outline='1px dashed rgba(99,179,237,0.6)';});
    el.addEventListener('mouseout',function(){if(active!==el)el.style.outline='';});
  }
  window.addEventListener('load',function(){
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,img,ul,ol,table,figure,blockquote').forEach(init);
  });
})();<\/script>`

// Build srcdoc for thumbnail (no drag needed)
const buildThumbSrc = (slide: any): string => {
    const css = slide.css?.trim() || 'body{background:#1a1a2e;color:#fff;}'
    const tmp = typeof document !== 'undefined' ? document.createElement('div') : null
    if (tmp) { tmp.innerHTML = DOMPurify.sanitize(slide.html || '', { FORBID_TAGS: ['script'] }) }
    const html = tmp ? tmp.innerHTML : (slide.html || '')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}${css}</style></head><body>${html}</body></html>`
}

// Build srcdoc for main editable slide (with drag script)
const buildEditSrc = (slide: any): string => {
    const css = slide.css?.trim() || 'body{background:#1a1a2e;color:#fff;}'
    const tmp = typeof document !== 'undefined' ? document.createElement('div') : null
    if (tmp) { tmp.innerHTML = DOMPurify.sanitize(slide.html || '', { FORBID_TAGS: ['script'] }) }
    const html = tmp ? tmp.innerHTML : (slide.html || '')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}${css}</style></head><body>${html}${DRAG_SCRIPT}</body></html>`
}

const MATHJAX_SCRIPT = `<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']],processEscapes:true},chtml:{fontCache:'global'},startup:{typeset:true}};</script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`
const IFRAME_STYLES = `<style>
  body { margin: 0; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; background: white; color: #1a1a1a; }
  .container { max-width: 820px; margin: 0 auto; }
</style>`
const IFRAME_READY_SCRIPT = `<script>
  window.addEventListener('load', function() {
    if (window.MathJax) {
      setTimeout(function() { window.parent.postMessage('IFRAME_READY', '*'); }, 1500);
    } else {
      setTimeout(function() { window.parent.postMessage('IFRAME_READY', '*'); }, 500);
    }
  });
</script>`

function stripCodeFences(text: string) {
    if (typeof text !== 'string') return ''
    let processed = text.trim()
    if (processed.startsWith('```')) {
        processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
    }
    return processed
}

function looksLikeFullHtmlDocument(value: any): boolean {
    if (typeof value !== 'string') return false
    const trimmed = value.trim()
    return (
        /<!DOCTYPE html/i.test(trimmed) ||
        /<html[\s>]/i.test(trimmed) ||
        /<head[\s>]/i.test(trimmed) ||
        /<style[\s>]/i.test(trimmed) ||
        /<\/?[a-z][\s\S]*>/i.test(trimmed)
    )
}

function isHtmlString(value: any): boolean {
    if (typeof value !== 'string') return false
    const trimmed = value.trim()
    return /<!DOCTYPE html/i.test(trimmed) || /<\/?[a-z][\s\S]*>/i.test(trimmed)
}

function normalizeResultPayload(value: any) {
    let processed = value;

    if (typeof value === 'object' && value !== null) {
        // Try common result keys in our structured outputs
        processed = value.imageUrl || value.imageUrls?.[0] || value.htmlResult || value.content || value.result || JSON.stringify(value);
    }

    if (typeof processed !== 'string') {
        return { isHtmlResult: false, htmlResult: '', cleanedTextResult: String(processed) }
    }

    processed = stripCodeFences(processed)

    if (
        (processed.startsWith('"') && processed.endsWith('"')) ||
        (processed.startsWith("'") && processed.endsWith("'"))
    ) {
        processed = processed.slice(1, -1)
    }

    const isHtmlResult = looksLikeFullHtmlDocument(processed)

    return {
        isHtmlResult,
        htmlResult: isHtmlResult ? processed : '',
        cleanedTextResult: processed,
    }
}

function escapeHtml(text: string) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderMath(text: string) {
    if (!text) return ''

    let processed = stripCodeFences(String(text))
    const isHtml = isHtmlString(processed) || looksLikeFullHtmlDocument(processed)

    if (!isHtml) {
        processed = escapeHtml(processed)
    }

    processed = processed.replace(/\\\((.+?)\\\)/gs, (_, formula) => {
        return `<span class="math-inline">\\(${formula}\\)</span>`
    })

    processed = processed.replace(/\$\$(.+?)\$\$/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`
    })

    processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, formula) => {
        return `<div class="math-block">\\[${formula}\\]</div>`
    })

    if (!isHtml) {
        processed = processed.replace(/\n\n+/g, '</p><p class="my-3">')
        processed = '<p class="my-3">' + processed + '</p>'
        processed = processed.replace(/\n/g, '<br>')
    }

    return processed
}

function FullHtmlPreview({ html }: { html: string }) {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            // Only accept messages from our own iframes (srcdoc iframes have origin 'null')
            if (e.source !== iframeRef.current?.contentWindow) return
            if (e.data === 'IFRAME_READY') {
                setIsLoading(false)
            }
        }
        window.addEventListener('message', handler)
        const fallbackTimer = setTimeout(() => setIsLoading(false), 5000)

        return () => {
            window.removeEventListener('message', handler)
            clearTimeout(fallbackTimer)
        }
    }, [])

    useEffect(() => {
        const iframe = iframeRef.current
        if (!iframe) return

        const resize = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document
                if (!doc) return
                const height = (doc.body?.scrollHeight || doc.documentElement?.scrollHeight || 600) + 40
                iframe.style.height = `${Math.max(height, 400)}px`
            } catch {
                iframe.style.height = '800px'
            }
        }

        const handleLoad = () => resize()
        iframe.addEventListener('load', handleLoad)
        const timer = setTimeout(resize, 1200)

        return () => {
            iframe.removeEventListener('load', handleLoad)
            clearTimeout(timer)
        }
    }, [html])

    const alreadyHasMathJax = /mathjax/i.test(html)
    const hasHead = /<head[\s>]/i.test(html)
    const hasBody = /<body[\s>]/i.test(html)

    const INJECTED_HEAD = `${IFRAME_STYLES}${alreadyHasMathJax ? '' : MATHJAX_SCRIPT}`
    const INJECTED_BODY = `${IFRAME_READY_SCRIPT}`

    let finalHtml = html
    if (hasHead) {
        finalHtml = html.replace(/<head([^>]*)>/i, `<head$1>${INJECTED_HEAD}`)
    } else if (hasBody) {
        finalHtml = html.replace(/<body([^>]*)>/i, `<head>${INJECTED_HEAD}</head><body$1`)
    } else {
        finalHtml = `<!DOCTYPE html><html><head>${INJECTED_HEAD}</head><body><div class="container">${html}</div>${INJECTED_BODY}</body></html>`
    }

    if (hasHead || hasBody) {
        if (/<\/body>/i.test(finalHtml)) {
            finalHtml = finalHtml.replace(/<\/body>/i, `${INJECTED_BODY}</body>`)
        } else {
            finalHtml += INJECTED_BODY
        }
    }

    return (
        <div className="relative w-full border border-[#D8E6FF] rounded-2xl overflow-hidden bg-white min-h-[600px] flex items-center justify-center">
            {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 text-[#FF7E58] animate-spin mb-4" />
                    <p className="text-gray-500 font-medium animate-pulse">Готовим документ к просмотру (шрифты, формулы, верстка)...</p>
                </div>
            )}
            <iframe
                ref={iframeRef}
                title="HTML результат"
                srcDoc={finalHtml}
                className={`w-full border-0 transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                style={{ minHeight: '600px' }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
            />
        </div>
    )
}

export default function MaterialViewer({ lessonId, generationId, type, content: directContent, isEditable }: MaterialViewerProps) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(!!(lessonId && generationId) && !directContent)
    const [error, setError] = useState<string | null>(null)
    const [lessonTitle, setLessonTitle] = useState<string>('')
    const [generationType, setGenerationType] = useState<string>(type || '')
    const [htmlSlideIndex, setHtmlSlideIndex] = useState(0)
    const [htmlSlides, setHtmlSlides] = useState<any[]>([])
    const [isHtmlResult, setIsHtmlResult] = useState(false)
    const [cleanedTextResult, setCleanedTextResult] = useState('')
    const [gameData, setGameData] = useState<{ url: string; downloadUrl: string; topic: string; type: string } | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)
    const [showPdfModal, setShowPdfModal] = useState(false)
    const downloadMenuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const editorRef = useRef<PresentationEditorRef>(null)
    const contentRef = useRef<HTMLDivElement>(null)

    // Detect image content early so handleDownload can use it
    const isImageContent = (generationType === 'image' || generationType === 'photosession' || generationType === 'image_generation') &&
        (content?.startsWith('data:image') || content?.startsWith('http'))

    // Sync htmlSlides with rendered slides when presentation data is parsed
    useEffect(() => {
        if (generationType === 'presentation' && content) {
            try {
                const pd = typeof content === 'string' ? JSON.parse(content) : content
                const sl: any[] = pd?.slides || (Array.isArray(pd) ? pd : [])
                if (sl.length > 0 && typeof sl[0]?.html === 'string') setHtmlSlides(sl)
            } catch { /* ignore */ }
        }
    }, [content, generationType])

    // Listen for drag-position updates from iframe
    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            // Only accept messages from embedded srcdoc iframes (origin 'null') within our window
            if (e.origin !== 'null' && e.origin !== window.location.origin) return
            if (e.data?.type === 'slide-html') {
                setHtmlSlides(prev => prev.map((s, i) =>
                    i === htmlSlideIndex ? { ...s, html: e.data.html } : s
                ))
            }
        }
        window.addEventListener('message', onMsg)
        return () => window.removeEventListener('message', onMsg)
    }, [htmlSlideIndex])

    // Load MathJax and typeset content when it changes (for formulas in worksheets etc.)
    useEffect(() => {
        if (!content || generationType === 'presentation') return
        const win = window as any
        const doTypeset = () => {
            if (win.MathJax?.typesetPromise && contentRef.current) {
                win.MathJax.typesetPromise([contentRef.current]).catch(console.error)
            }
        }
        if (!win.MathJax) {
            win.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']], processEscapes: true }, svg: { fontCache: 'global' }, startup: { ready() { win.MathJax.startup.defaultReady(); doTypeset() } } }
            const s = document.createElement('script')
            s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
            s.async = true
            document.head.appendChild(s)
        } else {
            doTypeset()
        }
    }, [content, generationType])

    useEffect(() => {
        if (directContent !== undefined && directContent !== null) {
            if (type === 'presentation') {
                setContent(typeof directContent === 'object' ? JSON.stringify(directContent) : directContent);
            } else {
                const { htmlResult, isHtmlResult: isHtml, cleanedTextResult: cleaned } = normalizeResultPayload(directContent);
                setContent(isHtml ? htmlResult : cleaned);
                setIsHtmlResult(isHtml);
                setCleanedTextResult(cleaned);
            }
            setLoading(false);
            return;
        }

        if (!lessonId || !generationId) return;

        const fetchContent = async () => {
            try {
                // Fetch the full lesson to get the generation content
                // Optimization: In a real app, we might want a specific endpoint for this
                const response = await apiClient.get(`/lessons/${lessonId}`)
                const lesson = response.data
                setLessonTitle(lesson.title)

                const generation = lesson.generations.find((g: any) => g.id === generationId)

                if (!generation) {
                    setError('Материал не найден')
                } else if (!generation.outputData) {
                    setError('Контент еще не готов или отсутствует')
                } else {
                    setGenerationType(generation.generationType)

                    if (generation.generationType === 'game_generation') {
                        const od = generation.outputData
                        setGameData({
                            url: od.url || '',
                            downloadUrl: od.downloadUrl || '',
                            topic: od.topic || '',
                            type: od.type || '',
                        })
                    } else if (generation.generationType === 'presentation') {
                        setContent(typeof generation.outputData === 'object' ? JSON.stringify(generation.outputData) : generation.outputData);
                    } else {
                        const { htmlResult, isHtmlResult: isHtml, cleanedTextResult: cleaned } = normalizeResultPayload(generation.outputData);
                        setContent(isHtml ? htmlResult : cleaned);
                        setIsHtmlResult(isHtml);
                        setCleanedTextResult(cleaned);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch material:', err)
                setError('Не удалось загрузить материал')
            } finally {
                setLoading(false)
            }
        }

        fetchContent()
    }, [lessonId, generationId, directContent, type])

    const typeHasAnswers = (t: string) =>
        ['worksheet', 'quiz', 'exam-variant', 'lesson_preparation'].includes(t)

    const handleDownload = async (opts: { withAnswers?: boolean } = {}) => {
        // --- Презентация ---
        if (generationType === 'presentation') {
            const data = typeof content === 'string' ? JSON.parse(content) : content
            const downloadUrl = data?.pptxUrl || data?.pdfUrl || data?.exportUrl
            if (downloadUrl) {
                window.open(downloadUrl, '_blank')
            } else {
                alert('Ссылка на скачивание не найдена')
            }
            return
        }

        // --- Изображение ---
        if (isImageContent && content) {
            try {
                setIsDownloading(true)
                const response = await fetch(content)
                const blob = await response.blob()
                const url = window.URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `image-${Date.now()}.png`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                window.URL.revokeObjectURL(url)
            } catch (error) {
                console.error('Error downloading image:', error)
                window.open(content, '_blank')
            } finally {
                setIsDownloading(false)
            }
            return
        }

        if (!generationId) {
            alert('Не найден id генерации')
            return
        }

        setIsDownloading(true)
        try {
            const baseTitle = lessonTitle || generationType.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
            const suffix = typeHasAnswers(generationType) && opts.withAnswers === false ? '-student' : ''
            // Шлём id генерации — бекенд сам читает outputData из БД и рендерит
            // PDF тем же путём, что Telegram/MAX. Гарантирует 1-в-1 совпадение.
            await downloadPdfById(generationId, `${baseTitle}${suffix}.pdf`, { withAnswers: opts.withAnswers })
        } catch (error) {
            console.error('Failed to generate PDF:', error)
            alert('Ошибка при генерации PDF. Попробуйте снова.')
        } finally {
            setIsDownloading(false)
        }
    }



    // Parse content if it's a presentation (stored as JSON string)
    let presentationData: any = null;
    if (generationType === 'presentation' && content) {
        try {
            presentationData = typeof content === 'string' ? JSON.parse(content) : content;
        } catch (e) {
            console.error('Failed to parse presentation data', e);
        }
    }

    // Detect new HTML/CSS slide format
    const slides: any[] = presentationData?.slides || (Array.isArray(presentationData) ? presentationData : [])
    const isHtmlSlides = slides.length > 0 && typeof slides[0]?.html === 'string'


    const captureSlideAsImage = async (slide: any): Promise<string> => {
        const W = 1280, H = 720
        const container = document.createElement('div')
        container.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;z-index:-9999;`

        const styleEl = document.createElement('style')
        styleEl.textContent = `*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}${slide.css?.trim() || 'body{background:#1a1a2e;color:#fff;}'}`
        container.appendChild(styleEl)

        const tmp = document.createElement('div')
        tmp.innerHTML = DOMPurify.sanitize(slide.html || '', { FORBID_TAGS: ['script'] })
        tmp.style.cssText = `width:${W}px;height:${H}px;overflow:hidden;`
        container.appendChild(tmp)

        document.body.appendChild(container)
        await new Promise(r => setTimeout(r, 150))

        try {
            const canvas = await html2canvas(container, {
                width: W, height: H, scale: 1, useCORS: true, allowTaint: true,
                windowWidth: W, windowHeight: H, logging: false, imageTimeout: 5000,
            })
            return canvas.toDataURL('image/jpeg', 0.88)
        } finally {
            try { document.body.removeChild(container) } catch (_) { }
        }
    }

    const captureAllSlides = () => Promise.all(htmlSlides.map(s => captureSlideAsImage(s)))

    const downloadPDF = async () => {
        if (!htmlSlides.length) return
        setIsExporting(true)
        setShowDownloadMenu(false)
        try {
            const images = await captureAllSlides()
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 167.25] })
            images.forEach((imgData, i) => {
                if (i > 0) pdf.addPage([297, 167.25], 'landscape')
                pdf.addImage(imgData, 'JPEG', 0, 0, 297, 167.25)
            })
            pdf.save(`${lessonTitle || 'presentation'}.pdf`)
        } catch (e) { console.error('PDF export failed', e) }
        setIsExporting(false)
    }

    const downloadPPTX = async () => {
        if (!htmlSlides.length) return
        setIsExporting(true)
        setShowDownloadMenu(false)
        try {
            const [images, PptxGenJS] = await Promise.all([
                captureAllSlides(),
                import('pptxgenjs').then(m => m.default),
            ])
            const prs = new PptxGenJS()
            prs.layout = 'LAYOUT_16x9'
            images.forEach(imgData => {
                const prsSlide = prs.addSlide()
                prsSlide.addImage({ data: imgData, x: 0, y: 0, w: 10, h: 5.625 })
            })
            await prs.writeFile({ fileName: `${lessonTitle || 'presentation'}.pptx` })
        } catch (e) { console.error('PPTX export failed', e) }
        setIsExporting(false)
    }

    const handleSave = async (updatedSlides: any[]) => {
        if (!generationId) return;
        try {
            const updatedData = { ...presentationData, slides: updatedSlides };
            await apiClient.patch(`/generate/${generationId}`, updatedData);
            setContent(JSON.stringify(updatedData));
            alert('Презентация сохранена');
        } catch (err) {
            console.error('Failed to save presentation:', err);
            alert('Не удалось сохранить презентацию');
        }
    };

    // Save HTML slides back to API
    const handleSaveHtmlSlides = async () => {
        if (!generationId || !slides.length) return
        try {
            const updatedData = Array.isArray(presentationData) ?
                slides : { ...(presentationData || {}), slides }
            await apiClient.patch(`/generate/${generationId}`, updatedData)
            alert('Презентация сохранена')
        } catch (err) {
            console.error('Failed to save:', err)
            alert('Не удалось сохранить')
        }
    }

    // Close download menu on outside click (ref-based to avoid race with button clicks)
    useEffect(() => {
        if (!showDownloadMenu) return
        const handler = (e: MouseEvent) => {
            if (downloadMenuRef.current?.contains(e.target as Node)) return
            setShowDownloadMenu(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [showDownloadMenu])

    // Open HTML slides in the full workspace editor (all editing tools available)
    const openInWorkspaceEditor = () => {
        if (!slides.length) return
        try {
            sessionStorage.setItem('pendingPresentationSlides', JSON.stringify(slides))
            sessionStorage.setItem('pendingPresentationTitle', lessonTitle || 'Презентация')
            router.push('/workspace/presentations?loadFromSession=1')
        } catch (e) {
            console.error('Failed to store slides in sessionStorage:', e)
        }
    }

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 transition">
                        <ArrowLeft className="text-xl" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">{lessonTitle}</h1>
                        <p className="text-sm text-gray-500 capitalize">{getGenerationTypeLabel(generationType)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {generationType === 'presentation' ? (
                        <>
                            <button
                                onClick={isHtmlSlides ? handleSaveHtmlSlides : () => editorRef.current?.save()}
                                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2"
                            >
                                <Save size={18} /><span>Сохранить</span>
                            </button>
                            {isHtmlSlides ? (
                                <div className="relative" ref={downloadMenuRef}>
                                    <button
                                        onClick={() => setShowDownloadMenu(v => !v)}
                                        disabled={isExporting}
                                        className="px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 flex items-center gap-2 disabled:opacity-60"
                                    >
                                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                        <span>{isExporting ? 'Экспорт...' : 'Скачать'}</span>
                                    </button>
                                    {showDownloadMenu && (
                                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[150px] overflow-hidden">
                                            <button onClick={downloadPDF} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2 font-medium">
                                                <Download size={14} className="text-orange-500" /> PDF
                                            </button>
                                            <button onClick={downloadPPTX} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2 font-medium border-t border-gray-100">
                                                <Download size={14} className="text-blue-500" /> PPTX
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button onClick={() => editorRef.current?.export()} className="px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 flex items-center gap-2">
                                    <Download size={18} /><span>Скачать PDF</span>
                                </button>
                            )}
                        </>
                    ) : generationType === 'game_generation' && gameData?.url ? (
                        <a
                            href={gameData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition font-medium flex items-center gap-2 shadow-sm active:scale-95"
                        >
                            <ExternalLink size={18} />
                            <span>Открыть игру</span>
                        </a>
                    ) : !isImageContent && generationType !== 'presentation' && generationId ? (
                        <button
                            onClick={() => setShowPdfModal(true)}
                            disabled={isDownloading}
                            className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                        >
                            <Download size={18} />
                            <span>Скачать PDF</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => handleDownload()}
                            disabled={isDownloading}
                            className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                        >
                            {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                            <span>{isDownloading ? 'Скачивание...' : isImageContent ? 'Скачать изображение' : 'Скачать'}</span>
                        </button>
                    )}
                    <AssignTaskButton
                        generationId={generationId}
                        lessonId={lessonId}
                        topic={lessonTitle}
                    />
                </div>
            </div>

            {/* Content Viewer */}
            <div className="flex-1 overflow-hidden relative">
                {generationType === 'presentation' ? (
                    isHtmlSlides && htmlSlides.length > 0 ? (
                        // HTML/CSS slides: iframe viewer with drag-n-drop + dark backgrounds preserved
                        <div className="flex h-full">
                            {/* Thumbnail sidebar */}
                            <div className="w-52 bg-gray-900 overflow-y-auto flex flex-col gap-2 p-3 flex-shrink-0">
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Slides</p>
                                {htmlSlides.map((s: any, i: number) => (
                                    <button
                                        key={i}
                                        onClick={() => setHtmlSlideIndex(i)}
                                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${i === htmlSlideIndex ? 'border-blue-400 shadow-lg shadow-blue-900/50' : 'border-gray-700 opacity-70 hover:opacity-100 hover:border-gray-500'}`}
                                        style={{ aspectRatio: '16/9', width: '100%' }}
                                    >
                                        <iframe
                                            srcDoc={buildThumbSrc(s)}
                                            className="pointer-events-none"
                                            sandbox="allow-scripts"
                                            style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%', display: 'block' }}
                                        />
                                        <span className="absolute bottom-1.5 right-1.5 text-white text-[10px] font-bold bg-black/50 rounded px-1.5 py-0.5">{i + 1}</span>
                                    </button>
                                ))}
                            </div>
                            {/* Main slide + nav */}
                            <div className="flex-1 flex flex-col bg-gray-700">
                                <div className="flex-1 flex items-center justify-center p-6">
                                    <div className="w-full max-w-5xl shadow-2xl" style={{ aspectRatio: '16/9' }}>
                                        <iframe
                                            key={htmlSlideIndex}
                                            srcDoc={buildEditSrc(htmlSlides[htmlSlideIndex])}
                                            className="w-full h-full border-none rounded-xl"
                                            sandbox="allow-scripts allow-modals"
                                        />
                                    </div>
                                </div>
                                <div className="h-14 flex items-center justify-center gap-6 text-white bg-gray-800/80 backdrop-blur-sm">
                                    <button onClick={() => setHtmlSlideIndex(i => Math.max(0, i - 1))} disabled={htmlSlideIndex === 0} className="px-4 py-1.5 rounded-full text-sm hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-1">
                                        <ChevronLeft size={16} /> Назад
                                    </button>
                                    <span className="text-sm font-mono bg-white/10 rounded-full px-3 py-1">{htmlSlideIndex + 1} / {htmlSlides.length}</span>
                                    <button onClick={() => setHtmlSlideIndex(i => Math.min(htmlSlides.length - 1, i + 1))} disabled={htmlSlideIndex === htmlSlides.length - 1} className="px-4 py-1.5 rounded-full text-sm hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-1">
                                        Вперёд <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : slides.length > 0 ? (
                        // Legacy element-format slides: use PresentationEditor
                        <PresentationEditor ref={editorRef} initialData={slides} onSave={handleSave} />
                    ) : (presentationData?.pptxUrl || presentationData?.exportUrl) ? (
                        <iframe
                            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(presentationData.pptxUrl || presentationData.exportUrl)}`}
                            className="w-full h-full border-none bg-white"
                            title="Presentation Content"
                            allow="fullscreen"
                        />
                    ) : (
                        <div className="flex justify-center items-center h-full text-gray-500">Данные презентации не найдены.</div>
                    )

                ) : generationType === 'game_generation' && gameData ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-50 p-8">
                        <div className="bg-white rounded-3xl shadow-xl border border-purple-100 max-w-md w-full p-8 flex flex-col items-center gap-6">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-200">
                                <i className="fas fa-gamepad text-white text-3xl"></i>
                            </div>
                            <div className="text-center">
                                <h2 className="text-xl font-bold text-gray-900 mb-1">Обучающая игра готова!</h2>
                                {gameData.topic && (
                                    <p className="text-gray-500 text-sm">Тема: <span className="font-medium text-gray-700">{gameData.topic}</span></p>
                                )}
                            </div>
                            <a
                                href={gameData.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-lg rounded-2xl shadow-md shadow-purple-200 transition-all active:scale-95"
                            >
                                <i className="fas fa-play"></i>
                                Открыть игру
                                <ExternalLink size={18} />
                            </a>
                            {gameData.downloadUrl && (
                                <a
                                    href={gameData.downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-purple-200 text-purple-700 font-semibold rounded-2xl hover:bg-purple-50 transition-all active:scale-95"
                                >
                                    <Download size={16} />
                                    Скачать HTML-файл
                                </a>
                            )}
                        </div>
                    </div>
                ) : isImageContent ? (
                    // Image viewer
                    <div className="w-full h-full flex items-center justify-center bg-gray-900 p-8 relative">
                        <Image 
                            src={content!} 
                            alt="AI generated" 
                            fill
                            className="object-contain rounded-lg shadow-2xl p-8"
                            unoptimized
                        />
                    </div>
                ) : (
                    <div className="w-full h-full bg-white overflow-auto p-4 md:p-8">
                        {isHtmlResult ? (
                            <FullHtmlPreview html={content || ''} />
                        ) : (
                            <div
                                ref={contentRef}
                                className="formatted-content result-content prose max-w-4xl mx-auto worksheet-content text-black"
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMath(content || ''), { allowVulnerableTags: true } as any) }}
                            />
                        )}
                    </div>
                )}
            </div>
            <DownloadPdfModal
                isOpen={showPdfModal}
                onClose={() => setShowPdfModal(false)}
                generationId={generationId}
                filename={`${lessonTitle || generationType.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'}.pdf`}
                hasAnswers={typeHasAnswers(generationType)}
            />
        </div>
    )
}
