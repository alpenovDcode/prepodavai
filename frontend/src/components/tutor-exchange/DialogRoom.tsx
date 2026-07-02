'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    User,
    XCircle,
    CheckCircle2,
    Lock,
    ExternalLink,
} from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useDialog } from '@/hooks/tutor-exchange/useDialog'
import { DialogChat } from './DialogChat'
import { DialogActionsPanel } from './DialogActionsPanel'
import { PaymentCountdown } from './PaymentCountdown'
import { ViolationForm } from './ViolationForm'

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
    const { user } = useUser()
    const { dialog, isLoading, error, disabled, disabledMessage, reload } = useDialog(dialogId)
    const [reportOpen, setReportOpen] = useState(false)

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
                            <Link
                                href={`/dashboard/tutor/${user?.id === dialog.responderId ? dialog.lead.creatorId : dialog.responderId}`}
                                className="inline-flex items-center gap-1 hover:text-gray-800 hover:underline"
                            >
                                <User className="w-3 h-3" /> {counterpart(dialog, user?.id)}
                            </Link>
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

                        {dialog.status === 'TRIAL_PENDING' && dialog.trialLessonLink && (
                            <div className="mt-3 text-xs">
                                <div className="text-gray-500 mb-1">Ссылка на пробный:</div>
                                <a
                                    href={dialog.trialLessonLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline break-all"
                                >
                                    {dialog.trialLessonLink}
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        )}

                        {dialog.status === 'PAYMENT_PENDING' && dialog.paymentDeadline && (
                            <div className="mt-3 text-xs">
                                <div className="text-gray-500 mb-1">До оплаты:</div>
                                <PaymentCountdown deadline={dialog.paymentDeadline} />
                                {dialog.paymentSentAt && (
                                    <div className="text-emerald-700 mt-1">
                                        Оплата отмечена {new Date(dialog.paymentSentAt).toLocaleString('ru-RU')}
                                    </div>
                                )}
                            </div>
                        )}
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

                    {isParticipant && (
                        <DialogActionsPanel
                            dialog={dialog}
                            meId={user?.id}
                            onDone={reload}
                            onReport={() => setReportOpen(true)}
                        />
                    )}
                </aside>
            </div>

            {reportOpen && (
                <ViolationForm
                    dialogId={dialog.id}
                    onClose={() => setReportOpen(false)}
                    onDone={() => alert('Жалоба отправлена. Модератор рассмотрит в течение суток.')}
                />
            )}
        </div>
    )
}
