'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

/**
 * Страница входа ученика. Поддерживает два потока:
 *   1. Email + пароль (основной, — единый метод, зачисление через invite).
 *   2. По accessCode из query (?code=XXX) — legacy: учитель мог скопировать
 *      именно такую ссылку из ClassDetailPage. Если ученику дали код,
 *      мы пробуем вход автоматически, а форму email/пароля показываем как
 *      запасной путь. Без этой обработки ученик попадал на форму email/
 *      пароля, у него их не было — и он застревал.
 */
function StudentLoginContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const codeFromQuery = searchParams?.get('code')?.trim() || ''

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [autoLoginTried, setAutoLoginTried] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    // Автологин по ?code=XXX если параметр есть.
    useEffect(() => {
        if (!codeFromQuery || autoLoginTried) return
        setAutoLoginTried(true)
        setLoading(true)
        apiClient
            .post('/auth/student-login', { accessCode: codeFromQuery })
            .then((res: any) => {
                const user = res.data?.user
                if (!user) throw new Error('no user')
                localStorage.setItem('user', JSON.stringify({ id: user.id, name: user.name, role: user.role }))
                router.push('/student/dashboard')
            })
            .catch(() => {
                setInfo('Ссылка с кодом устарела. Войдите по email и паролю или попросите учителя прислать актуальную ссылку.')
            })
            .finally(() => setLoading(false))
    }, [codeFromQuery, autoLoginTried, router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        setInfo('')

        try {
            const response = await apiClient.post('/auth/student-login-email', { email, password })
            const { id, name, role } = response.data.user
            localStorage.setItem('user', JSON.stringify({ id, name, role }))
            router.push('/student/dashboard')
        } catch {
            setError('Неверный email или пароль. Проверьте данные и попробуйте снова.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 text-2xl mx-auto mb-4">
                        <i className="fas fa-user-graduate"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Вход для ученика</h1>
                    <p className="text-gray-500 mt-2">Введите данные, которые вам дал учитель</p>
                </div>

                {info && (
                    <div className="mb-5 p-4 bg-amber-50 text-amber-700 rounded-xl text-sm border border-amber-100">
                        {info}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="ivan@example.com"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition text-gray-900"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Пароль
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition text-gray-900"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <i className="fas fa-spinner fa-spin"></i>
                                Вход...
                            </span>
                        ) : (
                            'Войти'
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-5 border-t border-gray-100 text-center space-y-2">
                    <p className="text-sm text-gray-600">
                        Не помните email или пароль? Попросите учителя прислать данные для входа заново.
                    </p>
                    <button
                        type="button"
                        onClick={() => router.push('/')}
                        className="text-sm text-gray-500 hover:text-gray-700 underline"
                    >
                        Я не ученик — вернуться на главную
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function StudentLoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
                <i className="fas fa-spinner fa-spin text-indigo-600 text-3xl"></i>
            </div>
        }>
            <StudentLoginContent />
        </Suspense>
    )
}
