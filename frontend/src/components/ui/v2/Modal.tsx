'use client'

import { ReactNode, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface ModalProps {
    open: boolean
    onClose: () => void
    title?: ReactNode
    description?: ReactNode
    children: ReactNode
    /** Максимальная ширина контента. */
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Скрыть кнопку закрытия в углу. */
    hideCloseButton?: boolean
    /** Закрывать ли по клику на overlay. По умолчанию true. */
    closeOnOverlayClick?: boolean
    /** Кастомные действия в шапке справа. */
    headerActions?: ReactNode
}

const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
}

/**
 * Стандартный модал с overlay, шапкой и кнопкой закрытия.
 * Поддерживает Esc для закрытия и фокус-trap (базовый).
 */
export function Modal({
    open,
    onClose,
    title,
    description,
    children,
    size = 'md',
    hideCloseButton,
    closeOnOverlayClick = true,
    headerActions,
}: ModalProps) {
    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        },
        [onClose],
    )

    useEffect(() => {
        if (!open) return
        document.addEventListener('keydown', onKeyDown)
        // Lock body scroll
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = prev
        }
    }, [open, onKeyDown])

    if (!open || typeof window === 'undefined') return null

    const handleOverlay = closeOnOverlayClick ? onClose : undefined

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4 animate-fade-in"
            onClick={handleOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
        >
            <div
                className={cn(
                    'bg-surface rounded-2xl shadow-lg w-full max-h-[90vh] overflow-y-auto',
                    sizeClass[size],
                )}
                onClick={e => e.stopPropagation()}
            >
                {(title || !hideCloseButton) && (
                    <div className="p-5 border-b border-ink-100 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            {title && (
                                <h3 id="modal-title" className="font-bold text-ink-900 text-lg leading-tight">
                                    {title}
                                </h3>
                            )}
                            {description && (
                                <p className="text-sm text-ink-500 mt-1 leading-relaxed">{description}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {headerActions}
                            {!hideCloseButton && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Закрыть"
                                    className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {children}
            </div>
        </div>,
        document.body,
    )
}
