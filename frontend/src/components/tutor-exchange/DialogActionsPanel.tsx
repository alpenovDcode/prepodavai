'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import {
    XCircle,
    CalendarClock,
    CheckCircle2,
    ThumbsDown,
    Send,
    ShieldCheck,
    AlertTriangle,
    Star,
} from 'lucide-react'
import type { DialogDetails } from '@/hooks/tutor-exchange/useDialog'
import { RatingForm } from './RatingForm'

type Action =
    | 'schedule_trial'
    | 'trial_success'
    | 'trial_fail'
    | 'payment_sent'
    | 'confirm_payment'
    | 'dispute'
    | 'cancel'

interface Props {
    dialog: DialogDetails
    meId?: string
    onDone: () => void
    onReport: () => void
}

export function DialogActionsPanel({ dialog, meId, onDone, onReport }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState<Action | null>(null)
    const [showTrialModal, setShowTrialModal] = useState(false)
    const [trialLink, setTrialLink] = useState('')
    const [showRatingForm, setShowRatingForm] = useState(false)
    const [ratingSubmitted, setRatingSubmitted] = useState(false)

    const isCreator = meId === dialog.lead.creatorId
    const isResponder = meId === dialog.responderId
    const status = dialog.status
    const paymentSent = !!dialog.paymentDeadline && !!(dialog as any).paymentSentAt

    const run = async (action: Action, payload?: any) => {
        setBusy(action)
        try {
            await apiClient.post(`/tutor-exchange/dialogs/${dialog.id}/actions`, {
                action,
                ...(payload || {}),
            })
            if (action === 'trial_fail' || action === 'cancel') {
                router.push('/dashboard/dialogs')
            } else {
                onDone()
            }
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось выполнить действие')
        } finally {
            setBusy(null)
        }
    }

    const submitTrial = async () => {
        setShowTrialModal(false)
        await run('schedule_trial', { trialLessonLink: trialLink.trim() || undefined })
        setTrialLink('')
    }

    const buttons: React.ReactNode[] = []

    if (status === 'OPEN' && isCreator) {
        buttons.push(
            <ActionButton
                key="schedule"
                onClick={() => setShowTrialModal(true)}
                busy={busy === 'schedule_trial'}
                icon={<CalendarClock className="w-4 h-4" />}
                label="Назначить пробный урок"
                tone="primary"
            />,
        )
    }

    if (status === 'TRIAL_PENDING' && isResponder) {
        buttons.push(
            <ActionButton
                key="ok"
                onClick={() => run('trial_success')}
                busy={busy === 'trial_success'}
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Пробный прошёл успешно"
                tone="primary"
            />,
            <ActionButton
                key="fail"
                onClick={() => confirm('Отметить пробный как неудачный? Заявка вернётся в ленту.') && run('trial_fail')}
                busy={busy === 'trial_fail'}
                icon={<ThumbsDown className="w-4 h-4" />}
                label="Пробный не удался"
                tone="danger"
            />,
        )
    }

    if (status === 'PAYMENT_PENDING' && isResponder) {
        buttons.push(
            <ActionButton
                key="sent"
                onClick={() => run('payment_sent')}
                busy={busy === 'payment_sent'}
                icon={<Send className="w-4 h-4" />}
                label={paymentSent ? 'Оплата отмечена' : 'Я отправил оплату'}
                tone="primary"
                disabled={paymentSent}
            />,
        )
    }

    if (status === 'PAYMENT_PENDING' && isCreator) {
        buttons.push(
            <ActionButton
                key="confirm"
                onClick={() => run('confirm_payment')}
                busy={busy === 'confirm_payment'}
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Подтвердить получение оплаты"
                tone="primary"
                disabled={!paymentSent}
                hint={!paymentSent ? 'Дождитесь отметки об отправке от репетитора' : undefined}
            />,
        )
    }

    if (['TRIAL_PENDING', 'PAYMENT_PENDING'].includes(status)) {
        buttons.push(
            <ActionButton
                key="dispute"
                onClick={() => confirm('Открыть спор? Диалог перейдёт в статус "спор" и попадёт к админам.') && run('dispute')}
                busy={busy === 'dispute'}
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Открыть спор"
                tone="warn"
            />,
        )
    }

    if (['OPEN', 'TRIAL_PENDING'].includes(status)) {
        buttons.push(
            <ActionButton
                key="cancel"
                onClick={() => confirm('Отменить диалог? Заявка снова станет доступна в ленте.') && run('cancel')}
                busy={busy === 'cancel'}
                icon={<XCircle className="w-4 h-4" />}
                label="Отменить диалог"
                tone="ghost"
            />,
        )
    }

    if (['TRIAL_PENDING', 'PAYMENT_PENDING', 'DISPUTED'].includes(status)) {
        buttons.push(
            <button
                key="report"
                onClick={onReport}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs text-gray-600 hover:text-red-700 hover:bg-red-50 border border-gray-200 rounded-lg"
            >
                Сообщить о нарушении
            </button>,
        )
    }

    if (status === 'CONFIRMED' && (isCreator || isResponder)) {
        buttons.push(
            <ActionButton
                key="rate"
                onClick={() => setShowRatingForm(true)}
                busy={false}
                icon={<Star className="w-4 h-4" />}
                label={ratingSubmitted ? 'Оценка отправлена' : 'Оценить сделку'}
                tone="primary"
                disabled={ratingSubmitted}
            />,
        )
    }

    const counterpartLabel = () => {
        const c = isCreator ? dialog.responder : dialog.lead.creator
        return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'участника'
    }

    return (
        <section className="border border-gray-200 rounded-2xl p-4 bg-white space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Действия
            </div>
            {buttons.length === 0 && (
                <div className="text-[11px] text-gray-400">
                    На текущем этапе доступных действий нет.
                </div>
            )}
            {buttons}

            {showRatingForm && (
                <RatingForm
                    dialogId={dialog.id}
                    counterpartName={counterpartLabel()}
                    onClose={() => setShowRatingForm(false)}
                    onDone={() => setRatingSubmitted(true)}
                />
            )}

            {showTrialModal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTrialModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="text-sm font-semibold text-gray-900 mb-3">Назначить пробный урок</div>
                        <label className="text-xs text-gray-600 mb-1 block">Ссылка на встречу (Zoom / Google Meet)</label>
                        <input
                            type="url"
                            value={trialLink}
                            onChange={(e) => setTrialLink(e.target.value)}
                            placeholder="https://zoom.us/j/..."
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowTrialModal(false)}
                                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={submitTrial}
                                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                            >
                                Назначить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

function ActionButton({
    onClick,
    busy,
    icon,
    label,
    tone,
    disabled,
    hint,
}: {
    onClick: () => void
    busy: boolean
    icon: React.ReactNode
    label: string
    tone: 'primary' | 'danger' | 'warn' | 'ghost'
    disabled?: boolean
    hint?: string
}) {
    const cls = {
        primary: 'text-white bg-blue-600 hover:bg-blue-700',
        danger: 'text-red-700 border border-red-200 bg-red-50 hover:bg-red-100',
        warn: 'text-amber-800 border border-amber-200 bg-amber-50 hover:bg-amber-100',
        ghost: 'text-gray-600 border border-gray-200 bg-white hover:bg-gray-50',
    }[tone]
    return (
        <div>
            <button
                onClick={onClick}
                disabled={busy || disabled}
                className={`w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
            >
                {icon}
                {busy ? 'Обрабатываем...' : label}
            </button>
            {hint && <div className="text-[11px] text-gray-400 mt-1">{hint}</div>}
        </div>
    )
}
