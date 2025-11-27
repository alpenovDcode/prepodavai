'use client'

import { useState, useRef, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface AiAssistantChatProps {
    onClose?: () => void
}

// Функция для форматирования markdown в HTML
function formatMarkdown(text: string): string {
    let formatted = text

    // Заголовки
    formatted = formatted.replace(/^### (.*$)/gim, '<h3 class="text-base font-bold mt-3 mb-2">$1</h3>')
    formatted = formatted.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    formatted = formatted.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-3">$1</h1>')

    // Жирный текст
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')

    // Курсив
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')

    // Код inline
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 rounded text-sm font-mono">$1</code>')

    // Списки (упрощенная версия)
    formatted = formatted.replace(/^\d+\.\s+(.*)$/gim, '<li class="ml-4 mb-1">$1</li>')
    formatted = formatted.replace(/^[-*]\s+(.*)$/gim, '<li class="ml-4 mb-1">• $1</li>')

    // Переносы строк
    formatted = formatted.replace(/\n\n/g, '<br/><br/>')
    formatted = formatted.replace(/\n/g, '<br/>')

    return formatted
}

export default function AiAssistantChat({ onClose }: AiAssistantChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [inputMessage, setInputMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const sendMessage = async () => {
        if (!inputMessage.trim() || isLoading) return

        const userMessage = inputMessage.trim()
        setInputMessage('')
        setIsLoading(true)

        // Добавляем сообщение пользователя
        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }]
        setMessages(newMessages)

        try {
            const response = await apiClient.post('/ai-assistant/chat', {
                message: userMessage,
                history: messages,
            })

            // Добавляем ответ ассистента
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

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-[#D8E6FF] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#D8E6FF]/30 to-transparent border-b border-[#D8E6FF]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FF7E58] flex items-center justify-center">
                        <i className="fas fa-robot text-white"></i>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-black">AI-ассистент</h3>
                        <p className="text-xs text-black/70">Помощник для учителей</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            className="px-3 py-1.5 text-xs bg-[#D8E6FF] text-black rounded-lg hover:bg-[#FF7E58] hover:text-white transition"
                        >
                            <i className="fas fa-trash mr-1"></i>Очистить
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-[#D8E6FF] hover:bg-red-50 transition flex items-center justify-center"
                        >
                            <i className="fas fa-times text-red-500"></i>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[400px] max-h-[600px]">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-16 h-16 rounded-2xl bg-[#D8E6FF] flex items-center justify-center mb-4">
                            <i className="fas fa-comments text-[#FF7E58] text-2xl"></i>
                        </div>
                        <h4 className="text-lg font-bold text-black mb-2">Начните диалог</h4>
                        <p className="text-sm text-black/70 max-w-md">
                            Задавайте вопросы по педагогике, просите помощи в создании материалов или обсуждайте
                            методики преподавания
                        </p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-lg bg-[#FF7E58] flex items-center justify-center flex-shrink-0">
                                <i className="fas fa-robot text-white text-sm"></i>
                            </div>
                        )}
                        <div
                            className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-[#FF7E58] text-white'
                                    : 'bg-[#D8E6FF] text-black border border-[#D8E6FF]'
                                }`}
                        >
                            {msg.role === 'assistant' ? (
                                <div
                                    className="text-sm formatted-markdown"
                                    dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                                />
                            ) : (
                                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                        </div>
                        {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-lg bg-[#D8E6FF] flex items-center justify-center flex-shrink-0">
                                <i className="fas fa-user text-[#FF7E58] text-sm"></i>
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-lg bg-[#FF7E58] flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-robot text-white text-sm"></i>
                        </div>
                        <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-[#D8E6FF] border border-[#D8E6FF]">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 rounded-full bg-[#FF7E58] animate-bounce"></div>
                                <div className="w-2 h-2 rounded-full bg-[#FF7E58] animate-bounce delay-100"></div>
                                <div className="w-2 h-2 rounded-full bg-[#FF7E58] animate-bounce delay-200"></div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[#D8E6FF] bg-gradient-to-r from-[#D8E6FF]/10 to-transparent">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Напишите сообщение... (Enter для отправки)"
                        className="flex-1 px-4 py-3 rounded-xl border border-[#D8E6FF] bg-white text-black placeholder-black/50 resize-none focus:outline-none focus:ring-2 focus:ring-[#FF7E58] focus:border-transparent"
                        rows={1}
                        style={{
                            minHeight: '48px',
                            maxHeight: '120px',
                        }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!inputMessage.trim() || isLoading}
                        className="px-6 py-3 bg-[#FF7E58] text-white rounded-xl font-medium hover:shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <i className="fas fa-paper-plane"></i>
                        <span className="hidden sm:inline">Отправить</span>
                    </button>
                </div>
                <p className="text-xs text-black/50 mt-2">
                    <i className="fas fa-info-circle mr-1"></i>
                    AI может допускать ошибки. Проверяйте важную информацию.
                </p>
            </div>

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
