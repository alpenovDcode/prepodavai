'use client'

import { useState, useRef, useEffect } from 'react'
import { PenTool, Download, Copy, RefreshCw, Loader2, Edit3, Eye } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function WorksheetGenerator() {
    const [topic, setTopic] = useState('')
    const [subject, setSubject] = useState('')
    const [level, setLevel] = useState('Средняя школа')
    const [questionsCount, setQuestionsCount] = useState(10)

    const [localContent, setLocalContent] = useState('<p>Введите тему, выберите уровень и класс, нажмите Создать Задания.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const generate = async () => {
        if (!topic) return
        try {
            setLocalContent('<p>Генерируем рабочие листы...</p>')
            setEditMode(false)

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'worksheet',
                params: { userHash, subject, topic, level, questionsCount, format: 'HTML' }
            })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации: ${e.message}</p>`)
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
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600">
                        <PenTool className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Рабочие Листы</h2>
                            <GenerationCostBadge operationType="worksheet" />
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
                                placeholder="напр. История"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="напр. Вторая Мировая Война"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Уровень ученика</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-gray-900"
                            >
                                <option value="Младшие классы">Младшие классы</option>
                                <option value="Средняя школа">Средняя школа</option>
                                <option value="Старшие классы">Старшие классы</option>
                                <option value="Взрослые">Взрослые</option>
                                <option value="Подготовка к ОГЭ">Подготовка к ОГЭ</option>
                                <option value="Подготовка к ЕГЭ">Подготовка к ЕГЭ</option>
                                <option value="Студенты вузов">Студенты вузов</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Количество заданий ({questionsCount})</label>
                            <input
                                type="range"
                                min="1"
                                max="20"
                                value={questionsCount}
                                onChange={e => setQuestionsCount(parseInt(e.target.value))}
                                className="w-full accent-yellow-500 hover:accent-yellow-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>1</span>
                                <span>10</span>
                                <span>20</span>
                            </div>
                        </div>

                        <button
                            onClick={generate}
                            disabled={isGenerating || !topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-yellow-400 to-orange-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'Генерируем...' : 'Создать Задания'}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Toolbar */}
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <span className="text-xs font-bold tracking-wide text-gray-500">РАБОЧИЙ ЛИСТ</span>
                        <div className="flex items-center gap-2">
                            {localContent && localContent !== '<p>Введите тему, выберите уровень и класс, нажмите Создать Задания.</p>' && localContent !== '<p>Генерируем рабочие листы...</p>' && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                            <button onClick={generate} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Перегенерировать">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-all disabled:opacity-40 ml-2"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Скачать PDF
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden relative">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-yellow-500" />
                                <p className="font-medium">Генерируем рабочий лист...</p>
                                <p className="text-sm text-gray-400">Это может занять 30–60 секунд</p>
                            </div>
                        ) : !localContent || localContent === '<p>Введите тему, выберите уровень и класс, нажмите Создать Задания.</p>' ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <PenTool className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите тему и нажмите «Создать Задания»</p>
                                <p className="text-sm">Готовый рабочий лист появится здесь</p>
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
                                sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                                title="Рабочий лист"
                            />
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
