'use client'

import { useState, useRef, useEffect } from 'react'
import { PackageOpen, RefreshCw, Loader2, Maximize2, Copy, Download, Edit3, Eye } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function UnpackingGenerator() {
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [localContent, setLocalContent] = useState('<p>Ответьте на вопросы для распаковки вашей экспертности и создания товарной линейки.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const questions = [
        { id: 'q1', label: '1) Что вас подтолкнуло заниматься преподаванием? Возможная поворотная точка?' },
        { id: 'q2', label: '2) Что вы делаете лучше всего? Какая деятельность дается легко?' },
        { id: 'q3', label: '3) За что вам чаще всего говорят "спасибо" ученики и их родители?' },
        { id: 'q4', label: '4) Каким вашим знаниям/достижениям чаще всего удивляются люди?' },
        { id: 'q5', label: '5) 5 достижений, которыми вы гордитесь в жизни (связанные с преподаванием)?' },
        { id: 'q6', label: '6) Какие действия вы предприняли для этих 5 достижений?' },
        { id: 'q7', label: '7) Что уникального, авторского было создано вами?' },
        { id: 'q8', label: '8) С какими учениками вам нравится заниматься больше всего?' },
        { id: 'q9', label: '9) Почему именно с этой категорией учеников?' },
        { id: 'q10', label: '10) Какой категории учеников вы можете дать результат самым быстрым способом?' },
        { id: 'q11', label: '11) Какие ваши личностные качества больше всего влияют на вашу деятельность?' },
        { id: 'q12', label: '12) Какие ошибки вы допускали и как исправляли их?' },
        { id: 'q13', label: '13) 3 аспекта преподавания, которые вызывают больше всего вдохновения?' }
    ]

    const handleAnswerChange = (id: string, value: string) => {
        setAnswers(prev => ({ ...prev, [id]: value }))
    }

    const generate = async () => {
        // Require at least a few answers to generate a meaningful response
        const filledAnswers = Object.values(answers).filter(a => a.trim().length > 0)
        if (filledAnswers.length < 3) {
            setLocalContent('<p class="text-amber-600">Пожалуйста, ответьте хотя бы на 3 вопроса для получения качественного результата.</p>')
            return;
        }

        try {
            setLocalContent('<p>Анализируем ваши ответы и генерируем распаковку экспертности...</p><p>Это может занять некоторое время.</p>')
            setEditMode(false)

            // Format the answers into the expected structure
            const params = { ...answers }

            const status = await generateAndWait({ type: 'unpacking', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при распаковке: ${e.message}</p>`)
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
            <div className="w-[400px] md:w-[450px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                        <PackageOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Распаковка Экспертности</h2>
                            <GenerationCostBadge operationType="unpacking" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <p className="text-sm text-gray-600 mb-4 bg-violet-50 p-3 rounded-xl border border-violet-100">
                            Ответьте на максимальное количество вопросов подробно. Минимум 3 ответа для старта.
                        </p>

                        {questions.map((q) => (
                            <div key={q.id}>
                                <label className="block text-sm font-bold text-gray-700 mb-2">{q.label}</label>
                                <textarea
                                    value={answers[q.id] || ''}
                                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                                    placeholder="Ваш ответ..."
                                    rows={3}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-none text-gray-900 placeholder-gray-400"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || Object.values(answers).filter(a => a.trim().length > 0).length < 3}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tracking-wide text-gray-500">РЕЗУЛЬТАТ РАСПАКОВКИ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {localContent && !localContent.includes('ответьте хотя бы на 3 вопроса') && !localContent.includes('Анализируем ваши ответы') && !localContent.includes('Ответьте на вопросы для распаковки') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating || localContent.includes('Ответьте на вопросы')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating || localContent.includes('Ответьте на вопросы')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg transition-all disabled:opacity-40 ml-1"
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
                                <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
                                <p className="font-medium">Анализируем ответы...</p>
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
