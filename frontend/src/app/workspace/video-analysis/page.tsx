'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Video, RefreshCw, Loader2, Maximize2, UploadCloud, Copy, Download, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { useServiceCosts } from '@/lib/hooks/useServiceCosts'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import GenerationProgress from '@/components/workspace/GenerationProgress'

export default function VideoAnalysisGenerator() {
    const [analysisType, setAnalysisType] = useState('sales')
    const [videoUrl, setVideoUrl] = useState('')
    const [localContent, setLocalContent] = useState('')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const types = [
        { value: 'sales', label: 'Пробный урок' },
        { value: 'methodological', label: 'Методический анализ' }
    ]


    const generate = async () => {
        if (!videoUrl) return;

        try {
            setLocalContent('<p>Анализируем видеофайл...</p><p>Пожалуйста, подождите, это может занять несколько минут.</p>')
            setEditMode(false)

            const params = {
                fileUrl: videoUrl,
                analysisType
            }

            const status = await generateAndWait({ type: 'video-analysis', params })
            const resultData = status.result

            let finalHtml = ''
            if (typeof resultData === 'string') {
                finalHtml = resultData
            } else if (resultData) {
                finalHtml = resultData.html || resultData.htmlResult || resultData.content || resultData.text || JSON.stringify(resultData, null, 2)
            }
            
            if (finalHtml && typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<div')) {
                finalHtml = `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при анализе видео: ${e.message}</p>`)
        }
    }

    const toggleEditMode = () => {
        setEditMode(!editMode)
    }

    useEffect(() => {
        if (!editMode && iframeRef.current && localContent) {
            const iframe = iframeRef.current;

            const attachListener = () => {
                const iframeDoc = iframe.contentDocument;
                if (iframeDoc && iframeDoc.body) {
                    const handleClick = () => {
                        setEditMode(true);
                    };
                    iframeDoc.body.addEventListener('click', handleClick);
                    iframeDoc.body.style.cursor = 'text';

                    // We attach a property to clean it up later if needed, 
                    // but usually when localContent changes the iframe reloads.
                    (iframe as any)._cleanup = () => {
                        iframeDoc.body.removeEventListener('click', handleClick);
                    };
                }
            };

            // Attempt to attach immediately
            attachListener();

            // Also attach on load in case it hasn't loaded yet
            iframe.addEventListener('load', attachListener);

            return () => {
                iframe.removeEventListener('load', attachListener);
                if ((iframe as any)._cleanup) {
                    (iframe as any)._cleanup();
                }
            };
        }
    }, [editMode, localContent]);

    const handleDownloadPdf = () => {
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const safeContent = DOMPurify.sanitize(localContent, { FORCE_BODY: true })
        const html = /<\/head>/i.test(safeContent)
            ? safeContent.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8">${autoPrint}</head><body>${safeContent}</body></html>`
        const win = window.open('', '_blank')
        if (!win) { toast.error('Разрешите всплывающие окна для этого сайта'); return }
        win.document.open(); win.document.write(html); win.document.close()
    }

    const handleCopy = async () => {
        if (!localContent) return
        try {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = DOMPurify.sanitize(localContent)
            const textToCopy = tempDiv.innerText || tempDiv.textContent || ''
            await navigator.clipboard.writeText(textToCopy)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            await navigator.clipboard.writeText(localContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const { costs } = useServiceCosts()
    const isUnderMaintenance = costs?.find(c => c.operationType === 'video_analysis')?.isUnderMaintenance || false

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Video className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Анализ Видео</h2>
                            <GenerationCostBadge operationType="video_analysis" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        {isUnderMaintenance && (
                            <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                                <p className="text-xs text-yellow-800 font-medium leading-relaxed">
                                    <span className="font-bold block mb-1">Технические работы</span>
                                    Данный инструмент временно недоступен. Мы уже работаем над его восстановлением.
                                </p>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Видео (Яндекс.Диск или MP4)</label>

                            <div className="space-y-2">
                                <input
                                    type="text"
                                    placeholder="Ссылка на Яндекс.Диск или MP4"
                                    value={videoUrl}
                                    onChange={(e) => {
                                        setVideoUrl(e.target.value);
                                    }}
                                    disabled={isUnderMaintenance}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-400 disabled:opacity-50"
                                />
                                <p className="text-[10px] text-gray-400 px-1 font-medium italic">
                                    * Вставьте публичную ссылку на видео
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип анализа</label>
                            <select
                                value={analysisType}
                                onChange={e => setAnalysisType(e.target.value)}
                                disabled={isUnderMaintenance}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 placeholder-gray-400 disabled:opacity-50"
                            >
                                {types.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !videoUrl || isUnderMaintenance}
                        className={`w-full relative group overflow-hidden rounded-xl bg-gradient-to-r font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50 ${isUnderMaintenance ? 'from-gray-400 to-gray-500' : 'from-indigo-500 to-blue-600 p-px'}`}
                    >
                        <div className={`relative flex items-center justify-center gap-2 px-4 py-3 rounded-[11px] text-white ${isUnderMaintenance ? 'bg-gray-400' : 'bg-gradient-to-r from-indigo-500 to-blue-600'}`}>
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : isUnderMaintenance ? <i className="fas fa-wrench" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : isUnderMaintenance ? 'Тех. работы' : 'Анализировать'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold tracking-wide uppercase">ОТЧЕТ ОБ АНАЛИЗЕ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {localContent && !isGenerating && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-all disabled:opacity-40 ml-1"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Скачать PDF / Печать
                            </button>
                            <button className="p-2 ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Анализируем видео..." accentClassName="bg-indigo-500" estimatedSeconds={90} />
                        ) : !localContent ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                    <Video className="w-8 h-8 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-600">Готов к работе</p>
                                    <p className="text-sm">Укажите ссылку на видео и нажмите «Анализировать»</p>
                                </div>
                            </div>
                        ) : editMode ? (
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={localContent}
                                className={`w-full h-full border-0 bg-white`}
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="Результат генерации"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
