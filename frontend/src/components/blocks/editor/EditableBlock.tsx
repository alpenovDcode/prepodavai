'use client'

import { useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, Trash2, Copy, Plus } from 'lucide-react'

/**
 * Обёртка вокруг блока в режиме редактирования.
 *
 * UX (после переработки C):
 *   - В обычном состоянии — НИКАКИХ всплывающих контролов сбоку.
 *     Документ выглядит как документ, не как редактор базы данных.
 *   - При hover'е — слабая подсветка фона у блока (намёк что кликабелен).
 *   - При selected (клик по блоку) — над блоком всплывает узкий тулбар:
 *     ↑ ↓ Дублировать Удалить. Контролы НЕ загромождают потоки документа.
 *   - Между блоками — узкий gap (3px). При hover'е на этот gap появляется
 *     синяя линия с кнопкой "+ блок" посередине.
 *
 * Никаких изменений ширины/прыжков при hover'е — тулбар появляется ПОВЕРХ
 * (absolute), не сдвигает контент.
 */

export interface EditableBlockProps {
    children: ReactNode
    isFirst: boolean
    isLast: boolean
    onMoveUp: () => void
    onMoveDown: () => void
    onDuplicate: () => void
    onDelete: () => void
    onAddAfter: () => void
    selected?: boolean
    onClick?: () => void
}

export function EditableBlock({
    children, isFirst, isLast, onMoveUp, onMoveDown, onDuplicate, onDelete, onAddAfter, selected, onClick,
}: EditableBlockProps) {
    const [hover, setHover] = useState(false)

    return (
        <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {/* Floating toolbar — только когда selected */}
            {selected && (
                <div className="absolute -top-9 left-0 z-20 flex items-center gap-0.5 bg-white border border-ink-200 rounded-md shadow-md px-1 py-1">
                    <ToolbarBtn title="Вверх" disabled={isFirst} onClick={onMoveUp}>
                        <ChevronUp className="w-3.5 h-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn title="Вниз" disabled={isLast} onClick={onMoveDown}>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </ToolbarBtn>
                    <ToolbarSep />
                    <ToolbarBtn title="Дублировать" onClick={onDuplicate}>
                        <Copy className="w-3.5 h-3.5" />
                    </ToolbarBtn>
                    <ToolbarBtn title="Удалить" onClick={onDelete} danger>
                        <Trash2 className="w-3.5 h-3.5" />
                    </ToolbarBtn>
                </div>
            )}

            {/* Контент блока (рендерер или inline-редактор) */}
            <div
                role="button"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={(e) => { if (e.key === 'Enter' && onClick) onClick() }}
                className={[
                    'relative rounded-md transition-colors',
                    'px-3 py-1 -mx-3 -my-1', // компенсируем рамку, чтобы блок не «прыгал»
                    onClick ? 'cursor-pointer' : '',
                    selected
                        ? 'ring-2 ring-brand-300 ring-offset-2 ring-offset-transparent'
                        : hover
                            ? 'bg-ink-50/50'
                            : '',
                ].join(' ')}
            >
                {children}
            </div>

            {/* Узкий gap для добавления блока после */}
            <AddGap onClick={onAddAfter} />
        </div>
    )
}

function ToolbarBtn({
    children, onClick, title, disabled, danger,
}: { children: ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            className={[
                'w-7 h-7 inline-flex items-center justify-center rounded transition-colors',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                danger
                    ? 'text-danger-600 hover:bg-danger-50'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
            ].join(' ')}
        >
            {children}
        </button>
    )
}

function ToolbarSep() {
    return <span className="w-px h-4 bg-ink-200 mx-0.5" aria-hidden />
}

/**
 * Промежуток между блоками с появляющейся «+ блок» по hover'у. Чтобы кнопка
 * не выпрыгивала в потоке (с прыжком layout'а), gap имеет фиксированную высоту
 * и кнопка всплывает абсолютно по центру.
 */
function AddGap({ onClick }: { onClick: () => void }) {
    return (
        <div className="relative h-4 group/gap" data-add-gap>
            {/* Линия */}
            <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px bg-transparent group-hover/gap:bg-brand-200 transition-colors pointer-events-none" />
            {/* Кнопка */}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClick() }}
                title="Добавить блок"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/gap:opacity-100 transition-opacity inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-brand-500 text-white text-[11px] font-semibold shadow-sm hover:bg-brand-600 z-10"
            >
                <Plus className="w-3 h-3" /> блок
            </button>
        </div>
    )
}
