'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Loader2, Send, MessageCircle } from 'lucide-react'
import type { DialogDetails, DialogMessage } from '@/hooks/tutor-exchange/useDialog'
import { SystemMessage } from './SystemMessage'

interface Props {
    dialog: DialogDetails
    meId?: string
    canWrite: boolean
    onSent: () => void
}

const timeShort = (iso: string) =>
    new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function DialogChat({ dialog, meId, canWrite, onSent }: Props) {
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }, [dialog.messages.length])

    const handleSend = async (e: FormEvent) => {
        e.preventDefault()
        const trimmed = text.trim()
        if (!trimmed || sending) return
        setSending(true)
        setError(null)
        try {
            await apiClient.post(`/tutor-exchange/dialogs/${dialog.id}/messages`, { content: trimmed })
            setText('')
            onSent()
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось отправить сообщение')
        } finally {
            setSending(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            const form = e.currentTarget.form
            form?.requestSubmit()
        }
    }

    return (
        <div className="flex flex-col h-[60vh] min-h-[420px] md:h-[calc(100vh-260px)] rounded-2xl border border-ink-200 bg-surface overflow-hidden shadow-xs">
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-3"
                style={{ background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-soft) 100%)' }}
            >
                {dialog.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 text-brand-500 items-center justify-center mb-3">
                            <MessageCircle className="w-7 h-7" />
                        </div>
                        <p className="font-display text-base font-bold text-ink-900 mb-1">Начните разговор</p>
                        <p className="text-sm text-ink-500 max-w-xs leading-relaxed">
                            Обсудите ученика, договоритесь о времени и назначьте пробный урок.
                        </p>
                    </div>
                ) : (
                    dialog.messages.map((m, idx) => {
                        const prev = dialog.messages[idx - 1]
                        const groupTop = !prev || prev.senderId !== m.senderId || prev.isSystem !== m.isSystem
                        return <MessageBubble key={m.id} m={m} meId={meId} groupTop={groupTop} />
                    })
                )}
            </div>

            {canWrite ? (
                <form
                    onSubmit={handleSend}
                    className="border-t border-ink-200 bg-surface p-3 md:p-4 flex gap-2 items-end"
                >
                    <div className="flex-1 relative">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            placeholder="Написать сообщение..."
                            className="w-full resize-none rounded-xl border border-ink-200 bg-surface px-4 py-3 text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 transition-all duration-fast max-h-40"
                            disabled={sending}
                            style={{ minHeight: 44 }}
                        />
                        {text.length > 0 && (
                            <div className="pointer-events-none absolute right-3 bottom-2 text-[10px] text-ink-400 tabular-nums">
                                ⌘↵
                            </div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={!text.trim() || sending}
                        aria-label="Отправить"
                        className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:bg-ink-200 disabled:text-ink-400 shadow-brand-glow disabled:shadow-none transition-all duration-fast"
                    >
                        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </form>
            ) : (
                <div className="border-t border-ink-200 bg-ink-50 px-4 py-3 text-xs text-ink-500 text-center">
                    Диалог закрыт — писать больше нельзя
                </div>
            )}
            {error && (
                <div className="border-t border-danger-500/20 bg-danger-50 px-4 py-2 text-xs text-danger-700">{error}</div>
            )}
        </div>
    )
}

function MessageBubble({
    m,
    meId,
    groupTop,
}: {
    m: DialogMessage
    meId?: string
    groupTop: boolean
}) {
    if (m.isSystem) return <SystemMessage text={m.content} />
    const mine = m.senderId === meId
    return (
        <div
            className={`flex ${mine ? 'justify-end' : 'justify-start'} animate-msg-in`}
            style={{ marginTop: groupTop ? 6 : 2 }}
        >
            <div
                className={[
                    'max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed',
                    mine
                        ? 'bg-brand-500 text-white shadow-brand-glow'
                        : 'bg-ink-100 text-ink-900',
                    mine ? (groupTop ? 'rounded-tr-md' : 'rounded-tr-md') : (groupTop ? 'rounded-tl-md' : 'rounded-tl-md'),
                ].join(' ')}
            >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div
                    className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] tabular-nums ${
                        mine ? 'text-white/70' : 'text-ink-400'
                    }`}
                >
                    <span>{timeShort(m.createdAt)}</span>
                    {m.flagged && (
                        <span
                            title="Помечено модерацией"
                            className={mine ? 'text-warning-500' : 'text-warning-700'}
                        >
                            ⚑
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
