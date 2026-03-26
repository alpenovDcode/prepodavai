'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function SettingsPage() {
    const [profile, setProfile] = useState({
        fullName: '',
        email: '',
        bio: '',
        avatar: '',
    })

    const fileInputRef = useRef<HTMLInputElement>(null)

    const [notifications, setNotifications] = useState({
        notifyNewCourse: true,
        notifyStudentProgress: false,
        notifyWeeklyReport: true,
    })

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await apiClient.get('/users/me')
                if (response.data.success && response.data.user) {
                    const u = response.data.user
                    setProfile({
                        fullName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || '',
                        email: u.email || '',
                        bio: u.bio || '',
                        avatar: u.avatar || '',
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
    }, [])

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
                bio: profile.bio,
                avatar: profile.avatar,
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
                } catch (e) {}
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
                <h1 className="text-3xl font-bold text-gray-900">Настройки</h1>
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
                </div>

                <div className="mb-8">
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
