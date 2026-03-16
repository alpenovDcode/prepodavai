'use client'

import { useState, useRef, useEffect } from 'react'
import { BookOpen, RefreshCw, Loader2, Copy, Edit3, Eye, Download } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function VocabularyGenerator() {
    const [form, setForm] = useState({
        topic: '',
        language: 'en',
        wordsCount: 10,
    })

    const [editMode, setEditMode] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const [localContent, setLocalContent] = useState('<p>Введите тему, язык и количество слов для генерации словаря.</p>')

    const { generateAndWait, isGenerating } = useGenerations()

    const generate = async () => {
        if (!form.topic) return;

        try {
            setLocalContent('<p>Генерируем словарь...</p>')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const params = {
                userHash,
                topic: form.topic,
                language: form.language,
                wordsCount: form.wordsCount,
            }

            const status = await generateAndWait({ type: 'vocabulary', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')
            setEditMode(false)

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации словаря: ${e.message}</p>`)
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
        iframeRef.current?.contentWindow?.print()
    }

    const languages = [
        { value: 'en', label: 'Английский' },
        { value: 'ru', label: 'Русский' },
        { value: 'de', label: 'Немецкий' },
        { value: 'fr', label: 'Французский' },
        { value: 'es', label: 'Испанский' },
        { value: 'it', label: 'Итальянский' },
        { value: 'zh', label: 'Китайский' },
        { value: 'ko', label: 'Корейский' },
        { value: 'ja', label: 'Японский' },
        { value: 'ar', label: 'Арабский' },
        { value: 'pt', label: 'Португальский' },
        { value: 'hi', label: 'Хинди' },
        { value: 'tr', label: 'Турецкий' },
        { value: 'vi', label: 'Вьетнамский' },
        { value: 'pl', label: 'Польский' },
        { value: 'he', label: 'Иврит' }
    ]

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                        <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Словарь</h2>
                            <GenerationCostBadge operationType="vocabulary" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема</label>
                            <input
                                type="text"
                                value={form.topic}
                                onChange={e => setForm({ ...form, topic: e.target.value })}
                                placeholder="напр. Путешествия, Еда"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Язык</label>
                            <select
                                value={form.language}
                                onChange={e => setForm({ ...form, language: e.target.value })}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            >
                                {languages.map(lang => (
                                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Количество слов</label>
                            <select
                                value={form.wordsCount}
                                onChange={e => setForm({ ...form, wordsCount: Number(e.target.value) })}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 placeholder-gray-400"
                            >
                                {[5, 10, 15, 20, 25, 30].map(num => (
                                    <option key={num} value={num}>{num} слов</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={generate}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Создать Словарь'}</span>
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
                            <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md text-xs font-bold tracking-wide">СЛОВАРЬ</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs font-medium text-gray-500">{languages.find(l => l.value === form.language)?.label}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {localContent && localContent !== '<p>Введите тему, язык и количество слов для генерации словаря.</p>' && localContent !== '<p>Генерируем словарь...</p>' && (
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
                            <button onClick={handleCopy} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button onClick={generate} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Перегенерировать">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportPDF}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors ml-2"
                            >
                                <Download className="w-4 h-4" />
                                Экспорт PDF
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                                <p className="font-medium">Генерируем словарь...</p>
                                <p className="text-sm text-gray-400">Это может занять 15–30 секунд</p>
                            </div>
                        ) : !localContent || localContent === '<p>Введите тему, язык и количество слов для генерации словаря.</p>' ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <BookOpen className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите тему и нажмите «Создать Словарь»</p>
                                <p className="text-sm">Готовый словарь появится здесь</p>
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
                                title="Vocabulary Output"
                                sandbox="allow-same-origin allow-scripts allow-popups"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
