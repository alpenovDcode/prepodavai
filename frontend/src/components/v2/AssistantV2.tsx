'use client'

import { useEffect, useRef, useState } from 'react'
import {
    Send, Loader2, Bot, User, Trash2, Sparkles,
    MessageSquare, ChevronDown,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { useGenerations } from '@/lib/hooks/useGenerations'
import { cn } from '@/lib/utils/cn'

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
}

const PERSONAS = [
    { value: 'general',        label: 'Универсальный помощник',  desc: 'Любые вопросы учителя',     emoji: '🧠' },
    { value: 'methodologist',  label: 'Опытный методист',         desc: 'Планы, программы, ФГОС',    emoji: '📋' },
    { value: 'psychologist',   label: 'Детский психолог',          desc: 'Мотивация, конфликты',       emoji: '💬' },
    { value: 'lesson_planner', label: 'Планировщик уроков',        desc: 'Конспекты, цели, этапы',    emoji: '📅' },
    { value: 'examprep',       label: 'Эксперт ОГЭ/ЕГЭ',          desc: 'Подготовка к экзаменам',    emoji: '🎯' },
    { value: 'copywriter',     label: 'Тексты для соцсетей',        desc: 'Посты, биографии, истории', emoji: '✍️' },
]

const SUGGESTIONS: Record<string, string[]> = {
    general: [
        'Как провести первый урок в новом классе?',
        'Что делать, если ученик срывает урок?',
        'Как объяснить родителям неуспеваемость ребёнка?',
    ],
    methodologist: [
        'Составь технологическую карту урока «Тригонометрия», 10 класс',
        'Приёмы формирующего оценивания',
        'Система повторения за 4 недели до ЕГЭ',
    ],
    psychologist: [
        'Ученик отказывается отвечать у доски — как помочь?',
        'Как мотивировать подростка, которому «всё равно»?',
        'Скрипт разговора с тревожными родителями',
    ],
    lesson_planner: [
        'Конспект «Степени сравнения прилагательных», 4 класс, 45 мин',
        'Этапы урока по химии для нового материала',
        'ДЗ, которое ученики выполнят с удовольствием',
    ],
    examprep: [
        'Разбор задания №25 ЕГЭ по русскому',
        'Типичные ошибки в задании №19 ЕГЭ по математике',
        'План подготовки к ОГЭ по биологии за 2 месяца',
    ],
    copywriter: [
        'Пост-знакомство для репетитора математики',
        'История успеха: с тройки до пятёрки за месяц',
        'Описание профиля учителя английского',
    ],
}

const WELCOME_MSG: ChatMessage = {
    id: 'welcome',
    role: 'assistant',
    content: '<p>Привет! 👋 Я ваш ИИ-ассистент для учителей и репетиторов.</p><p>Выберите <strong>роль</strong> слева — и задайте любой вопрос или воспользуйтесь быстрыми подсказками.</p>',
}

