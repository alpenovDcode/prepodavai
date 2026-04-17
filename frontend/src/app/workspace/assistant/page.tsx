'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Bot, User, Trash2, Sparkles } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import DOMPurify from 'isomorphic-dompurify'

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
}

const personas = [
    { value: 'general',        label: 'Универсальный помощник',  desc: 'Любые вопросы учителя' },
    { value: 'methodologist',  label: 'Опытный методист',         desc: 'Планы, программы, ФГОС' },
    { value: 'psychologist',   label: 'Детский психолог',          desc: 'Мотивация, конфликты' },
    { value: 'lesson_planner', label: 'Планировщик уроков',        desc: 'Конспекты, цели, этапы' },
    { value: 'examprep',       label: 'Эксперт ОГЭ/ЕГЭ',          desc: 'Подготовка к экзаменам' },
    { value: 'copywriter',     label: 'Тексты для соцсетей',        desc: 'Посты, биографии, истории' },
]

const suggestionsByPersona: Record<string, string[]> = {
    general: [
        'Как провести первый урок в новом классе?',
        'Что делать, если ученик срывает урок?',
        'Как объяснить родителям неуспеваемость ребёнка?',
        'Напиши шаблон письма ученику с обратной связью',
    ],
    methodologist: [
        'Составь технологическую карту урока по теме «Тригонометрия», 10 класс',
        'Какие приёмы формирующего оценивания работают лучше всего?',
        'Как выстроить систему повторения за 4 недели до ЕГЭ?',
        'Опиши структуру урока по системно-деятельностному подходу',
    ],
    psychologist: [
        'Ученик отказывается отвечать у доски — как помочь?',
        'Как мотивировать подростка, которому «всё равно»?',
        'Скрипт разговора с тревожными родителями',
        'Приёмы снижения тревоги перед экзаменами',
    ],
    lesson_planner: [
        'Конспект урока «Степени сравнения прилагательных», 4 класс, 45 минут',
        'Этапы урока изучения нового материала по химии',
        'Домашнее задание, которое ученики выполнят с удовольствием',
        'Как уложить сложную тему в 40 минут?',
    ],
    examprep: [
        'Разбор задания №25 ЕГЭ по русскому языку',
        'Типичные ошибки в задании №19 ЕГЭ по математике',
        'План подготовки к ОГЭ по биологии за 2 месяца',
        'Как работать с текстом в ЕГЭ по литературе?',
    ],
    copywriter: [
        'Пост-знакомство для репетитора математики',
        'История успеха ученика: «с тройки до пятёрки за месяц»',
        'Описание профиля учителя английского языка',
        'Пост про пользу домашних заданий (без занудства)',
    ],
}

