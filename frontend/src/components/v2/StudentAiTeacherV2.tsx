'use client'

import { useEffect, useRef, useState } from 'react'
import {
    Send, Plus, Trash2, MessageSquare, Bot, Sparkles, Copy, Check, BookOpen, Calculator, Globe, FlaskConical,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { IconTile } from '@/components/ui/v2/IconTile'
import { cn } from '@/lib/utils/cn'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface Conversation {
    id: string
    title: string
    messages: ChatMessage[]
    updatedAt: number
}

const STORAGE_KEY = 'prepodavai_ai_teacher_v2'

const SUGGESTED_PROMPTS = [
    { icon: Calculator, label: 'Объясни теорему Пифагора', prompt: 'Объясни мне теорему Пифагора простыми словами с примером' },
    { icon: BookOpen,    label: 'Помоги с сочинением',     prompt: 'Помоги составить план сочинения по теме «Любимое время года»' },
    { icon: FlaskConical, label: 'Уравнение реакции',       prompt: 'Напиши уравнение реакции горения метана и объясни шаги' },
    { icon: Globe,        label: 'История кратко',          prompt: 'Расскажи кратко о причинах Великой Отечественной войны' },
]

/** Загружает диалоги из localStorage. На SSR — пустой массив. */
function loadConversations(): Conversation[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        return JSON.parse(raw)
    } catch { return [] }
}

function saveConversations(convs: Conversation[]) {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)) } catch { /* over quota */ }
}

function generateTitle(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user')?.content || 'Новый диалог'
    return first.slice(0, 40) + (first.length > 40 ? '…' : '')
}

/** Простой рендер контента: безопасный HTML + katex \\(...\\) и \\[...\\]. */
function renderMessageContent(text: string): string {
    if (!text) return ''
    // Защитим от любых HTML-инъекций в самом тексте сначала.
    let safe = DOMPurify.sanitize(text, { ALLOWED_TAGS: ['br','p','strong','em','code','pre','ul','ol','li','a'], ALLOWED_ATTR: ['href'] })

    // Inline: \( ... \) и $...$
    safe = safe.replace(/\\\((.+?)\\\)/g, (_, expr) => {
        try { return katex.renderToString(expr, { throwOnError: false, displayMode: false }) } catch { return _ }
    })
    safe = safe.replace(/\$([^$\n]+?)\$/g, (m, expr) => {
        try { return katex.renderToString(expr, { throwOnError: false, displayMode: false }) } catch { return m }
    })
    // Display: \[ ... \] и $$...$$
    safe = safe.replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => {
        try { return katex.renderToString(expr, { throwOnError: false, displayMode: true }) } catch { return _ }
    })
    safe = safe.replace(/\$\$([\s\S]+?)\$\$/g, (m, expr) => {
        try { return katex.renderToString(expr, { throwOnError: false, displayMode: true }) } catch { return m }
    })

    // Простые переводы строк → <br>
    return safe.replace(/\n/g, '<br>')
}

