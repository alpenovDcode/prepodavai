'use client'

import { useState, useEffect } from 'react'
import { FileEdit, RefreshCw, Loader2, Maximize2 } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function AdaptationGenerator() {
    const [action, setAction] = useState('simplify')
    const [text, setText] = useState('')
    const [level, setLevel] = useState('5')
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Введите исходный текст и выберите действие для генерации.</p>')

    const { generateAndWait, isGenerating } = useGenerations()

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const generate = async () => {
        if (!text) return;

        try {
            setLocalContent('<p>Генерируем текст...</p>')
            if (isMobile) setActiveTab('preview')
            
            const params = {
                sourceType: 'text',
                text,
                action,
                level,
                youtubeUrl: ''
            }

            const status = await generateAndWait({ type: 'content', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации текста: ${e.message}</p>`)
        }
    }

    const actions = [
        { value: 'simplify', label: 'Упростить текст' },
        { value: 'summary', label: 'Сделать саммари' },
        { value: 'questions', label: 'Придумать вопросы к тексту' },
        { value: 'keypoints', label: 'Выделить главные мысли (Keypoints)' }
    ]

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-cyan-500 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-cyan-500 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Результат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                        <FileEdit className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Адаптация Текста</h2>
                            <GenerationCostBadge operationType="content_adaptation" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Действие</label>
                            <select
                                value={action}
                                onChange={e => setAction(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                            >
                                {actions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Исходный текст</label>
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder="Вставьте исходный текст для обработки..."
                                rows={isMobile ? 12 : 8}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Класс (для адаптации)</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                            >
                                {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i + 1} value={String(i + 1)}>{i + 1} класс</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !text.trim()}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Адаптировать'}</span>
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
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                            <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 uppercase">РЕЗУЛЬТАТ</span>
                            <span className="text-gray-200 hidden xs:inline">•</span>
                            <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 hidden xs:inline">{actions.find(a => a.value === action)?.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 p-6 text-center">
                                <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-900">Адаптируем текст...</p>
                                    <p className="text-sm text-gray-400">Это может занять 15–30 секунд</p>
                                </div>
                            </div>
                        ) : !text.trim() ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                    <FileEdit className="w-8 h-8 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-600">Готов к работе</p>
                                    <p className="text-sm">Введите текст и нажмите «Адаптировать»</p>
                                </div>
                                {isMobile && (
                                    <button 
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-cyan-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Ввести текст
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="absolute inset-0">
                                <RichTextEditor
                                    content={localContent}
                                    onChange={setLocalContent}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
