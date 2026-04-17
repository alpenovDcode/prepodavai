'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { PackageOpen, RefreshCw, Loader2, Maximize2, Copy, Download, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import AssignTaskButton from '@/components/AssignTaskButton'
import GenerationProgress from '@/components/workspace/GenerationProgress'

export default function UnpackingGenerator() {
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [localContent, setLocalContent] = useState('<p>Ответьте на вопросы для распаковки вашей экспертности и создания товарной линейки.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && !localContent.includes('Ответьте на вопросы') && !localContent.includes('Анализируем ваши ответы') && !localContent.includes('ответьте хотя бы на 3')

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

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
            if (isMobile) setActiveTab('preview')

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
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const safeContent = DOMPurify.sanitize(localContent, { FORCE_BODY: true })
        const html = /<\/head>/i.test(safeContent)
            ? safeContent.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8">${autoPrint}</head><body>${safeContent}</body></html>`
        const win = window.open('', '_blank')
        if (!win) { toast.error('Разрешите всплывающие окна для этого сайта'); return }
        win.document.open(); win.document.write(html); win.document.close()
    }

    const handleCopy = async () => {
        if (!localContent) return
        try {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = DOMPurify.sanitize(localContent)
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
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Вопросы
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Результат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[400px] lg:w-[450px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                        <PackageOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Распаковка Экспертности</h2>
                            <GenerationCostBadge operationType="unpacking" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <p className="text-sm text-gray-600 mb-4 bg-violet-50 p-3 rounded-xl border border-violet-100 font-medium">
                            Ответьте на вопросы подробно. Минимум 3 ответа для генерации.
                        </p>

                        {questions.map((q) => (
                            <div key={q.id}>
                                <label className="block text-sm font-bold text-gray-700 mb-2">{q.label}</label>
                                <textarea
                                    value={answers[q.id] || ''}
                                    onChange={e => handleAnswerChange(q.id, e.target.value)}
                                    placeholder="Ваш ответ..."
                                    rows={3}
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 transition-all text-gray-900 placeholder-gray-400 resize-none"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || Object.values(answers).filter(a => a.trim().length > 0).length < 3}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать'}</span>
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
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0 overflow-x-auto">
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">РЕЗУЛЬТАТ</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && !localContent.includes('ответьте хотя бы на 3 вопроса') && !localContent.includes('Анализируем ваши ответы') && !localContent.includes('Ответьте на вопросы для распаковки') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${editMode
                                        ? 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating || localContent.includes('Ответьте на вопросы')}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{copied ? 'Готово!' : 'Копировать'}</span>
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating || localContent.includes('Ответьте на вопросы')}
                                className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-40"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            {hasResult && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic="Распаковка"
                                    className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-60"
                                />
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Анализируем ответы..." accentClassName="bg-violet-500" estimatedSeconds={55} />
                        ) : !localContent || localContent.includes('Ответьте на вопросы') ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-violet-50 flex items-center justify-center">
                                    <PackageOpen className="w-10 h-10 text-violet-200" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-gray-700">Распаковка появится здесь</h3>
                                    <p className="text-sm text-gray-400 max-w-[320px]">
                                        Ответьте на вопросы и нажмите кнопку Сгенерировать.
                                    </p>
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-violet-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        К вопросам
                                    </button>
                                )}
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
                                className="w-full h-full border-0 bg-white"
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="Результат генерации"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
