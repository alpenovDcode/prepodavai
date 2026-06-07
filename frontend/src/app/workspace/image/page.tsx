'use client'

import { useState, useEffect } from 'react'
import { Image as ImageIcon, RefreshCw, Loader2, Maximize2, Download, Sparkles, FlipHorizontal } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { apiClient } from '@/lib/api/client'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import GenerationProgress from '@/components/workspace/GenerationProgress'

const IMAGE_PRESETS = [
    {
        label: 'Солнечная система',
        preview: '/image-previews/solnechnaya-sistema.jpg',
        value: 'Красочная образовательная иллюстрация Солнечной системы: все 8 планет на орбитах вокруг Солнца, яркие цвета, космический фон со звёздами и туманностями, подписи к планетам, высокая детализация, научная точность',
        style: 'illustration',
    },
    {
        label: 'Строение клетки',
        preview: '/image-previews/stroenie-kletki.jpg',
        value: 'Детальная цветная схема животной клетки в разрезе с подписанными органеллами: ядро, митохондрии, рибосомы, эндоплазматическая сеть, аппарат Гольджи. Чистый учебный стиль иллюстрации, яркие цвета, белый фон',
        style: 'illustration',
    },
    {
        label: 'Исторический портрет',
        preview: '/image-previews/istoricheskiy-portret.jpg',
        value: 'Реалистичный портрет исторической личности в стиле эпохи Возрождения, детально прорисованное лицо, одежда соответствующей эпохи, драматическое освещение, фактура масляной живописи, музейное качество',
        style: 'realistic',
    },
    {
        label: 'Карта мира',
        preview: '/image-previews/karta-mira.jpg',
        value: 'Красивая карта мира в винтажном стиле с иллюстрированными континентами, горами, океанами, розой ветров, декоративными рамками, тёплые сепиевые тона с цветовыми акцентами, детализированный картографический стиль',
        style: 'illustration',
    },
    {
        label: 'Математическая концепция',
        preview: '/image-previews/matematicheskaya-kontseptsiya.jpg',
        value: 'Эффектная 3D-геометрическая композиция, отражающая математические концепции: спираль золотого сечения, последовательность Фибоначчи в природе, фракталы, яркий современный стиль учебного плаката, чистый белый фон',
        style: '3d-model',
    },
    {
        label: 'Химическая реакция',
        preview: '/image-previews/himicheskaya-reaktsiya.jpg',
        value: 'Яркая научная иллюстрация химической реакции на молекулярном уровне: цветные атомы и молекулы в процессе связывания, светящиеся энергетические эффекты, тёмный фон, динамичная и наглядная визуализация',
        style: 'illustration',
    },
    {
        label: 'Экосистема леса',
        preview: '/image-previews/ekosistema-lesa.jpg',
        value: 'Подробная иллюстрация лесной экосистемы с флорой и фауной, цепочки питания, различные ярусы леса (полог, подлесок, напочвенный покров), насыщенные зелёные и земляные оттенки, учебный плакат о природе',
        style: 'illustration',
    },
    {
        label: 'Физика: световые волны',
        preview: '/image-previews/fizika-svetovye-volny.jpg',
        value: 'Наглядная визуализация световых волн и электромагнитного спектра: диапазоны от радиоволн до гамма-излучения, цветные градиентные полосы, чистая научная схема со светящимися эффектами',
        style: 'illustration',
    },
]

