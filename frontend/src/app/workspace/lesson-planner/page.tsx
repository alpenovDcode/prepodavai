'use client'

import { useState, useRef } from 'react'
import { BookOpen, Download, Copy, RefreshCw, Loader2, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadPdfById } from '@/lib/utils/downloadPdf'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import AssignTaskButton from '@/components/AssignTaskButton'
import GenerationProgress from '@/components/workspace/GenerationProgress'
import { ensureMathJaxInHtml } from '@/lib/utils/ensureMathJax'

export default function LessonPlanner() {
    const [form, setForm] = useState({
        subject: '',
        topic: '',
        level: '5 Класс',
        duration: 45,
        objectives: '',
        style: 'Интерактивный',
        lessonType: 'Комбинированный урок',
        workFormat: 'Индивидуальный + Фронтальный',
        hwType: 'Стандартное закрепление',
        digitalTools: ''
    })

    const [isExporting, setIsExporting] = useState(false)
    const [htmlContent, setHtmlContent] = useState('')
    const [editMode, setEditMode] = useState(false)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const { isMobile } = useIsMobile()
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()


    const generateLesson = async () => {
        if (!form.topic) return;

        try {
            setHtmlContent('')
            setEditMode(false)
            if (isMobile) setActiveTab('preview')

            const user = getCurrentUser()
            const userHash = user?.userHash

            const params = {
                userHash,
                subject: form.subject,
                topic: form.topic,
                level: form.level,
                duration: form.duration,
                objectives: form.objectives,
                style: form.style,
                lessonType: form.lessonType,
                workFormat: form.workFormat,
                hwType: form.hwType,
                digitalTools: form.digitalTools,
            }

            const status = await generateAndWait({ type: 'lessonPlan', params })
            const resultData = status.result?.content || status.result
            setHtmlContent(typeof resultData === 'string' ? resultData : JSON.stringify(resultData))

        } catch (e: any) {
            console.error('Generation failed:', e)
            setHtmlContent(`<html><body style="font-family:sans-serif;padding:2rem;color:#dc2626"><h2>Ошибка генерации</h2><p>${e.message}</p></body></html>`)
        }
    }

    const handleCopy = async () => {
        try {
            const text = iframeRef.current?.contentDocument?.body?.innerText || ''
            await navigator.clipboard.writeText(text)
        } catch {
            await navigator.clipboard.writeText(htmlContent)
        }
    }

    const toggleEditMode = () => {
        const doc = iframeRef.current?.contentDocument
        if (!doc) return
        const next = !editMode
        doc.designMode = next ? 'on' : 'off'
        setEditMode(next)
    }

    const exportPDF = async () => {
        if (!activeGenerationId) {
            toast.error('Сначала сгенерируйте материал')
            return
        }
        try {
            await downloadPdfById(activeGenerationId, 'lesson-plan.pdf')
        } catch {
            toast.error('Не удалось сформировать PDF')
        }
    }

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
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Конструктор</h2>
                            <GenerationCostBadge operationType="lesson_plan" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        {/* Topic */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Тема или Концепт</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400">💡</span>
                                </div>
                                <input
                                    type="text"
                                    value={form.topic}
                                    onChange={e => setForm({ ...form, topic: e.target.value })}
                                    placeholder="напр. Фотосинтез"
                                    className="block w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#06b6d4] focus:bg-white transition-all text-gray-900 placeholder-gray-400"
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
                                    placeholder="Физика"
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#06b6d4] focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Класс</label>
                                <select
                                    value={form.level}
                                    onChange={e => setForm({ ...form, level: e.target.value })}
                                    className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#06b6d4] focus:bg-white transition-all text-gray-900"
                                >
                                    <option>5 Класс</option>
                                    <option>6 Класс</option>
                                    <option>7 Класс</option>
                                    <option>8 Класс</option>
                                    <option>Старшая Школа</option>
                                </select>
                            </div>
                        </div>

                        {/* Duration Selection */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Длительность</label>
                            <div className="flex gap-2">
                                {[30, 45, 90].map(mins => (
                                    <button
                                        key={mins}
                                        onClick={() => setForm({ ...form, duration: mins })}
                                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-all ${form.duration === mins ? 'border-[#06b6d4] text-[#06b6d4] bg-cyan-50 shadow-sm' : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}
                                    >
                                        {mins}м
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Teaching Style */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Стиль обучения</label>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="radio" name="style" checked={form.style === 'Интерактивный'} onChange={() => setForm({ ...form, style: 'Интерактивный' })} className="text-[#06b6d4] focus:ring-[#06b6d4] w-4 h-4 border-gray-300 transition-all" />
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Интерактивный</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="radio" name="style" checked={form.style === 'Лекция'} onChange={() => setForm({ ...form, style: 'Лекция' })} className="text-[#06b6d4] focus:ring-[#06b6d4] w-4 h-4 border-gray-300 transition-all" />
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Лекция</span>
                                </label>
                            </div>
                        </div>

                        {/* Lesson Type */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Тип урока</label>
                            <select
                                value={form.lessonType}
                                onChange={e => setForm({ ...form, lessonType: e.target.value })}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#06b6d4] focus:bg-white transition-all text-gray-900"
                            >
                                <option>Комбинированный урок</option>
                                <option>Урок изучения нового материала</option>
                                <option>Урок закрепления знаний</option>
                                <option>Урок повторения и обобщения</option>
                                <option>Урок контроля знаний</option>
                                <option>Лабораторная работа</option>
                                <option>Практическая работа</option>
                                <option>Экскурсия</option>
                                <option>Семинар / Дискуссия</option>
                            </select>
                        </div>

                        {/* Work Format */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 font-display">Формат работы</label>
                            <select
                                value={form.workFormat}
                                onChange={e => setForm({ ...form, workFormat: e.target.value })}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-[#06b6d4] focus:bg-white transition-all text-gray-900"
                            >
                                <option>Индивидуальный + Фронтальный</option>
                                <option>Парная работа</option>
                                <option>Групповая работа</option>
                                <option>Фронтальный (лекция)</option>
                                <option>Смешанный (все форматы)</option>
                            </select>
                        </div>

                        <button
                            onClick={generateLesson}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Создать План Урока'}</span>
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
                    {/* Toolbar Header */}
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 uppercase">{form.subject || 'ПЛАН'}</span>
                            <span className="text-gray-200 hidden xs:inline">•</span>
                            <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 hidden xs:inline">{form.level}</span>
                        </div>

                        <div className="flex items-center gap-1.5 md:gap-2">
                            {htmlContent && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all flex-shrink-0 ${editMode
                                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button onClick={handleCopy} disabled={!htmlContent} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>

                            <button
                                onClick={exportPDF}
                                disabled={!htmlContent}
                                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all active:scale-[0.98] ml-1 flex-shrink-0 disabled:opacity-40"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Export PDF</span>
                            </button>
                            {htmlContent && !isGenerating && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic={form.topic}
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg shadow-sm transition-all flex-shrink-0 disabled:opacity-60"
                                />
                            )}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden relative">
                        {isGenerating ? (
                            <GenerationProgress active={isGenerating} title="Создаём план урока..." accentClassName="bg-blue-500" estimatedSeconds={45} />
                        ) : !htmlContent ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                                    <BookOpen className="w-8 h-8 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-600">Готов к работе</p>
                                    <p className="text-sm">Введите тему и нажмите «Сгенерировать План Урока»</p>
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Настройка темы
                                    </button>
                                )}
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={ensureMathJaxInHtml(htmlContent)}
                                className={`w-full h-full border-0 bg-white ${editMode ? 'cursor-text' : ''}`}
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="План урока"
                            />
                        )}
                    </div>
                    {editMode && (
                        <div className="h-8 md:h-10 bg-blue-50 border-t border-blue-100 flex items-center justify-center px-4 flex-shrink-0">
                            <span className="text-[10px] md:text-xs text-blue-700 font-bold truncate">✏️ Кликните на текст чтобы изменить</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
