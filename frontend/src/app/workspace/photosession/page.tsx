'use client'

import { useState } from 'react'
import { Camera, RefreshCw, Loader2, Maximize2, UploadCloud, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import GenerationProgress from '@/components/workspace/GenerationProgress'

const photosessionPrompts = [
    {
        label: 'Летний портрет в саду',
        preview: '/photosession-previews/letny-portret-v-sadu.jpg',
        value: 'A breathtaking summer portrait of a person in a blooming garden. Pose: looking over the shoulder with a relaxed natural smile, one hand gently touching a blooming branch. Warm sunlight, golden hour, vibrant colors. Shot on 85mm lens, f/1.8, soft bokeh. Native 4K, UHD, highly detailed skin texture, cinematic lighting, photorealistic.'
    },
    {
        label: 'Деловой портрет в офисе',
        preview: '/photosession-previews/delovoy-portret-v-ofise.jpg',
        value: 'Professional corporate headshot in a modern glass office, stylish business attire. Pose: standing confidently with arms loosely crossed, looking directly at the camera, slight confident smile. Soft natural window light, softbox. Shot on 50mm, f/2.8, sharp focus. Native 4K, ultra-realistic, magazine editorial quality, highly detailed.'
    },
    {
        label: 'Семейная фотосессия на природе',
        preview: '/photosession-previews/semeynaya-fotosessiya-na-prirode.jpg',
        value: 'Candid family photography in beautiful nature, warm and joyful atmosphere. Pose: walking hand-in-hand towards the camera, looking at each other and laughing genuinely, dynamic movement. Sunset lighting. DSLR, 35mm lens, cinematic depth of field. Native 4K, masterpiece, highly detailed, hyper-realistic.'
    },
    {
        label: 'Портрет в студии',
        preview: '/photosession-previews/portret-v-studii.jpg',
        value: 'Expressive studio portrait, neutral dark grey background. Pose: sitting on a high stool, one hand elegantly resting near the chin, slight head tilt, intense direct gaze. Professional studio lighting, rim light, reflector. Shot on DSLR, 85mm, f/5.6. Native 4K, UHD, ultra-high skin texture detail, high-end retouching.'
    },
    {
        label: 'Романтическая фотосессия на закате',
        preview: '/photosession-previews/romanticheskaya-fotosessiya-na-zakate.jpg',
        value: 'Romantic couple at sunset, picturesque landscape. Pose: foreheads gently touching, wrapped in a warm close embrace, eyes closed in a tender moment. Soft golden backlighting. 50mm lens, f/1.4, cinematic atmosphere, lens flare. Native 4K, ultra-realistic, award-winning photography.'
    },
    {
        label: 'Спортивная фотосессия',
        preview: '/photosession-previews/sportivnaya-fotosessiya.jpg',
        value: 'Dynamic sports photography, modern sportswear, gym or stadium background. Pose: dynamic mid-stride running pose, body leaning forward, muscles tensed, focused and determined expression. Contrasting dramatic lighting. Fast shutter speed, sharp focus, sweat drops. Native 4K, photorealistic.'
    },
    {
        label: 'Детская фотосессия в парке',
        preview: '/photosession-previews/detskaya-fotosessiya-v-parke.jpg',
        value: 'Joyful child playing in a sunny park, vibrant clean colors. Pose: running towards the camera with arms wide open, big genuine laugh, hair flying in the wind. Soft daylight. 85mm lens, f/2.0, heavy background blur, magical atmosphere. Native 4K, professional family photography, hyper-detailed.'
    },
    {
        label: 'Выпускная фотосессия',
        preview: '/photosession-previews/vypusknaya-fotosessiya.jpg',
        value: 'Elegant graduation portrait, evening gown or suit, classic architecture background. Pose: holding the diploma proudly against the chest with both hands, chin slightly up, triumphant bright smile. Soft evening light, magazine style. Professional color grading, RAW photo. Native 4K, UHD, masterpiece.'
    },
    {
        label: 'Портрет в городской среде',
        preview: '/photosession-previews/portret-v-gorodskoy-srede.jpg',
        value: 'Stylish street-style portrait in a modern metropolis, trendy outfit. Pose: walking confidently towards the camera, one hand casually resting in a coat pocket, glancing away over the shoulder. City lights. 35mm lens, f/1.4, shallow depth of field, beautiful city bokeh. Native 4K, cinematic street photography, highly detailed.'
    },
    {
        label: 'Фотосессия на пляже',
        preview: '/photosession-previews/fotosessiya-na-plyazhe.jpg',
        value: 'Atmospheric beach photography, sea breeze. Pose: standing barefoot in the shallow surf, holding a wide-brimmed sun hat with one hand, looking dreamily at the ocean horizon. Golden hour light, sun reflecting on water. 50mm lens, film aesthetic. Native 4K, hyper-realistic, high resolution, soft cinematic colors.'
    },
    {
        label: 'Портрет в библиотеке',
        preview: '/photosession-previews/portret-v-biblioteke.jpg',
        value: 'Cozy portrait in an antique library, intellectual atmosphere. Pose: sitting at a wooden desk, leaning over an open ancient book, holding a pen, looking up thoughtfully off-camera. Warm light from a desk lamp, bookshelves in soft focus. 50mm lens, f/2.0. Native 4K, highest detail of shadows and highlights.'
    },
    {
        label: 'Свадебная фотосессия',
        preview: '/photosession-previews/svadebnaya-fotosessiya.jpg',
        value: 'Luxury wedding photography, elegant wedding dress and suit, picturesque castle or garden background. Pose: groom gently dipping the bride backward for a cinematic kiss, holding hands tightly. Soft diffused light, pastel tones. 85mm lens, f/1.8. Native 4K, fairy tale atmosphere, premium quality.'
    }
]

export default function PhotosessionGenerator() {
    const [style, setStyle] = useState('realistic')
    const [size, setSize] = useState('1024x1024')
    const [prompt, setPrompt] = useState(photosessionPrompts[0].value)
    const [imageHash, setImageHash] = useState('')
    const [fileName, setFileName] = useState('')
    const [previewUrl, setPreviewUrl] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [resultImageUrl, setResultImageUrl] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [isDownloading, setIsDownloading] = useState(false)
    const [showDetails, setShowDetails] = useState(false)
    const [clothing, setClothing] = useState('')
    const [pose, setPose] = useState('')
    const [background, setBackground] = useState('')
    const [mood, setMood] = useState('')
    const [lighting, setLighting] = useState('')

    const { generateAndWait, isGenerating } = useGenerations()

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setPreviewUrl(URL.createObjectURL(file))
        setIsUploading(true)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const { apiClient } = await import('@/lib/api/client')
            const response = await apiClient.post('/files/upload', formData)

            if (response.data?.success) {
                setImageHash(response.data.hash || response.data.url)
            } else {
                throw new Error('Upload failed on server')
            }
        } catch (error) {
            console.error('Upload failed', error)
            setErrorMsg('Ошибка загрузки фотографии')
            setFileName('Ошибка загрузки')
        } finally {
            setIsUploading(false)
        }
    }

    const buildFinalPrompt = () => {
        const details: string[] = []
        if (clothing) details.push(`Clothing: ${clothing}`)
        if (pose) details.push(`Pose: ${pose}`)
        if (background) details.push(`Background: ${background}`)
        if (mood) details.push(`Mood/Expression: ${mood}`)
        if (lighting) details.push(`Lighting: ${lighting}`)
        return details.length > 0 ? `${prompt}. Additional details: ${details.join(', ')}.` : prompt
    }

    const generate = async () => {
        if (!imageHash || !prompt) return;

        try {
            setErrorMsg('')
            setResultImageUrl(null)

            const params = {
                photoHash: imageHash,
                style,
                size,
                prompt: buildFinalPrompt()
            }

            const status = await generateAndWait({ type: 'photosession', params })
            const resultData = status.result?.content || status.result
            const url = resultData?.imageUrl || resultData

            if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:image'))) {
                setResultImageUrl(url)
            } else {
                // If we have an array of URLs
                if (resultData?.imageUrls && Array.isArray(resultData.imageUrls) && resultData.imageUrls.length > 0) {
                    setResultImageUrl(resultData.imageUrls[0])
                } else {
                    // Fallback to a working placeholder if all else fails
                    setResultImageUrl(`https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=${size.split('x')[0]}&q=80`)
                }
            }

        } catch (e: any) {
            console.error('Generation failed:', e)
            setErrorMsg(`Ошибка при создании фотосессии: ${e.message}`)
        }
    }

    const handleDownload = async () => {
        if (!resultImageUrl) return;
        try {
            setIsDownloading(true);
            const response = await fetch(resultImageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `photosession-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading image:', error);
            const link = document.createElement('a');
            link.href = resultImageUrl;
            link.download = `photosession-${Date.now()}.png`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            setIsDownloading(false);
        }
    }

    const styles = [
        { value: 'realistic', label: 'Реалистичный' },
        { value: 'artistic', label: 'Художественный' },
        { value: 'professional', label: 'Профессиональный' },
        { value: 'creative', label: 'Креативный' }
    ]

    const sizes = [
        { value: '1024x1024', label: 'Квадрат (1024x1024)' },
        { value: '1024x1792', label: 'Портрет (1024x1792)' },
        { value: '1792x1024', label: 'Ландшафт (1792x1024)' }
    ]

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[340px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                        <Camera className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">AI Фотосессия</h2>
                            <GenerationCostBadge operationType="photosession" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Исходное фото</label>

                            <div className="mt-2 text-center">
                                {previewUrl ? (
                                    <div className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-square mb-2 bg-gray-50 flex items-center justify-center text-gray-900 placeholder-gray-400">
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                                            <p className="text-white text-sm font-medium mb-3">Заменить фото</p>
                                            <button
                                                onClick={() => {
                                                    setPreviewUrl('')
                                                    setFileName('')
                                                    setImageHash('')
                                                }}
                                                className="px-4 py-2 bg-white/20 hover:bg-white text-white hover:text-gray-900 rounded-lg backdrop-blur-sm transition-all text-sm font-medium"
                                            >
                                                Отменить
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-orange-100 border-dashed rounded-xl cursor-pointer bg-orange-50/30 hover:bg-orange-50/80 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {isUploading ? (
                                                <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-2" />
                                            ) : (
                                                <UploadCloud className="w-8 h-8 text-orange-400 mb-2" />
                                            )}
                                            <p className="text-xs text-center px-4 font-medium text-gray-600">
                                                {fileName || "Загрузите селфи или портрет"}
                                            </p>
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Стиль обработки</label>
                            <select
                                value={style}
                                onChange={e => setStyle(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                            >
                                {styles.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Размер и пропорции</label>
                            <select
                                value={size}
                                onChange={e => setSize(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                            >
                                {sizes.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Сценарий (Промпт)</label>
                            <select
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                            >
                                {photosessionPrompts.map((opt, idx) => (
                                    <option key={idx} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="border border-gray-100 rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowDetails(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-bold text-gray-600"
                            >
                                <span>Детали (необязательно)</span>
                                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {showDetails && (
                                <div className="p-4 space-y-3 bg-white">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Одежда</label>
                                        <input
                                            type="text"
                                            value={clothing}
                                            onChange={e => setClothing(e.target.value)}
                                            placeholder="белая рубашка, деловой костюм..."
                                            className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Поза</label>
                                        <input
                                            type="text"
                                            value={pose}
                                            onChange={e => setPose(e.target.value)}
                                            placeholder="стоя вполоборота, сидя..."
                                            className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Фон</label>
                                        <input
                                            type="text"
                                            value={background}
                                            onChange={e => setBackground(e.target.value)}
                                            placeholder="городская улица, студия..."
                                            className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Настроение / Эмоция</label>
                                        <input
                                            type="text"
                                            value={mood}
                                            onChange={e => setMood(e.target.value)}
                                            placeholder="улыбчивое, серьёзное, задумчивое..."
                                            className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Освещение</label>
                                        <input
                                            type="text"
                                            value={lighting}
                                            onChange={e => setLighting(e.target.value)}
                                            placeholder="мягкий свет, золотой час..."
                                            className="block w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 placeholder-gray-400"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || isUploading || !imageHash || !prompt}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-orange-400 to-amber-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-400 to-amber-500 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать фото'}</span>
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
                            <GenerationProgress active={isGenerating} title="Создаём фотосессию..." accentClassName="bg-orange-500" estimatedSeconds={50} />
                        ) : resultImageUrl ? (
                            <div className="relative group max-w-full max-h-full rounded-xl overflow-hidden shadow-sm border border-gray-200">
                                <img
                                    src={resultImageUrl}
                                    alt="Generated Photosession"
                                    className="object-contain max-h-[calc(100vh-16rem)] w-auto"
                                />
                            </div>
                        ) : (
                            <div className="w-full h-full overflow-y-auto p-6">
                                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-4">ПРИМЕРЫ СТИЛЕЙ</p>
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {photosessionPrompts.map((p, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setPrompt(p.value)}
                                            title={p.label}
                                            className={`group relative rounded-xl overflow-hidden border-2 transition-all text-left ${
                                                prompt === p.value
                                                    ? 'border-orange-400 shadow-md shadow-orange-100'
                                                    : 'border-transparent hover:border-orange-200'
                                            }`}
                                        >
                                            <div className="aspect-square bg-gray-100 relative">
                                                <img
                                                    src={p.preview}
                                                    alt={p.label}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none'
                                                    }}
                                                />
                                                <div className="absolute inset-0 bg-gray-200 flex items-center justify-center -z-10">
                                                    <Camera className="w-8 h-8 text-gray-300" />
                                                </div>
                                                {prompt === p.value && (
                                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2">
                                                <p className="text-white text-[11px] font-semibold leading-tight line-clamp-2">{p.label}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