export default function ImageGenerator() {
    const [prompt, setPrompt] = useState('')
    const [style, setStyle] = useState('realistic')
    const [resultImageUrl, setResultImageUrl] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)

    // Редактирование готового изображения
    const [currentGenId, setCurrentGenId] = useState<string | null>(null)
    const [editInstruction, setEditInstruction] = useState('')
    const [isEditingImage, setIsEditingImage] = useState(false)
    const [editStatus, setEditStatus] = useState('')
    const [isFlipped, setIsFlipped] = useState(false)
    const [keepSeed, setKeepSeed] = useState(false)
    const [seed, setSeed] = useState<number | null>(null)

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const flipImageBlob = async (srcBlob: Blob): Promise<Blob> => {
        const bitmap = await createImageBitmap(srcBlob)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return srcBlob
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(bitmap, 0, 0)
        return await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b || srcBlob), 'image/png'),
        )
    }

    const handleDownload = async () => {
        if (!resultImageUrl) return;
        try {
            setIsDownloading(true);
            const response = await fetch(resultImageUrl);
            let blob = await response.blob();
            if (isFlipped) {
                try { blob = await flipImageBlob(blob) } catch { /* отдаём оригинал */ }
            }
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
            setCurrentGenId(null)
            setEditInstruction('')
            setEditStatus('')
            setIsFlipped(false)
            if (isMobile) setActiveTab('preview')

            // «Сохранять основу» — переиспользуем тот же seed, чтобы новые варианты
            // были стабильнее. Иначе — новый случайный seed на каждую генерацию.
            const seedToUse = keepSeed && seed != null ? seed : Math.floor(Math.random() * 1_000_000_000)
            setSeed(seedToUse)

            const params = {
                prompt,
                style,
                seed: seedToUse,
            }

            const status = await generateAndWait({ type: 'image_generation', params })
            const resultData: any = status.result

            const imageUrl =
                resultData?.imageUrl ||
                (Array.isArray(resultData?.imageUrls) && resultData.imageUrls[0]) ||
                (typeof resultData?.content === 'string' ? resultData.content : null) ||
                (typeof resultData === 'string' ? resultData : null)

            if (typeof imageUrl === 'string' && (imageUrl.startsWith('http') || imageUrl.startsWith('data:image'))) {
                setResultImageUrl(imageUrl)
            } else {
                setErrorMsg('Не удалось получить ссылку на изображение')
            }

        } catch (e: any) {
            console.error('Generation failed:', e)
            setErrorMsg(`Ошибка при создании изображения: ${e.message}`)
        }
    }

    const editImage = async () => {
        const baseId = currentGenId || activeGenerationId
        if (!baseId || isEditingImage) return
        const instruction = editInstruction.trim()
        if (!instruction) return

        setIsEditingImage(true)
        setEditStatus('Применяю правку…')
        setErrorMsg('')
        try {
            const start = await apiClient.post(`/generate/${baseId}/edit-image`, { instruction })
            const newRequestId: string | undefined = start.data?.requestId
            if (!newRequestId) throw new Error('Не удалось запустить правку')

            let imageUrl: string | null = null
            for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 3000))
                const resp = await apiClient.get(`/generate/${newRequestId}?_t=${Date.now()}`)
                const status = resp.data?.status?.status ?? resp.data?.status
                if (status === 'completed') {
                    const rd: any = resp.data?.result ?? resp.data?.status?.result
                    imageUrl =
                        rd?.imageUrl ||
                        (Array.isArray(rd?.imageUrls) && rd.imageUrls[0]) ||
                        (typeof rd?.content === 'string' ? rd.content : null) ||
                        (typeof rd === 'string' ? rd : null)
                    break
                }
                if (status === 'failed') throw new Error(resp.data?.error || 'Правка не удалась')
                setEditStatus(`Применяю правку… (${i + 1})`)
            }

            if (!imageUrl) throw new Error('Превышено время ожидания. Загляните в историю чуть позже.')

            setResultImageUrl(imageUrl)
            setCurrentGenId(newRequestId)
            setEditInstruction('')
            setEditStatus('')
            setIsFlipped(false)
        } catch (e: any) {
            console.error('Image edit failed:', e)
            setEditStatus('')
            setErrorMsg(e?.response?.data?.message || e?.message || 'Не удалось отредактировать изображение')
        } finally {
            setIsEditingImage(false)
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
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Результат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.01)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Генератор</h2>
                            <GenerationCostBadge operationType="image_generation" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div className="text-sm text-gray-600 bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex gap-3">
                            <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0" />
                            <span className="leading-snug">Опишите объект максимально подробно для лучшего результата.</span>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Пресеты</label>
                            <div className="flex flex-wrap gap-1.5">
                                {IMAGE_PRESETS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        onClick={() => { setPrompt(preset.value); setStyle(preset.style) }}
                                        className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors border border-indigo-100"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Описание (Промпт)</label>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="Милый рыжий котёнок играет с клубком красных ниток..."
                                rows={6}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Стиль</label>
                            <select
                                value={style}
                                onChange={e => setStyle(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-gray-900"
                            >
                                {styles.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={keepSeed}
                                onChange={(e) => setKeepSeed(e.target.checked)}
                                className="mt-0.5 w-4 h-4 accent-indigo-600 rounded"
                            />
                            <span className="text-xs text-gray-600 leading-snug">
                                <span className="font-semibold text-gray-800">Сохранять основу</span> — новые генерации
                                будут ближе к текущей (тот же seed). Удобно, чтобы доработать промпт без полной смены картинки.
                            </span>
                        </label>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !prompt.trim()}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать'}</span>
                        </div>
                    </button>
                    {errorMsg && <p className="mt-3 text-[11px] text-center text-red-500 font-bold bg-red-50 p-2 rounded-lg">{errorMsg}</p>}
                </div>
            </div>

            {/* Viewer Area */}
            <div className={`
                ${isMobile && activeTab !== 'preview' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">РЕЗУЛЬТАТ</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {resultImageUrl && (
                                <button
                                    onClick={() => setIsFlipped((f) => !f)}
                                    title="Отразить по горизонтали — меняет лево/право"
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-bold active:scale-95"
                                >
                                    <FlipHorizontal className="w-3.5 h-3.5" />
                                    <span>{isFlipped ? 'Вернуть' : 'Отразить'}</span>
                                </button>
                            )}
                            {resultImageUrl && (
                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-bold disabled:opacity-50 active:scale-95"
                                >
                                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    <span>{isDownloading ? '...' : 'Скачать'}</span>
                                </button>
                            )}
                            <button className="p-2 ml-1 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors flex-shrink-0">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto relative bg-gray-50/50 flex items-center justify-center p-4 md:p-8">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Создаём изображение..." accentClassName="bg-blue-500" estimatedSeconds={60} />
                        ) : resultImageUrl ? (
                            <div className="flex flex-col items-center gap-4 w-full max-w-full">
                                <div className="relative group max-w-full rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-white p-2">
                                    <img
                                        src={resultImageUrl}
                                        alt="Generated Image"
                                        className={`object-contain max-h-[calc(100vh-26rem)] md:max-h-[calc(100vh-26rem)] w-auto rounded-xl transition-all ${isEditingImage ? 'opacity-50' : ''} ${isFlipped ? '-scale-x-100' : ''}`}
                                    />
                                    {isEditingImage && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex items-center gap-2 bg-white/90 px-4 py-2 rounded-full shadow text-sm font-semibold text-gray-700">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {editStatus || 'Применяю правку…'}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Изменить объекты на изображении */}
                                <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                        <p className="text-sm font-semibold text-gray-900">Изменить изображение</p>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2">
                                        Опишите, что поправить — например: «перенеси чемодан в левую руку». Персонаж и композиция сохранятся. Дешевле полной генерации.
                                    </p>
                                    <textarea
                                        value={editInstruction}
                                        onChange={(e) => setEditInstruction(e.target.value)}
                                        placeholder="Что изменить на изображении?"
                                        rows={2}
                                        maxLength={1000}
                                        disabled={isEditingImage}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-60"
                                    />
                                    <button
                                        onClick={editImage}
                                        disabled={isEditingImage || !editInstruction.trim()}
                                        className="mt-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-bold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isEditingImage ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {editStatus || 'Применяю правку…'}
                                            </>
                                        ) : (
                                            'Применить правку'
                                        )}
                                    </button>
                                    {errorMsg && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full overflow-y-auto p-6">
                                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-4">ПРИМЕРЫ</p>
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {IMAGE_PRESETS.map((preset, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => { setPrompt(preset.value); setStyle(preset.style) }}
                                            title={preset.label}
                                            className={`group relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                                                prompt === preset.value
                                                    ? 'border-indigo-500 shadow-md shadow-indigo-100'
                                                    : 'border-transparent hover:border-indigo-200'
                                            }`}
                                        >
                                            <div className="aspect-square bg-gray-100 relative">
                                                <img
                                                    src={preset.preview}
                                                    alt={preset.label}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none'
                                                    }}
                                                />
                                                <div className="absolute inset-0 bg-gray-200 flex items-center justify-center -z-10">
                                                    <ImageIcon className="w-8 h-8 text-gray-300" />
                                                </div>
                                                {prompt === preset.value && (
                                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2">
                                                <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2">{preset.label}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-4 w-full px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        К настройке
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
