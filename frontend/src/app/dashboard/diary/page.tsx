'use client'

import TeacherDiaryTab from '@/components/students/TeacherDiaryTab'

export default function DiaryPage() {
    return (
        <div className="max-w-[1320px] w-full mx-auto p-8 max-md:p-4">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-ink-900">Дневник учителя</h1>
                <p className="text-sm text-ink-500 mt-1">Записи уроков, цели и анализ занятий</p>
            </div>
            <TeacherDiaryTab />
        </div>
    )
}
