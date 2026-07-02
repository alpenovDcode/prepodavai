'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Loader2 } from 'lucide-react'
import { StarRating } from './StarRating'

export function RatingForm({
    dialogId,
    counterpartName,
    onClose,
    onDone,
}: {
    dialogId: string
    counterpartName: string
    onClose: () => void
    onDone: () => void
}) {
    const [score, setScore] = useState(5)
    const [comment, setComment] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        setBusy(true)
        setError(null)
        try {
            await apiClient.post(`/tutor-exchange/dialogs/${dialogId}/ratings`, {
                score,
                comment: comment.trim() || undefined,
            })
            onDone()
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось сохранить оценку')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <div className="text-sm font-semibold text-gray-900 mb-1">
                    Оценить сделку с {counterpartName}
                </div>
                <p className="text-xs text-gray-500 mb-4">
                    Оценка появится на публичном профиле репетитора. Оценить можно один раз.
                </p>

                <div className="mb-4 flex items-center gap-3">
                    <StarRating value={score} onChange={setScore} size="lg" />
                    <span className="text-sm text-gray-700 font-semibold">{score} / 5</span>
                </div>

                <label className="text-xs text-gray-600 mb-1 block">Комментарий (необязательно)</label>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="Что понравилось / что можно улучшить"
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
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
                    >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        Отправить оценку
                    </button>
                </div>
            </div>
        </div>
    )
}
