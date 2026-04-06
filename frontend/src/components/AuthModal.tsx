'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
  initialMode?: 'login' | 'register'
}

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loginMode, setLoginMode] = useState<'phone' | 'apikey'>('apikey')

  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    username: '',
    apiKey: ''
  })

  useEffect(() => {
    if (initialMode === 'register') {
      setIsLogin(false)
    } else {
      setIsLogin(true)
      setLoginMode('apikey')
    }
  }, [initialMode])

  const handleLoginWithPassword = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const loginResponse = await apiClient.post('/auth/login', {
        phone: form.phone.trim(),
        password: form.password
      })

      if (loginResponse.data.success) {
        const user = loginResponse.data.user;
        const userData = {
          name: user?.firstName || 'Пользователь',
          phone: user?.phone || form.phone.trim(),
          userHash: loginResponse.data.userHash || user?.id || `u_${Date.now()}`,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')

        onSuccess()
      } else {
        setErrorMessage(loginResponse.data.error || 'Ошибка входа')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      setErrorMessage(error.response?.data?.error || error.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginWithApiKey = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const loginResponse = await apiClient.post('/auth/login-with-api-key', {
        username: form.username.trim(),
        apiKey: form.apiKey.trim()
      })

      if (loginResponse.data.success) {
        const user = loginResponse.data.user;
        const userData = {
          name: user?.firstName || user?.username || 'Пользователь',
          username: user?.username,
          phone: user?.phone || '',
          telegramId: user?.telegramId,
          userHash: loginResponse.data.userHash || user?.id || `u_${Date.now()}`,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')

        onSuccess()
      } else {
        setErrorMessage(loginResponse.data.error || 'Ошибка входа')
      }
    } catch (error: any) {
      console.error('Login with API key error:', error)
      setErrorMessage(error.response?.data?.error || error.message || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterByEmail = async () => {
    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await apiClient.post('/auth/register-by-email', {
        email: form.email.trim(),
        firstName: form.name.trim() || undefined
      })

      if (response.data.success) {
        const user = response.data.user
        const userData = {
          name: user?.firstName || form.name || 'Пользователь',
          username: user?.username,
          email: user?.email || form.email,
          userHash: response.data.userHash || user?.id || `u_${Date.now()}`,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')

        setSuccessMessage('Данные для входа отправлены на вашу почту!')

        setTimeout(() => {
          onSuccess()
        }, 1500)
      } else {
        setErrorMessage(response.data.error || 'Ошибка регистрации')
      }
    } catch (error: any) {
      console.error('Register by email error:', error)
      setErrorMessage(error.response?.data?.message || error.response?.data?.error || 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setErrorMessage('')
    setSuccessMessage('')
    setPrivacyAccepted(false)
    setForm({
      name: '',
      phone: '',
      email: '',
      password: '',
      username: '',
      apiKey: ''
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

      <div
        className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <i className="fas fa-times text-gray-400"></i>
        </button>

        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <i className="fas fa-graduation-cap text-white text-3xl"></i>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-center mb-2">
          <span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
            {isLogin ? 'Вход' : 'Регистрация'}
          </span>
        </h2>
        <p className="text-center text-gray-900 mb-8">
          {isLogin
            ? 'Введите данные из письма'
            : 'Укажите email для получения данных входа'
          }
        </p>

        {/* Email Registration Form */}
        {!isLogin && (
          <form onSubmit={(e) => { e.preventDefault(); handleRegisterByEmail(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2"></i>
                Имя
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                type="text"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="Введите ваше имя"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-envelope text-orange-500 mr-2"></i>
                Email
              </label>
              <input
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                type="email"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="example@email.com"
              />
              <p className="text-xs text-gray-500 mt-1">На эту почту придут данные для входа</p>
            </div>

            {successMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                <i className="fas fa-check-circle mr-2"></i>
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {errorMessage}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                Я соглашаюсь с{' '}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:text-orange-700 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  политикой конфиденциальности
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !privacyAccepted || !form.email.trim()}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>

            <div className="text-center text-xs text-gray-500 space-y-1 pt-1">
              <p>
                Нажимая «Зарегистрироваться», вы соглашаетесь с{' '}
                <a href="/legal/offer" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Офертой</a>
                {' '}и{' '}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Политикой конфиденциальности</a>
              </p>
              <p className="flex items-center justify-center gap-3">
                <a href="/legal/consent/processing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на обработку данных</a>
                <span className="text-gray-300">|</span>
                <a href="/legal/consent/mailing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на рассылку</a>
              </p>
            </div>
          </form>
        )}

        {/* Login Form: Username + API Key */}
        {isLogin && loginMode === 'apikey' && (
          <form onSubmit={(e) => { e.preventDefault(); handleLoginWithApiKey(); }} className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm mb-4">
              <i className="fas fa-info-circle text-blue-500 mr-2"></i>
              Если возникли сложности с авторизацией, напишите куратору или менеджеру, который за вами привязан
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2"></i>
                Почта
              </label>
              <input
                value={form.username}
                onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                type="text"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="your_username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-key text-orange-500 mr-2"></i>
                Персональный ключ
              </label>
              <input
                value={form.apiKey}
                onChange={(e) => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                type="text"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400 font-mono text-sm"
                placeholder="ABcd1234EFgh5678..."
              />
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {errorMessage}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                Я соглашаюсь с{' '}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:text-orange-700 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  политикой конфиденциальности
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !privacyAccepted}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sign-in-alt'}`}></i>
              {loading ? 'Вход...' : 'Войти'}
            </button>

            <div className="text-center text-xs text-gray-500 space-y-1 pt-1">
              <p>
                Нажимая «Войти», вы соглашаетесь с{' '}
                <a href="/legal/offer" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Офертой</a>
                {' '}и{' '}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Политикой конфиденциальности</a>
              </p>
              <p className="flex items-center justify-center gap-3">
                <a href="/legal/consent/processing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на обработку данных</a>
                <span className="text-gray-300">|</span>
                <a href="/legal/consent/mailing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на рассылку</a>
              </p>
            </div>
          </form>
        )}

        {/* Login Form: Phone + Password */}
        {isLogin && loginMode === 'phone' && (
          <form onSubmit={(e) => { e.preventDefault(); handleLoginWithPassword(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-phone text-orange-500 mr-2"></i>
                Номер телефона
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                type="tel"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="+7 900 123 45 67"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-lock text-orange-500 mr-2"></i>
                Пароль
              </label>
              <input
                value={form.password}
                onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                type="password"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="••••••••"
              />
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {errorMessage}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                Я соглашаюсь с{' '}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:text-orange-700 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  политикой конфиденциальности
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !privacyAccepted}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sign-in-alt'}`}></i>
              {loading ? 'Вход...' : 'Войти'}
            </button>

            <div className="text-center text-xs text-gray-500 space-y-1 pt-1">
              <p>
                Нажимая «Войти», вы соглашаетесь с{' '}
                <a href="/legal/offer" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Офертой</a>
                {' '}и{' '}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Политикой конфиденциальности</a>
              </p>
              <p className="flex items-center justify-center gap-3">
                <a href="/legal/consent/processing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на обработку данных</a>
                <span className="text-gray-300">|</span>
                <a href="/legal/consent/mailing" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Согласие на рассылку</a>
              </p>
            </div>
          </form>
        )}

        {/* Toggle between Login and Register */}
        <div className="mt-6 text-center">
          <button
            onClick={toggleMode}
            className="text-orange-600 hover:text-orange-700 font-medium"
          >
            {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
          </button>
        </div>
      </div>
    </div>
  )
}
