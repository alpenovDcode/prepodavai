'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Loader2 } from 'lucide-react'

export function ViolationForm({
    dialogId,
    onClose,
    onDone,
}: {
    dialogId: string
    onClose: () => void
    onDone: () => void
}) {
    const [text, setText] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const trimmed = text.trim()
        if (trimmed.length < 10) {
            setError('Опишите нарушение подробнее — минимум 10 символов.')
            return
        }
        setBusy(true)
        setError(null)
        try {
            await apiClient.post(`/tutor-exchange/dialogs/${dialogId}/violations`, {
                description: trimmed,
            })
            onDone()
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось отправить жалобу')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <div className="text-sm font-semibold text-gray-900 mb-2">Сообщить о нарушении</div>
                <p className="text-xs text-gray-500 mb-3">
                    Опишите ситуацию: что произошло, какие правила нарушены. Модератор рассмотрит в течение суток.
                </p>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    placeholder="Например: репетитор перестал выходить на связь после оплаты"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
                <div className="flex gap-2 justify-end mt-4">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={submit}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                    >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        Отправить жалобу
                    </button>
                </div>
            </div>
        </div>
    )
}
