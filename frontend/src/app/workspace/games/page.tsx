'use client'

import React, { useState, useRef } from 'react'
import { Download, Copy, RefreshCw, Loader2, Gamepad2, ExternalLink } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function GamesGenerator() {
    const [form, setForm] = useState({
        type: 'millionaire',
        topic: '',
    })

    const [isGenerating, setIsGenerating] = useState(false)
    const [generationResult, setGenerationResult] = useState<{ url: string; downloadUrl: string } | null>(null)

    const iframeRef = useRef<HTMLIFrameElement>(null)

    const generateGame = async () => {
        if (!form.topic) return

        setIsGenerating(true)
        setGenerationResult(null)

        try {
            // getCurrentUser usually initializes stuff, kept here for side effects if any
            getCurrentUser()

            const response = await apiClient.post('/games/generate', {
                topic: form.topic,
                type: form.type
            })

            if (response.data && response.data.url) {
                setGenerationResult({
                    url: response.data.url,
                    downloadUrl: response.data.downloadUrl,
                })
            } else {
                alert('Не удалось получить URL игры')
            }
        } catch (error: any) {
            console.error(error)
            alert(error.response?.data?.message || error.message || 'Произошла ошибка при генерации')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleCopyLink = () => {
        if (generationResult?.url) {
            navigator.clipboard.writeText(generationResult.url)
        }
    }

    const exportHTML = () => {
        if (generationResult?.downloadUrl) {
            window.open(generationResult.downloadUrl, '_blank')
        }
    }

    const openInNewTab = () => {
        if (generationResult?.url) {
            window.open(generationResult.url, '_blank')
        }
    }

    const GAME_TYPES = [
        { value: 'millionaire', label: 'Кто хочет стать миллионером' },
        { value: 'flashcards', label: 'Флеш-карточки' },
        { value: 'crossword', label: 'Филворд (Поиск слов)' },
        { value: 'memory', label: 'Найди пару (Memory)' },
        { value: 'truefalse', label: 'Правда или Ложь' }
    ]

    const selectedGameLabel = GAME_TYPES.find(g => g.value === form.type)?.label?.toUpperCase() || 'ОБУЧАЮЩИЕ ИГРЫ'

    return (
        <div className="flex w-full h-full bg-[#F9FAFB] overflow-hidden">
            <div className="w-[320px] lg:w-[380px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full z-10 shadow-sm relative">
                <div className="p-4 sm:p-5 flex flex-col h-full">
                    <div className="mb-6 pb-4 border-b border-gray-100/80">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm">
                                <Gamepad2 className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold tracking-tight text-gray-900 leading-tight">Обучающие Игры</h2>
                                <GenerationCostBadge operationType="game_generation" />
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed font-medium">Создайте интерактивную игру по вашей теме</p>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar pb-6 space-y-5">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Тип игры</label>
                                <select
                                    value={form.type}
                                    onChange={e => setForm({ ...form, type: e.target.value })}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:bg-white transition-colors text-gray-900"
                                >
                                    {GAME_TYPES.map(g => (
                                        <option key={g.value} value={g.value}>{g.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Тема</label>
                                <input
                                    type="text"
                                    value={form.topic}
                                    onChange={e => setForm({ ...form, topic: e.target.value })}
                                    placeholder="напр. История Древнего Рима"
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                />
                            </div>
                        </div>

                        <button
                            onClick={generateGame}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-orange-400 to-red-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-400 to-red-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Сгенерировать Игру'}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-orange-50 text-orange-700 rounded-md text-xs font-bold tracking-wide">{selectedGameLabel}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {generationResult && (
                                <button onClick={openInNewTab} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
                                    <ExternalLink className="w-3.5 h-3.5" /> Открыть в новой вкладке
                                </button>
                            )}
                            <button onClick={handleCopyLink} disabled={!generationResult} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40" title="Скопировать ссылку">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button onClick={generateGame} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Перегенерировать">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportHTML}
                                disabled={!generationResult}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors ml-2 disabled:opacity-40"
                            >
                                <Download className="w-4 h-4" />
                                Скачать HTML
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                                <p className="font-medium">Создаём игру...</p>
                                <p className="text-sm text-gray-400">Это может занять 15–30 секунд</p>
                            </div>
                        ) : !generationResult ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <Gamepad2 className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите тему и нажмите «Сгенерировать Игру»</p>
                                <p className="text-sm">Готовая игра появится здесь</p>
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={generationResult.url}
                                className="w-full h-full border-0"
                                sandbox="allow-same-origin allow-scripts allow-modals"
                                title="Игра"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
