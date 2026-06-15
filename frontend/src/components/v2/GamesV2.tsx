'use client'

import { useEffect, useRef, useState } from 'react'
import {
    Gamepad2, Copy, Check, RefreshCw, Loader2, Eye, Wand2,
    Sparkles, Settings2, ExternalLink, Download, Link2, QrCode,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { apiClient } from '@/lib/api/client'
import { getCurrentUser } from '@/lib/utils/userIdentity'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Badge } from '@/components/ui/v2/Badge'
import { Tabs } from '@/components/ui/v2/Tabs'

import GenerationProgress from '@/components/workspace/GenerationProgress'
import AssignTaskButton from '@/components/AssignTaskButton'

type GameType = 'memory' | 'flashcards' | 'millionaire' | 'crossword' | 'truefalse'

const GAME_TYPES: { value: GameType; label: string }[] = [
    { value: 'memory',      label: 'Memory' },
    { value: 'flashcards',  label: 'Flash-карты' },
    { value: 'millionaire', label: 'Миллионер' },
    { value: 'crossword',   label: 'Кроссворд' },
    { value: 'truefalse',   label: 'Правда или Ложь' },
]

const GAME_HINT =
    '«Memory» — найди пару. «Flash-карты» — карточки для запоминания. «Миллионер» — викторина с подсказками. «Кроссворд» — словарный запас. «Правда или Ложь» — утверждения на проверку знаний.'

const DIFFICULTIES = [
    { value: 'easy',   label: 'Лёгкая' },
    { value: 'medium', label: 'Средняя' },
    { value: 'hard',   label: 'Сложная' },
]

const LEVELS = Array.from({ length: 11 }, (_, i) => ({ label: `${i + 1} класс`, value: `${i + 1} класс` }))

const TOPIC_PRESETS = ['История Древнего Рима', 'Митоз', 'Past Simple', 'Законы Ньютона']

