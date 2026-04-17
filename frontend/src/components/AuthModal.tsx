'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
  initialMode?: 'login' | 'register'
}

type Mode = 'login' | 'register' | 'recovery'

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode === 'register' ? 'register' : 'login')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  // Login form
  const [loginForm, setLoginForm] = useState({ username: '', apiKey: '' })

  // Register form
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', referralCode: '' })
  const [registerStep, setRegisterStep] = useState<'form' | 'verify-code'>('form')
  const [registerCode, setRegisterCode] = useState('')

  // Recovery form
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryStep, setRecoveryStep] = useState<'form' | 'verify-code'>('form')
  const [recoveryCode, setRecoveryCode] = useState('')

  useEffect(() => {
    const savedCode = localStorage.getItem('prepodavai_referral_code')
    if (savedCode) setRegisterForm(prev => ({ ...prev, referralCode: savedCode }))
  }, [])

  useEffect(() => {
    setMode(initialMode === 'register' ? 'register' : 'login')
  }, [initialMode])

  const resetErrors = () => { setErrorMessage(''); setSuccessMessage('') }

  const switchMode = (next: Mode) => {
    resetErrors()
    setPrivacyAccepted(false)
    setMode(next)
  }

  // ── Сохранение пользователя и редирект ──────────────────────────────────
  const saveAndLogin = (data: any, userHash: string) => {
    const user = data.user
    localStorage.setItem('prepodavai_user', JSON.stringify({
      name: user?.firstName || user?.username || 'Пользователь',
      username: user?.username,
      email: user?.email,
      userHash,
      isAuthenticated: true,
      loginTime: new Date().toISOString(),
    }))
    localStorage.setItem('prepodavai_authenticated', 'true')
    localStorage.removeItem('prepodavai_utm')
    onSuccess()
  }

  // ── Вход по логину + ключу ───────────────────────────────────────────────
  const handleLoginWithApiKey = async () => {
    setLoading(true); resetErrors()
    try {
      const res = await apiClient.post('/auth/login-with-api-key', {
        username: loginForm.username.trim(),
        apiKey: loginForm.apiKey.trim(),
      })
      if (res.data.success) {
        saveAndLogin(res.data, res.data.userHash || res.data.user?.id)
      } else {
        setErrorMessage(res.data.error || 'Ошибка входа')
      }
    } catch (e: any) {
      setErrorMessage(e.response?.data?.message || e.response?.data?.error || 'Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  // ── Регистрация: отправка кода ───────────────────────────────────────────
  const handleRegisterSendCode = async () => {
    setLoading(true); resetErrors()
    try {
      const res = await apiClient.post('/auth/register-by-email', { email: registerForm.email.trim() })
      if (res.data.success && res.data.pending) {
        const code = registerForm.referralCode.trim()
        if (code) localStorage.setItem('prepodavai_referral_code', code)
        setRegisterStep('verify-code')
        setSuccessMessage('Код подтверждения отправлен на вашу почту')
      } else {
        setErrorMessage(res.data.error || 'Ошибка регистрации')
      }
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || ''
      setErrorMessage(!msg || msg.toLowerCase() === 'internal server error' ? 'Ошибка сервера. Попробуйте позже.' : msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Регистрация: подтверждение кода ─────────────────────────────────────
  const handleRegisterVerifyCode = async () => {
    setLoading(true); resetErrors()
    try {
      const utmParams = (() => {
        try { const r = localStorage.getItem('prepodavai_utm'); return r ? JSON.parse(r).params : {} }
        catch { return {} }
      })()
      const res = await apiClient.post('/auth/verify-email-code', {
        email: registerForm.email.trim(),
        code: registerCode.trim(),
        firstName: registerForm.name.trim() || undefined,
        ...utmParams,
      })
      if (res.data.success) {
        saveAndLogin(res.data, res.data.userHash || res.data.user?.id)
      } else {
        setErrorMessage(res.data.error || 'Ошибка подтверждения')
      }
    } catch (e: any) {
      setErrorMessage(e.response?.data?.message || e.response?.data?.error || 'Неверный код или срок действия истёк')
    } finally {
      setLoading(false)
    }
  }

  // ── Восстановление: отправка кода ───────────────────────────────────────
  const handleRecoverySendCode = async () => {
    setLoading(true); resetErrors()
    try {
      const res = await apiClient.post('/auth/register-by-email', { email: recoveryEmail.trim() })
      if (res.data.success && res.data.pending) {
        setRecoveryStep('verify-code')
        setSuccessMessage('Код для входа отправлен на вашу почту')
      } else {
        setErrorMessage(res.data.error || 'Ошибка отправки кода')
      }
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || ''
      setErrorMessage(!msg || msg.toLowerCase() === 'internal server error' ? 'Ошибка сервера. Попробуйте позже.' : msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Восстановление: подтверждение кода ──────────────────────────────────
  const handleRecoveryVerifyCode = async () => {
    setLoading(true); resetErrors()
    try {
      const res = await apiClient.post('/auth/verify-email-code', {
        email: recoveryEmail.trim(),
        code: recoveryCode.trim(),
      })
      if (res.data.success) {
        saveAndLogin(res.data, res.data.userHash || res.data.user?.id)
      } else {
        setErrorMessage(res.data.error || 'Ошибка подтверждения')
      }
    } catch (e: any) {
      setErrorMessage(e.response?.data?.message || e.response?.data?.error || 'Неверный код или срок действия истёк')
    } finally {
      setLoading(false)
    }
  }

  // ── Заголовок модала ─────────────────────────────────────────────────────
  const title = mode === 'login' ? 'Вход'
    : mode === 'register' ? (registerStep === 'verify-code' ? 'Подтверждение' : 'Регистрация')
    : (recoveryStep === 'verify-code' ? 'Подтверждение' : 'Восстановление доступа')

  const subtitle = mode === 'login' ? 'Введите данные из письма'
    : mode === 'register' ? (registerStep === 'verify-code' ? 'Введите код из письма' : 'Укажите email для получения данных входа')
    : (recoveryStep === 'verify-code' ? 'Введите код из письма' : 'Введите email вашего аккаунта')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <i className="fas fa-times text-gray-400" />
        </button>

        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <i className="fas fa-graduation-cap text-white text-3xl" />
          </div>
        </div>

        <h2 className="text-3xl font-bold text-center mb-2">
          <span className="bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
            {title}
          </span>
        </h2>
        <p className="text-center text-gray-500 mb-8 text-sm">{subtitle}</p>

        {/* ── ВХОД ─────────────────────────────────────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={(e) => { e.preventDefault(); handleLoginWithApiKey() }} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-xs flex items-start gap-2">
              <i className="fas fa-info-circle mt-0.5 shrink-0" />
              Если возникли сложности с авторизацией, напишите куратору или менеджеру, который за вами привязан
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2" />Почта
              </label>
              <input
                value={loginForm.username}
                onChange={(e) => setLoginForm(p => ({ ...p, username: e.target.value }))}
                type="text" required autoComplete="username"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-lock text-orange-500 mr-2" />Пароль
              </label>
              <input
                value={loginForm.apiKey}
                onChange={(e) => setLoginForm(p => ({ ...p, apiKey: e.target.value }))}
                type="password" required autoComplete="current-password"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="Ваш пароль"
              />
            </div>

            {errorMessage && <ErrorBox message={errorMessage} />}

            <PrivacyCheckbox checked={privacyAccepted} onChange={setPrivacyAccepted} />

            <SubmitButton loading={loading} disabled={!privacyAccepted} label="Войти" loadingLabel="Вход..." icon="fa-sign-in-alt" />

            <LegalLinks action="Войти" />
          </form>
        )}

        {/* ── РЕГИСТРАЦИЯ: ввод email ───────────────────────────────────── */}
        {mode === 'register' && registerStep === 'form' && (
          <form onSubmit={(e) => { e.preventDefault(); handleRegisterSendCode() }} className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <i className="fas fa-link mt-0.5 shrink-0" />
              <span>Это веб-аккаунт. После регистрации вы сможете привязать <strong>Telegram</strong> и <strong>MAX</strong> в настройках профиля.</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-user text-orange-500 mr-2" />Имя
              </label>
              <input
                value={registerForm.name}
                onChange={(e) => setRegisterForm(p => ({ ...p, name: e.target.value }))}
                type="text"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="Введите ваше имя"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-envelope text-orange-500 mr-2" />Email
              </label>
              <input
                value={registerForm.email}
                onChange={(e) => setRegisterForm(p => ({ ...p, email: e.target.value }))}
                type="email" required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="example@email.com"
              />
              <p className="text-xs text-gray-400 mt-1">На эту почту придут данные для входа</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-gift text-orange-500 mr-2" />Код приглашения
                <span className="text-gray-400 font-normal ml-1">(необязательно)</span>
              </label>
              <input
                value={registerForm.referralCode}
                onChange={(e) => setRegisterForm(p => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
                type="text" maxLength={16}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400 font-mono tracking-wider"
                placeholder="XXXXXXXX"
              />
            </div>

            {errorMessage && <ErrorBox message={errorMessage} />}

            <PrivacyCheckbox checked={privacyAccepted} onChange={setPrivacyAccepted} />

            <SubmitButton loading={loading} disabled={!privacyAccepted || !registerForm.email.trim()} label="Зарегистрироваться" loadingLabel="Регистрация..." icon="fa-paper-plane" />

            <LegalLinks action="Зарегистрироваться" />
          </form>
        )}

        {/* ── РЕГИСТРАЦИЯ: ввод кода ────────────────────────────────────── */}
        {mode === 'register' && registerStep === 'verify-code' && (
          <form onSubmit={(e) => { e.preventDefault(); handleRegisterVerifyCode() }} className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm">
              <i className="fas fa-envelope-open text-blue-500 mr-2" />
              Мы отправили 6-значный код на <strong>{registerForm.email}</strong>
            </div>

            <CodeInput value={registerCode} onChange={setRegisterCode} />

            {successMessage && <SuccessBox message={successMessage} />}
            {errorMessage && <ErrorBox message={errorMessage} />}

            <SubmitButton loading={loading} disabled={registerCode.length !== 6} label="Подтвердить" loadingLabel="Проверка..." icon="fa-check" />

            <button type="button" onClick={() => { setRegisterStep('form'); setRegisterCode(''); resetErrors() }}
              className="w-full text-sm text-gray-500 hover:text-gray-700">
              Изменить email
            </button>
          </form>
        )}

        {/* ── ВОССТАНОВЛЕНИЕ: ввод email ────────────────────────────────── */}
        {mode === 'recovery' && recoveryStep === 'form' && (
          <form onSubmit={(e) => { e.preventDefault(); handleRecoverySendCode() }} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
              <i className="fas fa-key mt-0.5 shrink-0" />
              <span>Введите email, указанный при регистрации. Мы отправим код для входа — ваши данные будут высланы повторно.</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-envelope text-orange-500 mr-2" />Email аккаунта
              </label>
              <input
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                type="email" required autoFocus
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 placeholder:text-gray-400"
                placeholder="your@email.com"
              />
            </div>

            {errorMessage && <ErrorBox message={errorMessage} />}

            <SubmitButton loading={loading} disabled={!recoveryEmail.trim()} label="Получить код" loadingLabel="Отправка..." icon="fa-paper-plane" />
          </form>
        )}

        {/* ── ВОССТАНОВЛЕНИЕ: ввод кода ─────────────────────────────────── */}
        {mode === 'recovery' && recoveryStep === 'verify-code' && (
          <form onSubmit={(e) => { e.preventDefault(); handleRecoveryVerifyCode() }} className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-sm">
              <i className="fas fa-envelope-open text-blue-500 mr-2" />
              Мы отправили 6-значный код на <strong>{recoveryEmail}</strong>. В том же письме — ваши данные для входа.
            </div>

            <CodeInput value={recoveryCode} onChange={setRecoveryCode} />

            {successMessage && <SuccessBox message={successMessage} />}
            {errorMessage && <ErrorBox message={errorMessage} />}

            <SubmitButton loading={loading} disabled={recoveryCode.length !== 6} label="Войти" loadingLabel="Проверка..." icon="fa-sign-in-alt" />

            <button type="button" onClick={() => { setRecoveryStep('form'); setRecoveryCode(''); resetErrors() }}
              className="w-full text-sm text-gray-500 hover:text-gray-700">
              Изменить email
            </button>
          </form>
        )}

        {/* ── НАВИГАЦИЯ ─────────────────────────────────────────────────── */}
        <div className="mt-6 text-center space-y-2">
          {mode === 'login' && (
            <>
              <button onClick={() => switchMode('register')} className="text-orange-600 hover:text-orange-700 font-medium block w-full">
                Нет аккаунта? Зарегистрируйтесь
              </button>
              <button onClick={() => switchMode('recovery')} className="text-sm text-gray-500 hover:text-gray-700 underline">
                Забыли данные для входа? Получить код на почту
              </button>
            </>
          )}
          {mode === 'register' && (
            <button onClick={() => switchMode('login')} className="text-orange-600 hover:text-orange-700 font-medium">
              Уже есть аккаунт? Войдите
            </button>
          )}
          {mode === 'recovery' && (
            <button onClick={() => switchMode('login')} className="text-orange-600 hover:text-orange-700 font-medium">
              Вспомнили данные? Войти
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Вспомогательные компоненты ───────────────────────────────────────────────

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        <i className="fas fa-shield-alt text-orange-500 mr-2" />Код подтверждения
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        type="text" inputMode="numeric" required autoFocus
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 text-center text-2xl font-mono tracking-widest"
        placeholder="______"
      />
      <p className="text-xs text-gray-400 mt-1">Код действителен 10 минут</p>
    </div>
  )
}

function PrivacyCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-orange-500 cursor-pointer flex-shrink-0" />
      <span className="text-sm text-gray-700">
        Я соглашаюсь с{' '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer"
          className="text-orange-600 hover:text-orange-700 underline" onClick={(e) => e.stopPropagation()}>
          политикой конфиденциальности
        </a>
      </span>
    </label>
  )
}

function SubmitButton({ loading, disabled, label, loadingLabel, icon }: {
  loading: boolean; disabled: boolean; label: string; loadingLabel: string; icon: string
}) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
      <i className={`fas ${loading ? 'fa-spinner fa-spin' : icon}`} />
      {loading ? loadingLabel : label}
    </button>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
      <i className="fas fa-exclamation-circle mr-2" />{message}
    </div>
  )
}

function SuccessBox({ message }: { message: string }) {
  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
      <i className="fas fa-check-circle mr-2" />{message}
    </div>
  )
}

function LegalLinks({ action }: { action: string }) {
  return (
    <div className="text-center text-xs text-gray-500 space-y-1 pt-1">
      <p>
        Нажимая «{action}», вы соглашаетесь с{' '}
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
  )
}
