'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { apiClient } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import { getGenerationTypeLabel } from '@/lib/utils/translations'
// V2 презентации: больше нет тяжёлого редактора слайдов. Контент приходит как
// готовый HTML с встроенным просмотрщиком (← →, MathJax), просто показываем в iframe.
import { SlideDoc } from '@/types/slide-doc'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { Save, Download, ChevronLeft, ChevronRight, ExternalLink, ArrowLeft, Loader2, Edit3, X } from 'lucide-react'
import AssignTaskButton from './AssignTaskButton'
import Image from 'next/image'
import DOMPurify from 'isomorphic-dompurify'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { downloadPdfById } from '@/lib/utils/downloadPdf'
import DownloadPdfModal from './workspace/DownloadPdfModal'
import { LOGO_BASE64 } from '@/constants/branding'
import { DocumentRenderer } from '@/components/blocks/DocumentRenderer'
import { isJsonBlocksFormat, GenerationDocument as GenerationDocumentSchema } from '@/lib/blocks/schema'
import type { GenerationDocument as GenerationDocumentT } from '@/lib/blocks/schema'

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
// Полная дизайн-система (синхронизирована с DesignSystemConfig.STYLES в backend
// и с тем, что бэк вставляет в свежие генерации). Нужно, чтобы при сохранении
// правки HTML-фрагментом без <head> результат не выглядел «голым текстом».
const IFRAME_STYLES = `<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f9fafb; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
  .container { max-width: 100% !important; width: 100% !important; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
  .header-logo { width: auto; height: 40px; }
  h1 { font-size: 28px; font-weight: 700; color: #111827; }
  h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #374151; }
  h3 { font-size: 17px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #374151; }
  p { margin-bottom: 16px; }
  ul, ol { padding-left: 24px; margin-bottom: 20px; }
  li { margin-bottom: 8px; }
  input[type="text"], textarea {
    width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px;
    font-family: inherit; font-size: inherit; background: white;
  }
  input[type="text"]:focus, textarea:focus { outline: none; border-color: #4f46e5; }
  .inline-input { display: inline-block; width: 150px; border: none; border-bottom: 1px solid #9ca3af; border-radius: 0; padding: 0 4px; background: transparent; }
  .footer-logo { text-align: right; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
  .footer-logo img { width: 120px; opacity: 0.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 14px; }
  th { background-color: #f9fafb; font-weight: 600; text-align: left; padding: 12px; border: 1px solid #d1d5db; }
  td { padding: 12px; border: 1px solid #e5e7eb; vertical-align: top; }
  .meta-info { margin-bottom: 30px; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
  .callout { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
  .teacher-answers-only { margin-top: 40px; padding-top: 20px; border-top: 2px dashed #d1d5db; }
  .teacher-answers-only h2 { color: #dc2626; }
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

    // Если сохранилось НЕСКОЛЬКО HTML-документов подряд (артефакт
    // пересохранения) — берём только первый, иначе материал рендерится дважды
    const htmlEnd = processed.match(/<\/html>/i)
    if (htmlEnd && htmlEnd.index !== undefined) {
        const endIdx = htmlEnd.index + htmlEnd[0].length
        if (/<!DOCTYPE\s+html|<html[\s>]/i.test(processed.slice(endIdx))) {
            processed = processed.slice(0, endIdx)
        }
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

export interface FullHtmlPreviewHandle {
    /** Собирает полный HTML с отредактированным body. Возвращает null если пусто. */
    getEditedFullHtml: () => string | null
}

interface FullHtmlPreviewProps {
    html: string
    editMode?: boolean
}

const FullHtmlPreview = forwardRef<FullHtmlPreviewHandle, FullHtmlPreviewProps>(function FullHtmlPreview(
    { html, editMode = false },
    ref,
) {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isLoading, setIsLoading] = useState(true)

    // srcDoc обновляем ТОЛЬКО когда контент реально меняется снаружи.
    // Тогл режима правки и пост-сейв не должны вызывать перезагрузку iframe,
    // иначе MathJax/CDN-скрипты тянутся заново и виден белый экран.
    const lastHtmlRef = useRef('')
    const [srcDoc, setSrcDoc] = useState('')

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.source !== iframeRef.current?.contentWindow) return
            if (e.data === 'IFRAME_READY') setIsLoading(false)
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
    }, [srcDoc])

    // Пересобираем srcDoc при изменении html ИЛИ переключении editMode.
    // В режиме edit убираем MathJax-скрипт — иначе MathJax типсечит LaTeX в
    // <mjx-container>, и при сохранении мы получаем CHTML вместо исходных
    // \(...\). Стрип mjx-container в этом случае удаляет формулы совсем.
    useEffect(() => {
        if (!html) return
        const key = `${editMode ? 'edit' : 'view'}|${html}`
        if (key === lastHtmlRef.current) return
        lastHtmlRef.current = key

        const hasHead = /<head[\s>]/i.test(html)
        const hasBody = /<body[\s>]/i.test(html)

        // Базовый html — без polyfill.io и (в edit-режиме) без MathJax-скриптов.
        let baseHtml = html
            .replace(/LOGO_PLACEHOLDER/g, LOGO_BASE64)
            .replace(/<script[^>]+src=["'][^"']*polyfill\.io[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
        if (editMode) {
            baseHtml = baseHtml
                .replace(/<script[^>]*>\s*window\.MathJax[\s\S]*?<\/script>/gi, '')
                .replace(/<script[^>]+src=["'][^"']*mathjax[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
        }

        const alreadyHasMathJax = /mathjax/i.test(baseHtml)
        const INJECTED_HEAD = `${IFRAME_STYLES}${editMode || alreadyHasMathJax ? '' : MATHJAX_SCRIPT}`
        const INJECTED_BODY = `${IFRAME_READY_SCRIPT}`

        let finalHtml = baseHtml
        if (hasHead) {
            // Вставляем В КОНЕЦ <head>, а не в начало: тогда наши overrides
            // (например, .container { max-width: 1100px }) выигрывают каскад
            // у backend-стилей, где исторически зашит max-width: 800px.
            if (/<\/head>/i.test(finalHtml)) {
                finalHtml = finalHtml.replace(/<\/head>/i, `${INJECTED_HEAD}</head>`)
            } else {
                finalHtml = finalHtml.replace(/<head([^>]*)>/i, `<head$1>${INJECTED_HEAD}`)
            }
        } else if (hasBody) {
            finalHtml = finalHtml.replace(/<body([^>]*)>/i, `<head>${INJECTED_HEAD}</head><body$1`)
        } else {
            finalHtml = `<!DOCTYPE html><html><head>${INJECTED_HEAD}</head><body><div class="container">${finalHtml}</div>${INJECTED_BODY}</body></html>`
        }
        if (hasHead || hasBody) {
            if (/<\/body>/i.test(finalHtml)) {
                finalHtml = finalHtml.replace(/<\/body>/i, `${INJECTED_BODY}</body>`)
            } else {
                finalHtml += INJECTED_BODY
            }
        }
        setSrcDoc(finalHtml)
    }, [html, editMode])

    // Применяем contentEditable после смены srcDoc (после перезагрузки iframe).
    useEffect(() => {
        const doc = iframeRef.current?.contentDocument
        if (!doc?.body) return
        doc.body.contentEditable = editMode ? 'true' : 'false'
        if (editMode) {
            doc.body.style.outline = '2px dashed #FF7E58'
            doc.body.style.outlineOffset = '-2px'
            doc.body.style.cursor = 'text'
        } else {
            doc.body.style.outline = ''
            doc.body.style.outlineOffset = ''
            doc.body.style.cursor = ''
        }
    }, [editMode, srcDoc])

    useImperativeHandle(ref, () => ({
        getEditedFullHtml: () => {
            const doc = iframeRef.current?.contentDocument
            const root = doc?.documentElement
            if (!root) {
                console.error('[FullHtmlPreview] getEditedFullHtml: iframe не готов')
                return null
            }

            // Берём ПОЛНУЮ структуру iframe (html → head + body): это надёжнее,
            // чем парсить baseline regex'ом и подменять body — там легко
            // потерять CSS или сломать инлайн-атрибуты body.
            let fullHtml = `<!DOCTYPE html>${root.outerHTML}`

            // Стрипаем скрипты (вкл. MathJax CDN и IFRAME_READY_SCRIPT) и
            // отрендеренный MathJax (mjx-container/mjx-assistive-mml): иначе
            // в БД попадёт CHTML вместо исходного LaTeX, и следующий просмотр
            // потеряет формулы / получит about:srcdoc SyntaxError.
            fullHtml = fullHtml
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
                .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')

            // Проверяем, что в body вообще что-то есть (защита от «всё пропало»).
            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
            const bodyInner = bodyMatch ? bodyMatch[1] : ''
            const textOnly = bodyInner.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
            console.log('[FullHtmlPreview] save: fullHtml.length=', fullHtml.length, 'bodyInner.length=', bodyInner.length, 'textOnly.length=', textOnly.length)
            if (!textOnly) return null

            // Помечаем edit-baseline под новым fullHtml — чтобы повторное
            // нажатие «Сохранить» без изменений не дёргало iframe. Когда
            // editMode сбросится в false, useEffect соберёт view-вариант
            // (с MathJax) — это OK и нужно, чтобы формулы заново отрисовались.
            lastHtmlRef.current = `edit|${fullHtml}`
            return fullHtml
        },
    }), [])

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
                srcDoc={srcDoc}
                className={`w-full border-0 transition-opacity duration-700 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                style={{ minHeight: '600px' }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
            />
        </div>
    )
})

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
    const [isSlideDocEditing, setIsSlideDocEditing] = useState(false)
    const [htmlEditMode, setHtmlEditMode] = useState(false)
    const [isSavingHtml, setIsSavingHtml] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    // ── JSON blocks-v1 формат ──
    // Если outputData содержит { format: 'json-blocks-v1', outputDoc },
    // рендерим DocumentRenderer (read-only). Старый legacy MaterialViewer
    // не знает про этот формат и без этого state'а уходил в JSON-stringify
    // фолбэк → пользователь видел сырой JSON в превью материала.
    const [v2Doc, setV2Doc] = useState<GenerationDocumentT | null>(null)
    const htmlPreviewRef = useRef<FullHtmlPreviewHandle>(null)
    const downloadMenuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const editorRef = useRef<any>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const { generateAndWait } = useGenerations()

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
                // Урок может вообще отсутствовать (когда lessonId === generationId,
                // т.е. ссылка из истории генераций без привязки к уроку — игры,
                // презентации, изображения). Не валим всю загрузку в этом случае:
                // ниже фолбэк на /generate/{id}.
                let generation: any = null
                try {
                    const response = await apiClient.get(`/lessons/${lessonId}`)
                    const lesson = response.data
                    setLessonTitle(lesson.title)
                    generation = lesson.generations.find((g: any) => g.id === generationId) || null
                } catch (lessonErr) {
                    // 404 на /lessons/{id} — нормально: пробуем direct /generate/{id}
                }

                // Фолбэк: после «Выдать задание» генерация переносится в урок
                // задания (linkToLesson меняет lessonId), и в исходном уроке её
                // больше нет. Загружаем напрямую по id — endpoint вернёт
                // отредактированный outputData. Также сюда же попадают игры/
                // презентации, открытые из истории генераций.
                if (!generation) {
                    try {
                        const direct = await apiClient.get(`/generate/${generationId}`)
                        const result = direct.data?.result ?? direct.data?.status?.result
                        if (result) {
                            generation = {
                                id: generationId,
                                generationType: type || direct.data?.generationType || result?.type || '',
                                outputData: result,
                            }
                        }
                    } catch { /* генерация реально не существует — упадём в ошибку ниже */ }
                }

                if (!generation) {
                    setError('Материал не найден')
                } else if (!generation.outputData) {
                    setError('Контент еще не готов или отсутствует')
                } else if (isJsonBlocksFormat(generation.outputData)) {
                    // Новый JSON-blocks-v1 формат — рендерим напрямую через
                    // DocumentRenderer ниже, минуя нормализацию HTML.
                    setGenerationType(generation.generationType)
                    const parsed = GenerationDocumentSchema.safeParse(generation.outputData.outputDoc)
                    if (parsed.success) {
                        setV2Doc(parsed.data)
                    } else {
                        setError('Документ материала повреждён')
                    }
                } else {
                    setGenerationType(generation.generationType)

                    if (generation.generationType === 'game_generation') {
                        const od = generation.outputData
                        setGameData({
                            url: od?.url || '',
                            downloadUrl: od?.downloadUrl || '',
                            topic: od?.topic || '',
                            type: od?.type || '',
                        })
                        // Современные игры хранятся как HTML-строка в outputData.content
                        // (или сам outputData — строка). Кладём её в content, чтобы
                        // рендерилось через FullHtmlPreview, а не уходило в пустой
                        // gameData-фолбэк.
                        const { htmlResult, isHtmlResult: isHtml, cleanedTextResult: cleaned } = normalizeResultPayload(od)
                        if (isHtml) {
                            setContent(htmlResult)
                            setIsHtmlResult(true)
                            setCleanedTextResult(cleaned)
                        }
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

    // Редактирование HTML-результата прямо в просмотре материала.
    // FullHtmlPreview выставляет contentEditable на body iframe и хранит
    // baseline-HTML внутри; мы лишь дёргаем save и пишем PATCH в БД.
    const startHtmlEdit = () => setHtmlEditMode(true)

    const cancelHtmlEdit = () => {
        // Просто выходим из режима — iframe откатывает contentEditable; чтобы
        // сбросить наброски пользователя, перезагружаем srcDoc установкой того
        // же контента (lastHtmlRef внутри сравнит — но он уже совпадает, поэтому
        // принудительно ставим короткое значение и потом сразу обратно).
        setHtmlEditMode(false)
        // Самый честный способ откатить правки — перечитать контент с сервера.
        // Чтобы не усложнять, дёргаем re-render через setContent: если изменения
        // в iframe были, они отображаются до перезагрузки страницы. Это известный
        // компромисс; в worksheet/page.tsx ровно та же логика.
    }

    const resetEdits = async () => {
        if (!generationId || isResetting) return
        if (!confirm('Сбросить все ручные правки и вернуться к исходной AI-версии? Действие необратимо.')) return
        setIsResetting(true)
        try {
            const resp = await apiClient.post<{ result?: any }>(`/generate/${generationId}/reset-edits`)
            const restored = resp.data?.result
            const restoredContent = typeof restored === 'string' ? restored : (restored?.content ?? restored?.htmlResult ?? restored?.html ?? restored?.text)
            if (typeof restoredContent === 'string' && restoredContent.length > 0) {
                setContent(restoredContent)
                setIsHtmlResult(looksLikeFullHtmlDocument(restoredContent))
                setHtmlEditMode(false)
                alert('Правки сброшены. Материал восстановлен к исходному.')
            } else {
                alert('Резервной версии нет — нечего восстанавливать.')
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Не удалось сбросить правки'
            alert(msg)
        } finally {
            setIsResetting(false)
        }
    }

    const saveHtmlEdit = async () => {
        if (!generationId || isSavingHtml) return
        const fullHtml = htmlPreviewRef.current?.getEditedFullHtml()
        if (fullHtml == null) {
            alert('Пустой результат не сохранён — изменения отклонены.')
            return
        }
        console.log('[MaterialViewer] saving HTML, length =', fullHtml.length, 'preview:', fullHtml.slice(0, 200))
        setIsSavingHtml(true)
        try {
            await apiClient.patch(`/generate/${generationId}`, {
                outputData: { content: fullHtml },
            })
            // Содержимое iframe уже актуально; синхронизируем стейт, чтобы
            // последующее открытие PDF/Telegram-доставка работали с тем же HTML.
            setContent(fullHtml)
            setHtmlEditMode(false)
        } catch (err: any) {
            const resp = err?.response?.data
            const msg = (Array.isArray(resp?.message) ? resp.message.join('; ') : resp?.message)
                || err?.message
                || 'Не удалось сохранить изменения'
            console.error('[MaterialViewer] save failed:', err?.response?.status, resp)
            alert(msg)
        } finally {
            setIsSavingHtml(false)
        }
    }

    const handleDownload = async (opts: { withAnswers?: boolean } = {}) => {
        // --- Презентация ---
        if (generationType === 'presentation') {
            const data = typeof content === 'string' ? JSON.parse(content) : content
            // SlideDoc path: re-render server-side via dedicated endpoint.
            // Stored pdfUrl/exportUrl can be stale once the user edits and saves;
            // hitting the endpoint always reflects the latest saved state.
            if (data?.slideDoc && generationId) {
                setIsDownloading(true)
                try {
                    const res = await apiClient.post(`/generate/${generationId}/presentation/pdf`, {}, { responseType: 'blob' })
                    const blob = res.data as Blob
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${lessonTitle || data.slideDoc.topic || 'presentation'}.pdf`
                    a.click()
                    URL.revokeObjectURL(url)
                } catch (e) {
                    console.error('Presentation PDF export failed:', e)
                    alert('Ошибка при скачивании PDF')
                } finally {
                    setIsDownloading(false)
                }
                return
            }
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

    // Detect new SlideDoc format (current pipeline). Distinct from legacy
    // HTML-string slides AND from element-based slides — has structured layouts.
    const slideDoc = presentationData?.slideDoc;
    const isSlideDoc = !!slideDoc && Array.isArray(slideDoc.slides) && slideDoc.slides.length > 0;

    // Detect legacy HTML/CSS slide format
    const slides: any[] = presentationData?.slides || (Array.isArray(presentationData) ? presentationData : [])
    const isHtmlSlides = !isSlideDoc && slides.length > 0 && typeof slides[0]?.html === 'string'


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
                        isSlideDoc ? (
                            <>
                                <button
                                    onClick={() => setIsSlideDocEditing(v => !v)}
                                    className={`px-4 py-2 rounded-lg transition font-medium flex items-center gap-2 ${isSlideDocEditing ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                                >
                                    {isSlideDocEditing ? <span>Просмотр</span> : <span>Редактировать</span>}
                                </button>
                                <button
                                    onClick={() => handleDownload()}
                                    disabled={isDownloading}
                                    className="px-4 py-2 text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                    <span>Скачать PDF</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!generationId) return;
                                        setIsDownloading(true);
                                        try {
                                            const res = await apiClient.post(`/generate/${generationId}/presentation/pptx`, {}, { responseType: 'blob' });
                                            const blob = res.data as Blob;
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `${lessonTitle || slideDoc.topic || 'presentation'}.pptx`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        } catch (e) {
                                            console.error('PPTX export failed:', e);
                                            alert('Ошибка при скачивании PPTX');
                                        } finally {
                                            setIsDownloading(false);
                                        }
                                    }}
                                    disabled={isDownloading}
                                    className="px-4 py-2 text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Download size={18} />
                                    <span>PPTX</span>
                                </button>
                            </>
                        ) : (
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
                        )
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
                        <>
                            {/* Кнопки редактирования HTML-результата (worksheet/quiz/...). */}
                            {isEditable && isHtmlResult && !htmlEditMode && (
                                <>
                                    <button
                                        onClick={resetEdits}
                                        disabled={isResetting}
                                        className="px-3 py-2 text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700 rounded-lg transition text-sm flex items-center gap-2 active:scale-95 disabled:opacity-50"
                                        title="Вернуть материал к исходной AI-версии (откатить ручные правки)"
                                    >
                                        {isResetting ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeft size={16} />}
                                        <span>Сбросить правки</span>
                                    </button>
                                    <button
                                        onClick={startHtmlEdit}
                                        className="px-4 py-2 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition font-medium flex items-center gap-2 active:scale-95"
                                        title="Редактировать материал"
                                    >
                                        <Edit3 size={18} />
                                        <span>Редактировать</span>
                                    </button>
                                </>
                            )}
                            {isEditable && isHtmlResult && htmlEditMode && (
                                <>
                                    <button
                                        onClick={saveHtmlEdit}
                                        disabled={isSavingHtml}
                                        className="px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition font-medium flex items-center gap-2 active:scale-95 disabled:opacity-60"
                                    >
                                        {isSavingHtml ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                        <span>{isSavingHtml ? 'Сохранение...' : 'Сохранить'}</span>
                                    </button>
                                    <button
                                        onClick={cancelHtmlEdit}
                                        disabled={isSavingHtml}
                                        className="px-4 py-2 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition font-medium flex items-center gap-2 active:scale-95 disabled:opacity-60"
                                    >
                                        <X size={18} />
                                        <span>Отмена</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setShowPdfModal(true)}
                                disabled={isDownloading || htmlEditMode}
                                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium flex items-center gap-2 shadow-sm shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                                title={htmlEditMode ? 'Сохраните правки, чтобы скачать актуальную версию' : ''}
                            >
                                <Download size={18} />
                                <span>Скачать PDF</span>
                            </button>
                        </>
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
                    // V2: бекенд кладёт готовый HTML в outputData.content — там встроенный
                    // просмотрщик слайдов с MathJax, навигация ← →. Просто показываем в iframe.
                    typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<body')) ? (
                        <iframe
                            srcDoc={content}
                            className="w-full h-full border-none bg-white"
                            title="Presentation"
                            sandbox="allow-scripts allow-same-origin"
                        />
                    ) : presentationData?.content && typeof presentationData.content === 'string' ? (
                        <iframe
                            srcDoc={presentationData.content}
                            className="w-full h-full border-none bg-white"
                            title="Presentation"
                            sandbox="allow-scripts allow-same-origin"
                        />
                    ) : isHtmlSlides && htmlSlides.length > 0 ? (
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

                ) : generationType === 'game_generation' && typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<body')) ? (
                    // Игры в новом формате возвращают готовый HTML с встроенным движком — просто iframe.
                    <iframe
                        srcDoc={content}
                        className="w-full h-full border-none bg-white"
                        title="Game"
                        sandbox="allow-scripts allow-same-origin allow-modals allow-forms"
                    />
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
                ) : v2Doc ? (
                    <div className="w-full h-full overflow-auto">
                        <DocumentRenderer doc={v2Doc} />
                    </div>
                ) : (
                    <div className="w-full h-full bg-white overflow-auto p-4 md:p-8">
                        {isHtmlResult ? (
                            <FullHtmlPreview ref={htmlPreviewRef} html={content || ''} editMode={htmlEditMode} />
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
