'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import StudentSidebar from '@/components/StudentSidebar'
import DOMPurify from 'isomorphic-dompurify'
import { Bot, Send, Trash2, Lightbulb, BookOpen, HelpCircle } from 'lucide-react'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

function formatMarkdown(text: string): string {
    let formatted = text
    formatted = formatted.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold mt-3 mb-2">$1</h3>')
    formatted = formatted.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    formatted = formatted.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-3">$1</h1>')
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 rounded text-sm font-mono">$1</code>')
    formatted = formatted.replace(/^\d+\.\s+(.*)$/gim, '<li class="ml-4 mb-1">$1</li>')
    formatted = formatted.replace(/^[-*]\s+(.*)$/gim, '<li class="ml-4 mb-1">$1</li>')
    formatted = formatted.replace(/\n\n/g, '<br/><br/>')
    formatted = formatted.replace(/\n/g, '<br/>')
    return formatted
}

const quickSuggestions = [
    { text: 'Объясни тему простыми словами', icon: Lightbulb },
    { text: 'Помоги разобраться с задачей', icon: HelpCircle },
    { text: 'Посоветуй материалы для изучения', icon: BookOpen },
]

export default function AiTeacherPage() {
    const router = useRouter()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputMessage, setInputMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [user, setUser] = useState<StudentUser | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        const userStr = localStorage.getItem('user')
        if (!userStr) {
            router.push('/student/login')
            return
        }
        setUser(JSON.parse(userStr) as StudentUser)
    }, [router])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const sendMessage = async (text?: string) => {
        const messageText = text || inputMessage.trim()
        if (!messageText || isLoading) return

        setInputMessage('')
        setIsLoading(true)

        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: messageText }]
        setMessages(newMessages)

        try {
            const response = await apiClient.post('/ai-assistant/student-chat', {
                message: messageText,
                history: messages,
            })
            setMessages([...newMessages, { role: 'assistant', content: response.data.response }])
        } catch (error: any) {
            console.error('Chat error:', error)
            setMessages([
                ...newMessages,
                {
                    role: 'assistant',
                    content: 'Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.',
                },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const clearChat = () => {
        setMessages([])
        setInputMessage('')
    }

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_authenticated')
        localStorage.removeItem('user')
        router.push('/student/login')
    }

    return (
        <div className="flex min-h-screen bg-[#F9FAFB]">
            <StudentSidebar user={user} onLogout={handleLogout} />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 lg:px-10 py-4 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-md">
                            <Bot size={22} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">ИИ Учитель</h1>
                            <p className="text-xs text-gray-500">Подсказки и рекомендации для обучения</p>
                        </div>
                    </div>
                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 bg-gray-50 rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                            <Trash2 size={16} />
                            <span className="hidden sm:inline">Очистить чат</span>
                        </button>
                    )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 lg:px-10 py-6">
                    <div className="max-w-3xl mx-auto space-y-4">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mb-6">
                                    <Bot size={36} className="text-orange-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Привет! Я твой ИИ Учитель</h2>
                                <p className="text-gray-500 max-w-md mb-8">
                                    Я помогу тебе разобраться в учебных темах, дам подсказки и рекомендации. Я не буду решать за тебя, но помогу понять материал!
                                </p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {quickSuggestions.map((suggestion) => (
                                        <button
                                            key={suggestion.text}
                                            onClick={() => sendMessage(suggestion.text)}
                                            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 hover:border-orange-300 hover:bg-orange-50 transition-all shadow-sm hover:shadow-md"
                                        >
                                            <suggestion.icon size={16} className="text-orange-500" />
                                            {suggestion.text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <Bot size={18} className="text-white" />
                                    </div>
                                )}
                                <div
                                    className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === 'user'
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                                    }`}
                                >
                                    {msg.role === 'assistant' ? (
                                        <div
                                            className="text-sm leading-relaxed formatted-markdown"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMarkdown(msg.content)) }}
                                        />
                                    ) : (
                                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-3 justify-start">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Bot size={18} className="text-white" />
                                </div>
                                <div className="px-5 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce"></div>
                                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input */}
                <div className="border-t border-gray-100 bg-white px-4 lg:px-10 py-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex gap-3">
                            <textarea
                                ref={inputRef}
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Задай вопрос по учёбе..."
                                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent focus:bg-white transition-colors"
                                rows={1}
                                style={{ minHeight: '48px', maxHeight: '120px' }}
                            />
                            <button
                                onClick={() => sendMessage()}
                                disabled={!inputMessage.trim() || isLoading}
                                className="px-5 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Send size={18} />
                                <span className="hidden sm:inline">Отправить</span>
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 ml-1">
                            ИИ Учитель помогает разобраться в материале, но не даёт готовых решений.
                        </p>
                    </div>
                </div>
            </main>

            <style jsx>{`
                .formatted-markdown h1,
                .formatted-markdown h2,
                .formatted-markdown h3 {
                    color: inherit;
                }
                .formatted-markdown strong {
                    color: inherit;
                }
                .formatted-markdown code {
                    background-color: rgba(0, 0, 0, 0.05);
                }
                .formatted-markdown li {
                    list-style-position: inside;
                }
            `}</style>
        </div>
    )
}
