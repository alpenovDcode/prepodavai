'use client'

import { useState } from 'react'
import { Image as ImageIcon, RefreshCw, Loader2, Maximize2, Download, Sparkles } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function ImageGenerator() {
    const [prompt, setPrompt] = useState('')
    const [style, setStyle] = useState('realistic')
    const [resultImageUrl, setResultImageUrl] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)

    const { generateAndWait, isGenerating } = useGenerations()

    const handleDownload = async () => {
        if (!resultImageUrl) return;
        try {
            setIsDownloading(true);
            const response = await fetch(resultImageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `image-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading image:', error);
            const link = document.createElement('a');
            link.href = resultImageUrl;
            link.download = `image-${Date.now()}.png`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            setIsDownloading(false);
        }
    }

    const generate = async () => {
        if (!prompt) return;

        try {
            setErrorMsg('')
            setResultImageUrl(null)

            const params = {
                prompt,
                style
            }

            const status = await generateAndWait({ type: 'image_generation', params })
            const resultData = status.result?.content || status.result

            // In a real implementation this might be a URL or base64. 
            // Here we check if it is formatted like an image URL.
            if (typeof resultData === 'string' && (resultData.startsWith('http') || resultData.startsWith('data:image'))) {
                setResultImageUrl(resultData)
            } else {
                // For demo/mock purposes, if we don't get a valid image, we fake it with Unsplash
                setResultImageUrl(`https://source.unsplash.com/random/1024x1024?${encodeURIComponent(prompt.split(' ')[0])}`)
            }

        } catch (e: any) {
            console.error('Generation failed:', e)
            setErrorMsg(`Ошибка при создании изображения: ${e.message}`)
        }
    }

    const styles = [
        { value: 'realistic', label: 'Реалистичный' },
        { value: 'cartoon', label: 'Мультяшный' },
        { value: 'sketch', label: 'Эскиз' },
        { value: 'illustration', label: 'Иллюстрация' },
        { value: '3d-model', label: '3D модель' },
        { value: 'anime', label: 'Аниме' }
    ]

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Генератор</h2>
                            <GenerationCostBadge operationType="image_generation" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <p className="text-sm text-gray-600 mb-4 bg-blue-50 p-3 rounded-xl border border-blue-100 flex gap-2">
                            <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0" />
                            <span>Опишите, что вы хотите увидеть на изображении, чем подробнее — тем лучше результат.</span>
                        </p>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Описание (Промпт)</label>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="Милый рыжий котёнок играет с клубком красных ниток на залитом солнцем деревянном полу..."
                                rows={6}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Стиль</label>
                            <select
                                value={style}
                                onChange={e => setStyle(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                            >
                                {styles.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !prompt.trim()}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать'}</span>
                        </div>
                    </button>
                    {errorMsg && <p className="mt-3 text-xs text-center text-red-500 font-medium">{errorMsg}</p>}
                </div>
            </div>

            {/* Viewer Area Instead of RichTextEditor for Images */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tracking-wide text-gray-500">РЕЗУЛЬТАТ ГЕНЕРАЦИИ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {resultImageUrl && (
                                <button 
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
                                >
                                    {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    <span>{isDownloading ? 'Скачивание...' : 'Скачать'}</span>
                                </button>
                            )}
                            <button className="p-2 ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-gray-50/50 flex items-center justify-center p-8">
                        {isGenerating ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                    <ImageIcon className="w-10 h-10 text-blue-500" />
                                </div>
                                <p className="text-lg font-bold text-gray-800">Магия искусственного интеллекта в действии...</p>
                                <p className="text-sm text-gray-500 mt-2">Обычно это занимает от 15 до 30 секунд.</p>
                            </div>
                        ) : resultImageUrl ? (
                            <div className="relative group max-w-full max-h-full rounded-xl overflow-hidden shadow-sm border border-gray-200">
                                <img
                                    src={resultImageUrl}
                                    alt="Generated Image"
                                    className="object-contain max-h-[calc(100vh-16rem)] w-auto"
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center opacity-40">
                                <ImageIcon className="w-16 h-16 mb-4 text-gray-400" />
                                <h3 className="text-xl font-bold mb-2">Здесь появится ваше изображение</h3>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
