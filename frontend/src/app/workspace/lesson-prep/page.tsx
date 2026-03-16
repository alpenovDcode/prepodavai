'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Loader2, Maximize2 } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function LessonPrepGenerator() {
    const [subject, setSubject] = useState('')
    const [topic, setTopic] = useState('')
    const [level, setLevel] = useState('5')
    const [interests, setInterests] = useState('')
    const [generationTypes, setGenerationTypes] = useState(['lessonPlan', 'worksheet', 'quiz'])

    // Using a simple state for now, but UI could support toggling these
    const allGenTypes = [
        { value: 'lessonPlan', label: 'План урока' },
        { value: 'worksheet', label: 'Рабочий лист' },
        { value: 'presentation', label: 'Структура презентации' },
        { value: 'quest', label: 'Сценарий квеста' },
        { value: 'visuals', label: 'Тематические идеи изображений' },
        { value: 'quiz', label: 'Тест' },
        { value: 'content', label: 'Учебный материал' }
    ]

    const [localContent, setLocalContent] = useState('<p>Заполните параметры для создания комплексного вау-урока с учетом интересов ученика.</p>')

    const { generateAndWait, isGenerating } = useGenerations()

    const generate = async () => {
        if (!subject || !topic) return;

        try {
            setLocalContent('<p>Генерируем материалы для вау-урока...</p>')
            const params = {
                subject,
                topic,
                level,
                interests,
                generationTypes
            }

            const status = await generateAndWait({ type: 'lesson_preparation', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации материалов: ${e.message}</p>`)
        }
    }

    const toggleType = (value: string) => {
        setGenerationTypes(prev =>
            prev.includes(value)
                ? prev.filter(t => t !== value)
                : [...prev, value]
        )
    }

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-pink-600">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Вау-урок</h2>
                            <GenerationCostBadge operationType="lesson_preparation" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Предмет</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Математика"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Дроби"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Класс</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400"
                            >
                                {Array.from({ length: 11 }, (_, i) => (
                                    <option key={i + 1} value={String(i + 1)}>{i + 1} класс</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Интересы ученика</label>
                            <textarea
                                value={interests}
                                onChange={e => setInterests(e.target.value)}
                                placeholder="Minecraft, Roblox, футбол (для персонализации)..."
                                rows={3}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Что сгенерировать</label>
                            <div className="space-y-2 mt-2">
                                {allGenTypes.map(type => (
                                    <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={generationTypes.includes(type.value)}
                                            onChange={() => toggleType(type.value)}
                                            className="rounded text-pink-500 focus:ring-pink-500 border-gray-300"
                                        />
                                        <span className="text-sm text-gray-600">{type.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !subject || !topic}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Создать Вау-урок'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tracking-wide text-gray-500">МАТЕРИАЛЫ УРОКА</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        <div className="absolute inset-0">
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
