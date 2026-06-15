'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import TeacherDiaryTab from '@/components/students/TeacherDiaryTab'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'

export default function DiaryPage() {
    const router = useRouter()
    const menu = useMobileMenu()
    return (
        <>
            <Topbar
                title="Дневник учителя"
                subtitle="Записи уроков, цели и анализ занятий"
                onMobileMenuToggle={menu.toggle}
                hideSearch
                leading={
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                        aria-label="Назад"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                }
            />
            <div className="max-w-[1320px] w-full mx-auto p-8 max-md:p-4">
                <TeacherDiaryTab />
            </div>
        </>
    )
}
