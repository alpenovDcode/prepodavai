'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Plus, Trash2, Sparkles, Copy, Check, RefreshCw, ThumbsUp, ThumbsDown,
  Paperclip, Mic, ArrowUp, MoreHorizontal, Lightbulb, Calculator, BookOpen, Flame, CheckCircle2, Compass,
} from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import 'katex/dist/katex.min.css'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useStudentMobileMenu } from '@/components/layout/v2/StudentLayoutV2'
import { useUser } from '@/lib/hooks/useUser'
import { cn } from '@/lib/utils/cn'
import { useTour } from '@/lib/tour/useTour'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatItem {
  id: string
  title: string
  lastMessageAt: string
  messagesCount: number
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  model: string | null
}

interface ChatDetail {
  id: string
  title: string
  messages: ChatMessage[]
}

type DateGroup = 'today' | 'yesterday' | 'week' | 'older'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function pluralMessages(n: number): string {
  const m = n % 100
  if (m >= 11 && m <= 19) return `${n} сообщений`
  const k = n % 10
  if (k === 1) return `${n} сообщение`
  if (k >= 2 && k <= 4) return `${n} сообщения`
  return `${n} сообщений`
}

function formatLastMsg(count: number, lastAt: string): string {
  const diff = Date.now() - new Date(lastAt).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const cnt = pluralMessages(count)
  if (mins < 2) return `${cnt} · сейчас`
  if (mins < 60) return `${cnt} · ${mins} мин назад`
  if (hours < 24) return `${cnt} · ${hours} ч назад`
  return cnt
}

function getDateGroup(iso: string): DateGroup {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const d = new Date(iso)
  const dm = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dm.getTime() === today.getTime()) return 'today'
  if (dm.getTime() === yesterday.getTime()) return 'yesterday'
  if (dm >= weekAgo) return 'week'
  return 'older'
}

const GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: 'На этой неделе',
  older: 'Раньше',
}

