'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import PresentationEditor, { PresentationEditorRef } from './PresentationEditor'
import PresentationPlayer from './PresentationPlayer'
import { Save, Download, ChevronLeft, ChevronRight, ExternalLink, ArrowLeft } from 'lucide-react'
import Image from 'next/image'

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
    if (tmp) { tmp.innerHTML = slide.html || ''; tmp.querySelectorAll('script').forEach(s => s.remove()) }
    const html = tmp ? tmp.innerHTML : (slide.html || '')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}${css}</style></head><body>${html}</body></html>`
}

// Build srcdoc for main editable slide (with drag script)
const buildEditSrc = (slide: any): string => {
    const css = slide.css?.trim() || 'body{background:#1a1a2e;color:#fff;}'
    const tmp = typeof document !== 'undefined' ? document.createElement('div') : null
    if (tmp) { tmp.innerHTML = slide.html || ''; tmp.querySelectorAll('script, #__drag-script__').forEach(s => s.remove()) }
    const html = tmp ? tmp.innerHTML : (slide.html || '')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}${css}</style></head><body>${html}${DRAG_SCRIPT}</body></html>`
}

export default function MaterialViewer({ lessonId, generationId, type, content: directContent, isEditable }: MaterialViewerProps) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(!!(lessonId && generationId) && !directContent)
    const [error, setError] = useState<string | null>(null)
    const [lessonTitle, setLessonTitle] = useState<string>('')
    const [generationType, setGenerationType] = useState<string>(type || '')
    const [htmlSlideIndex, setHtmlSlideIndex] = useState(0)
    const [htmlSlides, setHtmlSlides] = useState<any[]>([])
    const router = useRouter()
    const editorRef = useRef<PresentationEditorRef>(null)
    const contentRef = useRef<HTMLDivElement>(null)

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
                // Ensure directContent is a string before calling extractHtmlPayload
                let contentString = '';
                if (typeof directContent === 'string') {
                    contentString = directContent;
                } else if (typeof directContent === 'object') {
                    // If it has a 'content' property (common in our JSON structure), use that, otherwise stringify
                    contentString = directContent.content || JSON.stringify(directContent);
                }

                const { html } = extractHtmlPayload(contentString);
                setContent(html);
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

                    // Extract content from the normalized result object
                    let rawContent = '';
                    if (typeof generation.outputData === 'string') {
                        rawContent = generation.outputData;
                    } else if (generation.outputData?.content) {
                        rawContent = generation.outputData.content;
                    } else {
                        rawContent = JSON.stringify(generation.outputData, null, 2);
                    }

                    if (generation.generationType === 'presentation') {
                        // For presentation, we need the full JSON object to get URLs
                        // If it was stringified, keep it as string, we'll parse it in render
                        // If it was object (from generation.outputData directly), stringify it
                        setContent(typeof generation.outputData === 'object' ? JSON.stringify(generation.outputData) : generation.outputData);
                    } else {
                        // Process the content (remove markdown, quotes, etc.) for text generations
                        const { html } = extractHtmlPayload(rawContent);
                        setContent(html);
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

    // Helper function to clean up HTML content (ported from TelegramService)
    const extractHtmlPayload = (value: string): { isHtml: boolean; html: string } => {
        if (!value) {
            return { isHtml: false, html: '' };
        }

        let processed = value.trim();

        // Remove markdown blocks ```html ... ```
        if (processed.startsWith('```')) {
            processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
        }

        // Remove surrounding quotes if present
        if (
            (processed.startsWith('"') && processed.endsWith('"')) ||
            (processed.startsWith("'") && processed.endsWith("'"))
        ) {
            processed = processed.slice(1, -1);
        }

        // Unescape common JSON escapes if it looks like it was double-stringified
        processed = processed.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        const isHtml = /<!DOCTYPE html/i.test(processed) || /<html[\s>]/i.test(processed) || /<body[\s>]/i.test(processed) || /<\/?[a-z][\s\S]*>/i.test(processed);

        return { isHtml, html: processed };
    }

    const handleDownload = () => {
        if (generationType === 'presentation') {
            // For presentations, try to download PPTX first, then PDF
            const data = typeof content === 'string' ? JSON.parse(content) : content;
            const downloadUrl = data?.pptxUrl || data?.pdfUrl || data?.exportUrl;

            if (downloadUrl) {
                window.open(downloadUrl, '_blank');
            } else {
                alert('Ссылка на скачивание не найдена');
            }
            return;
        }

        if (!content) return

        const blob = new Blob([content], { type: 'text/html' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${generationType}-${new Date().toISOString().split('T')[0]}.html`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-screen bg-gray-50">
                <div className="text-red-500 text-xl font-semibold mb-4">{error}</div>
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                    Назад
                </button>
            </div>
        )
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

    // Detect image content
    const isImageContent = (generationType === 'image' || generationType === 'photosession') &&
        (content?.startsWith('data:image') || content?.startsWith('http'))

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

    // PDF export for HTML/CSS slides via print window
    const handleHtmlExportPDF = () => {
        if (!slides.length) return
        const win = window.open('', '_blank')
        if (!win) return
        const slidePages = slides.map((s: any) => {
            const css = s.css?.trim() || 'body{background:#1a1a2e;color:#fff;}'
            const tmp = document.createElement('div')
            tmp.innerHTML = s.html || ''
            tmp.querySelectorAll('script').forEach(el => el.remove())
            const html = tmp.innerHTML
            return `<div class="slide-page">${html}<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif}${css}</style></div>`
        }).join('')
        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:297mm 167mm;margin:0}body{margin:0}.slide-page{width:297mm;height:167mm;overflow:hidden;page-break-after:always;position:relative;display:block}</style></head><body>${slidePages}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`)
        win.document.close()
    }

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
                        <p className="text-sm text-gray-500 capitalize">{generationType === 'presentation' ? 'Презентация' : generationType === 'image' ? 'Изображение' : generationType}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {generationType === 'presentation' && (
                        <>
                            <button onClick={() => editorRef.current?.save()} className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2">
                                <Save size={18} /><span>Сохранить</span>
                            </button>
                            <button onClick={() => editorRef.current?.export()} className="px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 flex items-center gap-2">
                                <Download size={18} /><span>Скачать PDF</span>
                            </button>
                        </>
                    )}
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
                                            sandbox="allow-same-origin"
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
                                            sandbox="allow-same-origin allow-scripts allow-modals"
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
                    <div className="w-full h-full bg-white overflow-auto p-8">
                        <div
                            ref={contentRef}
                            className="prose max-w-4xl mx-auto worksheet-content text-black"
                            dangerouslySetInnerHTML={{ __html: content || '' }}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
