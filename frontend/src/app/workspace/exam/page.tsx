'use client'

import { useState, useRef, useEffect } from 'react'
import { GraduationCap, Download, Copy, RefreshCw, Loader2, Edit3, Eye } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function ExamGeneratorPage() {
    const [subject, setSubject] = useState('')
    const [level, setLevel] = useState('ОГЭ (9 класс)')
    const [questionsCount, setQuestionsCount] = useState(20)
    const [preferences, setPreferences] = useState('')
    const [customPrompt, setCustomPrompt] = useState('')

    const [localContent, setLocalContent] = useState('<p>Введите предмет, выберите тип экзамена (ОГЭ/ЕГЭ), настройте количество заданий и нажмите Сгенерировать Вариант.</p>')
    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const generate = async () => {
        if (!subject) return
        try {
            setLocalContent('<p>Генерируем вариант экзамена (ОГЭ/ЕГЭ)... Это может занять около минуты.</p>')
            setEditMode(false)

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'exam-variant',
                params: { userHash, subject, level, questionsCount, preferences, customPrompt, format: 'HTML' }
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
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                        <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Варианты ОГЭ/ЕГЭ</h2>
                            <GenerationCostBadge operationType="exam-variant" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Предмет *</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="напр. Информатика, Биология"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип экзамена</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                            >
                                <option value="ОГЭ (9 класс)">ОГЭ (9 класс)</option>
                                <option value="ЕГЭ (11 класс)">ЕГЭ (11 класс)</option>
                                <option value="ВПР (Всероссийские проверочные работы)">ВПР</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Количество заданий ({questionsCount})</label>
                            <input
                                type="range"
                                min="5"
                                max="40"
                                value={questionsCount}
                                onChange={e => setQuestionsCount(parseInt(e.target.value))}
                                className="w-full accent-purple-500 hover:accent-purple-600"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>5</span>
                                <span>20</span>
                                <span>40</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Пожелания к варианту (опционально)</label>
                            <textarea
                                value={preferences}
                                onChange={e => setPreferences(e.target.value)}
                                placeholder="Например: Сделать варианты более сложными, сделать акцент на геометрию..."
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400 h-24 max-h-48 resize-y"
                            />
                        </div>

                        <button
                            onClick={generate}
                            disabled={isGenerating || !subject}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'Генерируем...' : 'Сгенерировать Вариант'}</span>
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
                        <span className="text-xs font-bold tracking-wide text-gray-500">КИМ (РАСПЕЧАТКА)</span>
                        <div className="flex items-center gap-2">
                            {localContent && !localContent.includes('Введите предмет') && !localContent.includes('Генерируем') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
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
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-all disabled:opacity-40 ml-2"
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
                                <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                                <p className="font-medium">Составляем КИМ...</p>
                                <p className="text-sm text-gray-400">Это может занять 30–60 секунд</p>
                            </div>
                        ) : !localContent || localContent.includes('Введите предмет') ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <GraduationCap className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите предмет и нажмите «Сгенерировать Вариант»</p>
                                <p className="text-sm">Готовый вариант отобразится здесь</p>
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
                                title="Вариант ОГЭ/ЕГЭ"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
