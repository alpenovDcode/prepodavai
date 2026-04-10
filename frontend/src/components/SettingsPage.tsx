'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import { CheckCircle, AlertCircle, Loader2, Link2, Link2Off } from 'lucide-react'

export default function SettingsPage() {
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        phone: '',
        phoneVerified: false,
        bio: '',
        avatar: '',
        subject: '',
        grades: '',
    })

    const [phoneVerif, setPhoneVerif] = useState<{
        step: 'idle' | 'code_sent' | 'done'
        loading: boolean
        code: string
        error: string | null
        bonusGranted: boolean
    }>({ step: 'idle', loading: false, code: '', error: null, bonusGranted: false })

    const fileInputRef = useRef<HTMLInputElement>(null)

    const [notifications, setNotifications] = useState({
        notifyNewCourse: true,
        notifyStudentProgress: false,
        notifyWeeklyReport: true,
    })

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Платформы
    type PlatformInfo = { linked: boolean; platformId: string | null; platformName: string | null }
    const [platforms, setPlatforms] = useState<{ telegram: PlatformInfo; max: PlatformInfo } | null>(null)
    const [linking, setLinking] = useState<{
        platform: 'telegram' | 'max'
        token: string
        link: string
        status: 'waiting' | 'done' | 'expired'
    } | null>(null)
    const [unlinking, setUnlinking] = useState<'telegram' | 'max' | null>(null)
    const linkPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchPlatforms = useCallback(async () => {
        try {
            const res = await apiClient.get('/auth/platforms')
            if (res.data.success) setPlatforms(res.data.platforms)
        } catch { /* ignore */ }
    }, [])

    const startLinking = async (platform: 'telegram' | 'max') => {
        try {
            const res = await apiClient.post('/auth/link-token', { platform })
            if (!res.data.success) return
            setLinking({ platform, token: res.data.token, link: res.data.deepLink, status: 'waiting' })

            // Polling every 2s
            linkPollRef.current = setInterval(async () => {
                try {
                    const poll = await apiClient.get(`/auth/link-status?token=${res.data.token}`)
                    if (poll.data.status === 'completed') {
                        clearInterval(linkPollRef.current!)
                        setLinking(prev => prev ? { ...prev, status: 'done' } : null)
                        await fetchPlatforms()
                        setTimeout(() => setLinking(null), 2000)
                    } else if (poll.data.status === 'expired') {
                        clearInterval(linkPollRef.current!)
                        setLinking(prev => prev ? { ...prev, status: 'expired' } : null)
                    }
                } catch { /* ignore */ }
            }, 2000)
        } catch (err: any) {
            setStatusMessage({ type: 'error', text: err?.response?.data?.message || 'Ошибка генерации токена' })
        }
    }

    const cancelLinking = () => {
        if (linkPollRef.current) clearInterval(linkPollRef.current)
        setLinking(null)
    }

    const handleUnlink = async (platform: 'telegram' | 'max') => {
        setUnlinking(platform)
        try {
            await apiClient.delete(`/auth/unlink/${platform}`)
            await fetchPlatforms()
        } catch (err: any) {
            setStatusMessage({ type: 'error', text: err?.response?.data?.message || 'Ошибка отвязки' })
        } finally {
            setUnlinking(null)
        }
    }

    // Cleanup polling on unmount
    useEffect(() => () => { if (linkPollRef.current) clearInterval(linkPollRef.current) }, [])

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await apiClient.get('/users/me')
                if (response.data.success && response.data.user) {
                    const u = response.data.user
                    setProfile({
                        fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || '',
                        email: u.email || '',
                        phone: u.phone || '',
                        phoneVerified: u.phoneVerified || false,
                        bio: u.bio || '',
                        avatar: u.avatar || '',
                        subject: u.subject || '',
                        grades: u.grades || '',
                    })
                    setNotifications({
                        notifyNewCourse: u.notifyNewCourse ?? true,
                        notifyStudentProgress: u.notifyStudentProgress ?? false,
                        notifyWeeklyReport: u.notifyWeeklyReport ?? true,
                    })
                }
            } catch (error) {
                console.error('Failed to load profile settings:', error)
                setStatusMessage({ type: 'error', text: 'Ошибка при загрузке профиля' })
            } finally {
                setLoading(false)
            }
        }
        fetchProfile()
        fetchPlatforms()
    }, [fetchPlatforms])

    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const onAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file)

        try {
            setSaving(true)
            const response = await apiClient.post('/files/upload', formData)
            if (response.data.success) {
                const newAvatarHash = response.data.hash
                setProfile(prev => ({ ...prev, avatar: newAvatarHash }))

                // Сразу сохраняем в профиль
                await apiClient.put('/users/me', {
                    avatar: newAvatarHash
                })

                setStatusMessage({ type: 'success', text: 'Аватар обновлен' })
                setTimeout(() => setStatusMessage(null), 3000)
            }
        } catch (error) {
            console.error('Failed to upload avatar:', error)
            setStatusMessage({ type: 'error', text: 'Ошибка при загрузке аватара' })
        } finally {
            setSaving(false)
        }
    }

    const handleSendCode = async () => {
        if (!profile.phone.trim()) {
            setPhoneVerif(p => ({ ...p, error: 'Введите номер телефона' }))
            return
        }
        setPhoneVerif(p => ({ ...p, loading: true, error: null }))
        try {
            await apiClient.post('/users/me/phone/send-code', { phone: profile.phone.trim() })
            setPhoneVerif(p => ({ ...p, step: 'code_sent', loading: false }))
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Ошибка отправки SMS'
            setPhoneVerif(p => ({ ...p, loading: false, error: msg }))
        }
    }

    const handleVerifyCode = async () => {
        if (!phoneVerif.code.trim()) return
        setPhoneVerif(p => ({ ...p, loading: true, error: null }))
        try {
            await apiClient.post('/users/me/phone/verify', {
                phone: profile.phone.trim(),
                code: phoneVerif.code.trim(),
            })
            setProfile(p => ({ ...p, phoneVerified: true }))
            setPhoneVerif(p => ({ ...p, step: 'done', loading: false, bonusGranted: true }))
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Неверный код'
            setPhoneVerif(p => ({ ...p, loading: false, error: msg }))
        }
    }

    const handleSaveProfile = async () => {
        setSaving(true)
        setStatusMessage(null)
        try {
            const names = profile.fullName.trim().split(' ')
            const firstName = names[0] || ''
            const lastName = names.slice(1).join(' ') || ''

            await apiClient.put('/users/me', {
                firstName,
                lastName,
                email: profile.email,
                phone: profile.phone,
                bio: profile.bio,
                avatar: profile.avatar,
                subject: profile.subject,
                grades: profile.grades,
                notifyNewCourse: notifications.notifyNewCourse,
                notifyStudentProgress: notifications.notifyStudentProgress,
                notifyWeeklyReport: notifications.notifyWeeklyReport,
            })

            // Re-sync local storage name if needed somewhere else
            const storedUserStr = localStorage.getItem('prepodavai_user')
            if (storedUserStr) {
                try {
                    const storedUser = JSON.parse(storedUserStr)
                    storedUser.name = `${firstName} ${lastName}`.trim() || storedUser.name
                    localStorage.setItem('prepodavai_user', JSON.stringify(storedUser))
                } catch (e) { }
            }

            setStatusMessage({ type: 'success', text: 'Изменения успешно сохранены' })
            setTimeout(() => setStatusMessage(null), 3000)
        } catch (error) {
            console.error('Failed to save profile:', error)
            setStatusMessage({ type: 'error', text: 'Не удалось сохранить профиль' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Моя карточка</h1>
                <p className="text-gray-600 mt-1">Управление профилем и настройками аккаунта.</p>
            </div>

            {/* Profile Section */}
            <div className="dashboard-card mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Профиль</h2>

                <div className="flex items-center gap-6 mb-8">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg overflow-hidden border-4 border-white">
                        {profile.avatar ? (
                            <img
                                src={`${apiClient.defaults.baseURL}/files/${profile.avatar}`}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            profile.fullName.split(' ').map(n => n[0]).join('').toUpperCase()
                        )}
                    </div>
                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={onAvatarFileChange}
                            accept="image/*"
                            className="hidden"
                        />
                        <button
                            onClick={handleAvatarClick}
                            className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition shadow-md hover:shadow-lg mb-2"
                        >
                            Изменить аватар
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Полное имя
                        </label>
                        <input
                            type="text"
                            value={profile.fullName}
                            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Email адрес
                        </label>
                        <input
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Телефон
                        </label>

                        {/* Verified state */}
                        {profile.phoneVerified ? (
                            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                <span className="text-sm font-medium text-green-800">{profile.phone}</span>
                                <span className="text-xs text-green-600 ml-auto">Подтверждён</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Phone input + send button */}
                                <div className="flex gap-2">
                                    <input
                                        type="tel"
                                        value={profile.phone}
                                        onChange={(e) => {
                                            setProfile({ ...profile, phone: e.target.value })
                                            setPhoneVerif(p => ({ ...p, step: 'idle', error: null, code: '' }))
                                        }}
                                        placeholder="+7 (999) 000-00-00"
                                        disabled={phoneVerif.step === 'code_sent' || phoneVerif.loading}
                                        className="flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition disabled:opacity-60"
                                    />
                                    {phoneVerif.step !== 'code_sent' && (
                                        <button
                                            type="button"
                                            onClick={handleSendCode}
                                            disabled={phoneVerif.loading || !profile.phone.trim()}
                                            className="px-4 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                                        >
                                            {phoneVerif.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Получить код
                                        </button>
                                    )}
                                </div>

                                {/* Code input */}
                                {phoneVerif.step === 'code_sent' && (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={phoneVerif.code}
                                            onChange={(e) => setPhoneVerif(p => ({ ...p, code: e.target.value, error: null }))}
                                            placeholder="Код из SMS"
                                            maxLength={4}
                                            className="flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition text-center tracking-widest font-mono text-lg"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleVerifyCode}
                                            disabled={phoneVerif.loading || phoneVerif.code.length < 4}
                                            className="px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                                        >
                                            {phoneVerif.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Подтвердить
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPhoneVerif(p => ({ ...p, step: 'idle', code: '', error: null }))}
                                            className="px-3 py-3 bg-gray-100 text-gray-500 rounded-xl text-sm hover:bg-gray-200 transition"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}

                                {/* Hint / error / bonus */}
                                {phoneVerif.bonusGranted && (
                                    <p className="text-sm text-green-600 font-medium flex items-center gap-1.5">
                                        <CheckCircle className="w-4 h-4" /> +50 Токенов начислено!
                                    </p>
                                )}
                                {phoneVerif.error && (
                                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4" /> {phoneVerif.error}
                                    </p>
                                )}
                                {phoneVerif.step === 'code_sent' && !phoneVerif.error && (
                                    <p className="text-xs text-gray-500">SMS отправлено на {profile.phone}. Код действует 5 минут.</p>
                                )}
                                {phoneVerif.step === 'idle' && !profile.phoneVerified && (
                                    <p className="text-xs text-gray-400">Подтвердите телефон и получите +50 Токенов</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        О себе
                    </label>
                    <textarea
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition resize-none"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Мой предмет
                        </label>
                        <input
                            type="text"
                            value={profile.subject}
                            onChange={(e) => setProfile({ ...profile, subject: e.target.value })}
                            placeholder="Например: Математика, Русский язык"
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Классы
                        </label>
                        <input
                            type="text"
                            value={profile.grades}
                            onChange={(e) => setProfile({ ...profile, grades: e.target.value })}
                            placeholder="Например: 5–9 классы"
                            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                        {saving ? 'Сохранение...' : 'Сохранить изменения'}
                    </button>
                    {statusMessage && (
                        <div className={`flex items-center gap-2 text-sm font-medium ${statusMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                            {statusMessage.text}
                        </div>
                    )}
                </div>
            </div>

            {/* Connected Platforms Section */}
            <div className="dashboard-card mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Подключённые платформы</h2>
                <p className="text-sm text-gray-500 mb-6">Привяжите Telegram или MAX, чтобы получать результаты генерации прямо в мессенджере.</p>

                <div className="space-y-4">
                    {(['telegram', 'max'] as const).map((platform) => {
                        const info = platforms?.[platform]
                        const isLinked = info?.linked ?? false
                        const displayName = info?.platformName ?? null
                        const isUnlinking = unlinking === platform

                        return (
                            <div key={platform} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${platform === 'telegram' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                                        {platform === 'telegram'
                                            ? <i className="fab fa-telegram text-blue-500 text-lg" />
                                            : <i className="fas fa-robot text-purple-500 text-lg" />}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900 text-sm">
                                            {platform === 'telegram' ? 'Telegram' : 'MAX'}
                                        </p>
                                        {isLinked && displayName
                                            ? <p className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {displayName}</p>
                                            : <p className="text-xs text-gray-400">Не привязан</p>}
                                    </div>
                                </div>

                                {isLinked ? (
                                    <button
                                        onClick={() => handleUnlink(platform)}
                                        disabled={isUnlinking}
                                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                                    >
                                        {isUnlinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2Off className="w-3 h-3" />}
                                        Отвязать
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => startLinking(platform)}
                                        disabled={!!linking}
                                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition disabled:opacity-50"
                                    >
                                        <Link2 className="w-3 h-3" />
                                        Привязать
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Linking modal */}
                {linking && (
                    <div className="mt-4 p-4 border-2 border-primary-200 bg-primary-50 rounded-xl">
                        {linking.status === 'waiting' && (
                            <>
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                    Привязка {linking.platform === 'telegram' ? 'Telegram' : 'MAX'}
                                </p>
                                <p className="text-xs text-gray-600 mb-3">
                                    Откройте бота и отправьте команду, или нажмите кнопку ниже:
                                </p>
                                <div className="flex items-center gap-2 mb-3">
                                    <code className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono text-gray-700 truncate">
                                        /start link_{linking.token}
                                    </code>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(`/start link_${linking.token}`)}
                                        className="px-2 py-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition text-xs"
                                        title="Скопировать"
                                    >
                                        <i className="fas fa-copy" />
                                    </button>
                                </div>
                                <a
                                    href={linking.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 transition mb-3"
                                >
                                    <i className={`fab fa-${linking.platform === 'telegram' ? 'telegram' : 'robot'}`} />
                                    Открыть бота
                                </a>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <Loader2 className="w-3 h-3 animate-spin text-primary-500" />
                                    Ожидаю подтверждения...
                                    <button onClick={cancelLinking} className="ml-auto text-gray-400 hover:text-gray-600">Отмена</button>
                                </div>
                            </>
                        )}
                        {linking.status === 'done' && (
                            <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" /> Платформа успешно привязана!
                            </p>
                        )}
                        {linking.status === 'expired' && (
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-red-600 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" /> Токен истёк. Попробуйте снова.
                                </p>
                                <button onClick={cancelLinking} className="text-xs text-gray-500 hover:text-gray-700">Закрыть</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Notifications Section */}
            <div className="dashboard-card">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Уведомления</h2>

                <div className="space-y-4">
                    {/* New Course Content */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-50">
                        <div>
                            <h3 className="font-semibold text-gray-900">Новый контент</h3>
                            <p className="text-sm text-gray-600">Уведомлять о выходе новых курсов или материалов.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notifications.notifyNewCourse}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, notifyNewCourse: e.target.checked })
                                }
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>

                    {/* Student Progress */}
                    <div className="flex items-center justify-between py-3 border-b border-gray-50">
                        <div>
                            <h3 className="font-semibold text-gray-900">Прогресс учеников</h3>
                            <p className="text-sm text-gray-600">Получать уведомления о достижениях учеников.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notifications.notifyStudentProgress}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, notifyStudentProgress: e.target.checked })
                                }
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>

                    {/* Weekly Report */}
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <h3 className="font-semibold text-gray-900">Email уведомления</h3>
                            <p className="text-sm text-gray-600">Получать ежедневные сводки на почту.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notifications.notifyWeeklyReport}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, notifyWeeklyReport: e.target.checked })
                                }
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    )
}
