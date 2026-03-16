'use client'

import { useState } from 'react'

export default function SettingsPage() {
    const [profile, setProfile] = useState({
        fullName: 'Jane Doe',
        email: 'jane.doe@email.com',
        bio: 'Middle school science teacher with a passion for interactive learning.',
    })

    const [notifications, setNotifications] = useState({
        newCourseContent: true,
        studentProgress: false,
        weeklyReport: true,
    })

    const handleSaveProfile = () => {
        console.log('Saving profile:', profile)
        // TODO: Implement save logic
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
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                        {profile.fullName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <button className="px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition shadow-md hover:shadow-lg mb-2">
                            Изменить аватар
                        </button>
                        <button className="block text-sm text-red-500 hover:text-red-600 font-medium">
                            Удалить
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

                <button
                    onClick={handleSaveProfile}
                    className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition"
                >
                    Сохранить изменения
                </button>
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
                                checked={notifications.newCourseContent}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, newCourseContent: e.target.checked })
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
                                checked={notifications.studentProgress}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, studentProgress: e.target.checked })
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
                                checked={notifications.weeklyReport}
                                onChange={(e) =>
                                    setNotifications({ ...notifications, weeklyReport: e.target.checked })
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
