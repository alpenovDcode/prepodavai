'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
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
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

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
        if (!subject) return
        try {
            setLocalContent('<p>Генерируем вариант экзамена (ОГЭ/ЕГЭ)... Это может занять около минуты.</p>')
            setEditMode(false)
            if (isMobile) setActiveTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const status = await generateAndWait({
                type: 'exam-variant',
                params: { userHash, subject, level, questionsCount, preferences, customPrompt, format: 'HTML' }
            })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>') && !finalHtml.includes('<html')) {
                finalHtml = `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${finalHtml}</div>`
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
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const html = /<\/head>/i.test(localContent)
            ? localContent.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8">${autoPrint}</head><body>${localContent}</body></html>`
        const win = window.open('', '_blank')
        if (!win) { alert('Разрешите всплывающие окна для этого сайта'); return }
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
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Вариант
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
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
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 transition-all text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип экзамена</label>
                            <select
                                value={level}
                                onChange={e => setLevel(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 transition-all text-gray-900"
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
                                className="w-full accent-purple-500 hover:accent-purple-600 cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-bold px-1">
                                <span>5</span>
                                <span>20</span>
                                <span>40</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Пожелания (опционально)</label>
                            <textarea
                                value={preferences}
                                onChange={e => setPreferences(e.target.value)}
                                placeholder="Например: Сделать акцент на геометрию..."
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 transition-all text-gray-900 placeholder-gray-400 h-24 max-h-48 resize-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !subject}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'Генерируем...' : 'Сгенерировать Вариант'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className={`
                ${isMobile && activeTab !== 'preview' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Toolbar */}
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">КИМ</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && !localContent.includes('Введите предмет') && !localContent.includes('Генерируем') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${editMode
                                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{copied ? 'Готово!' : 'Копировать'}</span>
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden relative">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 p-6 text-center">
                                <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-900">Составляем КИМ...</p>
                                    <p className="text-sm text-gray-400 max-w-[280px]">Это может занять около минуты.</p>
                                </div>
                            </div>
                        ) : !localContent || localContent.includes('Введите предмет') ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center">
                                    <GraduationCap className="w-10 h-10 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-gray-700">Вариант появится здесь</h3>
                                    <p className="text-sm text-gray-400 max-w-[320px]">
                                        Введите предмет и нажмите кнопку Сгенерировать Вариант.
                                    </p>
                                </div>
                                {isMobile && (
                                    <button 
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Настроить
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
                                title="Вариант ОГЭ/ЕГЭ"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
