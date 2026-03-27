'use client'

import { useState, useRef, useEffect } from 'react'
import { HelpCircle, Download, Copy, RefreshCw, Loader2, Eye, Edit3 } from 'lucide-react'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { apiClient } from '@/lib/api/client'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function QuizGenerator() {
    const [form, setForm] = useState({
        subject: '',
        topic: '',
        level: '8 Класс',
        questionsCount: 10,
        answersCount: 4,
    })

    const [editMode, setEditMode] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)


    const [isExporting, setIsExporting] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Определите параметры теста и нажмите Сгенерировать.</p>')

    const { generateAndWait, isGenerating } = useGenerations()

    const generateQuiz = async () => {
        if (!form.topic) return;

        try {
            setLocalContent('<p>Генерируем вопросы для теста...</p>')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const params = {
                userHash,
                subject: form.subject,
                topic: form.topic,
                level: form.level,
                questionsCount: form.questionsCount,
                answersCount: form.answersCount,
            }

            const status = await generateAndWait({ type: 'quiz', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации теста: ${e.message}</p>`)
        }
    }

    const handleCopy = () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = localContent;
        navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '');
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

    const exportPDF = () => {
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const html = /<\/head>/i.test(localContent)
            ? localContent.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8">${autoPrint}</head><body>${localContent}</body></html>`
        const win = window.open('', '_blank')
        if (!win) { alert('Разрешите всплывающие окна для этого сайта'); return }
        win.document.open(); win.document.write(html); win.document.close()
    }

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">

            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                        <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Генератор Тестов</h2>
                            <GenerationCostBadge operationType="quiz" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">

                    <div className="space-y-6">
                        {/* Topic */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема Теста</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400">❓</span>
                                </div>
                                <input
                                    type="text"
                                    value={form.topic}
                                    onChange={e => setForm({ ...form, topic: e.target.value })}
                                    placeholder="напр. Строение клетки"
                                    className="block w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                />
                            </div>
                        </div>

                        {/* Subject & Grade */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Предмет</label>
                                <input
                                    type="text"
                                    value={form.subject}
                                    onChange={e => setForm({ ...form, subject: e.target.value })}
                                    placeholder="напр. Биология"
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Класс</label>
                                <select
                                    value={form.level}
                                    onChange={e => setForm({ ...form, level: e.target.value })}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                >
                                    <option>5 Класс</option>
                                    <option>6 Класс</option>
                                    <option>7 Класс</option>
                                    <option>8 Класс</option>
                                    <option>Старшая Школа</option>
                                </select>
                            </div>
                        </div>

                        {/* Questions Count */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Вопросы</label>
                                <select
                                    value={form.questionsCount}
                                    onChange={e => setForm({ ...form, questionsCount: Number(e.target.value) })}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                >
                                    {[5, 10, 15, 20, 25].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Варианты</label>
                                <select
                                    value={form.answersCount}
                                    onChange={e => setForm({ ...form, answersCount: Number(e.target.value) })}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                >
                                    {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={generateQuiz}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Сгенерировать Тест'}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-xs font-bold tracking-wide">ТЕСТ</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs font-medium text-gray-500">{form.questionsCount} Вопросов</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {localContent && localContent !== '<p>Определите параметры теста и нажмите Сгенерировать.</p>' && localContent !== '<p>Генерируем вопросы для теста...</p>' && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button onClick={handleCopy} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button onClick={generateQuiz} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Перегенерировать">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportPDF}
                                disabled={isExporting}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors ml-2"
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Экспорт PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-green-500" />
                                <p className="font-medium">Генерируем тест...</p>
                                <p className="text-sm text-gray-400">Это может занять 30–60 секунд</p>
                            </div>
                        ) : !localContent || localContent === '<p>Определите параметры теста и нажмите Сгенерировать.</p>' ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <HelpCircle className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите тему и нажмите «Сгенерировать Тест»</p>
                                <p className="text-sm">Готовый тест появится здесь</p>
                            </div>
                        ) : editMode ? (
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                                readOnly={isGenerating}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={localContent}
                                className={`w-full h-full border-0 ${editMode ? 'cursor-text' : ''}`}
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="Тест"
                            />
                        )}
                    </div>
                    {editMode && (
                        <div className="h-9 bg-green-50 border-t border-green-100 flex items-center justify-center">
                            <span className="text-xs text-green-700 font-medium">✏️ Режим редактирования — кликните на текст чтобы изменить</span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
