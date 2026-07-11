'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { useAdminViolations, AdminViolation } from '@/hooks/tutor-exchange/useAdminViolations'
import { Loader2, AlertOctagon, CheckCircle2, XCircle, Snowflake, Undo2 } from 'lucide-react'
import { DisputeResolver, type Resolution } from '@/components/tutor-exchange/DisputeResolver'

const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Ожидает',
    RESOLVED: 'Удовлетворена',
    DISMISSED: 'Отклонена',
}

const nameOf = (u: { firstName?: string | null; lastName?: string | null } | null | undefined, fallback = 'Пользователь') =>
    [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || fallback

export default function AdminViolationsPage() {
    const [status, setStatus] = useState<string>('PENDING')
    const { items, isLoading, error, reload } = useAdminViolations(status)
    const [busyId, setBusyId] = useState<string | null>(null)

    const patch = async (v: AdminViolation, next: 'RESOLVED' | 'DISMISSED') => {
        setBusyId(v.id)
        try {
            await apiClient.patch(`/admin/tutor-exchange/violations/${v.id}`, { status: next })
            reload()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось обновить жалобу')
        } finally {
            setBusyId(null)
        }
    }

    const resolveDispute = async (
        dialogId: string,
        resolution: Resolution,
        note: string,
        freezeResponder: boolean,
    ) => {
        await apiClient.post(`/admin/tutor-exchange/dialogs/${dialogId}/resolve`, {
            resolution,
            note,
            freezeResponder,
        })
        reload()
    }

    const unfreeze = async (userId: string) => {
        if (!confirm('Разморозить репетитора? Он снова сможет откликаться и размещать заявки.')) return
        try {
            await apiClient.post(`/admin/tutor-exchange/tutors/${userId}/unfreeze`, {})
            reload()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось разморозить')
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-gray-900">Жалобы на бирже</h1>
                <Link href="/check/prrv/admin/tools" className="text-sm text-gray-500 hover:text-gray-800">
                    К инструментам
                </Link>
            </div>

            <div className="flex gap-2 mb-4">
                {['PENDING', 'RESOLVED', 'DISMISSED', ''].map((s) => (
                    <button
                        key={s || 'ALL'}
                        onClick={() => setStatus(s)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                            status === s
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {s === '' ? 'Все' : STATUS_LABEL[s]}
                    </button>
                ))}
            </div>

            {isLoading && (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Загружаем...
                </div>
            )}
            {error && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">{error}</div>
            )}
            {!isLoading && !error && items.length === 0 && (
                <div className="border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
                    Жалоб нет
                </div>
            )}

            <div className="space-y-2">
                {items.map((v) => (
                    <div key={v.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">
                                    {v.dialog.lead.subject}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <span>Заказчик — {nameOf(v.dialog.lead.creator)}, репетитор — {nameOf(v.dialog.responder)}</span>
                                    {v.dialog.responder.marketProfile?.disabledAt && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-1.5 py-0.5">
                                            <Snowflake className="w-3 h-3" /> заморожен
                                            <button
                                                onClick={() => unfreeze(v.dialog.responder.id)}
                                                className="ml-1 inline-flex items-center gap-0.5 text-sky-700 hover:text-sky-900 underline"
                                            >
                                                <Undo2 className="w-3 h-3" /> разморозить
                                            </button>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span
                                className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                                    v.status === 'PENDING'
                                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                                        : v.status === 'RESOLVED'
                                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                            : 'text-gray-500 bg-gray-100 border-gray-200'
                                }`}
                            >
                                {STATUS_LABEL[v.status]}
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                            От {nameOf(v.reporter)} ({v.reporter?.email || '—'}) · {new Date(v.createdAt).toLocaleString('ru-RU')}
                        </div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 mb-3">
                            {v.description}
                        </div>
                        <div className="flex gap-2 items-center">
                            <Link
                                href={`/dashboard/dialogs/${v.dialogId}`}
                                className="text-xs text-blue-600 hover:underline"
                            >
                                Открыть диалог →
                            </Link>
                            <div className="flex-1" />
                            {v.status === 'PENDING' && (
                                <>
                                    <button
                                        onClick={() => patch(v, 'DISMISSED')}
                                        disabled={busyId === v.id}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                                    >
                                        <XCircle className="w-3.5 h-3.5" /> Отклонить
                                    </button>
                                    <button
                                        onClick={() => patch(v, 'RESOLVED')}
                                        disabled={busyId === v.id}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                                    >
                                        <AlertOctagon className="w-3.5 h-3.5" /> Удовлетворить
                                    </button>
                                </>
                            )}
                            {v.status === 'RESOLVED' && (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Обработана
                                </span>
                            )}
                        </div>

                        {v.dialog.status === 'DISPUTED' && (
                            <DisputeResolver
                                onResolve={(resolution, note, freeze) =>
                                    resolveDispute(v.dialogId, resolution, note, freeze)
                                }
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
