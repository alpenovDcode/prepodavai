'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { downloadPdf } from '@/lib/utils/downloadPdf'
import { MessageCircle, RefreshCw, Loader2, Copy, Download, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import AssignTaskButton from '@/components/AssignTaskButton'
import GenerationProgress from '@/components/workspace/GenerationProgress'
import { ensureMathJaxInHtml } from '@/lib/utils/ensureMathJax'

export default function FeedbackGenerator() {
    const [taskType, setTaskType] = useState('')
    const [studentWork, setStudentWork] = useState('')
    const [level, setLevel] = useState('')
    const [localContent, setLocalContent] = useState('')
    const [editMode, setEditMode] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()

    const generate = async () => {
        if (!studentWork || !taskType) return;

        try {
            setEditMode(false)
            const params = { taskType, studentWork, level }

            const status = await generateAndWait({ type: 'feedback', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации фидбека: ${e.message}</p>`)
        }
    }

    const toggleEditMode = () => setEditMode(!editMode)

    const handleCopy = () => {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = DOMPurify.sanitize(localContent)
        navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '')
    }

    const exportPDF = async () => {
        try {
            await downloadPdf(localContent)
        } catch {
            toast.error('Не удалось сформировать PDF')
        }
    }

    useEffect(() => {
        if (!editMode && iframeRef.current && localContent) {
            const iframeDoc = iframeRef.current.contentDocument
            if (iframeDoc) {
                const handleClick = () => setEditMode(true)
                iframeDoc.body.addEventListener('click', handleClick)
                iframeDoc.body.style.cursor = 'text'
                return () => { iframeDoc.body.removeEventListener('click', handleClick) }
            }
        }
    }, [editMode, localContent])

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                        <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Фидбек на работу</h2>
                            <GenerationCostBadge operationType="feedback" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип задания</label>
                            <input
                                type="text"
                                value={taskType}
                                onChange={e => setTaskType(e.target.value)}
                                placeholder="эссе, решение задачи..."
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Текст работы</label>
                            <textarea
                                value={studentWork}
                                onChange={e => setStudentWork(e.target.value)}
                                placeholder="Вставьте ответ ученика..."
                                rows={8}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Класс (необязательно)</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 placeholder-gray-400"
                            >
                                <option value="">—</option>
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
                        disabled={isGenerating || !studentWork.trim() || !taskType.trim()}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-orange-400 to-red-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-400 to-red-500 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-md text-[10px] font-bold tracking-wide uppercase">ФИДБЕК</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all flex-shrink-0 ${editMode
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Править'}</span>
                                </button>
                            )}
                            <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportPDF}
                                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all active:scale-[0.98] ml-1 flex-shrink-0"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                            </button>
                            {localContent && !isGenerating && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic="Фидбек"
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex-shrink-0 disabled:opacity-60"
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Генерируем фидбек..." accentClassName="bg-orange-500" estimatedSeconds={25} />
                        ) : !localContent ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                    <MessageCircle className="w-8 h-8 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-600">Готов к работе</p>
                                    <p className="text-sm">Введите текст работы ученика и нажмите «Сгенерировать»</p>
                                </div>
                            </div>
                        ) : editMode ? (
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={ensureMathJaxInHtml(localContent)}
                                className="w-full h-full border-0 bg-white"
                                title="Feedback Output"
                                sandbox="allow-scripts allow-popups allow-modals"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
