'use client'

import { useState, useRef, useEffect } from 'react'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import DOMPurify from 'isomorphic-dompurify'
import { downloadPdf } from '@/lib/utils/downloadPdf'
import { LineChart, RefreshCw, Loader2, UploadCloud, X, Copy, Download, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import AssignTaskButton from '@/components/AssignTaskButton'
import GenerationProgress from '@/components/workspace/GenerationProgress'
import { apiClient } from '@/lib/api/client'

export default function SalesAdvisorGenerator() {
    const [images, setImages] = useState<{ file: File, previewUrl: string, serverUrl: string }[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Загрузите скриншоты переписки с клиентом (до 6 штук) для получения рекомендаций по продажам.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const { isMobile } = useIsMobile()
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && !localContent.includes('Загрузите скриншоты')

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        if (images.length + files.length > 6) {
            toast.error('Можно загрузить максимум 6 скриншотов')
            return
        }

        setIsUploading(true)

        try {
            const newImages = await Promise.all(files.map(async (file) => {
                const previewUrl = URL.createObjectURL(file)

                const formData = new FormData()
                formData.append('file', file)
                const response = await apiClient.post('/files/upload', formData)
                if (!response.data?.success) throw new Error('Upload failed')

                const serverUrl: string = response.data.url

                return { file, previewUrl, serverUrl }
            }))

            setImages(prev => [...prev, ...newImages])
        } catch (error) {
            console.error('Upload failed', error)
            toast.error('Ошибка при загрузке изображений')
        } finally {
            setIsUploading(false)
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
            if (isMobile) setActiveTab('preview')

            const params = {
                imageUrls: images.map(img => img.serverUrl)
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

    const handleDownloadPdf = async () => {
        try {
            await downloadPdf(localContent)
        } catch {
            toast.error('Не удалось сформировать PDF')
        }
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

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Загрузка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Результат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[340px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                        <LineChart className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">ИИ-Продажник</h2>
                            <GenerationCostBadge operationType="sales_advisor" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight uppercase">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-100">
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-sm font-bold text-gray-700 tracking-tight">Скриншоты диалога</label>
                                <span className="px-2 py-0.5 bg-gray-100 rounded-lg text-[10px] text-gray-500 font-bold">{images.length} / 6</span>
                            </div>

                            {/* Upload Area */}
                            {images.length < 6 && (
                                <div className="mt-2 text-center mb-4">
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-teal-100 border-dashed rounded-2xl cursor-pointer bg-teal-50/30 hover:bg-teal-50 hover:border-teal-300 transition-all group">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {isUploading ? (
                                                <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-2" />
                                            ) : (
                                                <UploadCloud className="w-8 h-8 text-teal-400 group-hover:text-teal-600 transition-colors mb-2" />
                                            )}
                                            <p className="text-xs text-center px-6 font-bold text-gray-500 uppercase tracking-tight">
                                                {isUploading ? 'Загрузка...' : 'Выбрать файлы'}
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
                                        <div key={idx} className="relative aspect-square rounded-xl border border-gray-100 overflow-hidden group shadow-sm bg-gray-50">
                                            <img src={img.previewUrl} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button
                                                    onClick={() => removeImage(idx)}
                                                    className="p-2 bg-white/20 hover:bg-red-500 text-white rounded-full transition-all active:scale-95"
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
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Анализировать'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className={`
                ${isMobile && activeTab !== 'preview' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0 overflow-x-auto">
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">РЕКОМЕНДАЦИИ</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && !localContent.includes('Загрузите скриншоты') && !localContent.includes('Анализируем диалог') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${editMode
                                        ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating || localContent.includes('Загрузите скриншоты')}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{copied ? 'Готово!' : 'Копировать'}</span>
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating || localContent.includes('Загрузите скриншоты')}
                                className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-40 ml-1"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            {hasResult && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic="ИИ-продажник"
                                    className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-60"
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Анализируем диалог..." accentClassName="bg-teal-500" estimatedSeconds={40} />
                        ) : !localContent || localContent.includes('Загрузите скриншоты') ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-teal-50 flex items-center justify-center">
                                    <LineChart className="w-10 h-10 text-teal-200" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-gray-700">Анализ появится здесь</h3>
                                    <p className="text-sm text-gray-400 max-w-[320px]">
                                        Загрузите скриншоты переписки и нажмите кнопку Анализировать.
                                    </p>
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-primary-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all text-gray-900"
                                    >
                                        К загрузке
                                    </button>
                                )}
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
                                className="w-full h-full border-0 bg-white"
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