export default function GamesV2() {
    const [type, setType] = useState<GameType>('memory')
    const [topic, setTopic] = useState('История Древнего Рима')
    const [level, setLevel] = useState('5 класс')
    const [count, setCount] = useState(15)
    const [difficulty, setDifficulty] = useState('medium')

    const [isGenerating, setIsGenerating] = useState(false)
    const [result, setResult] = useState<{
        url: string
        downloadUrl: string
        generationId: string | null
    } | null>(null)
    const [copied, setCopied] = useState(false)
    const [mobileTab, setMobileTab] = useState<'config' | 'preview'>('config')

    const iframeRef = useRef<HTMLIFrameElement>(null)

    const generate = async () => {
        if (!topic.trim()) {
            toast.error('Укажите тему игры')
            return
        }
        setIsGenerating(true)
        setResult(null)
        setMobileTab('preview')
        try {
            getCurrentUser()
            const resp = await apiClient.post('/games/generate', {
                topic: topic.trim(),
                type,
                level,
                count,
                difficulty,
            })
            if (resp.data && resp.data.url) {
                setResult({
                    url: resp.data.url,
                    downloadUrl: resp.data.downloadUrl,
                    generationId: resp.data.generationId ?? null,
                })
            } else {
                toast.error('Не удалось получить URL игры')
            }
        } catch (err: any) {
            console.error('Game generation failed:', err)
            toast.error(err?.response?.data?.message || err?.message || 'Ошибка генерации')
        } finally {
            setIsGenerating(false)
        }
    }

    const copyLink = async () => {
        if (!result?.url) return
        try {
            await navigator.clipboard.writeText(result.url)
            setCopied(true)
            toast.success('Ссылка скопирована')
            setTimeout(() => setCopied(false), 1500)
        } catch {
            toast.error('Не удалось скопировать')
        }
    }

    const openInNewTab = () => result?.url && window.open(result.url, '_blank')
    const download = () => result?.downloadUrl && window.open(result.downloadUrl, '_blank')

    // Cmd/Ctrl + Enter
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                if (!isGenerating && topic.trim()) generate()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topic, type, level, count, isGenerating])

    const hasResult = !!result && !isGenerating
    const qrSrc = result?.url
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(result.url)}`
        : null

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Mobile tabs */}
            <div className="lg:hidden border-b border-ink-200 bg-surface px-4 pt-2">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'config',  label: 'Параметры',    icon: <Settings2 className="w-4 h-4" /> },
                        { id: 'preview', label: 'Предпросмотр', icon: <Eye       className="w-4 h-4" /> },
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
                            style={{ background: '#EEF2FF', color: '#4338CA' }}
                        >
                            <Gamepad2 className="w-[22px] h-[22px]" />
                        </span>
                        <div>
                            <h2 className="font-display font-bold text-[18px] text-ink-900">Обучающая игра</h2>
                            <div className="text-[12px] text-ink-500 mt-0.5">HTML5-игра по вашей теме · ~25 секунд</div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-[18px] pt-4">
                        {/* Game type chips */}
                        <div data-tour="type">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Тип игры
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                                {GAME_TYPES.map((g) => (
                                    <ChipButton key={g.value} active={type === g.value} onClick={() => setType(g.value)}>
                                        {g.label}
                                    </ChipButton>
                                ))}
                            </div>
                            <div className="text-[11px] text-ink-500 mt-2 leading-relaxed">{GAME_HINT}</div>
                        </div>

                        {/* Topic */}
                        <div data-tour="topic">
                            <Input
                                label="ТЕМА"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="История Древнего Рима"
                                hint="По теме будут составлены задания"
                            />
                            <div className="flex gap-1.5 flex-wrap mt-2.5">
                                {TOPIC_PRESETS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setTopic(p)}
                                        className="px-2.5 py-1 bg-ink-100 hover:bg-ink-200 hover:text-ink-900 border-none rounded-sm text-[12px] text-ink-600 transition-colors"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Level chips */}
                        <div data-tour="level">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Класс
                            </label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full h-10 px-3 rounded-md border border-ink-200 bg-surface text-[14px] text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 transition-colors"
                            >
                                {LEVELS.map(l => (
                                    <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Count slider */}
                        <div data-tour="count">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Количество заданий
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min={5}
                                    max={30}
                                    value={count}
                                    onChange={(e) => setCount(Number(e.target.value))}
                                    className="flex-1 accent-brand-500"
                                />
                                <div className="min-w-[36px] text-center bg-brand-50 text-brand-700 px-2.5 py-1 rounded-sm font-bold text-[13px] tnum">
                                    {count}
                                </div>
                            </div>
                        </div>

                        {/* Сложность */}
                        <div data-tour="difficulty">
                            <label className="block text-[12px] font-semibold text-ink-700 mb-2 uppercase tracking-wider">
                                Сложность
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                                {DIFFICULTIES.map(d => (
                                    <ChipButton key={d.value} active={difficulty === d.value} onClick={() => setDifficulty(d.value)}>
                                        {d.label}
                                    </ChipButton>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-ink-100">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                leftIcon={<Wand2 className="w-4 h-4" />}
                                onClick={generate}
                                loading={isGenerating}
                                disabled={!topic.trim()}
                                data-tour="generate"
                            >
                                {isGenerating ? 'В процессе…' : 'Сгенерировать'}
                            </Button>
                            <div className="text-center text-[11px] text-ink-500 mt-2.5 inline-flex items-center justify-center w-full gap-1">
                                <Sparkles className="w-3 h-3" />
                                ⌘ + ↵ — горячая клавиша
                            </div>
                        </div>
                    </div>
                </Card>

                {/* RIGHT: preview */}
                <Card padding="none"
                      className={`col-span-8 max-lg:col-span-1 flex flex-col h-[calc(100vh-120px)] max-lg:h-[calc(100vh-160px)] overflow-hidden max-lg:${mobileTab === 'preview' ? '' : 'hidden'}`}>
                    {/* preview-toolbar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 flex-wrap">
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Генерация…</>
                            ) : hasResult ? (
                                <><Eye className="w-4 h-4" /> Превью</>
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
                                    leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                                    onClick={copyLink}
                                >
                                    {copied ? 'Скопировано' : 'Ссылка'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                                    onClick={openInNewTab}
                                >
                                    Открыть
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Download className="w-3.5 h-3.5" />}
                                    onClick={download}
                                >
                                    Скачать
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
                                {result?.generationId && (
                                    <AssignTaskButton
                                        generationId={result.generationId}
                                        topic={topic}
                                        label="Выдать классу"
                                        className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-md transition-colors"
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* preview body */}
                    <div data-tour="preview" className="flex-1 min-h-0 bg-ink-50 overflow-hidden p-6 max-md:p-3">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center">
                                <GenerationProgress
                                    active={isGenerating}
                                    title="Создаём игру…"
                                    accentClassName="bg-brand-500"
                                    estimatedSeconds={25}
                                />
                            </div>
                        ) : hasResult && result ? (
                            <div className="h-full flex flex-col gap-3">
                                {/* link + QR strip */}
                                <div className="flex items-center gap-3 p-3 bg-surface border border-ink-200 rounded-lg flex-wrap">
                                    {qrSrc && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={qrSrc}
                                            alt="QR-код для запуска игры"
                                            className="w-[64px] h-[64px] rounded-sm border border-ink-200 bg-white"
                                        />
                                    )}
                                    <div className="flex-1 min-w-[200px]">
                                        <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-500 mb-1 flex items-center gap-1.5">
                                            <QrCode className="w-3 h-3" /> Ссылка для учеников
                                        </div>
                                        <div className="text-[13px] text-ink-700 font-mono truncate select-all" title={result.url}>
                                            {result.url}
                                        </div>
                                        <div className="text-[11px] text-ink-500 mt-1">
                                            Отсканируй QR — игра откроется на телефоне ученика.
                                        </div>
                                    </div>
                                </div>
                                {/* iframe */}
                                <div className="flex-1 min-h-[640px] rounded-lg overflow-hidden bg-white border border-ink-200">
                                    <iframe
                                        ref={iframeRef}
                                        src={result.url}
                                        className="w-full h-full border-0"
                                        sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                                        title="game-preview"
                                        allowFullScreen
                                    />
                                </div>
                            </div>
                        ) : (
                            // preview-placeholder
                            <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-ink-200 rounded-lg bg-surface text-ink-500 min-h-[400px]">
                                <div className="w-[72px] h-[72px] rounded-lg bg-ink-100 inline-flex items-center justify-center text-ink-400 mb-4">
                                    <Gamepad2 className="w-9 h-9" />
                                </div>
                                <h3 className="font-display font-bold text-[16px] text-ink-700 mb-1.5">
                                    Заполните настройки слева
                                </h3>
                                <p className="text-[13px] max-w-[360px] leading-relaxed">
                                    После генерации здесь появится превью игры, ссылка и QR-код для запуска на устройствах учеников.
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
