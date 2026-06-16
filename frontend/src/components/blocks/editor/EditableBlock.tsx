'use client'

import { useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, Trash2, Copy, Plus, GripVertical } from 'lucide-react'

/**
 * Обёртка вокруг блока в режиме редактирования.
 *
 * UX:
 *   - В обычном состоянии блок выглядит как при чтении (через BlockRenderer
 *     либо специальный inline-редактор, передающийся children'ом).
 *   - При hover'е появляется компактная панель управления слева:
 *     перемещение вверх/вниз, дублировать, удалить.
 *   - Между блоками — кнопка-разделитель «+ добавить блок» — вызывает onAddAfter.
 *   - Выделение текущего блока (если editing=true) — оранжевая рамка.
 *
 * Принципы:
 *   - Не пытаемся быть рамкой-в-рамке: всё inline в потоке документа.
 *   - Контролы всплывают над контентом, не двигают вёрстку.
 *   - Никакого drag-and-drop в MVP (только кнопки) — drag добавим позже.
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
    /** Чтобы показывать рамку у блока, который в данный момент редактируется. */
    selected?: boolean
    /** Колбэк клика по блоку (выделение для последующего редактирования). */
    onClick?: () => void
}

export function EditableBlock({
    children, isFirst, isLast, onMoveUp, onMoveDown, onDuplicate, onDelete, onAddAfter, selected, onClick,
}: EditableBlockProps) {
    const [hover, setHover] = useState(false)

    return (
        <div className="relative group" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {/* Контент блока (рендерер или inline-редактор) */}
            <div
                role="button"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={(e) => { if (e.key === 'Enter' && onClick) onClick() }}
                className={[
                    'relative rounded-md transition-colors cursor-pointer',
                    'px-3 py-2 -mx-3 -my-2', // компенсируем рамку, чтобы блок не «прыгал» по ширине
                    selected
                        ? 'bg-brand-50 ring-2 ring-brand-300'
                        : hover
                            ? 'bg-ink-50/60'
                            : '',
                ].join(' ')}
            >
                {children}
            </div>

            {/* Контролы блока — всплывают по hover'у (или когда selected) */}
            {(hover || selected) && (
                <div className="absolute -left-9 top-1 flex flex-col gap-0.5 z-10">
                    <button
                        type="button"
                        title="Вверх"
                        onClick={(e) => { e.stopPropagation(); onMoveUp() }}
                        disabled={isFirst}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white border border-ink-200 shadow-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Вниз"
                        onClick={(e) => { e.stopPropagation(); onMoveDown() }}
                        disabled={isLast}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white border border-ink-200 shadow-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Дублировать"
                        onClick={(e) => { e.stopPropagation(); onDuplicate() }}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white border border-ink-200 shadow-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    >
                        <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Удалить"
                        onClick={(e) => { e.stopPropagation(); onDelete() }}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-white border border-ink-200 shadow-sm text-danger-600 hover:bg-danger-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Кнопка «добавить после» — снизу, в межблочном промежутке */}
            <AddBlockGap onClick={onAddAfter} />
        </div>
    )
}

function AddBlockGap({ onClick }: { onClick: () => void }) {
    return (
        <div className="relative h-3 group/gap">
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClick() }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/gap:opacity-100 transition-opacity inline-flex items-center gap-1 h-6 px-2 rounded-md bg-brand-500 text-white text-[11px] font-semibold shadow-sm hover:bg-brand-600 z-10"
                title="Добавить блок"
            >
                <Plus className="w-3 h-3" /> блок
            </button>
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-transparent group-hover/gap:bg-brand-200 transition-colors pointer-events-none" />
        </div>
    )
}

// Re-export icon for AddBlockMenu's «+ блок в самом начале» кнопка.
export { Plus, GripVertical }
