'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [loginMode, setLoginMode] = useState<'phone' | 'apikey'>('phone')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1) // 1 = form, 2 = verification code
  const [errorMessage, setErrorMessage] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [resendTimer, setResendTimer] = useState(0)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    username: '',
    apiKey: ''
  })

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const tab = urlParams.get('tab')

    if (tab === 'telegram') {
      setIsLogin(true)
      setLoginMode('apikey')
    } else if (tab === 'phone') {
      setIsLogin(true)
      setLoginMode('phone')
    }
  }, [])

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])

  const startResendTimer = () => {
    setResendTimer(60)
  }

  const handleSendCode = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const response = await apiClient.post('/auth/phone/send-code', {
        phone: form.phone.trim()
      })

      if (response.data.success) {
        setVerificationId(response.data.verificationId)
        setDebugCode(response.data.debugCode || '')
        setStep(2)
        startResendTimer()
      } else {
        setErrorMessage(response.data.error || 'Ошибка отправки кода')
      }
    } catch (error: any) {
      console.error('Send code error:', error)
      setErrorMessage(error.response?.data?.error || 'Ошибка отправки кода')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const response = await apiClient.post('/auth/phone/login', {
        phone: form.phone.trim(),
        code: verificationCode
      })

      if (response.data.success) {
        const userData = {
          name: response.data.user.firstName || form.name,
          phone: response.data.user.phone,
          userHash: response.data.userHash,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')
        if (response.data.token) {
          localStorage.setItem('prepodavai_token', response.data.token)
        }

        onSuccess()
      } else {
        setErrorMessage(response.data.error || 'Неверный код')
      }
    } catch (error: any) {
      console.error('Verification error:', error)
      setErrorMessage(error.response?.data?.error || 'Ошибка проверки кода')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginWithPassword = async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const loginResponse = await apiClient.post('/auth/login', {
        phone: form.phone.trim(),
        password: form.password
      })

      if (loginResponse.data.success) {
        const userData = {
          name: loginResponse.data.user.firstName,
          phone: loginResponse.data.user.phone,
          userHash: loginResponse.data.userHash,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')
        if (loginResponse.data.token) {
          localStorage.setItem('prepodavai_token', loginResponse.data.token)
        }

        onSuccess()
      } else {
        setErrorMessage(loginResponse.data.error || 'Ошибка входа')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      setErrorMessage(error.response?.data?.error || 'Ошибка входа')
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
        const userData = {
          name: loginResponse.data.user.firstName || loginResponse.data.user.username,
          username: loginResponse.data.user.username,
          phone: loginResponse.data.user.phone || '',
          telegramId: loginResponse.data.user.telegramId,
          userHash: loginResponse.data.userHash,
          isAuthenticated: true,
          loginTime: new Date().toISOString()
        }

        localStorage.setItem('prepodavai_user', JSON.stringify(userData))
        localStorage.setItem('prepodavai_authenticated', 'true')
        if (loginResponse.data.token) {
          localStorage.setItem('prepodavai_token', loginResponse.data.token)
        }

        onSuccess()
      } else {
        setErrorMessage(loginResponse.data.error || 'Ошибка входа')
      }
    } catch (error: any) {
      console.error('Login with API key error:', error)
      setErrorMessage(error.response?.data?.error || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setStep(1)
    setErrorMessage('')
    setVerificationCode('')
    setDebugCode('')
    setLoginMode('phone')
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
            {isLogin ? 'Вход' : (step === 1 ? 'Регистрация' : 'Подтверждение')}
          </span>
        </h2>
        <p className="text-center text-gray-900 mb-8">
          {isLogin
            ? (loginMode === 'phone' ? 'Введите телефон и пароль' : 'Введите данные из Telegram')
            : (step === 1 ? 'Создайте новый аккаунт' : 'Введите код из SMS')
          }
        </p>

        {/* Step 1: Registration Form */}
        {!isLogin && step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); handleSendCode(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2"></i>
                Имя
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                type="text"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="Введите ваше имя"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-phone text-orange-500 mr-2"></i>
                Телефон
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                type="tel"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="+7 900 123 45 67"
              />
              <p className="text-xs text-gray-500 mt-1">На этот номер придет SMS с кодом</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-envelope text-orange-500 mr-2"></i>
                Email (опционально)
              </label>
              <input
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                type="email"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="example@email.com"
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
                minLength={6}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="Минимум 6 символов"
              />
              <p className="text-xs text-gray-500 mt-1">Минимум 6 символов</p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
              {loading ? 'Отправка...' : 'Отправить код'}
            </button>
          </form>
        )}

        {/* Step 2: Verification Code */}
        {!isLogin && step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-orange-100 mx-auto mb-4 flex items-center justify-center">
                <i className="fas fa-mobile-alt text-orange-500 text-2xl"></i>
              </div>
              <p className="text-gray-600">
                Код отправлен на номер<br />
                <span className="font-semibold text-gray-900">{form.phone}</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                <i className="fas fa-key text-orange-500 mr-2"></i>
                Введите код из SMS
              </label>
              <input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                type="text"
                required
                maxLength={4}
                pattern="[0-9]{4}"
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-center text-2xl font-bold text-gray-900 placeholder:text-gray-400 tracking-widest"
                placeholder="0000"
              />
            </div>

            {debugCode && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                <strong>DEV MODE:</strong> Код: {debugCode}
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {errorMessage}
                {attemptsLeft !== null && (
                  <span className="block mt-1">Осталось попыток: {attemptsLeft}</span>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || verificationCode.length !== 4}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
              {loading ? 'Проверка...' : 'Подтвердить'}
            </button>

            <button
              type="button"
              onClick={handleSendCode}
              disabled={resendTimer > 0}
              className="w-full py-3 text-orange-600 hover:text-orange-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {resendTimer > 0 ? `Отправить снова через ${resendTimer}с` : 'Отправить код снова'}
            </button>

            <button
              type="button"
              onClick={() => { setStep(1); setErrorMessage(''); setVerificationCode(''); }}
              className="w-full py-3 text-gray-600 hover:text-gray-700 font-medium"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Изменить данные
            </button>
          </form>
        )}

        {/* Login Mode Switcher */}
        {isLogin && (
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => { setLoginMode('phone'); setErrorMessage(''); }}
              className={`flex-1 py-3 rounded-xl font-medium transition-all ${loginMode === 'phone'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <i className="fas fa-phone mr-2"></i>
              Телефон
            </button>
            <button
              type="button"
              onClick={() => { setLoginMode('apikey'); setErrorMessage(''); }}
              className={`flex-1 py-3 rounded-xl font-medium transition-all ${loginMode === 'apikey'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <i className="fab fa-telegram mr-2"></i>
              Telegram
            </button>
          </div>
        )}

        {/* Login Form: Phone + Password */}
        {isLogin && loginMode === 'phone' && (
          <div className="py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 mx-auto mb-4 flex items-center justify-center">
              <i className="fas fa-phone-slash text-orange-500 text-2xl"></i>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Вход по телефону недоступен</h3>
            <p className="text-gray-500 mb-4">
              В данный момент вход по номеру телефона временно закрыт.
            </p>
            <button
              onClick={() => setLoginMode('apikey')}
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              Войти через Telegram
            </button>
          </div>
        )}

        {/* Login Form: Username + API Key */}
        {isLogin && loginMode === 'apikey' && (
          <form onSubmit={(e) => { e.preventDefault(); handleLoginWithApiKey(); }} className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm mb-4">
              <i className="fab fa-telegram text-blue-500 mr-2"></i>
              Получить эти данные можно в Telegram боте, отправив команду <code className="font-mono bg-blue-100 px-2 py-1 rounded">/start</code>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2"></i>
                Username из Telegram
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sign-in-alt'}`}></i>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {/* Toggle */}
        <div className="mt-6 text-center">
          {isLogin ? (
            <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-500">
              <i className="fas fa-info-circle mr-2"></i>
              Регистрация временно закрыта
            </div>
          ) : (
            <button
              onClick={toggleMode}
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              Уже есть аккаунт? Войдите
            </button>
          )}
        </div>
      </div>
    </div>
  )
}