export default function AssistantGenerator() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: '<p>Здравствуйте! 👋 Я ваш ИИ-ассистент для учителей и репетиторов.</p><p>Выберите <strong>роль</strong> слева под задачу — и задайте любой вопрос или воспользуйтесь быстрыми подсказками.</p>'
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('general')
    const [activeTab, setActiveTab] = useState<'config' | 'chat'>('chat')
    const [isMobile, setIsMobile] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const { generateAndWait, isGenerating } = useGenerations()

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isGenerating])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isGenerating) return

        const userMsg = inputValue.trim()
        setInputValue('')
        const newMessages = [...messages, { id: Date.now().toString(), role: 'user' as const, content: userMsg }]
        setMessages(newMessages)

        try {
            const status = await generateAndWait({ type: 'assistant', params: { prompt: userMsg, systemPrompt } })
            const resultData = status.result?.content || status.result
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: typeof resultData === 'string'
                    ? resultData
                    : '<p>Извините, не удалось обработать запрос. Попробуйте переформулировать.</p>'
            }])
        } catch (e: any) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `<p>Произошла ошибка: ${e.message}</p>`
            }])
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const suggestions = suggestionsByPersona[systemPrompt] ?? suggestionsByPersona['general']
    const currentPersona = personas.find(p => p.value === systemPrompt)

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">

            {/* Mobile tabs */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button onClick={() => setActiveTab('config')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}>
                        Настройка
                    </button>
                    <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}>
                        Чат
                    </button>
                </div>
            )}

            {/* Sidebar */}
            <div className={`${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'} w-full md:w-[290px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 shadow-[2px_0_12px_rgba(0,0,0,0.03)]`}>
                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-base text-gray-900">AI Ассистент</h2>
                            <GenerationCostBadge operationType="assistant" />
                        </div>
                        <p className="text-[11px] text-gray-400">Помощник учителя</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-gray-100">
                    {/* Persona cards */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Роль ассистента</p>
                        <div className="space-y-1.5">
                            {personas.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setSystemPrompt(p.value)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                                        systemPrompt === p.value
                                            ? 'bg-indigo-50 border-indigo-200'
                                            : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                                    }`}
                                >
                                    <div className={`font-semibold text-[13px] ${systemPrompt === p.value ? 'text-indigo-700' : 'text-gray-800'}`}>
                                        {p.label}
                                    </div>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quick prompts */}
                    <div className="border-t border-gray-100 pt-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Быстрые запросы
                        </p>
                        <div className="space-y-1.5">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setInputValue(s); if (isMobile) setActiveTab('chat') }}
                                    className="w-full text-left px-3 py-2.5 bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl text-[12px] text-gray-600 hover:text-indigo-700 transition-all font-medium leading-snug"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat */}
            <div className={`${isMobile && activeTab !== 'chat' ? 'hidden' : 'flex'} flex-1 flex-col min-w-0 p-3 md:p-5 overflow-hidden h-full`}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                    {/* Header */}
                    <div className="h-13 border-b border-gray-100 px-4 py-3 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                            <span className="text-sm font-bold text-gray-800">{currentPersona?.label ?? 'AI Ассистент'}</span>
                            <span className="text-xs text-gray-400 hidden md:block">· {currentPersona?.desc}</span>
                        </div>
                        <button
                            onClick={() => setMessages([messages[0]])}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-red-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Очистить</span>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin scrollbar-thumb-gray-200 bg-gray-50/30">
                        <div className="max-w-2xl mx-auto space-y-5">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                        msg.role === 'user'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white border border-gray-200 text-indigo-500'
                                    }`}>
                                        {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                    </div>

                                    {msg.role === 'user' ? (
                                        <div className="max-w-[78%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div
                                            className="ai-message max-w-[88%] bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm text-sm text-gray-800 leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }}
                                        />
                                    )}
                                </div>
                            ))}

                            {isGenerating && (
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 text-indigo-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Bot className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-2 shadow-sm">
                                        <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                                        <span className="text-xs text-gray-400 font-medium">Думаю...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input */}
                    <div className="p-3 md:p-4 bg-white border-t border-gray-100">
                        <div className="max-w-2xl mx-auto flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 p-1.5 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
                            <textarea
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Спросите меня о чём угодно..."
                                className="flex-1 max-h-36 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 pl-4 text-sm outline-none text-gray-900 placeholder-gray-400 scrollbar-none"
                                rows={1}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isGenerating}
                                className="w-10 h-10 mb-0.5 mr-0.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-300 text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-sm disabled:shadow-none"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                        <p className="max-w-2xl mx-auto mt-1.5 text-center text-[10px] text-gray-400">
                            ИИ может ошибаться · Enter — отправить · Shift+Enter — новая строка
                        </p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .ai-message p { margin: 0 0 10px; line-height: 1.65; }
                .ai-message p:last-child { margin-bottom: 0; }
                .ai-message h3 { font-size: 14px; font-weight: 700; color: #111827; margin: 14px 0 6px; }
                .ai-message h3:first-child { margin-top: 0; }
                .ai-message ul { list-style: disc; padding-left: 18px; margin: 6px 0 10px; }
                .ai-message ol { list-style: decimal; padding-left: 18px; margin: 6px 0 10px; }
                .ai-message li { margin-bottom: 4px; line-height: 1.55; }
                .ai-message strong { font-weight: 600; color: #111827; }
                .ai-message em { font-style: italic; color: #6b7280; }
                .ai-message code {
                    background: #f3f4f6; border-radius: 4px;
                    padding: 2px 6px; font-size: 12px;
                    font-family: ui-monospace, monospace; color: #4f46e5;
                }
                .ai-message hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
                .ai-message blockquote.ai-quote {
                    border-left: 3px solid #4f46e5; margin: 10px 0;
                    padding: 10px 14px; background: #f5f3ff;
                    border-radius: 0 8px 8px 0; color: #374151; font-style: italic; font-size: 13px;
                }
                .ai-message .ai-card {
                    border: 1px solid #e5e7eb; border-radius: 10px;
                    padding: 12px 14px; margin: 8px 0; background: #fafafa;
                }
                .ai-message .ai-card > strong {
                    display: block; margin-bottom: 4px; color: #4f46e5; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;
                }
                .ai-message .ai-tip {
                    background: #fffbeb; border: 1px solid #fde68a;
                    border-radius: 8px; padding: 10px 14px;
                    margin: 8px 0; color: #78350f; font-size: 13px;
                }
                .ai-message ol.ai-steps { list-style: none; padding: 0; margin: 8px 0; counter-reset: steps; }
                .ai-message ol.ai-steps li {
                    counter-increment: steps; display: flex;
                    gap: 10px; margin-bottom: 8px; align-items: flex-start;
                }
                .ai-message ol.ai-steps li::before {
                    content: counter(steps);
                    min-width: 20px; height: 20px;
                    background: #4f46e5; color: white;
                    border-radius: 50%; font-size: 11px; font-weight: 700;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0; margin-top: 2px;
                }
            `}</style>
        </div>
    )
}
