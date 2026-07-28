'use client'

import { useEffect, useState } from 'react'
import {
    CheckCircle2,
    Download,
    FileText,
    Loader2,
    Monitor,
    Smartphone,
    Users,
    X,
} from 'lucide-react'
import {
    downloadPdfById,
    downloadPresentationPdfById,
    type PresentationPdfLayout,
} from '@/lib/utils/downloadPdf'

// DOCX-экспорт временно отключён (дублирование контента), оставляем только PDF.

type DownloadState = 'idle' | 'loading' | 'success' | 'error'

interface DownloadPdfModalProps {
    isOpen: boolean
    onClose: () => void
    generationId: string | null | undefined
    filename: string
    /**
     * Если `true` — показываем два варианта скачивания (с ответами / без).
     * Если `false` — сразу триггерим скачивание со всеми ответами при открытии.
     */
    hasAnswers?: boolean
    /**
     * Для генераций с несколькими разделами (Вау-урок): индекс раздела,
     * который надо скачать. Если не задан — скачивается весь документ.
     */
    sectionIndex?: number
    /**
     * Презентации скачиваются через landscape endpoint /presentation/pdf,
     * а не через общий документный /pdf.
     */
    presentation?: boolean
}

export default function DownloadPdfModal({
    isOpen,
    onClose,
    generationId,
    filename,
    hasAnswers = false,
    sectionIndex,
    presentation = false,
}: DownloadPdfModalProps) {
    const [state, setState] = useState<DownloadState>('idle')
    const [error, setError] = useState<string>('')

    useEffect(() => {
        if (isOpen) {
            setState('idle')
            setError('')
        }
    }, [isOpen])

    const download = async (
        withAnswers: boolean,
        presentationLayout: PresentationPdfLayout = 'landscape',
    ) => {
        if (!generationId) {
            setError('Не найден id генерации')
            setState('error')
            return
        }
        setState('loading')
        setError('')
        try {
            const baseName = filename.replace(/\.(pdf|docx)$/i, '')
            const suffix = hasAnswers && !withAnswers ? '-student' : ''
            const finalName = `${baseName}${suffix}.pdf`
            if (presentation) {
                await downloadPresentationPdfById(generationId, finalName, presentationLayout)
            } else {
                await downloadPdfById(generationId, finalName, { withAnswers, sectionIndex })
            }
            setState('success')
            setTimeout(() => onClose(), 900)
        } catch (e: any) {
            setError(e?.message || 'Не удалось сформировать PDF')
            setState('error')
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in"
            onClick={() => state !== 'loading' && onClose()}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                            <Download className="w-5 h-5 text-yellow-700" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">
                                {presentation ? 'Скачать презентацию' : 'Скачать документ'}
                            </h2>
                            <p className="text-[12px] text-gray-500">
                                {presentation
                                    ? 'Выберите ориентацию PDF'
                                    : hasAnswers
                                        ? 'Выберите формат и вариант'
                                        : 'Выберите формат'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={state === 'loading'}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
                        aria-label="Закрыть"
                    >
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {state === 'loading' && (
                        <div className="flex flex-col items-center py-6 text-center">
                            <Loader2 className="w-10 h-10 text-yellow-600 animate-spin mb-3" />
                            <p className="text-sm font-semibold text-gray-900">Формируем PDF…</p>
                            <p className="text-[12px] text-gray-500 mt-1">Это займёт несколько секунд</p>
                        </div>
                    )}

                    {state === 'success' && (
                        <div className="flex flex-col items-center py-6 text-center">
                            <CheckCircle2 className="w-10 h-10 text-green-600 mb-3" />
                            <p className="text-sm font-semibold text-gray-900">Готово!</p>
                            <p className="text-[12px] text-gray-500 mt-1">PDF скачивается</p>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="flex flex-col items-center py-6 text-center">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-3">
                                <X className="w-5 h-5 text-red-600" />
                            </div>
                            <p className="text-sm font-semibold text-gray-900">Не удалось скачать</p>
                            <p className="text-[12px] text-gray-500 mt-1">{error}</p>
                            <button
                                onClick={() => setState('idle')}
                                className="mt-4 px-4 py-2 text-[12px] font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg"
                            >
                                Попробовать снова
                            </button>
                        </div>
                    )}

                    {/* Формат-селектор PDF/DOCX временно скрыт — DOCX-экспорт
                        отключён до фикса дублирования контента. */}

                    {state === 'idle' && (
                        presentation ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    onClick={() => download(true, 'landscape')}
                                    className="group relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 border-brand-200 hover:border-brand-500 hover:bg-brand-50 transition-all text-left"
                                >
                                    <span className="absolute top-2.5 right-2.5 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                                        Рекомендуем
                                    </span>
                                    <div className="w-12 h-9 bg-brand-100 rounded-lg flex items-center justify-center group-hover:bg-brand-200 transition-colors">
                                        <Monitor className="w-6 h-6 text-brand-700" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Горизонтально</p>
                                        <p className="text-[12px] text-gray-500 mt-0.5">16:9 · 1280 × 720</p>
                                        <p className="text-[11px] text-gray-400 mt-1">Обычная презентация</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => download(true, 'portrait')}
                                    className="group flex flex-col items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-all text-left"
                                >
                                    <div className="w-9 h-12 bg-violet-100 rounded-lg flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                                        <Smartphone className="w-5 h-5 text-violet-700" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Вертикально</p>
                                        <p className="text-[12px] text-gray-500 mt-0.5">9:16 · 720 × 1280</p>
                                        <p className="text-[11px] text-gray-400 mt-1">Как текущий PDF</p>
                                    </div>
                                </button>
                            </div>
                        ) : hasAnswers ? (
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => download(true)}
                                    className="group flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-all text-left"
                                >
                                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-yellow-200 transition-colors">
                                        <FileText className="w-5 h-5 text-yellow-700" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">С ответами</p>
                                        <p className="text-[12px] text-gray-500 mt-0.5">Для учителя — с ключом ответов</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => download(false)}
                                    className="group flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
                                >
                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                                        <Users className="w-5 h-5 text-blue-700" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">Без ответов</p>
                                        <p className="text-[12px] text-gray-500 mt-0.5">Для ученика — только задания</p>
                                    </div>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => download(true)}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-white font-semibold transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Скачать PDF
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    )
}