export default function StudentAiTeacherV2() {
    const menu = useStudentMobileMenu()

    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Load + create first conversation
    useEffect(() => {
        const loaded = loadConversations()
        if (loaded.length === 0) {
            const c = newConversation()
            setConversations([c])
            setActiveId(c.id)
        } else {
            setConversations(loaded)
            setActiveId(loaded[0].id)
        }
    }, [])

    const updateAndSave = (next: Conversation[]) => {
        setConversations(next)
        saveConversations(next)
    }

    const active = conversations.find(c => c.id === activeId) || null

    // Auto-scroll on new messages
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, [active?.messages.length, isSending])

    const newConversation = (): Conversation => ({
        id: Math.random().toString(36).slice(2, 12),
        title: 'Новый диалог',
        messages: [],
        updatedAt: Date.now(),
    })

    const startNew = () => {
        const c = newConversation()
        updateAndSave([c, ...conversations])
        setActiveId(c.id)
        setInput('')
        setSidebarOpen(false)
        textareaRef.current?.focus()
    }

    const deleteConversation = (id: string) => {
        const next = conversations.filter(c => c.id !== id)
        updateAndSave(next.length ? next : [newConversation()])
        if (activeId === id) setActiveId(next[0]?.id || null)
    }

    const sendMessage = async (preset?: string) => {
        const text = (preset ?? input).trim()
        if (!text || isSending || !active) return

        const messagesBefore = active.messages
        const newMessages: ChatMessage[] = [...messagesBefore, { role: 'user', content: text }]
        const updatedConv: Conversation = {
            ...active,
            messages: newMessages,
            title: messagesBefore.length === 0 ? generateTitle(newMessages) : active.title,
            updatedAt: Date.now(),
        }
        const stageOne = conversations.map(c => c.id === active.id ? updatedConv : c)
        updateAndSave(stageOne)
        setInput('')
        setIsSending(true)

        try {
            const response = await apiClient.post('/ai-assistant/student-chat', {
                message: text,
                history: messagesBefore,
            })
            const final: ChatMessage[] = [...newMessages, { role: 'assistant', content: response.data?.response || '…' }]
            const finalConv: Conversation = { ...updatedConv, messages: final, updatedAt: Date.now() }
            updateAndSave(stageOne.map(c => c.id === active.id ? finalConv : c))
        } catch (e: any) {
            const errMsg = e?.response?.data?.message || 'Извините, произошла ошибка. Попробуйте ещё раз.'
            const errFinal: ChatMessage[] = [...newMessages, { role: 'assistant', content: errMsg }]
            updateAndSave(stageOne.map(c => c.id === active.id ? { ...updatedConv, messages: errFinal } : c))
        } finally {
            setIsSending(false)
            requestAnimationFrame(() => textareaRef.current?.focus())
        }
    }

    const copyAnswer = async (msg: ChatMessage, idx: number) => {
        try {
            await navigator.clipboard.writeText(msg.content)
            setCopiedId(`${active?.id}-${idx}`)
            toast.success('Скопировано')
            setTimeout(() => setCopiedId(null), 1500)
        } catch { toast.error('Не удалось скопировать') }
    }

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const isEmptyChat = !active || active.messages.length === 0

    return (
        <>
            <Topbar
                title="ИИ-учитель"
                subtitle="Задайте вопрос — получите подробный ответ"
                onMobileMenuToggle={menu.toggle}
                notificationsAudience="student"
                hideSearch
                actions={
                    <Button variant="ghost" size="sm" leftIcon={<MessageSquare className="w-4 h-4" />} onClick={() => setSidebarOpen(true)} className="lg:hidden">
                        Чаты
                    </Button>
                }
            />

            <div className="flex-1 min-h-0 flex">
                {/* Sidebar — список диалогов */}
                <aside
                    className={cn(
                        'border-r border-ink-200 bg-surface flex flex-col w-[260px] flex-shrink-0',
                        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:translate-x-0',
                        sidebarOpen ? '' : 'max-lg:-translate-x-full',
                        'transition-transform duration-200',
                    )}
                >
                    <div className="p-3 border-b border-ink-100">
                        <Button variant="primary" size="sm" fullWidth leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={startNew}>
                            Новый диалог
                        </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {conversations
                            .sort((a, b) => b.updatedAt - a.updatedAt)
                            .map(c => (
                                <div
                                    key={c.id}
                                    className={cn(
                                        'group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                                        c.id === activeId ? 'bg-brand-50 text-brand-700' : 'hover:bg-ink-100 text-ink-700',
                                    )}
                                    onClick={() => { setActiveId(c.id); setSidebarOpen(false) }}
                                >
                                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                                    <span className="flex-1 text-[13px] font-medium truncate">{c.title}</span>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); deleteConversation(c.id) }}
                                        className="opacity-0 group-hover:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded text-ink-400 hover:text-danger-500 hover:bg-white transition-all"
                                        aria-label="Удалить"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                    </div>
                </aside>

                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div className="lg:hidden fixed inset-0 z-30 bg-black/40 animate-fade-in" onClick={() => setSidebarOpen(false)} />
                )}

                {/* Chat area */}
                <main className="flex-1 min-w-0 flex flex-col bg-ink-50">
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6 max-md:px-4">
                        {isEmptyChat ? (
                            <div className="max-w-[680px] mx-auto pt-8">
                                <div className="text-center mb-8">
                                    <IconTile color="brand" size="lg" className="mx-auto mb-4">
                                        <Bot className="w-7 h-7" />
                                    </IconTile>
                                    <h2 className="font-display font-bold text-[24px] text-ink-900 mb-1">Чем могу помочь?</h2>
                                    <p className="text-[14px] text-ink-500">Спросите про задачу, формулу, исторический факт — я подскажу.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                                    {SUGGESTED_PROMPTS.map((s, i) => {
                                        const Icon = s.icon
                                        return (
                                            <Card
                                                key={i}
                                                interactive
                                                padding="md"
                                                onClick={() => sendMessage(s.prompt)}
                                                className="flex items-center gap-3 hover:border-brand-300 transition-all"
                                            >
                                                <IconTile color="info" size="sm"><Icon className="w-4 h-4" /></IconTile>
                                                <span className="text-[13px] font-semibold text-ink-700">{s.label}</span>
                                            </Card>
                                        )
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-[760px] mx-auto flex flex-col gap-5">
                                {active!.messages.map((m, i) => (
                                    <MessageBubble
                                        key={i}
                                        message={m}
                                        copied={copiedId === `${active!.id}-${i}`}
                                        onCopy={() => copyAnswer(m, i)}
                                    />
                                ))}
                                {isSending && (
                                    <div className="flex gap-3">
                                        <IconTile color="brand" size="md"><Bot className="w-4 h-4" /></IconTile>
                                        <div className="flex-1 flex items-center gap-1.5 text-ink-500 text-sm pt-2">
                                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" />
                                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.15s' }} />
                                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
                                            <span className="ml-2">Думаю…</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="border-t border-ink-200 bg-surface p-4 max-md:p-3">
                        <div className="max-w-[760px] mx-auto flex items-end gap-2">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder="Спросите что угодно… (Enter — отправить, Shift+Enter — новая строка)"
                                rows={1}
                                className="flex-1 max-h-[160px] p-3 rounded-md border border-ink-200 bg-surface text-[14px] resize-none focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15"
                                style={{ minHeight: 44 }}
                            />
                            <Button
                                variant="primary"
                                size="md"
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || isSending}
                                loading={isSending}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="max-w-[760px] mx-auto mt-2 text-[11px] text-ink-400 text-center inline-flex items-center justify-center w-full gap-1">
                            <Sparkles className="w-3 h-3" />
                            Ответы ИИ. Если важно — проверьте у учителя.
                        </div>
                    </div>
                </main>
            </div>
        </>
    )
}

function MessageBubble({ message, copied, onCopy }: { message: ChatMessage; copied: boolean; onCopy: () => void }) {
    const isUser = message.role === 'user'
    if (isUser) {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] bg-brand-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                    <div className="text-[14px] whitespace-pre-wrap break-words">{message.content}</div>
                </div>
            </div>
        )
    }
    return (
        <div className="flex gap-3 group">
            <IconTile color="brand" size="md" className="mt-1"><Bot className="w-4 h-4" /></IconTile>
            <div className="flex-1 min-w-0">
                <div
                    className="bg-surface border border-ink-200 rounded-2xl rounded-tl-sm px-4 py-3 text-[14px] text-ink-900 leading-relaxed prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMessageContent(message.content) }}
                />
                <div className="mt-1 inline-flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        type="button"
                        onClick={onCopy}
                        className="text-[11px] text-ink-500 hover:text-ink-700 inline-flex items-center gap-1"
                    >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Скопировано' : 'Копировать'}
                    </button>
                </div>
            </div>
        </div>
    )
}
