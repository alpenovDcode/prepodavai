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
            <div className="p-6 max-w-3xl mx-auto">
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {disabledMessage || 'Биржа временно недоступна'}
                </div>
            </div>
        )
    }
    if (isLoading) {
        return (
            <div className="p-6 max-w-3xl mx-auto text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем диалоги...
            </div>
        )
    }
    if (error) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">{error}</div>
            </div>
        )
    }
    if (!dialogs.length) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <div className="border border-gray-200 rounded-2xl p-8 text-center text-gray-500">
                    <MessageSquare className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    У вас пока нет диалогов.
                    <br />
                    <Link href="/dashboard/leads" className="text-blue-600 hover:underline">
                        Найти заявку в ленте →
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Мои диалоги</h1>
            <ul className="space-y-2">
                {dialogs.map((d) => (
                    <li key={d.id}>
                        <Link
                            href={`/dashboard/dialogs/${d.id}`}
                            className="block border border-gray-200 rounded-xl p-4 bg-white hover:border-blue-300 hover:shadow-sm transition"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">{d.lead.subject}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {d.lead.grade} · с {counterpartName(d, user?.id)}
                                    </div>
                                </div>
                                <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${STATUS_COLOR[d.status]}`}>
                                    {STATUS_LABEL[d.status]}
                                </span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-2">
                                Создан {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}
