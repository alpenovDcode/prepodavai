'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader2, Bot, User, Maximize2, Sparkles } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'
import MathContent from '@/components/MathContent'

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
    const [activeTab, setActiveTab] = useState<'config' | 'chat'>('chat')
    const [isMobile, setIsMobile] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

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
            const params = {
                prompt: userMsg,
                systemPrompt,
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
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Настройка
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'chat' ? 'bg-sky-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Чат
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg text-gray-900">AI Ассистент</h2>
                            <GenerationCostBadge operationType="assistant" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium tracking-tight uppercase">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-100">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 tracking-tight">Роль ассистента</label>
                            <select
                                value={systemPrompt}
                                onChange={e => setSystemPrompt(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 transition-all text-gray-900 appearance-none cursor-pointer"
                            >
                                {personas.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-gray-500 mt-2 font-medium leading-relaxed">
                                Роль определяет характер ответов и профессиональный уклон ИИ.
                            </p>
                        </div>

                        <div className="pt-5 border-t border-gray-100">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                Быстрые запросы
                            </label>
                            <div className="space-y-2">
                                {suggestions.map((suggestion, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            setInputValue(suggestion);
                                            if (isMobile) setActiveTab('chat');
                                        }}
                                        className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-sky-50 border border-gray-100 hover:border-sky-200 rounded-xl text-[13px] text-gray-700 transition-all active:scale-[0.98] font-medium"
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
            <div className={`
                ${isMobile && activeTab !== 'chat' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Chat Header */}
                    <div className="h-14 md:h-16 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-sm font-bold text-gray-700 tracking-tight">PRRV AI Assistant</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMessages([messages[0]])}
                                className="text-[11px] font-bold text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors uppercase tracking-tight bg-gray-50 hover:bg-red-50"
                            >
                                Очистить
                            </button>
                            <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all hidden md:block">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/20 scrollbar-thin scrollbar-thumb-gray-200">
                        <div className="max-w-3xl mx-auto space-y-6">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                >
                                    <div className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-1 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-100 text-sky-600'
                                        }`}>
                                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                    </div>
                                    <div className={`max-w-[85%] md:max-w-[80%] rounded-2xl px-4 py-3 md:px-5 md:py-3.5 shadow-sm ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                                        }`}>
                                        <MathContent
                                            html={msg.content.replace(/\n/g, '<br/>')}
                                            className={`prose prose-sm max-w-none prose-p:leading-relaxed ${
                                                msg.role === 'user'
                                                    ? 'prose-invert text-white prose-p:text-white prose-headings:text-white prose-li:text-white'
                                                    : 'text-gray-900 prose-p:text-gray-910 prose-headings:text-gray-900 prose-li:text-gray-900'
                                            }`}
                                        />
                                    </div>
                                </div>
                            ))}

                            {isGenerating && (
                                <div className="flex gap-3 md:gap-4">
                                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-white border border-gray-100 text-sky-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-5 py-3 md:py-4 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                                        <span className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-tight">Печатает...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Chat Input */}
                    <div className="p-3 md:p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                        <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-100 p-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-50 transition-all">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Спросите меня о чем угодно..."
                                className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:ring-0 py-3 pl-4 text-sm scrollbar-none outline-none text-gray-900 placeholder-gray-400"
                                rows={1}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isGenerating}
                                className="w-10 h-10 mb-0.5 mr-0.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-gray-100 disabled:text-gray-300 text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-md disabled:shadow-none"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                        <div className="max-w-3xl mx-auto mt-2 text-center text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                            AI может ошибаться • Workspace v2
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
