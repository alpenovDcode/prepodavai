'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StudentSidebar from '@/components/StudentSidebar'
import { MessageSquare, Bell } from 'lucide-react'

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

export default function StudentMessagesPage() {
    const router = useRouter()
    const [user, setUser] = useState<StudentUser | null>(null)

    useEffect(() => {
        const userStr = localStorage.getItem('user')
        if (!userStr) {
            router.push('/student/login')
            return
        }
        setUser(JSON.parse(userStr))
    }, [router])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('user')
        router.push('/student/login')
    }

    return (
        <div className="flex min-h-screen bg-[#F9FAFB]">
            <StudentSidebar user={user} onLogout={handleLogout} />

            <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-4xl font-black text-gray-900 mb-2">Сообщения</h1>
                        <p className="text-gray-500 text-lg">Уведомления и сообщения от учителя</p>
                    </div>

                    <div className="text-center py-32">
                        <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-orange-200 mx-auto mb-6">
                            <MessageSquare size={44} />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-3">Раздел в разработке</h3>
                        <p className="text-gray-500 max-w-sm mx-auto">
                            Скоро здесь появятся уведомления о новых заданиях и сообщения от учителя.
                        </p>
                        <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 rounded-full text-sm font-semibold">
                            <Bell size={16} />
                            Уведомления придут позже
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
