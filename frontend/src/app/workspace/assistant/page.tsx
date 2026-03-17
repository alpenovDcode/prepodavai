'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Bot, User, Maximize2, Sparkles } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import DOMPurify from 'isomorphic-dompurify'

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function AssistantGenerator() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Здравствуйте! Я ваш ИИ-ассистент преподавателя. Чем я могу помочь вам сегодня? Я могу написать план урока, придумать идеи для мероприятий, помочь с проверкой текстов или ответить на любые профессиональные вопросы.'
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [systemPrompt, setSystemPrompt] = useState('general')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isGenerating])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isGenerating) return;

        const userMsg = inputValue.trim()
        setInputValue('')

        // Add user message to UI
        const newMessages = [
            ...messages,
            { id: Date.now().toString(), role: 'user' as const, content: userMsg }
        ]
        setMessages(newMessages)

        try {
            // In a real app, you would pass the entire message history to maintain context
            // For now, we just pass the current prompt and persona to the generation hook
            const params = {
                prompt: userMsg,
                systemPrompt,
                // history: newMessages.map(m => ({ role: m.role, content: m.content }))
            }

            const status = await generateAndWait({ type: 'assistant', params })
            const resultData = status.result?.content || status.result

            if (typeof resultData === 'string') {
                setMessages(prev => [
                    ...prev,
                    { id: Date.now().toString(), role: 'assistant', content: resultData }
                ])
            } else {
                setMessages(prev => [
                    ...prev,
                    { id: Date.now().toString(), role: 'assistant', content: 'Извините, я не смог обработать ваш запрос. Пожалуйста, попробуйте переформулировать.' }
                ])
            }

        } catch (e: any) {
            console.error('Generation failed:', e)
            setMessages(prev => [
                ...prev,
                { id: Date.now().toString(), role: 'assistant', content: `Произошла ошибка: ${e.message}` }
            ])
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const personas = [
        { value: 'general', label: 'Универсальный помощник' },
        { value: 'methodologist', label: 'Опытный методист' },
        { value: 'psychologist', label: 'Детский психолог' },
        { value: 'copywriter', label: 'Копирайтер для соцсетей' }
    ]

    const suggestions = [
        "Напиши 3 идеи для нестандартного начала урока",
        "Как мотивировать подростка, который ничего не хочет делать?",
        "Составь расписание занятий на неделю с учетом отдыха",
        "Напиши пост-знакомство для репетитора в соцсетях"
    ]

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] hidden md:flex">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">AI Ассистент</h2>
                            <GenerationCostBadge operationType="assistant" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Роль ассистента</label>
                            <select
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-gray-900 placeholder-gray-400"
                            >
                                {personas.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-2">
                                Изменение роли поменяет тон и формат ответов нейросети.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-gray-100">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                Быстрые запросы
                            </label>
                            <div className="space-y-2">
                                {suggestions.map((suggestion, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setInputValue(suggestion)}
                                        className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-sky-50 border border-gray-200 hover:border-sky-200 rounded-lg text-sm text-gray-600 transition-colors text-gray-900 placeholder-gray-400"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Chat Header */}
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-sm font-bold text-gray-700">PRRV AI Assistant</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMessages([messages[0]])}
                                className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors"
                            >
                                Очистить чат
                            </button>
                            <button className="p-2 ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors md:hidden">
                                <MessageSquare className="w-4 h-4" />
                            </button>
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors hidden md:block">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/30 scrollbar-thin scrollbar-thumb-gray-200">
                        <div className="max-w-3xl mx-auto space-y-6">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-sky-100 text-sky-600'
                                        }`}>
                                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                    </div>
                                    <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-sm'
                                        }`}>
                                        <div className="prose text-gray-900 prose-p:text-gray-900 prose-headings:text-gray-900 prose-li:text-gray-900 text-gray-900 prose-p:text-gray-900 prose-headings:text-gray-900 prose-li:text-gray-900 prose-sm max-w-none prose-p:leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content.replace(/\n/g, '<br/>')) }}
                                        />
                                    </div>
                                </div>
                            ))}

                            {isGenerating && (
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                                        <span className="text-sm font-medium text-gray-500">Печатает...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 bg-white border-t border-gray-100">
                        <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 p-1 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all text-gray-900 placeholder-gray-400">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Спросите меня о чем угодно..."
                                className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 pl-4 text-sm scrollbar-thin outline-none"
                                rows={1}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isGenerating}
                                className="w-10 h-10 mb-0.5 mr-0.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:bg-gray-200 disabled:text-gray-400 text-white flex items-center justify-center flex-shrink-0 transition-colors"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                        <div className="max-w-3xl mx-auto mt-2 text-center text-[10px] text-gray-400">
                            AI может допускать ошибки. Проверяйте важную информацию.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
