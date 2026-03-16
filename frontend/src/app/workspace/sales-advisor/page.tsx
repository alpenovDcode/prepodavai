'use client'

import { useState, useRef, useEffect } from 'react'
import { LineChart, RefreshCw, Loader2, Maximize2, UploadCloud, X, Copy, Download, Edit3, Eye } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function SalesAdvisorGenerator() {
    const [images, setImages] = useState<{ file: File, url: string, hash: string }[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Загрузите скриншоты переписки с клиентом (до 6 штук) для получения рекомендаций по продажам.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        // Check if adding these files exceeds the limit
        if (images.length + files.length > 6) {
            alert('Можно загрузить максимум 6 скриншотов')
            return
        }

        setIsUploading(true)

        try {
            const newImages = await Promise.all(files.map(async (file) => {
                // Create local object URL for preview
                const url = URL.createObjectURL(file)

                // Placeholder: in a real app, upload the file and get a hash/URL
                // For now, we simulate a successful upload delay
                await new Promise(resolve => setTimeout(resolve, 500))
                const hash = 'simulated_hash_' + Date.now() + '_' + Math.random().toString(36).substring(7)

                return { file, url, hash }
            }))

            setImages(prev => [...prev, ...newImages])
        } catch (error) {
            console.error('Upload failed', error)
            alert('Ошибка при загрузке изображений')
        } finally {
            setIsUploading(false)
            // Reset input so the same files can be selected again if needed
            e.target.value = ''
        }
    }

    const removeImage = (indexToRemove: number) => {
        setImages(prev => prev.filter((_, index) => index !== indexToRemove))
    }

    const generate = async () => {
        if (images.length === 0) return;

        try {
            setLocalContent('<p>Анализируем диалог с клиентом...</p><p>Пожалуйста, подождите.</p>')
            setEditMode(false)

            // Extract hashes for the API
            const imageHashes = images.map(img => img.hash)

            const params = {
                imageHashes
            }

            const status = await generateAndWait({ type: 'sales_advisor', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при анализе: ${e.message}</p>`)
        }
    }

    const toggleEditMode = () => {
        setEditMode(!editMode)
    }

    useEffect(() => {
        if (!editMode && iframeRef.current && localContent) {
            const iframeDoc = iframeRef.current.contentDocument;
            if (iframeDoc) {
                const handleClick = () => {
                    setEditMode(true);
                };
                iframeDoc.body.addEventListener('click', handleClick);
                iframeDoc.body.style.cursor = 'text';

                return () => {
                    iframeDoc.body.removeEventListener('click', handleClick);
                };
            }
        }
    }, [editMode, localContent]);

    const handleDownloadPdf = () => {
        iframeRef.current?.contentWindow?.print()
    }

    const handleCopy = async () => {
        if (!localContent) return
        try {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = localContent
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

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[340px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                        <LineChart className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">ИИ-Продажник</h2>
                            <GenerationCostBadge operationType="sales_advisor" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-bold text-gray-700">Скриншоты диалога</label>
                                <span className="text-xs text-gray-500 font-medium">{images.length} / 6</span>
                            </div>

                            {/* Upload Area */}
                            {images.length < 6 && (
                                <div className="mt-2 text-center mb-4">
                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-teal-100 border-dashed rounded-xl cursor-pointer bg-teal-50/50 hover:bg-teal-50 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {isUploading ? (
                                                <Loader2 className="w-6 h-6 text-teal-500 animate-spin mb-1" />
                                            ) : (
                                                <UploadCloud className="w-6 h-6 text-teal-500 mb-1" />
                                            )}
                                            <p className="text-xs text-center px-4 font-medium text-gray-500">
                                                Загрузить изображения
                                            </p>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} disabled={isUploading} />
                                    </label>
                                </div>
                            )}

                            {/* Image Previews */}
                            {images.length > 0 && (
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden group">
                                            <img src={img.url} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button
                                                    onClick={() => removeImage(idx)}
                                                    className="p-1.5 bg-white/20 hover:bg-red-500 text-white rounded-full transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || isUploading || images.length === 0}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Анализировать продажи'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tracking-wide text-gray-500">РЕКОМЕНДАЦИИ ИИ-ПРОДАЖНИКА</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {localContent && !localContent.includes('Загрузите скриншоты') && !localContent.includes('Анализируем диалог') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating || localContent.includes('Загрузите скриншоты')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating || localContent.includes('Загрузите скриншоты')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-all disabled:opacity-40 ml-1"
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
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
                                <p className="font-medium">Анализируем скриншоты...</p>
                                <p className="text-sm text-gray-400">Пожалуйста, подождите.</p>
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
                                sandbox="allow-same-origin allow-scripts allow-modals"
                                title="Результат генерации"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
