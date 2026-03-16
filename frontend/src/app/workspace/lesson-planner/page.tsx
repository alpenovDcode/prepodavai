'use client'

import { useState, useRef } from 'react'
import { BookOpen, Download, Copy, RefreshCw, Loader2, Edit3, Eye } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { getCurrentUser } from '@/lib/utils/userIdentity'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

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
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const generateLesson = async () => {
        if (!form.topic) return;

        try {
            setHtmlContent('')
            setEditMode(false)

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

    const exportPDF = () => {
        iframeRef.current?.contentWindow?.print()
    }


    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">

            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Конструктор Уроков</h2>
                            <GenerationCostBadge operationType="lesson_plan" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">

                    <div className="space-y-6">
                        {/* Topic */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тема или Концепт</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-400">💡</span>
                                </div>
                                <input
                                    type="text"
                                    value={form.topic}
                                    onChange={e => setForm({ ...form, topic: e.target.value })}
                                    placeholder="напр. Фотосинтез"
                                    className="block w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
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
                                    placeholder="напр. Физика"
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Класс</label>
                                <select
                                    value={form.level}
                                    onChange={e => setForm({ ...form, level: e.target.value })}
                                    className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
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
                            <label className="block text-sm font-bold text-gray-700 mb-2">Длительность</label>
                            <div className="flex gap-2">
                                {[30, 45, 90].map(mins => (
                                    <button
                                        key={mins}
                                        onClick={() => setForm({ ...form, duration: mins })}
                                        className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${form.duration === mins ? 'border-[#06b6d4] text-[#06b6d4] bg-cyan-50 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {mins}м
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Teaching Style */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Стиль обучения</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="style" checked={form.style === 'Интерактивный'} onChange={() => setForm({ ...form, style: 'Интерактивный' })} className="text-[#06b6d4] focus:ring-[#06b6d4]" />
                                    <span className="text-sm font-medium text-gray-700">Интерактивный</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="style" checked={form.style === 'Лекция'} onChange={() => setForm({ ...form, style: 'Лекция' })} className="text-[#06b6d4] focus:ring-[#06b6d4]" />
                                    <span className="text-sm font-medium text-gray-700">Лекция</span>
                                </label>
                            </div>
                        </div>

                        {/* Lesson Type */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип урока</label>
                            <select
                                value={form.lessonType}
                                onChange={e => setForm({ ...form, lessonType: e.target.value })}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900"
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
                            <label className="block text-sm font-bold text-gray-700 mb-2">Формат работы</label>
                            <select
                                value={form.workFormat}
                                onChange={e => setForm({ ...form, workFormat: e.target.value })}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900"
                            >
                                <option>Индивидуальный + Фронтальный</option>
                                <option>Парная работа</option>
                                <option>Групповая работа</option>
                                <option>Фронтальный (лекция)</option>
                                <option>Смешанный (все форматы)</option>
                            </select>
                        </div>

                        {/* HW Type */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип домашнего задания</label>
                            <select
                                value={form.hwType}
                                onChange={e => setForm({ ...form, hwType: e.target.value })}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900"
                            >
                                <option>Стандартное закрепление</option>
                                <option>Творческое задание</option>
                                <option>Исследовательский проект</option>
                                <option>Чтение / Конспект</option>
                                <option>Дифференцированное (по уровням)</option>
                                <option>Без домашнего задания</option>
                            </select>
                        </div>

                        {/* Digital Tools */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                Инструменты и оборудование
                                <span className="text-[10px] font-normal px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Опционально</span>
                            </label>
                            <input
                                type="text"
                                value={form.digitalTools}
                                onChange={e => setForm({ ...form, digitalTools: e.target.value })}
                                placeholder="напр. Kahoot, проектор, хромбуки"
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        {/* Specific Objectives */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                Специфические цели обучения
                                <span className="text-[10px] font-normal px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Опционально</span>
                            </label>
                            <textarea
                                value={form.objectives}
                                onChange={e => setForm({ ...form, objectives: e.target.value })}
                                placeholder="напр. Студенты должны понимать роль фотосинтеза..."
                                rows={3}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-colors resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <button
                            onClick={generateLesson}
                            disabled={isGenerating || !form.topic}
                            className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 group-hover:bg-transparent transition-all"></div>
                            <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-[11px] text-white">
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                                <span>{isGenerating ? 'В процессе...' : 'Сгенерировать План Урока'}</span>
                            </div>
                        </button>
                    </div>

                    {/* History panel mock */}
                    <div className="mt-10">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Недавние планы</h3>
                            <button className="text-xs font-semibold text-cyan-600 hover:text-cyan-700">Смотреть все</button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors text-gray-900 placeholder-gray-400">
                                <div className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-900 placeholder-gray-400">
                                    <BookOpen className="w-4 h-4 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold leading-tight">Древний Рим</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">История • 7 Класс</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Toolbar Header */}
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-bold tracking-wide">{form.subject.toUpperCase()}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs font-medium text-gray-500">{form.level}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {htmlContent && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${editMode
                                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    {editMode ? 'Просмотр' : 'Редактировать'}
                                </button>
                            )}
                            <button onClick={handleCopy} disabled={!htmlContent} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40" title="Скопировать">
                                <Copy className="w-4 h-4" />
                            </button>
                            <button onClick={generateLesson} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Перегенерировать">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={exportPDF}
                                disabled={!htmlContent}
                                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors ml-2 disabled:opacity-40"
                            >
                                <Download className="w-4 h-4" />
                                Экспорт PDF
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden relative">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                                <p className="font-medium">Генерируем план урока...</p>
                                <p className="text-sm text-gray-400">Это может занять 30–60 секунд</p>
                            </div>
                        ) : !htmlContent ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                                <BookOpen className="w-12 h-12 text-gray-200" />
                                <p className="font-medium text-gray-500">Введите тему и нажмите «Сгенерировать План Урока»</p>
                                <p className="text-sm">Готовый план появится здесь</p>
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={htmlContent}
                                className={`w-full h-full border-0 ${editMode ? 'cursor-text' : ''}`}
                                sandbox="allow-same-origin allow-scripts allow-popups allow-modals"
                                title="План урока"
                            />
                        )}
                    </div>
                    {editMode && (
                        <div className="h-9 bg-blue-50 border-t border-blue-100 flex items-center justify-center">
                            <span className="text-xs text-blue-700 font-medium">✏️ Режим редактирования — кликните на текст чтобы изменить</span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