export default function AssistantV2() {
    const { generateAndWait, isGenerating } = useGenerations()

    const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG])
    const [input, setInput] = useState('')
    const [persona, setPersona] = useState('general')
    const [sidebarOpen, setSidebarOpen] = useState(true)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const currentPersona = PERSONAS.find(p => p.value === persona)
    const suggestions = SUGGESTIONS[persona] ?? SUGGESTIONS.general

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isGenerating])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || isGenerating) return

        setInput('')
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text }
        setMessages(prev => [...prev, userMsg])

        try {
            const status = await generateAndWait({ type: 'assistant', params: { prompt: text, systemPrompt: persona } })
            const resultData = status.result?.content || status.result
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: typeof resultData === 'string'
                    ? resultData
                    : '<p>Извините, не удалось обработать запрос. Попробуйте переформулировать.</p>',
            }])
        } catch (e: any) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `<p>Произошла ошибка: ${e.message}</p>`,
            }])
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const clearChat = () => setMessages([WELCOME_MSG])

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* ─── Sidebar ─── */}
                <div className={cn(
                    'bg-surface border-r border-ink-200 flex-col flex-shrink-0 overflow-y-auto transition-all duration-200',
                    sidebarOpen ? 'w-[260px] flex' : 'w-0 hidden lg:flex lg:w-[260px]',
                )}>
                    {/* Persona section */}
                    <div className="p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400 mb-2">Роль ассистента</div>
                        <div className="space-y-1">
                            {PERSONAS.map(p => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setPersona(p.value)}
                                    className={cn(
                                        'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
                                        persona === p.value
                                            ? 'bg-brand-50 border-brand-200 text-brand-700'
                                            : 'bg-surface border-transparent hover:bg-ink-50 hover:border-ink-200 text-ink-700',
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">{p.emoji}</span>
                                        <div className="min-w-0">
                                            <div className="font-semibold text-[13px] truncate">{p.label}</div>
                                            <div className="text-[11px] text-ink-400 mt-0.5">{p.desc}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quick prompts */}
                    <div className="px-4 pb-4 border-t border-ink-100 pt-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400 mb-2 flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            Быстрые запросы
                        </div>
                        <div className="space-y-1">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => { setInput(s); inputRef.current?.focus() }}
                                    className="w-full text-left px-3 py-2 rounded-lg bg-ink-50 hover:bg-brand-50 border border-transparent hover:border-brand-200 text-[12px] text-ink-600 hover:text-brand-700 transition-all font-medium leading-snug"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ─── Chat area ─── */}
                <div className="flex-1 flex flex-col min-w-0 bg-surface-soft">
                    {/* Chat header */}
                    <div className="h-12 flex items-center justify-between px-4 border-b border-ink-200 bg-surface flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(o => !o)}
                                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md text-ink-500 hover:bg-ink-100"
                            >
                                <ChevronDown className={cn('w-4 h-4 transition-transform', sidebarOpen && 'rotate-90')} />
                            </button>
                            <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                            <span className="text-[13px] font-bold text-ink-900">
                                {currentPersona?.emoji} {currentPersona?.label}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={clearChat}
                            className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-400 hover:text-danger-600 px-2.5 py-1.5 rounded-lg hover:bg-danger-50 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Очистить</span>
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-h-0">
                        <div className="max-w-2xl mx-auto space-y-4">
                            {messages.map(msg => (
                                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <div className={cn(
                                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                                        msg.role === 'user'
                                            ? 'bg-brand-600 text-white'
                                            : 'bg-surface border border-ink-200 text-brand-500',
                                    )}>
                                        {msg.role === 'user'
                                            ? <User className="w-3.5 h-3.5" />
                                            : <Bot className="w-3.5 h-3.5" />
                                        }
                                    </div>
                                    {msg.role === 'user' ? (
                                        <div className="max-w-[78%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div
                                            className="ai-msg-v2 max-w-[88%] bg-surface border border-ink-200 rounded-2xl rounded-tl-sm px-4 py-3.5 text-[13px] text-ink-800 leading-relaxed shadow-sm"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }}
                                        />
                                    )}
                                </div>
                            ))}

                            {isGenerating && (
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-surface border border-ink-200 text-brand-500 flex items-center justify-center flex-shrink-0">
                                        <Bot className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="bg-surface border border-ink-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                                        <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin" />
                                        <span className="text-[12px] text-ink-400 font-medium">Думаю…</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input */}
                    <div className="flex-shrink-0 p-3 lg:p-4 border-t border-ink-200 bg-surface">
                        <div className="max-w-2xl mx-auto">
                            <div className="flex items-end gap-2 bg-surface-soft border border-ink-200 rounded-xl p-1.5 focus-within:border-brand-400 focus-within:ring-[3px] focus-within:ring-brand-400/10 transition-all">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Спросите меня о чём угодно…"
                                    rows={1}
                                    className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 pl-3 text-[13px] text-ink-900 placeholder:text-ink-400 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={!input.trim() || isGenerating}
                                    className="w-10 h-10 mb-0.5 mr-0.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-300 text-white flex items-center justify-center transition-all active:scale-95 shadow-sm disabled:shadow-none"
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </button>
                            </div>
                            <p className="text-center text-[11px] text-ink-400 mt-1.5">
                                Enter — отправить · Shift+Enter — новая строка
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .ai-msg-v2 p { margin: 0 0 8px; line-height: 1.65; }
                .ai-msg-v2 p:last-child { margin-bottom: 0; }
                .ai-msg-v2 h3 { font-size: 13px; font-weight: 700; color: var(--ink-900); margin: 12px 0 5px; }
                .ai-msg-v2 h3:first-child { margin-top: 0; }
                .ai-msg-v2 ul { list-style: disc; padding-left: 16px; margin: 5px 0 8px; }
                .ai-msg-v2 ol { list-style: decimal; padding-left: 16px; margin: 5px 0 8px; }
                .ai-msg-v2 li { margin-bottom: 3px; line-height: 1.55; }
                .ai-msg-v2 strong { font-weight: 600; color: var(--ink-900); }
                .ai-msg-v2 code { background: var(--ink-100); border-radius: 4px; padding: 1px 5px; font-size: 12px; color: var(--brand-600); }
                .ai-msg-v2 hr { border: none; border-top: 1px solid var(--ink-200); margin: 10px 0; }
            `}</style>
        </div>
    )
}
