'use client'

import { useState } from 'react'
import { Loader2, Scale, Snowflake } from 'lucide-react'

export type Resolution = 'DEAL_CONFIRMED' | 'RETURNED_TO_FEED' | 'CANCELLED'

export const RESOLUTION_LABEL: Record<Resolution, string> = {
    DEAL_CONFIRMED: 'Засчитать сделку',
    RETURNED_TO_FEED: 'Вернуть заявку в ленту',
    CANCELLED: 'Закрыть без возврата',
}

/**
 * Блок разрешения спора: три исхода + обязательный комментарий модератора
 * + опция заморозки репетитора. Используется и на странице «Споры», и на
 * странице «Жалобы» (для жалоб на спорные диалоги).
 */
export function DisputeResolver({
    onResolve,
}: {
    onResolve: (resolution: Resolution, note: string, freeze: boolean) => Promise<void>
}) {
    const [resolution, setResolution] = useState<Resolution>('DEAL_CONFIRMED')
    const [note, setNote] = useState('')
    const [freeze, setFreeze] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        if (note.trim().length < 5) {
            setError('Опишите решение — минимум 5 символов.')
            return
        }
        setBusy(true)
        setError(null)
        try {
            await onResolve(resolution, note.trim(), freeze)
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось разрешить спор')
            setBusy(false)
        }
    }

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                <Scale className="w-3.5 h-3.5" /> Разрешить спор
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
                {(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((r) => (
                    <label
                        key={r}
                        className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer ${
                            resolution === r
                                ? 'border-blue-400 bg-blue-50 text-blue-900'
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                        }`}
                    >
                        <input
                            type="radio"
                            name={`resolution-${r}`}
                            checked={resolution === r}
                            onChange={() => setResolution(r)}
                            className="text-blue-600 focus:ring-blue-500"
                        />
                        {RESOLUTION_LABEL[r]}
                    </label>
                ))}
            </div>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Комментарий модератора: что решили и почему (обязательно)"
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={freeze}
                    onChange={(e) => setFreeze(e.target.checked)}
                    className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <Snowflake className="w-3.5 h-3.5 text-sky-600" />
                Заморозить репетитора (запретить отклики и размещение заявок)
            </label>
            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
            <button
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                Разрешить спор
            </button>
        </div>
    )
}