/** Simple markdown → safe HTML */
function renderMarkdown(raw: string): string {
  if (!raw) return ''
  // Strip any embedded HTML first
  let t = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })

  // Fenced code blocks
  t = t.replace(/```[\w]*\n?([\s\S]*?)```/g, (_m, code) =>
    `<pre style="background:var(--ink-50);border-radius:6px;padding:10px 12px;font-size:13px;overflow-x:auto;margin:8px 0">${code.trim()}</pre>`)

  // Inline code
  t = t.replace(/`([^`\n]+)`/g,
    '<code style="background:var(--ink-50);border-radius:4px;padding:2px 6px;font-size:13px">$1</code>')

  // Bold
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')

  // Lists
  const lines = t.split('\n')
  const out: string[] = []
  let inUl = false
  for (const line of lines) {
    const ulMatch = /^[-*•]\s(.+)/.exec(line)
    const olMatch = /^\d+\.\s(.+)/.exec(line)
    if (ulMatch) {
      if (!inUl) { out.push('<ul style="margin:8px 0;padding-left:20px">'); inUl = true }
      out.push(`<li>${ulMatch[1]}</li>`)
    } else if (olMatch && inUl) {
      out.push(`<li>${olMatch[1]}</li>`)
    } else {
      if (inUl) { out.push('</ul>'); inUl = false }
      out.push(line)
    }
  }
  if (inUl) out.push('</ul>')
  t = out.join('\n')

  // Paragraphs / line-breaks
  t = t.replace(/\n\n/g, '</p><p style="margin:8px 0">')
  t = t.replace(/\n/g, '<br>')
  return `<p style="margin:0">${t}</p>`
}

const QUICK_PROMPTS = [
  { icon: Lightbulb,    label: 'Объясни простыми словами', tpl: 'Объясни простыми словами: ' },
  { icon: Calculator,   label: 'Реши пошагово',            tpl: 'Реши задачу пошагово: ' },
  { icon: CheckCircle2, label: 'Проверь моё решение',      tpl: 'Проверь моё решение: ' },
  { icon: BookOpen,     label: 'Дай пример',               tpl: 'Дай пример по теме: ' },
]

const EXAMPLE_QUESTIONS = [
  'Объясни производную простыми словами',
  'Реши уравнение: 2x² + 3x − 5 = 0',
  'Что такое Past Perfect и когда его использовать?',
  'Помоги разобраться с законом Ома',
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StudentAiTeacherV2() {
  const menu = useStudentMobileMenu()
  const tour = useTour()
  const { initials } = useUser()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const { data: chatsData, mutate: mutateChats } = useSWR<{ items: ChatItem[] }>('/ai-chats', fetcher)
  const chats = chatsData?.items ?? []

  const { data: studentProfile } = useSWR<{ streakDays?: number }>('/students/me', fetcher)
  const streak = studentProfile?.streakDays ?? 0

  // Load chat detail when activeId changes
  useEffect(() => {
    if (!activeId) return
    apiClient.get(`/ai-chats/${activeId}`).then((r: any) => setActiveChat(r.data)).catch(() => setActiveChat(null))
  }, [activeId])

  // Auto-select first chat on initial load
  useEffect(() => {
    if (!activeId && chats.length > 0) setActiveId(chats[0].id)
  }, [chats, activeId])

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeChat?.messages.length, isSending])

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 40), 144)}px`
  }, [])

  const startNew = useCallback(async () => {
    try {
      const r = await apiClient.post('/ai-chats', {})
      const id: string = r.data.id
      setActiveId(id)
      setActiveChat({ id, title: 'Новый диалог', messages: [] })
      await mutateChats()
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = '40px'
      setTimeout(() => textareaRef.current?.focus(), 50)
    } catch {
      toast.error('Не удалось создать чат')
    }
  }, [mutateChats])

  const deleteChatById = useCallback(async (id: string) => {
    try {
      await apiClient.delete(`/ai-chats/${id}`)
      if (activeId === id) {
        setActiveId(null)
        setActiveChat(null)
      }
      await mutateChats()
    } catch {
      toast.error('Не удалось удалить чат')
    }
  }, [activeId, mutateChats])

  const sendMessage = useCallback(async (preset?: string) => {
    const content = (preset ?? input).trim()
    if (!content || isSending) return

    let chatId = activeId
    if (!chatId) {
      try {
        const r = await apiClient.post('/ai-chats', {})
        chatId = r.data.id
        setActiveId(chatId)
      } catch {
        toast.error('Не удалось создать чат')
        return
      }
    }

    const tempId = `temp-${Date.now()}`
    const tempUser: ChatMessage = { id: tempId, role: 'user', content, createdAt: new Date().toISOString(), model: null }

    setActiveChat(prev => prev
      ? { ...prev, messages: [...prev.messages, tempUser] }
      : { id: chatId!, title: content.slice(0, 40), messages: [tempUser] })

    setInput('')
    setIsSending(true)
    if (textareaRef.current) textareaRef.current.style.height = '40px'

    try {
      const r = await apiClient.post(`/ai-chats/${chatId}/messages`, { content })
      const { messages: newMsgs } = r.data
      setActiveChat(prev => {
        if (!prev) return null
        const filtered = prev.messages.filter(m => m.id !== tempId)
        return { ...prev, messages: [...filtered, ...newMsgs] }
      })
      await mutateChats()
    } catch {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Извините, произошла ошибка. Попробуйте ещё раз.',
        createdAt: new Date().toISOString(), model: null,
      }
      setActiveChat(prev => prev ? { ...prev, messages: [...prev.messages, errMsg] } : null)
    } finally {
      setIsSending(false)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [input, isSending, activeId, mutateChats])

  const copyMessage = useCallback(async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      toast.success('Скопировано')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Не удалось скопировать')
    }
  }, [])

  const regenerate = useCallback(async (msgId: string) => {
    if (!activeId || isSending) return
    setIsSending(true)
    try {
      const r = await apiClient.post(`/ai-chats/${activeId}/messages/${msgId}/regenerate`)
      const newMsg: ChatMessage = r.data
      setActiveChat(prev => prev
        ? { ...prev, messages: prev.messages.map(m => m.id === msgId ? newMsg : m) }
        : null)
    } catch {
      toast.error('Ошибка при перегенерации')
    } finally {
      setIsSending(false)
    }
  }, [activeId, isSending])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const MAX_TEXT_SIZE = 50_000
    const textTypes = ['text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/html']
    if (textTypes.some(t => file.type.startsWith(t)) && file.size <= MAX_TEXT_SIZE) {
      const text = await file.text()
      setInput(prev => prev ? `${prev}\n\n[Файл: ${file.name}]\n${text}` : `[Файл: ${file.name}]\n${text}`)
    } else {
      setInput(prev => prev ? `${prev} [Прикреплён файл: ${file.name}]` : `[Файл: ${file.name}]`)
    }
    textareaRef.current?.focus()
  }, [])

  const handleVoiceInput = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      toast.error('Голосовой ввод не поддерживается в этом браузере')
      return
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const rec = new SpeechRec()
    rec.lang = 'ru-RU'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    rec.onstart = () => setIsListening(true)
    rec.onend = () => { setIsListening(false); recognitionRef.current = null }
    rec.onerror = () => { setIsListening(false); recognitionRef.current = null; toast.error('Ошибка записи голоса') }
    rec.onresult = (ev: any) => {
      const text = ev.results[0][0].transcript
      setInput(prev => prev ? `${prev} ${text}` : text)
      textareaRef.current?.focus()
    }
    rec.start()
  }, [isListening])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Group chats by date period
  const grouped = chats.reduce<Partial<Record<DateGroup, ChatItem[]>>>((acc, c) => {
    const g = getDateGroup(c.lastMessageAt)
    acc[g] = [...(acc[g] ?? []), c]
    return acc
  }, {})
  const groupOrder: DateGroup[] = ['today', 'yesterday', 'week', 'older']

  const isEmptyChat = !activeChat || activeChat.messages.length === 0

  return (
    <>
      {/* Global keyframe for message animation */}
      <style>{`@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      <Topbar
        title="ИИ-учитель"
        onMobileMenuToggle={menu.toggle}
        notificationsAudience="student"
        hideSearch
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={tour.start}
              className="h-9 px-3 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors inline-flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" />
              Тур
            </button>
            {streak > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--warning-50, #FFFBEB)', border: '1px solid #FDE68A',
                color: '#B45309', borderRadius: 999, padding: '4px 12px',
                fontSize: 13, fontWeight: 600,
              }}>
                <Flame className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
                {streak} {streak === 1 ? 'день' : streak >= 2 && streak <= 4 ? 'дня' : 'дней'} подряд
              </div>
            )}
          </div>
        }
      />

      {/* chat-shell: 260px sidebar + flex main */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* chat-side (history) */}
        <aside data-tour="chat-history" className="w-[260px] flex-shrink-0 flex flex-col overflow-hidden border-r border-ink-200 bg-surface max-lg:hidden">

          {/* new-chat-btn */}
          <div data-tour="new-chat" className="p-4 border-b border-ink-100 flex-shrink-0">
            <button
              type="button"
              onClick={startNew}
              className="h-10 w-full rounded-md text-sm font-bold text-white inline-flex items-center justify-center gap-2 transition-all"
              style={{ background: 'linear-gradient(135deg, var(--brand-500), var(--brand-600))' }}
              onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, var(--brand-600), var(--brand-700))' }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, var(--brand-500), var(--brand-600))' }}
            >
              <Plus className="w-4 h-4" />
              Новый чат
            </button>
          </div>

          {/* chat history list */}
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-ink-400 text-center">
                Начните новый чат!
              </div>
            ) : (
              groupOrder.map(g => {
                const items = grouped[g]
                if (!items?.length) return null
                return (
                  <div key={g}>
                    <div className="px-4 pt-3.5 pb-1 text-[11px] font-bold text-ink-400 uppercase tracking-[0.06em]">
                      {GROUP_LABELS[g]}
                    </div>
                    {items.map(chat => (
                      <div
                        key={chat.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setActiveId(chat.id) }}
                        onKeyDown={e => e.key === 'Enter' && setActiveId(chat.id)}
                        className={cn(
                          'group px-4 py-2.5 cursor-pointer transition-all border-l-[3px] flex items-start gap-1',
                          chat.id === activeId
                            ? 'bg-brand-50 border-l-brand-500'
                            : 'border-l-transparent hover:bg-ink-50',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-ink-900 truncate leading-snug">
                            {chat.title}
                          </div>
                          <div className="text-[11px] text-ink-500 mt-0.5">
                            {formatLastMsg(chat.messagesCount, chat.lastMessageAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); deleteChatById(chat.id) }}
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-ink-400 hover:text-danger-500 hover:bg-white transition-all mt-0.5"
                          aria-label="Удалить чат"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* chat-main */}
        <div className="flex-1 min-w-0 flex flex-col bg-surface overflow-hidden">

          {/* chat-head */}
          <div data-tour="chat-head" className="flex items-center justify-between gap-4 px-6 py-4 border-b border-ink-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* AI avatar with status dot */}
              <div className="relative w-10 h-10 rounded-lg flex-shrink-0 inline-flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                <Sparkles className="w-5 h-5 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                  style={{ background: 'var(--success-500, #22C55E)' }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink-900">ИИ-учитель</h2>
                <div className="text-[12px] text-ink-500 mt-px">Помогает разобраться в материале — спрашивай что угодно</div>
              </div>
            </div>

            {/* ⋯ menu */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowMenu(v => !v)}
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-ink-200 bg-surface text-ink-600 hover:bg-ink-50 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-ink-200 rounded-lg shadow-md py-1 min-w-[160px]">
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); startNew() }}
                      className="w-full text-left px-4 py-2 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                      Очистить чат (новый)
                    </button>
                    {activeId && (
                      <button
                        type="button"
                        onClick={() => { setShowMenu(false); deleteChatById(activeId) }}
                        className="w-full text-left px-4 py-2 text-[13px] text-danger-500 hover:bg-danger-50 transition-colors"
                      >
                        Удалить чат
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* chat-body */}
          <div data-tour="chat-body" ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-6 max-md:px-4"
            style={{ background: 'var(--ink-50, #F8F9FA)' }}>

            {isEmptyChat ? (
              /* Empty state */
              <div className="max-w-[680px] mx-auto h-full flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-2xl mb-5 inline-flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="font-display text-[22px] font-bold text-ink-900 mb-1">Чем могу помочь?</h3>
                <p className="text-[14px] text-ink-500 mb-8 text-center max-w-md">
                  Задай любой вопрос — объясню на пальцах, решу пошагово, проверю решение.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-md:grid-cols-1">
                  {EXAMPLE_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="p-4 bg-white border border-ink-200 rounded-lg text-left text-[13px] text-ink-700 font-medium hover:border-brand-300 hover:bg-brand-50 transition-all shadow-sm"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-[760px] mx-auto flex flex-col gap-6">
                {activeChat!.messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    userInitials={initials}
                    copied={copiedId === msg.id}
                    onCopy={() => copyMessage(msg.content, msg.id)}
                    onRegenerate={() => regenerate(msg.id)}
                    onThumbsUp={() => toast.success('Спасибо за оценку!')}
                    onThumbsDown={() => toast.success('Учтём ваш отзыв')}
                  />
                ))}

                {/* Typing indicator */}
                {isSending && (
                  <div className="flex gap-3.5" style={{ animation: 'msgIn 0.3s ease' }}>
                    <div className="w-8 h-8 rounded-full flex-shrink-0 inline-flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-white border border-ink-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full bg-ink-400 animate-bounce" />
                        <span className="w-2 h-2 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-2 h-2 rounded-full bg-ink-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-ink-200 bg-surface px-6 pt-4 pb-5 max-md:px-3 flex-shrink-0">

            {/* quick-prompts */}
            <div data-tour="quick-prompts" className="flex flex-wrap gap-1.5 mb-3 max-w-[760px] mx-auto">
              {QUICK_PROMPTS.map(qp => {
                const Icon = qp.icon
                return (
                  <button
                    key={qp.tpl}
                    type="button"
                    onClick={() => {
                      setInput(qp.tpl)
                      resizeTextarea()
                      setTimeout(() => {
                        textareaRef.current?.focus()
                        const ta = textareaRef.current
                        if (ta) ta.selectionStart = ta.selectionEnd = ta.value.length
                      }, 0)
                    }}
                    className="h-[30px] px-3 bg-ink-50 border border-ink-200 text-ink-700 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-all"
                  >
                    <Icon className="w-3 h-3" />
                    {qp.label}
                  </button>
                )
              })}
            </div>

            {/* composer-input */}
            <div data-tour="composer" className="max-w-[760px] mx-auto bg-white border border-ink-300 rounded-xl p-1 flex items-end gap-2 shadow-sm focus-within:border-brand-400 focus-within:ring-[3px] focus-within:ring-brand-400/10 transition-all">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".txt,.md,.csv,.json,.html" />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); resizeTextarea() }}
                onKeyDown={handleKey}
                placeholder="Спроси что угодно — про задание, тему или формулу…"
                rows={1}
                style={{ minHeight: 40, maxHeight: 144, resize: 'none' }}
                className="flex-1 px-3 py-2.5 text-[14px] text-ink-900 bg-transparent border-none outline-none placeholder:text-ink-400"
              />
              <div className="flex items-center gap-1 p-1 flex-shrink-0">
                <button
                  type="button"
                  title="Прикрепить файл"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                >
                  <Paperclip className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  title={isListening ? 'Остановить запись' : 'Голосовой ввод'}
                  onClick={handleVoiceInput}
                  className={cn(
                    'w-9 h-9 inline-flex items-center justify-center rounded-md transition-colors',
                    isListening ? 'bg-danger-50 text-danger-700 animate-pulse' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  <Mic className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  title="Отправить"
                  disabled={!input.trim() || isSending}
                  onClick={() => sendMessage()}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  style={{ background: 'linear-gradient(135deg, var(--brand-500), var(--brand-600))' }}
                >
                  <ArrowUp className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>

            {/* composer-hint */}
            <div className="max-w-[760px] mx-auto mt-2 text-center text-[11px] text-ink-400">
              <kbd className="bg-ink-100 rounded px-1 py-0.5 font-mono text-[10px] text-ink-600">Enter</kbd>
              {' '}— отправить ·{' '}
              <kbd className="bg-ink-100 rounded px-1 py-0.5 font-mono text-[10px] text-ink-600">Shift+Enter</kbd>
              {' '}— перенос строки
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage
  userInitials: string
  copied: boolean
  onCopy: () => void
  onRegenerate: () => void
  onThumbsUp: () => void
  onThumbsDown: () => void
}

function MessageBubble({ msg, userInitials, copied, onCopy, onRegenerate, onThumbsUp, onThumbsDown }: MessageBubbleProps) {
  const isUser = msg.role === 'user'
  const time = formatTime(msg.createdAt)

  if (isUser) {
    return (
      <div className="flex flex-row-reverse gap-3.5" style={{ animation: 'msgIn 0.3s ease' }}>
        {/* User avatar */}
        <div className="w-8 h-8 rounded-full flex-shrink-0 inline-flex items-center justify-center text-[12px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}>
          {userInitials.slice(0, 2)}
        </div>
        <div>
          <div className="max-w-[80%] px-[18px] py-3.5 text-[14px] text-white leading-relaxed rounded-2xl rounded-br-sm"
            style={{ background: 'linear-gradient(135deg, var(--brand-500), var(--brand-600))' }}>
            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
          </div>
          <div className="text-[11px] text-ink-400 mt-1.5 text-right">{time}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3.5" style={{ animation: 'msgIn 0.3s ease' }}>
      {/* AI avatar */}
      <div className="w-8 h-8 rounded-full flex-shrink-0 inline-flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {/* Bubble */}
        <div
          className="max-w-[80%] px-[18px] py-3.5 bg-white border border-ink-200 rounded-2xl rounded-tl-sm text-[14px] text-ink-800 leading-relaxed shadow-sm"
          style={{ wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
        />
        {/* msg-actions */}
        <div className="flex items-center gap-1.5 mt-2">
          <button
            type="button"
            onClick={onCopy}
            className="h-7 px-2.5 border border-ink-200 bg-white text-ink-600 rounded text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-ink-50 hover:text-ink-900 hover:border-ink-300 transition-all"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            Копировать
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="h-7 px-2.5 border border-ink-200 bg-white text-ink-600 rounded text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-ink-50 hover:text-ink-900 hover:border-ink-300 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Перегенерировать
          </button>
          <button
            type="button"
            onClick={onThumbsUp}
            className="h-7 w-7 border border-ink-200 bg-white text-ink-600 rounded inline-flex items-center justify-center hover:bg-ink-50 hover:text-ink-900 transition-all"
            aria-label="Нравится"
          >
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onThumbsDown}
            className="h-7 w-7 border border-ink-200 bg-white text-ink-600 rounded inline-flex items-center justify-center hover:bg-ink-50 hover:text-ink-900 transition-all"
            aria-label="Не нравится"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
        </div>
        {/* meta */}
        <div className="text-[11px] text-ink-400 mt-1.5">
          {time}{msg.model ? ` · ${msg.model}` : ''}
        </div>
      </div>
    </div>
  )
}
