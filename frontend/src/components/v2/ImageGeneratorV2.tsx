'use client'

import { useEffect, useState } from 'react'
import {
    Image as ImageIcon, Copy, Check, RefreshCw, Loader2, Wand2, Sparkles,
    Download, Eye, Settings2, FlipHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { useGenerations } from '@/lib/hooks/useGenerations'
import { apiClient } from '@/lib/api/client'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import AssignTaskButton from '@/components/AssignTaskButton'

const STYLES = [
    { value: 'illustration', label: 'Иллюстрация' },
    { value: 'photo',        label: 'Фото' },
    { value: 'cartoon',      label: 'Мультяшный' },
    { value: '3d',           label: '3D' },
    { value: 'icon',         label: 'Иконка' },
]

const ASPECTS = [
    { value: '1024x1024', label: 'Квадрат' },
    { value: '1792x1024', label: 'Альбом' },
    { value: '1024x1792', label: 'Портрет' },
]

const COUNTS = [1, 2, 4]

type Preset = { label: string; preview: string; value: string; style: string }
const PRESETS: Preset[] = [
    { label: 'Солнечная система',     preview: '/image-previews/solnechnaya-sistema.jpg',
      value: 'Красочная образовательная иллюстрация Солнечной системы: все 8 планет на орбитах вокруг Солнца, яркие цвета, космический фон со звёздами и туманностями, подписи к планетам, высокая детализация, научная точность',
      style: 'illustration' },
    { label: 'Строение клетки',       preview: '/image-previews/stroenie-kletki.jpg',
      value: 'Детальная цветная схема животной клетки в разрезе с подписанными органеллами: ядро, митохондрии, рибосомы, эндоплазматическая сеть, аппарат Гольджи. Чистый учебный стиль иллюстрации, яркие цвета, белый фон',
      style: 'illustration' },
    { label: 'Исторический портрет',  preview: '/image-previews/istoricheskiy-portret.jpg',
      value: 'Реалистичный портрет исторической личности в стиле эпохи Возрождения, детально прорисованное лицо, одежда соответствующей эпохи, драматическое освещение, фактура масляной живописи, музейное качество',
      style: 'realistic' },
    { label: 'Карта мира',            preview: '/image-previews/karta-mira.jpg',
      value: 'Красивая карта мира в винтажном стиле с иллюстрированными континентами, горами, океанами, розой ветров, декоративными рамками, тёплые сепиевые тона с цветовыми акцентами, детализированный картографический стиль',
      style: 'illustration' },
    { label: 'Математика',            preview: '/image-previews/matematicheskaya-kontseptsiya.jpg',
      value: 'Эффектная 3D-геометрическая композиция, отражающая математические концепции: спираль золотого сечения, последовательность Фибоначчи в природе, фракталы, яркий современный стиль учебного плаката, чистый белый фон',
      style: 'illustration' },
    { label: 'Химия',                 preview: '/image-previews/himicheskaya-reaktsiya.jpg',
      value: 'Яркая научная иллюстрация химической реакции на молекулярном уровне: цветные атомы и молекулы в процессе связывания, светящиеся энергетические эффекты, тёмный фон, динамичная и наглядная визуализация',
      style: 'illustration' },
    { label: 'Лесная экосистема',     preview: '/image-previews/ekosistema-lesa.jpg',
      value: 'Подробная иллюстрация лесной экосистемы с флорой и фауной, цепочки питания, различные ярусы леса (полог, подлесок, напочвенный покров), насыщенные зелёные и земляные оттенки, учебный плакат о природе',
      style: 'illustration' },
    { label: 'Световые волны',        preview: '/image-previews/fizika-svetovye-volny.jpg',
      value: 'Наглядная визуализация световых волн и электромагнитного спектра: диапазоны от радиоволн до гамма-излучения, цветные градиентные полосы, чистая научная схема со светящимися эффектами',
      style: 'illustration' },
]

function pickImageExt(mime: string, url: string): string {
    const m = (mime || '').toLowerCase()
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
    if (m.includes('png')) return 'png'
    if (m.includes('webp')) return 'webp'
    if (m.includes('gif')) return 'gif'
    if (m.includes('avif')) return 'avif'
    // Фолбэк по URL — для data: и .jpg/.png/.webp в пути.
    const u = (url || '').toLowerCase()
    const dataMatch = u.match(/^data:image\/([a-z0-9+-]+)/)
    if (dataMatch) {
        const sub = dataMatch[1]
        if (sub === 'jpeg') return 'jpg'
        return sub
    }
    const pathMatch = u.match(/\.(jpe?g|png|webp|gif|avif)(?:\?|#|$)/)
    if (pathMatch) return pathMatch[1] === 'jpeg' ? 'jpg' : pathMatch[1]
    return 'jpg'
}

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

export default function ImageGeneratorV2() {
    // form
    const [prompt, setPrompt] = useState('')
    const [style, setStyle] = useState('illustration')
    const [size, setSize] = useState('1024x1024')
    const [count, setCount] = useState(1)
    const [keepSeed, setKeepSeed] = useState(false)
    const [seed, setSeed] = useState<number | null>(null)

    // result
    const [imageUrls, setImageUrls] = useState<string[]>([])
    const [selectedIdx, setSelectedIdx] = useState(0)
    const [currentGenId, setCurrentGenId] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    // toolbar/edit state
    const [isFlipped, setIsFlipped] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [copied, setCopied] = useState(false)

    const [editInstruction, setEditInstruction] = useState('')
    const [isEditingImage, setIsEditingImage] = useState(false)
    const [editStatus, setEditStatus] = useState('')

    // mobile tabs
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && imageUrls.length > 0
    const selectedUrl = imageUrls[selectedIdx] ?? null
    const generationId = currentGenId || activeGenerationId

    const generate = async () => {
        if (!prompt.trim()) {
            toast.error('Опишите изображение')
            return
        }
        setErrorMsg('')
        setImageUrls([])
        setSelectedIdx(0)
        setIsFlipped(false)
        setEditInstruction('')
        setEditStatus('')
        setCurrentGenId(null)
        setMobileTab('preview')

        const seedToUse = keepSeed && seed != null ? seed : Math.floor(Math.random() * 1_000_000_000)
        setSeed(seedToUse)

        try {
            const status = await generateAndWait({
                type: 'image_generation',
                params: { prompt, style, size, count, seed: seedToUse },
            })
            const r: any = status.result
            const urls: string[] = Array.isArray(r?.imageUrls) && r.imageUrls.length
                ? r.imageUrls
                : r?.imageUrl
                    ? [r.imageUrl]
                    : (typeof r?.content === 'string' ? [r.content] : (typeof r === 'string' ? [r] : []))

            const clean = urls.filter(u => typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:image')))
            if (!clean.length) {
                setErrorMsg('Не удалось получить ссылку на изображение')
                return
            }
            setImageUrls(clean)
            setSelectedIdx(0)
        } catch (e: any) {
            console.error('Image generation failed:', e)
            setErrorMsg(`Ошибка при создании изображения: ${e?.message || 'неизвестная'}`)
        }
    }

    const downloadImage = async () => {
        if (!selectedUrl) return
        try {
            setIsDownloading(true)
            // Прокси через бэк: он скачивает у провайдера (replicate.delivery
            // и т.п.) и отдаёт уже с правильным Content-Type и filename.
            // Прямой fetch с фронта часто ломается из-за CORS у провайдера —
            // blob получается пустым/опасным opaque-ответом → битый файл.
            let blob: Blob | null = null
            if (generationId) {
                try {
                    const resp = await apiClient.get(`/generate/${generationId}/image`, {
                        responseType: 'blob',
                    })
                    if (resp.data instanceof Blob && resp.data.size > 0) {
                        blob = resp.data
                    }
                } catch {
                    // если бэк-прокси упал — фолбэк ниже на прямой fetch
                }
            }
            if (!blob) {
                const response = await fetch(selectedUrl)
                if (!response.ok) throw new Error(`Fetch ${response.status}`)
                const direct = await response.blob()
                if (direct.size === 0) throw new Error('Empty blob from direct fetch')
                blob = direct
            }
            if (isFlipped) {
                try { blob = await flipImageBlob(blob) } catch { /* отдадим оригинал */ }
            }
            const ext = pickImageExt(blob.type, selectedUrl)
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `image-${Date.now()}.${ext}`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
        } catch (e) {
            console.error('downloadImage failed:', e)
            toast.error('Не удалось скачать изображение')
        } finally {
            setIsDownloading(false)
        }
    }

    const copyImageLink = async () => {
        if (!selectedUrl) return
        try {
            await navigator.clipboard.writeText(selectedUrl)
            setCopied(true)
            toast.success('Ссылка скопирована')
            setTimeout(() => setCopied(false), 1500)
        } catch { toast.error('Не удалось скопировать') }
    }

    const editImage = async () => {
        const baseId = generationId
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
                const statusStr = resp.data?.status?.status ?? resp.data?.status
                if (statusStr === 'completed') {
                    const rd: any = resp.data?.result ?? resp.data?.status?.result
                    imageUrl =
                        rd?.imageUrl ||
                        (Array.isArray(rd?.imageUrls) && rd.imageUrls[0]) ||
                        (typeof rd?.content === 'string' ? rd.content : null) ||
                        (typeof rd === 'string' ? rd : null)
                    break
                }
                if (statusStr === 'failed') throw new Error(resp.data?.error || 'Правка не удалась')
                setEditStatus(`Применяю правку… (${i + 1})`)
            }

            if (!imageUrl) throw new Error('Превышено время ожидания. Загляните в историю чуть позже.')

            setImageUrls([imageUrl])
            setSelectedIdx(0)
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

    // Cmd/Ctrl + Enter
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                if (!isGenerating && prompt.trim()) generate()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompt, isGenerating, style, size, count, keepSeed, seed])

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile tabs */}
            <div className="lg:hidden border-b border-ink-200 bg-surface px-4 pt-2">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'config', label: 'Параметры', icon: <Settings2 className="w-4 h-4" /> },
                        { id: 'preview', label: 'Предпросмотр', icon: <Eye className="w-4 h-4" /> },
                    ]}
                    active={mobileTab}
                    onChange={(k) => setMobileTab(k as any)}
                />
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-12 gap-4 p-6 max-md:p-3 max-lg:grid-cols-1">
                {/* LEFT: settings */}
                <Card padding="lg"
                      className={`col-span-4 max-lg:col-span-1 h-fit max-lg:${mobileTab === 'config' ? '' : 'hidden'}`}>
                    {/* tool-hero */}
                    <div className="flex items-center gap-3.5 pb-5 mb-1 border-b border-ink-100" data-tour="hero">
                        <span
                            className="w-11 h-11 rounded-md inline-flex items-center justify-center"
                            style={{ background: '#FDF4FF', color: '#A21CAF' }}
                        >
                            <ImageIcon className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Изображение</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">Иллюстрация по описанию · 25 секунд</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Prompt */}
                        <div data-tour="prompt">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Описание</label>
                            <textarea
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                placeholder="Что нужно изобразить (подробнее — лучше)"
                                rows={4}
                                className="w-full border border-ink-200 rounded-md px-3 py-2.5 text-[14px] bg-surface text-ink-900 resize-y focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/10 transition-colors"
                            />
                            <p className="text-[11px] text-ink-500 mt-1.5">Чем подробнее — тем точнее результат</p>

                            {/* presets strip */}
                            <div className="flex gap-1.5 flex-wrap mt-2.5">
                                {PRESETS.map(p => (
                                    <button
                                        key={p.label}
                                        type="button"
                                        onClick={() => { setPrompt(p.value); setStyle(p.style) }}
                                        className="px-2.5 py-1 bg-ink-100 hover:bg-ink-200 hover:text-ink-900 border-none rounded-sm text-[12px] text-ink-600 transition-colors"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Style chips */}
                        <div data-tour="style">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Стиль</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {STYLES.map(s => (
                                    <ChipButton key={s.value} active={style === s.value} onClick={() => setStyle(s.value)}>
                                        {s.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Aspect chips */}
                        <div data-tour="format">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">Формат</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {ASPECTS.map(a => (
                                    <ChipButton key={a.value} active={size === a.value} onClick={() => setSize(a.value)}>
                                        {a.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        {/* Keep seed */}
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={keepSeed}
                                onChange={(e) => setKeepSeed(e.target.checked)}
                                className="mt-[3px] w-[18px] h-[18px] accent-brand-500"
                            />
                            <span className="text-[13px] text-ink-700 leading-snug">
                                <span className="font-semibold text-ink-900">Сохранять основу</span>
                                <span className="text-ink-500"> — новые генерации будут ближе к текущей (тот же seed). Удобно, чтобы доработать промпт без полной смены картинки.</span>
                            </span>
                        </label>

                        <div className="pt-2 border-t border-ink-100" data-tour="generate">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!prompt.trim()}
                            >
                                {isGenerating ? 'В процессе…' : 'Сгенерировать'}
                            </Button>
                            <div className="text-center text-[11px] text-ink-500 mt-2.5 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                ⌘ + ↵ — горячая клавиша
                            </div>
                            {errorMsg && (
                                <p className="mt-3 text-[12px] text-center text-danger-700 bg-danger-50 px-3 py-2 rounded-md">
                                    {errorMsg}
                                </p>
                            )}
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-200px)] max-lg:h-[calc(100vh-220px)] overflow-hidden max-lg:${mobileTab === 'preview' ? '' : 'hidden'}`}>
                    {/* preview-toolbar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Генерация…</>
                            ) : hasResult ? (
                                <><Eye className="w-4 h-4" /> Предпросмотр</>
                            ) : (
                                <><Eye className="w-4 h-4 text-ink-400" /> Готов к работе</>
                            )}
                            {hasResult && <Badge variant="success">готово</Badge>}
                        </div>

                        <div className="flex-1" />

                        {hasResult && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<FlipHorizontal className="w-3.5 h-3.5" />}
                                    onClick={() => setIsFlipped(f => !f)}
                                >
                                    {isFlipped ? 'Вернуть' : 'Отразить'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    onClick={copyImageLink}
                                >
                                    {copied ? 'Скопировано' : 'Копировать'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    onClick={downloadImage}
                                    disabled={isDownloading}
                                >
                                    {isDownloading ? '...' : 'Скачать'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={generate}
                                    disabled={isGenerating}
                                >
                                    Заново
                                </Button>
                                {generationId && (
                                    <AssignTaskButton
                                        generationId={generationId}
                                        topic={prompt.slice(0, 60)}
                                        label="Выдать классу"
                                        className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* preview body */}
                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-auto p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress active={isGenerating} title="Создаём изображение…" accentClassName="bg-brand-500" estimatedSeconds={45} />
                            </div>
                        ) : hasResult ? (
                            <div className="flex flex-col items-center gap-4 w-full">
                                {/* Main image */}
                                <div className="rounded-lg overflow-hidden bg-surface border border-ink-200 shadow-sm p-2 max-w-full">
                                    <img
                                        src={selectedUrl ?? undefined}
                                        alt="Сгенерированное изображение"
                                        className={`object-contain max-h-[calc(100vh-380px)] max-lg:max-h-[calc(100vh-380px)] w-auto rounded-md transition-all ${isEditingImage ? 'opacity-50' : ''} ${isFlipped ? '-scale-x-100' : ''}`}
                                    />
                                    {isEditingImage && (
                                        <div className="relative -mt-12 flex items-center justify-center">
                                            <div className="flex items-center gap-2 bg-surface/95 px-4 py-2 rounded-full shadow text-[13px] font-semibold text-ink-700">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {editStatus || 'Применяю правку…'}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Variant thumbs */}
                                {imageUrls.length > 1 && (
                                    <div className="flex gap-2 flex-wrap justify-center">
                                        {imageUrls.map((u, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => { setSelectedIdx(i); setIsFlipped(false) }}
                                                className={[
                                                    'w-16 h-16 rounded-md overflow-hidden border-2 transition-all',
                                                    selectedIdx === i ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-ink-200 hover:border-brand-300',
                                                ].join(' ')}
                                                aria-label={`Вариант ${i + 1}`}
                                            >
                                                <img src={u} alt="" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Edit instruction */}
                                <div className="w-full max-w-xl rounded-lg border border-ink-200 bg-surface p-3.5">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                                        <p className="text-[13px] font-semibold text-ink-900">Изменить изображение</p>
                                    </div>
                                    <p className="text-[12px] text-ink-500 mb-2 leading-snug">
                                        Опишите, что поправить — например: «перенеси чемодан в левую руку». Персонаж и композиция сохранятся.
                                    </p>
                                    <textarea
                                        value={editInstruction}
                                        onChange={(e) => setEditInstruction(e.target.value)}
                                        placeholder="Что изменить на изображении?"
                                        rows={2}
                                        maxLength={1000}
                                        disabled={isEditingImage}
                                        className="w-full px-3 py-2 text-[13px] border border-ink-200 rounded-md focus:outline-none focus:border-brand-400 resize-none disabled:opacity-60"
                                    />
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        fullWidth
                                        onClick={editImage}
                                        loading={isEditingImage}
                                        disabled={isEditingImage || !editInstruction.trim()}
                                        leftIcon={!isEditingImage ? <Wand2 className="w-3.5 h-3.5" /> : undefined}
                                        className="mt-2"
                                    >
                                        {isEditingImage ? (editStatus || 'Применяю правку…') : 'Применить правку'}
                                    </Button>
                                    {errorMsg && <p className="text-[12px] text-danger-700 mt-2">{errorMsg}</p>}
                                </div>
                            </div>
                        ) : (
                            // preview-placeholder
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-ink-200 rounded-lg bg-surface text-ink-500 min-h-[400px]">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <ImageIcon className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">Заполните настройки слева</h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появятся варианты изображений. Можно выбрать одно или сразу несколько.
                                </p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

/* ── helpers ── */

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
                active
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'bg-surface border-ink-200 text-ink-700 hover:border-brand-300 hover:text-ink-900',
            ].join(' ')}
        >
            {children}
        </button>
    )
}
