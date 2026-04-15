'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

interface InvitePreview {
    token: string
    teacher: { name: string; avatar?: string | null }
    class: { id: string; name: string } | null
}

export default function InvitePage() {
    const params = useParams<{ token: string }>()
    const router = useRouter()
    const token = params?.token as string

    const [preview, setPreview] = useState<InvitePreview | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        if (!token) return
        apiClient
            .get<InvitePreview>(`/student-invites/${token}`)
            .then((res) => setPreview(res.data))
            .catch((err) => setError(err?.response?.data?.message || 'Приглашение недействительно'))
            .finally(() => setLoading(false))
    }, [token])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitError(null)
        setSubmitting(true)
        try {
            await apiClient.post(`/student-invites/${token}/accept`, {
                name,
                email: email || undefined,
                phone: phone || undefined,
                password,
            })
            setSuccess(true)
            setTimeout(() => router.push('/student/login'), 1500)
        } catch (err: any) {
            setSubmitError(err?.response?.data?.message || 'Не удалось завершить регистрацию')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (error || !preview) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-2xl">
                        <i className="fas fa-times"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Приглашение недействительно</h1>
                    <p className="text-gray-600">{error || 'Попросите преподавателя прислать новую ссылку.'}</p>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-2xl">
                        <i className="fas fa-check"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Готово!</h1>
                    <p className="text-gray-600">Вы зачислены к преподавателю. Перенаправляем на страницу входа…</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xl font-bold">
                        {preview.teacher.name.charAt(0)}
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Вас приглашает</h1>
                    <p className="text-lg font-semibold text-primary-700 mt-1">{preview.teacher.name}</p>
                    {preview.class && (
                        <p className="text-sm text-gray-600 mt-1">
                            Класс: <span className="font-medium">{preview.class.name}</span>
                        </p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ваше имя</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none"
                            placeholder="Иван Иванов"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email <span className="text-gray-400 font-normal">(необязательно)</span>
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none"
                            placeholder="you@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Номер телефона <span className="text-gray-400 font-normal">(необязательно)</span>
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none"
                            placeholder="+7 999 123-45-67"
                        />
                    </div>
                    <p className="text-xs text-gray-500 -mt-2">Укажите хотя бы email или телефон — он понадобится для входа.</p>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white focus:outline-none"
                            placeholder="Минимум 6 символов"
                        />
                    </div>

                    {submitError && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            {submitError}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition disabled:opacity-60"
                    >
                        {submitting ? 'Регистрируем...' : 'Принять приглашение'}
                    </button>
                </form>
            </div>
        </div>
    )
}
