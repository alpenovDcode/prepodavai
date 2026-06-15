'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import PdfDownloadButton from '@/components/workspace/PdfDownloadButton'
import { HelpCircle, Copy, RefreshCw, Loader2, Eye, Edit3 } from 'lucide-react'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import { ensureMathJaxInHtml, stripMathJaxScripts } from '@/lib/utils/ensureMathJax'
import { apiClient } from '@/lib/api/client'
// import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import AssignTaskButton from '@/components/AssignTaskButton'
import GenerationProgress from '@/components/workspace/GenerationProgress'
import toast from 'react-hot-toast'
import QuizGeneratorV2 from '@/components/v2/QuizGeneratorV2'

function QuizGeneratorLegacy() {
    const [form, setForm] = useState({
        subject: '',
        topic: '',
        level: '8 Класс',
        questionsCount: 10,
        answersCount: 4,
    })

    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const { isMobile } = useIsMobile()
    const [editMode, setEditMode] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [localContent, setLocalContent] = useState('<p>Определите параметры теста и нажмите Сгенерировать.</p>')
    const iframeRef = useRef<HTMLIFrameElement>(null)
    // srcDoc меняем ТОЛЬКО когда реально пришёл новый контент — тогл режима
    // правки и сохранение НЕ перезагружают iframe (см. worksheet/page.tsx)
    const lastSrcDocRef = useRef<string>('')
    const [srcDoc, setSrcDoc] = useState<string>('')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && !localContent.startsWith('<p>Определите') && !localContent.startsWith('<p>Генерируем')

    // В edit-режиме нужна версия без MathJax-скрипта: иначе LaTeX отрисуется в
    // <mjx-container>, и при сохранении мы получим CHTML вместо исходных \(...\)
    useEffect(() => {
        if (!localContent) return
        const key = `${editMode ? 'edit' : 'view'}|${localContent}`
        if (key === lastSrcDocRef.current) return
        lastSrcDocRef.current = key
        setSrcDoc(editMode ? stripMathJaxScripts(localContent) : ensureMathJaxInHtml(localContent))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localContent, editMode])


    const generateQuiz = async () => {
        if (!form.topic) return;

        try {
            setLocalContent('<p>Генерируем вопросы для теста...</p>')
            if (isMobile) setActiveTab('preview')

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

            setLocalContent(ensureMathJaxInHtml(finalHtml) || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            setLocalContent(`<p class="text-red-500">Ошибка при генерации теста: ${e.message}</p>`)
        }
    }

    const handleCopy = () => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = DOMPurify.sanitize(localContent);
        navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '');
    }

    // Правка прямо в iframe (contentEditable): сохраняет стили и таблицы теста,
    // которые Tiptap-редактор уничтожал. При выходе из правки результат
    // сохраняется на бэкенд — иначе «Выдать задание» и PDF берут старую версию,
    // а перезагрузка страницы теряет правки.
    const toggleEditMode = async () => {
        if (editMode) {
            const iframeDoc = iframeRef.current?.contentDocument
            let editedBodyHtml = iframeDoc?.body?.innerHTML ?? null
            let fullHtml = localContent
            if (editedBodyHtml !== null) {
                // Чистим <script> и отрендеренный MathJax, чтобы сохранить
                // исходный LaTeX, а не CHTML
                editedBodyHtml = editedBodyHtml
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
                    .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')

                // Защита от «всё пропало»: пустой результат не сохраняем
                const textOnly = editedBodyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
                if (!textOnly) {
                    toast.error('Пустой результат не сохранён')
                    return
                }

                const hasBody = /<body[^>]*>[\s\S]*<\/body>/i.test(localContent)
                if (hasBody) {
                    fullHtml = localContent.replace(
                        /<body([^>]*)>[\s\S]*<\/body>/i,
                        (_, bodyAttrs) => `<body${bodyAttrs}>${editedBodyHtml}</body>`
                    )
                } else {
                    // localContent — фрагмент без <body>. Браузер при парсинге srcDoc
                    // переносит <style> из начала фрагмента в <head> iframe — поэтому
                    // head берём ИЗ IFRAME, иначе документ сохранится без стилей
                    const headFromIframe = (iframeDoc?.head?.innerHTML || '')
                        .replace(/<script[\s\S]*?<\/script>/gi, '')
                    const headMatch = localContent.match(/<head[\s\S]*?<\/head>/i)
                    const head = headMatch
                        ? headMatch[0]
                        : `<head><meta charset="UTF-8">${headFromIframe}</head>`
                    fullHtml = `<!DOCTYPE html><html lang="ru">${head}<body>${editedBodyHtml}</body></html>`
                }
            }

            if (activeGenerationId) {
                setIsSaving(true)
                try {
                    await apiClient.patch(`/generate/${activeGenerationId}`, {
                        outputData: { content: fullHtml },
                    })
                    lastSrcDocRef.current = `edit|${fullHtml}`
                    setLocalContent(fullHtml)
                    toast.success('Сохранено')
                    setEditMode(false)
                } catch (err: any) {
                    const resp = err?.response?.data
                    const msg = (Array.isArray(resp?.message) ? resp.message.join('; ') : resp?.message)
                        || err?.message
                        || 'Не удалось сохранить изменения'
                    console.error('[quiz save] failed:', err?.response?.status, resp)
                    toast.error(msg)
                } finally {
                    setIsSaving(false)
                }
            } else {
                lastSrcDocRef.current = `edit|${fullHtml}`
                setLocalContent(fullHtml)
                setEditMode(false)
            }
        } else {
            setEditMode(true)
        }
    }

    const applyIframeState = (doc: Document) => {
        if (!doc?.body) return
        if (editMode) {
            doc.body.contentEditable = 'true'
            doc.body.style.outline = 'none'
            doc.body.style.cursor = 'text'
        } else {
            doc.body.contentEditable = 'false'
            doc.body.style.cursor = ''
            // После сохранения дотипсечиваем LaTeX без перезагрузки iframe
            const win = iframeRef.current?.contentWindow as any
            if (win?.MathJax?.typesetPromise) {
                win.MathJax.typesetPromise([doc.body]).catch(() => {})
            }
        }
    }

    const handleIframeLoad = () => {
        const iframeDoc = iframeRef.current?.contentDocument
        if (!iframeDoc?.body) return
        applyIframeState(iframeDoc)
    }

    // При смене editMode применяем состояние к уже загруженному iframe
    useEffect(() => {
        const iframeDoc = iframeRef.current?.contentDocument
        if (!iframeDoc?.body) return
        applyIframeState(iframeDoc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editMode]);

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Результат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                        <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Генератор Тестов</h2>
                            {/* <GenerationCostBadge operationType="quiz" /> */}
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">

                    <div className="space-y-6">
                        {/* Topic */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Тема Теста</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <span className="text-xs">❓</span>
                                </div>
                                <input
                                    type="text"
                                    value={form.topic}
                                    onChange={e => setForm({ ...form, topic: e.target.value })}
                                    placeholder="напр. Строение клетки"
                                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                                />
                            </div>
                        </div>

                        {/* Subject & Grade */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Предмет</label>
                                <input
                                    type="text"
                                    value={form.subject}
                                    onChange={e => setForm({ ...form, subject: e.target.value })}
                                    placeholder="Биология"
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Класс</label>
                                <select
                                    value={form.level}
                                    onChange={e => setForm({ ...form, level: e.target.value })}
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-gray-900"
                                >
                                    {Array.from({ length: 11 }, (_, i) => (
                                        <option key={i + 1} value={`${i + 1} Класс`}>{i + 1} класс</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Questions Count */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Вопросы</label>
                                <select
                                    value={form.questionsCount}
                                    onChange={e => setForm({ ...form, questionsCount: Number(e.target.value) })}
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-gray-900"
                                >
                                    {[5, 10, 15, 20, 25].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Варианты</label>
                                <select
                                    value={form.answersCount}
                                    onChange={e => setForm({ ...form, answersCount: Number(e.target.value) })}
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all text-gray-900"
                                >
                                    {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={generateQuiz}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-green-400 to-emerald-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Сгенерировать Тест'}</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* Editor Area */}
            <div className={`
                ${isMobile && activeTab !== 'preview' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 uppercase">ТЕСТ</span>
                            <span className="text-gray-200 hidden xs:inline">•</span>
                            <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 hidden xs:inline">{form.questionsCount} ВОПРОСОВ</span>
                        </div>

                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && localContent !== '<p>Определите параметры теста и нажмите Сгенерировать.</p>' && localContent !== '<p>Генерируем вопросы для теста...</p>' && (
                                <button
                                    onClick={toggleEditMode}
                                    disabled={isSaving}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all flex-shrink-0 disabled:opacity-60 ${editMode
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {isSaving
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{isSaving ? 'Сохранение...' : editMode ? 'Сохранить' : 'Править'}</span>
                                </button>
                            )}
                            <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>

                            <PdfDownloadButton
                                generationId={activeGenerationId}
                                filename="quiz.pdf"
                                hasAnswers
                                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all active:scale-[0.98] ml-1 flex-shrink-0"
                            />
                            {hasResult && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic={form.topic}
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex-shrink-0 disabled:opacity-60"
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative bg-white">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Генерируем тест..." accentClassName="bg-green-500" estimatedSeconds={45} />
                        ) : !localContent || localContent === '<p>Определите параметры теста и нажмите Сгенерировать.</p>' ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                    <HelpCircle className="w-8 h-8 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-600">Готов к работе</p>
                                    <p className="text-sm">Определите параметры и нажмите «Сгенерировать»</p>
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-green-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Настройка параметров
                                    </button>
                                )}
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={srcDoc}
                                onLoad={handleIframeLoad}
                                className={`w-full h-full border-0 ${editMode ? 'cursor-text' : ''}`}
                                sandbox="allow-scripts allow-popups allow-modals allow-same-origin"
                                title="Тест"
                            />
                        )}
                    </div>
                    {editMode && (
                        <div className="h-9 bg-green-50 border-t border-green-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-green-700 font-bold uppercase tracking-wider">✏️ Режим редактирования</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}


export default function Page() {
    if (process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true') return <QuizGeneratorV2 />
    return <QuizGeneratorLegacy />
}
