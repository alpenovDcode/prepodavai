'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, User as UserIcon, Award, MessagesSquare } from 'lucide-react'
import { useTutorProfile } from '@/hooks/tutor-exchange/useTutorProfile'
import { StarRating } from './StarRating'

const nameOf = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

export function TutorProfile({ userId }: { userId: string }) {
    const { profile, isLoading, error } = useTutorProfile(userId)

    if (isLoading) {
        return (
            <div className="p-6 max-w-3xl mx-auto text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем профиль...
            </div>
        )
    }
    if (error || !profile) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">
                    {error || 'Профиль не найден'}
                </div>
            </div>
        )
    }

    const { user, marketProfile, recentRatings } = profile

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Link
                href="/dashboard/leads"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
            >
                <ArrowLeft className="w-4 h-4" /> К ленте
            </Link>

            <div className="border border-gray-200 rounded-2xl p-6 bg-white mb-4">
                <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
                        {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                            nameOf(user).slice(0, 1).toUpperCase()
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-gray-900">{nameOf(user)}</h1>
                        {user.subject && <p className="text-sm text-gray-500 mt-0.5">{user.subject}</p>}
                        {marketProfile && marketProfile.ratingCount > 0 ? (
                            <div className="flex items-center gap-2 mt-2">
                                <StarRating value={Math.round(marketProfile.ratingAvg)} readOnly size="sm" />
                                <span className="text-sm font-semibold text-gray-700">
                                    {marketProfile.ratingAvg.toFixed(1)}
                                </span>
                                <span className="text-xs text-gray-500">
                                    · {marketProfile.ratingCount} отзыв(ов)
                                </span>
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 mt-2">Пока нет отзывов</div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <Award className="w-3 h-3" /> Сделок
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                            {marketProfile?.dealsCompleted ?? 0}
                        </div>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                            <MessagesSquare className="w-3 h-3" /> Средний рейтинг
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                            {marketProfile?.ratingAvg ? marketProfile.ratingAvg.toFixed(1) : '—'}
                        </div>
                    </div>
                </div>
            </div>

            <h2 className="text-sm font-semibold text-gray-900 mb-2">Отзывы</h2>
            {recentRatings.length === 0 ? (
                <div className="text-xs text-gray-400 border border-gray-200 rounded-xl p-4">Отзывов пока нет</div>
            ) : (
                <div className="space-y-2">
                    {recentRatings.map((r) => (
                        <div key={r.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                            <div className="flex items-center justify-between gap-3 mb-1">
                                <div className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                                    <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                                    {nameOf(r.rater)}
                                </div>
                                <StarRating value={r.score} readOnly size="sm" />
                            </div>
                            {r.comment && (
                                <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{r.comment}</div>
                            )}
                            <div className="text-[11px] text-gray-400 mt-1">
                                {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
