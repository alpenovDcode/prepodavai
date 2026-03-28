'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

function StudentLoginForm() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [accessCode, setAccessCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const code = searchParams.get('code')
        if (code) {
            setAccessCode(code)
        }
    }, [searchParams])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const response = await apiClient.post('/auth/student-login', { accessCode })
            const { user } = response.data

            // Храним только минимально необходимые данные (без чувствительных полей)
            const { id, name, role } = user
            localStorage.setItem('user', JSON.stringify({ id, name, role }))

            // Redirect to dashboard
            router.push('/student/dashboard')
        } catch (err) {
            console.error('Login failed:', err)
            setError('Неверный код доступа. Пожалуйста, проверьте код и попробуйте снова.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center text-primary-600 text-2xl mx-auto mb-4">
                        <i className="fas fa-user-graduate"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Вход для ученика</h1>
                    <p className="text-gray-500 mt-2">Введите код доступа, полученный от учителя</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Код доступа
                        </label>
                        <input
                            type="text"
                            value={accessCode}
                            onChange={(e) => setAccessCode(e.target.value)}
                            placeholder="123456"
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-center text-2xl tracking-widest font-mono text-gray-900"
                            maxLength={6}
                            required
                        />
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
        </div>
    )
}

export default function StudentLoginPage() {
    return (
        <Suspense fallback={<div>Загрузка...</div>}>
            <StudentLoginForm />
        </Suspense>
    )
}
