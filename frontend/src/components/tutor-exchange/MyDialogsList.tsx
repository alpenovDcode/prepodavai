'use client'

import Link from 'next/link'
import { MessageSquare, Loader2, AlertCircle } from 'lucide-react'
import { useMyDialogs, DialogListItem } from '@/hooks/tutor-exchange/useMyDialogs'
import { useUser } from '@/lib/hooks/useUser'

const STATUS_LABEL: Record<DialogListItem['status'], string> = {
    OPEN: 'Открыт',
    TRIAL_PENDING: 'Пробный урок',
    PAYMENT_PENDING: 'Оплата',
    CONFIRMED: 'Закрыт (успех)',
    CANCELLED: 'Отменён',
    DISPUTED: 'Спор',
}

const STATUS_COLOR: Record<DialogListItem['status'], string> = {
    OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
    TRIAL_PENDING: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    PAYMENT_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
    DISPUTED: 'bg-red-50 text-red-700 border-red-200',
}

const counterpartName = (d: DialogListItem, meId?: string) => {
    const counterpart = meId === d.responderId ? d.lead.creator : d.responder
    return [counterpart.firstName, counterpart.lastName].filter(Boolean).join(' ').trim() || 'Пользователь'
}

export function MyDialogsList() {
    const { dialogs, isLoading, error, disabled, disabledMessage } = useMyDialogs()
    const { user } = useUser()

    if (disabled) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 text-base text-amber-800 flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    {disabledMessage || 'Биржа временно недоступна'}
                </div>
            </div>
        )
    }
    if (isLoading) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto text-base text-gray-500 flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Загружаем диалоги...
            </div>
        )
    }
    if (error) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <div className="border border-red-200 bg-red-50 rounded-2xl p-5 text-base text-red-800">{error}</div>
            </div>
        )
    }
    if (!dialogs.length) {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Мои диалоги</h1>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center bg-white">
                    <div className="inline-flex w-16 h-16 rounded-2xl bg-blue-50 items-center justify-center mb-4">
                        <MessageSquare className="w-8 h-8 text-blue-500" />
                    </div>
                    <p className="text-lg text-gray-900 font-semibold mb-2">У вас пока нет диалогов</p>
                    <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                        Диалог появится когда вы откликнетесь на чужую заявку в ленте, или когда кто-то откликнется на вашу.
                    </p>
                    <Link
                        href="/dashboard/leads"
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold px-5 py-3 rounded-xl"
                    >
                        Найти заявку в ленте →
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto">
            <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
                <h1 className="text-3xl font-bold text-gray-900">Мои диалоги</h1>
                <Link href="/dashboard/leads" className="text-sm text-blue-600 hover:underline">
                    К ленте заявок →
                </Link>
            </div>
            <ul className="space-y-3">
                {dialogs.map((d) => (
                    <li key={d.id}>
                        <Link
                            href={`/dashboard/dialogs/${d.id}`}
                            className="block border border-gray-200 rounded-2xl p-5 bg-white hover:border-blue-300 hover:shadow-md transition-all"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-base font-bold text-gray-900 break-words">{d.lead.subject}</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {d.lead.grade} · с {counterpartName(d, user?.id)}
                                    </div>
                                </div>
                                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_COLOR[d.status]}`}>
                                    {STATUS_LABEL[d.status]}
                                </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-3">
                                Создан {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}
