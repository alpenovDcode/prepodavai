'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'

/**
 * Дефолтный shell для подстраниц /workspace/* в v2.
 * Даёт Topbar с back-кнопкой к ИИ-Генератору, балансом токенов и уведомлениями.
 * Подстраницы (worksheet/quiz/presentation/...) могут не ставить свой Topbar.
 */
const TOOL_LABELS: Record<string, string> = {
    worksheet:        'Рабочий лист',
    'quiz-generator': 'Генератор тестов',
    quiz:             'Генератор тестов',
    presentations:    'Презентации',
    'lesson-planner': 'Конструктор уроков',
    'lesson-prep':    'Вау-урок',
    vocabulary:       'Словарь',
    adaptation:       'Адаптация текста',
    games:            'Обучающие игры',
    exam:             'Варианты ОГЭ/ЕГЭ',
    homework:         'Проверка ДЗ',
    feedback:         'Фидбек',
    image:            'Генератор изображений',
    photosession:     'AI-фотосессия',
    transcription:    'Транскрибация видео',
    'video-analysis': 'Анализ видео',
    assistant:        'AI-ассистент',
    unpacking:        'Распаковка экспертности',
    'sales-advisor':  'ИИ-продажник',
    messages:         'Сообщения родителям',
}

export function WorkspaceShellV2({ children }: { children: ReactNode }) {
    const pathname = usePathname() || ''
    const menu = useMobileMenu()

    // /workspace → хаб (его собственный Topbar). Не дублируем.
    if (pathname === '/workspace' || pathname === '/workspace/') {
        return <>{children}</>
    }

    const segment = pathname.split('/').filter(Boolean)[1] || ''
    const label = TOOL_LABELS[segment] || 'Инструмент'

    return (
        <>
            <Topbar
                title={label}
                subtitle="ИИ Генератор"
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Link
                        href="/workspace"
                        className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-[13px] font-semibold text-ink-600 hover:bg-ink-100 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Все инструменты
                    </Link>
                }
            />
            <div className="flex-1">
                {children}
            </div>
        </>
    )
}
