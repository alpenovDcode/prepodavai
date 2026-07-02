'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, AlertCircle, User, XCircle, CheckCircle2, Lock } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { useUser } from '@/lib/hooks/useUser'
import { useDialog } from '@/hooks/tutor-exchange/useDialog'
import { DialogChat } from './DialogChat'

const STATUS_LABEL: Record<string, string> = {
    OPEN: 'Открыт',
    TRIAL_PENDING: 'Пробный урок',
    PAYMENT_PENDING: 'Оплата комиссии',
    CONFIRMED: 'Сделка закрыта',
    CANCELLED: 'Отменён',
    DISPUTED: 'Открыт спор',
}

const ACTIVE_STATUSES = ['OPEN', 'TRIAL_PENDING', 'PAYMENT_PENDING']

const counterpart = (dialog: any, meId?: string) => {
    const c = meId === dialog.responderId ? dialog.lead.creator : dialog.responder
    return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Пользователь'
}

export function DialogRoom({ dialogId }: { dialogId: string }) {
    const router = useRouter()
    const { user } = useUser()
    const { dialog, isLoading, error, disabled, disabledMessage, reload } = useDialog(dialogId)
    const [cancelling, setCancelling] = useState(false)

    if (disabled) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <Link href="/dashboard/dialogs" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К диалогам
                </Link>
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {disabledMessage || 'Биржа временно недоступна'}
                </div>
            </div>
        )
    }
    if (error) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <Link href="/dashboard/dialogs" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К диалогам
                </Link>
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">{error}</div>
            </div>
        )
    }
    if (isLoading || !dialog) {
        return (
            <div className="p-6 max-w-4xl mx-auto text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем диалог...
            </div>
        )
    }

    const isCreator = user?.id === dialog.lead.creatorId
    const isResponder = user?.id === dialog.responderId
    const isParticipant = isCreator || isResponder
    const canWrite = isParticipant && ACTIVE_STATUSES.includes(dialog.status)
    const canCancel = isParticipant && ACTIVE_STATUSES.includes(dialog.status)

    const cancelDialog = async () => {
        if (!confirm('Отменить диалог? Заявка снова станет доступна в ленте.')) return
        setCancelling(true)
        try {
            await apiClient.post(`/tutor-exchange/dialogs/${dialog.id}/actions`, { action: 'cancel' })
            router.push('/dashboard/dialogs')
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось отменить диалог')
            setCancelling(false)
        }
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <Link
                href="/dashboard/dialogs"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
            >
                <ArrowLeft className="w-4 h-4" /> К диалогам
            </Link>

            <div className="grid grid-cols-1 md:grid-cols-[1fr,280px] gap-4">
                <div>
                    <div className="mb-3">
                        <h1 className="text-xl font-bold text-gray-900">{dialog.lead.subject}</h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {dialog.lead.grade} · с{' '}
                            <span className="inline-flex items-center gap-1">
                                <User className="w-3 h-3" /> {counterpart(dialog, user?.id)}
                            </span>
                        </p>
                    </div>
                    <DialogChat dialog={dialog} meId={user?.id} canWrite={canWrite} onSent={reload} />
                </div>

                <aside className="space-y-4">
                    <section className="border border-gray-200 rounded-2xl p-4 bg-white">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Статус
                        </div>
                        <div className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                            {dialog.status === 'CONFIRMED' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : dialog.status === 'CANCELLED' ? (
                                <XCircle className="w-4 h-4 text-gray-400" />
                            ) : (
                                <Loader2 className="w-4 h-4 text-blue-500" />
                            )}
                            {STATUS_LABEL[dialog.status] || dialog.status}
                        </div>
                    </section>

                    <section className="border border-gray-200 rounded-2xl p-4 bg-white">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Контакт ученика
                        </div>
                        {dialog.lead.studentContact ? (
                            <div className="text-sm font-semibold text-emerald-900">{dialog.lead.studentContact}</div>
                        ) : (
                            <div className="text-xs text-gray-500 flex items-start gap-1">
                                <Lock className="w-3.5 h-3.5 mt-0.5" />
                                Откроется после закрытия сделки.
                            </div>
                        )}
                    </section>

                    <section className="border border-gray-200 rounded-2xl p-4 bg-white">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Действия
                        </div>
                        <div className="text-[11px] text-gray-400 mb-3">
                            Полная state-machine (пробный урок, оплата, спор) — этап 4.
                        </div>
                        {canCancel && (
                            <button
                                onClick={cancelDialog}
                                disabled={cancelling}
                                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50"
                            >
                                <XCircle className="w-4 h-4" />
                                {cancelling ? 'Отменяем...' : 'Отменить диалог'}
                            </button>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    )
}
