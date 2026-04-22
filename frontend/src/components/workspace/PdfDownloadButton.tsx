'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'
import DownloadPdfModal from './DownloadPdfModal'

interface PdfDownloadButtonProps {
    generationId: string | null | undefined
    filename: string
    /**
     * Если `true` — модалка покажет выбор «с ответами / без ответов».
     * Для типов без ключа ответов показываем просто кнопку скачивания.
     */
    hasAnswers?: boolean
    /** Сообщение, если нажали до генерации */
    emptyMessage?: string
    /** Полностью переопределить классы кнопки. Если не задано — жёлтый стиль. */
    className?: string
}

const DEFAULT_CLASSES =
    'flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg transition-all disabled:opacity-40 flex-shrink-0'

export default function PdfDownloadButton({
    generationId,
    filename,
    hasAnswers = false,
    emptyMessage = 'Сначала сгенерируйте материал',
    className,
}: PdfDownloadButtonProps) {
    const [open, setOpen] = useState(false)

    const handleClick = () => {
        if (!generationId) {
            toast.error(emptyMessage)
            return
        }
        setOpen(true)
    }

    const buttonClasses = className ?? DEFAULT_CLASSES

    return (
        <>
            <button onClick={handleClick} className={buttonClasses}>
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
            </button>
            <DownloadPdfModal
                isOpen={open}
                onClose={() => setOpen(false)}
                generationId={generationId}
                filename={filename}
                hasAnswers={hasAnswers}
            />
        </>
    )
}
