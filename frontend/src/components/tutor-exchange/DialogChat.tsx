'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Loader2, Send } from 'lucide-react'
import type { DialogDetails, DialogMessage } from '@/hooks/tutor-exchange/useDialog'
import { SystemMessage } from './SystemMessage'

interface Props {
    dialog: DialogDetails
    meId?: string
    canWrite: boolean
    onSent: () => void
}

export function DialogChat({ dialog, meId, canWrite, onSent }: Props) {
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
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

    return (
        <div className="flex flex-col h-[60vh] min-h-[400px] border border-gray-200 rounded-2xl bg-white overflow-hidden">
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2">
                {dialog.messages.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-6">Пока нет сообщений</div>
                )}
                {dialog.messages.map((m) => (
                    <MessageBubble key={m.id} m={m} meId={meId} />
                ))}
            </div>
            {canWrite ? (
                <form onSubmit={handleSend} className="border-t border-gray-200 p-3 flex gap-2 items-end bg-gray-50">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={2}
                        placeholder="Сообщение..."
                        className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={sending}
                    />
                    <button
                        type="submit"
                        disabled={!text.trim() || sending}
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-40"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {sending ? 'Отправка' : 'Отправить'}
                    </button>
                </form>
            ) : (
                <div className="border-t border-gray-200 p-3 text-xs text-gray-500 bg-gray-50 text-center">
                    Диалог закрыт — писать нельзя
                </div>
            )}
            {error && <div className="text-xs text-red-600 px-3 pb-2">{error}</div>}
        </div>
    )
}

function MessageBubble({ m, meId }: { m: DialogMessage; meId?: string }) {
    if (m.isSystem) return <SystemMessage text={m.content} />
    const mine = m.senderId === meId
    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
            >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                {m.flagged && (
                    <div className={`text-[10px] mt-1 ${mine ? 'text-blue-100' : 'text-amber-700'}`}>
                        помечено модерацией
                    </div>
                )}
            </div>
        </div>
    )
}
