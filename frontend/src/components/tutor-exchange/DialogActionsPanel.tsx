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
    Video,
    Loader2,
    ShieldAlert,
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
                label="Пробный прошёл — беру"
                tone="primary"
            />,
            <ActionButton
                key="fail"
                onClick={() => confirm('Отметить пробный как неудачный? Заявка вернётся в ленту.') && run('trial_fail')}
                busy={busy === 'trial_fail'}
                icon={<ThumbsDown className="w-4 h-4" />}
                label="Пробный не подошёл"
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
                label="Подтвердить получение"
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
                onClick={() => confirm('Открыть спор? Диалог перейдёт в статус «спор» и попадёт к админам.') && run('dispute')}
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
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-ink-500 hover:text-danger-700 hover:bg-danger-50 border border-ink-200 hover:border-danger-500/30 rounded-lg transition-colors duration-fast"
            >
                <ShieldAlert className="w-3.5 h-3.5" />
                Сообщить о нарушении
            </button>,
        )
    }

    if (status === 'CONFIRMED' && (isCreator || isResponder)) {
        // hasRated приходит с сервера — кнопка неактивна сразу после
        // перезагрузки, если оценка уже стоит (без этого повторный клик
        // получал 409). ratingSubmitted покрывает оценку в этой же сессии.
        const alreadyRated = ratingSubmitted || !!dialog.hasRated
        buttons.push(
            <ActionButton
                key="rate"
                onClick={() => setShowRatingForm(true)}
                busy={false}
                icon={<Star className="w-4 h-4" />}
                label={alreadyRated ? 'Оценка отправлена' : 'Оценить сделку'}
                tone="primary"
                disabled={alreadyRated}
            />,
        )
    }

    const counterpartLabel = () => {
        const c = isCreator ? dialog.responder : dialog.lead.creator
        return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'участника'
    }

    return (
        <section data-tour="dialog-actions" className="rounded-2xl border border-ink-200 bg-surface p-4 shadow-xs">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-3">
                Действия
            </div>
            {buttons.length === 0 && (
                <div className="rounded-xl bg-ink-50 border border-ink-200 p-3 text-xs text-ink-500 text-center">
                    На текущем этапе доступных действий нет.
                </div>
            )}
            <div className="flex flex-col gap-2">{buttons}</div>

            {showRatingForm && (
                <RatingForm
                    dialogId={dialog.id}
                    counterpartName={counterpartLabel()}
                    onClose={() => setShowRatingForm(false)}
                    onDone={() => setRatingSubmitted(true)}
                />
            )}

            {showTrialModal && (
                <TrialModal
                    link={trialLink}
                    onChange={setTrialLink}
                    onCancel={() => setShowTrialModal(false)}
                    onSubmit={submitTrial}
                />
            )}
        </section>
    )
}

function TrialModal({
    link,
    onChange,
    onCancel,
    onSubmit,
}: {
    link: string
    onChange: (v: string) => void
    onCancel: () => void
    onSubmit: () => void
}) {
    return (
        <div
            className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={onCancel}
        >
            <div
                className="bg-surface rounded-2xl shadow-lg p-6 max-w-md w-full border border-ink-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-display text-base font-bold text-ink-900">Назначить пробный урок</h3>
                        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                            Отправьте ссылку на встречу — репетитор увидит её в диалоге.
                        </p>
                    </div>
                </div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-600 mb-2">
                    Ссылка на встречу (Zoom / Google Meet)
                </label>
                <input
                    type="url"
                    value={link}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    autoFocus
                    className="w-full rounded-xl border border-ink-200 bg-surface px-3.5 py-2.5 text-sm mb-5 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 transition-all duration-fast"
                />
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100 rounded-xl transition-colors duration-fast"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={onSubmit}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-brand-glow transition-colors duration-fast"
                    >
                        <CalendarClock className="w-4 h-4" /> Назначить
                    </button>
                </div>
            </div>
        </div>
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
        primary:
            'text-white bg-brand-500 hover:bg-brand-600 shadow-brand-glow disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none',
        danger:
            'text-danger-700 border border-danger-500/25 bg-danger-50 hover:bg-danger-500/10 hover:border-danger-500/40',
        warn:
            'text-warning-700 border border-warning-500/25 bg-warning-50 hover:bg-warning-500/10 hover:border-warning-500/40',
        ghost:
            'text-ink-700 border border-ink-200 bg-surface hover:bg-ink-100',
    }[tone]
    return (
        <div>
            <button
                onClick={onClick}
                disabled={busy || disabled}
                className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all duration-fast disabled:cursor-not-allowed ${cls}`}
            >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
                <span>{busy ? 'Обрабатываем...' : label}</span>
            </button>
            {hint && <div className="text-[11px] text-ink-400 mt-1.5 pl-1">{hint}</div>}
        </div>
    )
}
