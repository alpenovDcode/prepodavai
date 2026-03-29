'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { Sparkles, RefreshCw, Loader2, Maximize2, Download, Copy, Eye, Edit3, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function LessonPrepGenerator() {
    const [subject, setSubject] = useState('')
    const [topic, setTopic] = useState('')
    const [level, setLevel] = useState('5')
    const [interests, setInterests] = useState('')
    const [generationTypes, setGenerationTypes] = useState(['lessonPlan', 'worksheet', 'quiz'])

    const [editMode, setEditMode] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [isExporting, setIsExporting] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Заполните параметры для создания комплексного вау-урока с учетом интересов ученика.</p>')

    const [results, setResults] = useState<Array<{ type: string; content: string }>>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)

    const { generateAndWait, isGenerating } = useGenerations()

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const allGenTypes = [
        { value: 'lesson-plan', label: 'План урока' },
        { value: 'worksheet', label: 'Рабочий лист' },
        { value: 'presentation', label: 'Структура презентации' },
        { value: 'content-adaptation', label: 'Учебный материал' },
        { value: 'quiz', label: 'Тест' }
    ]

    const currentResultType = useMemo(() => {
        if (!results.length) return null;
        const typeValue = results[currentIndex].type;
        return allGenTypes.find(t => t.value === typeValue)?.label || typeValue;
    }, [results, currentIndex, allGenTypes]);

    const generate = async () => {
        if (!subject || !topic || generationTypes.length === 0) return;

        setResults([]);
        setCurrentIndex(0);
        setLocalContent('<p>Генерируем материалы для вау-урока...</p>');
        if (isMobile) setActiveTab('preview')

        try {
            const params = {
                subject,
                topic,
                level,
                interests,
                generationTypes
            }

            const response = await generateAndWait({
                type: 'lessonPreparation',
                params
            })

            const resultData = response.result;

            if (resultData && resultData.sections && resultData.sections.length > 0) {
                const newResults = resultData.sections.map((s: any) => ({
                    type: s.title,
                    content: s.content
                }));

                setResults(newResults);
                setCurrentIndex(0);
                setLocalContent(newResults[0].content);
                setEditMode(false);
            } else {
                setLocalContent('<p>Не удалось сгенерировать контент.</p>');
            }

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации материалов: ${e.message}</p>`)
        }
    }

    const nextResult = () => {
        if (currentIndex < results.length - 1) {
            const nextIdx = currentIndex + 1;
            setCurrentIndex(nextIdx);
            setLocalContent(results[nextIdx].content);
        }
    }

    const prevResult = () => {
        if (currentIndex > 0) {
            const nextIdx = currentIndex - 1;
            setCurrentIndex(nextIdx);
            setLocalContent(results[nextIdx].content);
        }
    }

    // Update results array when local content changes in edit mode
    useEffect(() => {
        if (editMode && results.length > 0) {
            setResults(prev => {
                const updated = [...prev];
                if (updated[currentIndex].content !== localContent) {
                    updated[currentIndex] = { ...updated[currentIndex], content: localContent };
                }
                return updated;
            });
        }
    }, [localContent, editMode, currentIndex, results.length]);

    const toggleType = (value: string) => {
        setGenerationTypes(prev =>
            prev.includes(value)
                ? prev.filter(t => t !== value)
                : [...prev, value]
        )
    }

    const handleCopy = () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = DOMPurify.sanitize(localContent);
        navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '');
    }

    const toggleEditMode = () => {
        setEditMode(!editMode)
    }

    const exportPDF = () => {
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const safeContent = DOMPurify.sanitize(localContent, { FORCE_BODY: true })
        const html = /<\/head>/i.test(safeContent)
            ? safeContent.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8">${autoPrint}</head><body>${safeContent}</body></html>`
        const win = window.open('', '_blank')
        if (!win) { alert('Разрешите всплывающие окна для этого сайта'); return }
        win.document.open(); win.document.write(html); win.document.close()
    }

    useEffect(() => {
        if (!editMode && iframeRef.current && localContent && !isGenerating) {
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
    }, [editMode, localContent, isGenerating]);

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-pink-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Урок
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
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
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 transition-all text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="Дроби"
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 transition-all text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Класс</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 transition-all text-gray-900"
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
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 transition-all resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Что сгенерировать</label>
                            <div className="grid grid-cols-1 md:grid-cols-1 gap-2 mt-2">
                                {allGenTypes.map(type => (
                                    <label key={type.value} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-all">
                                        <input
                                            type="checkbox"
                                            checked={generationTypes.includes(type.value)}
                                            onChange={() => toggleType(type.value)}
                                            className="w-5 h-5 rounded-md text-pink-500 focus:ring-pink-500 border-gray-200"
                                        />
                                        <span className="text-sm font-medium text-gray-700">{type.label}</span>
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
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-pink-500 to-rose-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Создать Вау-урок'}</span>
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
                            <span className="hidden xs:inline px-2 py-1 bg-pink-50 text-pink-700 rounded-md text-[10px] font-bold tracking-tight">ВАУ-УРОК</span>
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1.5 rounded-xl border border-gray-100">
                                {results.length > 1 && (
                                    <button
                                        onClick={prevResult}
                                        disabled={currentIndex === 0}
                                        className="p-1 text-gray-400 hover:text-pink-600 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter whitespace-nowrap">
                                    {results.length > 0 ? `${currentIndex + 1}/${results.length}: ${currentResultType}` : `${generationTypes.length} ЭЛЕМ.`}
                                </span>
                                {results.length > 1 && (
                                    <button
                                        onClick={nextResult}
                                        disabled={currentIndex === results.length - 1}
                                        className="p-1 text-gray-400 hover:text-pink-600 disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 md:gap-2 ml-2">
                            {localContent && !localContent.includes('Заполните параметры') && !localContent.includes('Генерируем материалы') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${editMode
                                        ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Копировать">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportPDF}
                                className="flex items-center gap-1.5 px-3 py-2 bg-pink-50 hover:bg-pink-100 text-pink-700 text-[11px] font-bold rounded-lg transition-all shadow-sm"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 p-6 text-center">
                                <Loader2 className="w-12 h-12 animate-spin text-pink-500" />
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-900">Создаем Вау-урок...</p>
                                    <p className="text-sm text-gray-400">Это может занять около минуты.</p>
                                </div>
                            </div>
                        ) : !localContent || localContent.includes('Заполните параметры') ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-pink-50 flex items-center justify-center">
                                    <Sparkles className="w-10 h-10 text-pink-200" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-gray-700">Готовый урок появится здесь</h3>
                                    <p className="text-sm text-gray-400 max-w-[320px]">
                                        Введите тему и нажмите кнопку Создать Вау-урок.
                                    </p>
                                </div>
                                {isMobile && (
                                    <button 
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-pink-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Настроить урок
                                    </button>
                                )}
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
                                className="w-full h-full border-0"
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="Вау-урок"
                            />
                        )}
                    </div>
                    {editMode && (
                        <div className="h-8 bg-pink-50 border-t border-pink-100 flex items-center justify-center px-4">
                            <span className="text-[10px] text-pink-700 font-bold uppercase tracking-tight">✏️ РЕЖИМ РЕДАКТИРОВАНИЯ</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
