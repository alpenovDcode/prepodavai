'use client'

import {
    AlignCenter, AlignLeft, AlignRight, BringToFront, ChevronDown, ChevronUp,
    Copy, ImagePlus, Layers3, Plus, Redo2, Save, SendToBack, Shapes, Trash2,
    Type, Undo2, X,
} from 'lucide-react'
import {
    CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, useCallback,
    useEffect, useMemo, useRef, useState,
} from 'react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Button } from '@/components/ui/v2/Button'
import MathContent from '@/components/MathContent'
import type {
    CanvasElement, CanvasElementStyle, CanvasPresentation, CanvasSlide,
} from '@/types/presentation-canvas'
import {
    PRESENTATION_CANVAS_HEIGHT, PRESENTATION_CANVAS_WIDTH,
} from '@/types/presentation-canvas'

const GRID = 8
const HISTORY_LIMIT = 50

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function uid(prefix: string): string {
    return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function fontFamily(font: CanvasElementStyle['fontFamily']): string {
    return font === 'Courier New' ? '"Courier New", monospace' : `${font || 'Inter'}, Arial, sans-serif`
}

function escapePlainText(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function CanvasAssetImage({ hash, className, style }: { hash?: string; className?: string; style?: CSSProperties }) {
    const [src, setSrc] = useState<string | null>(null)
    useEffect(() => {
        if (!hash) { setSrc(null); return }
        let alive = true
        let objectUrl: string | null = null
        apiClient.get(`/files/${hash}`, { responseType: 'blob' })
            .then(res => {
                objectUrl = URL.createObjectURL(res.data)
                if (alive) setSrc(objectUrl)
            })
            .catch(() => { if (alive) setSrc(null) })
        return () => {
            alive = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [hash])
    if (!src) return <div className={`${className || ''} bg-ink-100 border border-dashed border-ink-300`} style={style} />
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" draggable={false} className={className} style={style} />
}

function elementStyle(element: CanvasElement): CSSProperties {
    const style = element.style || {}
    return {
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
        transform: `rotate(${element.rotation}deg)`,
        opacity: style.opacity ?? 1,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderStyle: style.borderColor ? 'solid' : undefined,
        borderWidth: style.borderColor ? style.borderWidth ?? 1 : undefined,
        borderRadius: element.shapeType === 'ellipse' ? '50%' : style.borderRadius,
        color: style.color || '#0F172A',
        fontFamily: fontFamily(style.fontFamily),
        fontSize: style.fontSize || 24,
        fontWeight: style.fontWeight || '400',
        fontStyle: style.fontStyle || 'normal',
        textAlign: style.textAlign || 'left',
        lineHeight: style.lineHeight || 1.25,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        overflow: 'hidden',
        boxSizing: 'border-box',
        userSelect: 'none',
    }
}

function ElementView({ element }: { element: CanvasElement }) {
    const style = elementStyle(element)
    if (element.type === 'image') {
        return (
            <CanvasAssetImage
                hash={element.assetHash}
                style={{ ...style, objectFit: element.style.objectFit || 'contain' }}
            />
        )
    }
    if (element.type === 'shape') {
        if (element.shapeType === 'line') {
            return <div style={{ ...style, height: Math.max(2, element.style.borderWidth || 2), background: element.style.borderColor || element.style.backgroundColor || '#0F172A' }} />
        }
        return <div style={style} />
    }
    // Thumbnails intentionally stay plain-text: rendering MathJax separately
    // in every miniature would launch hundreds of typeset jobs on large decks.
    return <div style={style}>{element.text || ''}</div>
}

export function PresentationCanvasSlide({
    slide, selectedId, onSelect, onPointerDown, onResizePointerDown, onEditText,
}: {
    slide: CanvasSlide
    selectedId?: string | null
    onSelect?: (id: string | null) => void
    onPointerDown?: (event: ReactPointerEvent, element: CanvasElement) => void
    onResizePointerDown?: (event: ReactPointerEvent, element: CanvasElement) => void
    onEditText?: (element: CanvasElement) => void
}) {
    return (
        <div
            className="relative overflow-hidden shadow-xl"
            style={{ width: PRESENTATION_CANVAS_WIDTH, height: PRESENTATION_CANVAS_HEIGHT, background: slide.background }}
            onPointerDown={() => onSelect?.(null)}
        >
            {[...slide.elements].sort((a, b) => a.zIndex - b.zIndex).map(element => (
                <div
                    key={element.id}
                    className="absolute"
                    style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex }}
                    onPointerDown={event => {
                        event.stopPropagation()
                        onSelect?.(element.id)
                        onPointerDown?.(event, element)
                    }}
                    onDoubleClick={event => {
                        event.stopPropagation()
                        if (element.type === 'text') onEditText?.(element)
                    }}
                >
                    <div style={{ ...elementStyle(element), left: 0, top: 0 }}>
                        {element.type === 'image'
                            ? <CanvasAssetImage hash={element.assetHash} style={{ width: '100%', height: '100%', objectFit: element.style.objectFit || 'contain' }} />
                            : element.type === 'text'
                                ? <MathContent html={escapePlainText(element.text || '')} />
                                : null}
                    </div>
                    {selectedId === element.id && (
                        <>
                            <div className="absolute inset-0 border-[3px] border-brand-500 pointer-events-none" />
                            <button
                                type="button"
                                aria-label="Изменить размер"
                                className="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-white border-[3px] border-brand-500 cursor-nwse-resize"
                                onPointerDown={event => {
                                    event.stopPropagation()
                                    onResizePointerDown?.(event, element)
                                }}
                            />
                        </>
                    )}
                </div>
            ))}
        </div>
    )
}

function ScaledSlide({
    slide, children, className = '',
}: {
    slide: CanvasSlide
    children?: (scale: number) => ReactNode
    className?: string
}) {
    const ref = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(0.5)
    useEffect(() => {
        const node = ref.current
        if (!node) return
        const resize = () => {
            const bounds = node.getBoundingClientRect()
            setScale(Math.max(0.08, Math.min(bounds.width / PRESENTATION_CANVAS_WIDTH, bounds.height / PRESENTATION_CANVAS_HEIGHT)))
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(node)
        return () => observer.disconnect()
    }, [])
    return (
        <div ref={ref} className={`relative overflow-hidden ${className}`}>
            <div
                className="absolute left-1/2 top-1/2"
                style={{
                    width: PRESENTATION_CANVAS_WIDTH,
                    height: PRESENTATION_CANVAS_HEIGHT,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: 'center',
                }}
            >
                {children ? children(scale) : <PresentationCanvasSlide slide={slide} />}
            </div>
        </div>
    )
}

function TinySlide({ slide }: { slide: CanvasSlide }) {
    return (
        <div className="relative w-full aspect-video overflow-hidden bg-white">
            <div style={{ width: 1280, height: 720, transform: 'scale(0.116)', transformOrigin: 'top left', background: slide.background }}>
                {slide.elements.map(element => <ElementView key={element.id} element={element} />)}
            </div>
        </div>
    )
}

export function PresentationCanvasPlayer({ data }: { data: CanvasPresentation }) {
    const [active, setActive] = useState(0)
    const slide = data.slides[Math.min(active, data.slides.length - 1)]
    useEffect(() => { if (active >= data.slides.length) setActive(0) }, [active, data.slides.length])
    if (!slide) return null
    return (
        <div className="h-full min-h-0 flex bg-ink-100">
            <aside className="w-32 flex-shrink-0 overflow-y-auto border-r border-ink-200 bg-white p-2 space-y-2">
                {data.slides.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => setActive(index)}
                        className={`block w-full rounded border-2 overflow-hidden ${index === active ? 'border-brand-500' : 'border-transparent hover:border-ink-300'}`}>
                        <TinySlide slide={item} />
                        <span className="block py-1 text-[10px] text-ink-500">{index + 1}</span>
                    </button>
                ))}
            </aside>
            <ScaledSlide slide={slide} className="flex-1 min-w-0 min-h-0" />
        </div>
    )
}

type Interaction = {
    kind: 'move' | 'resize'
    elementId: string
    startX: number
    startY: number
    original: CanvasElement
    before: CanvasPresentation
    scale: number
}

export default function PresentationCanvasEditor({
    initialData, saving, onCancel, onSave,
}: {
    initialData: CanvasPresentation
    saving?: boolean
    onCancel: () => void
    onSave: (data: CanvasPresentation) => void | Promise<void>
}) {
    const [data, setData] = useState(() => clone(initialData))
    const [active, setActive] = useState(0)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [interaction, setInteraction] = useState<Interaction | null>(null)
    const [editingText, setEditingText] = useState<string | null>(null)
    const [undoStack, setUndoStack] = useState<CanvasPresentation[]>([])
    const [redoStack, setRedoStack] = useState<CanvasPresentation[]>([])
    const uploadRef = useRef<HTMLInputElement>(null)
    const slide = data.slides[active]
    const selected = slide?.elements.find(element => element.id === selectedId) || null

    const commit = useCallback((updater: (current: CanvasPresentation) => CanvasPresentation) => {
        setData(current => {
            const next = updater(clone(current))
            setUndoStack(stack => [...stack.slice(-(HISTORY_LIMIT - 1)), clone(current)])
            setRedoStack([])
            return next
        })
    }, [])

    const patchElement = useCallback((id: string, patch: Partial<CanvasElement>, record = true) => {
        const apply = (current: CanvasPresentation) => {
            current.slides[active].elements = current.slides[active].elements.map(element =>
                element.id === id ? { ...element, ...patch, style: patch.style ? { ...element.style, ...patch.style } : element.style } : element,
            )
            return current
        }
        if (record) commit(apply)
        else setData(current => apply(clone(current)))
    }, [active, commit])

    const undo = useCallback(() => {
        setUndoStack(stack => {
            if (!stack.length) return stack
            const previous = stack[stack.length - 1]
            setRedoStack(redo => [...redo, clone(data)])
            setData(clone(previous))
            setSelectedId(null)
            return stack.slice(0, -1)
        })
    }, [data])
    const redo = useCallback(() => {
        setRedoStack(stack => {
            if (!stack.length) return stack
            const next = stack[stack.length - 1]
            setUndoStack(undoValues => [...undoValues, clone(data)])
            setData(clone(next))
            setSelectedId(null)
            return stack.slice(0, -1)
        })
    }, [data])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault()
                if (event.shiftKey) redo()
                else undo()
                return
            }
            if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
                event.preventDefault()
                commit(current => {
                    current.slides[active].elements = current.slides[active].elements.filter(element => element.id !== selectedId)
                    return current
                })
                setSelectedId(null)
                return
            }
            if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault()
                const step = event.shiftKey ? GRID : 1
                patchElement(selected.id, {
                    x: selected.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                    y: selected.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                })
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [active, commit, patchElement, redo, selected, selectedId, undo])

    useEffect(() => {
        if (!interaction) return
        const move = (event: PointerEvent) => {
            const dx = (event.clientX - interaction.startX) / interaction.scale
            const dy = (event.clientY - interaction.startY) / interaction.scale
            if (interaction.kind === 'move') {
                patchElement(interaction.elementId, {
                    x: Math.round((interaction.original.x + dx) / GRID) * GRID,
                    y: Math.round((interaction.original.y + dy) / GRID) * GRID,
                }, false)
            } else {
                patchElement(interaction.elementId, {
                    width: Math.max(24, Math.round((interaction.original.width + dx) / GRID) * GRID),
                    height: Math.max(24, Math.round((interaction.original.height + dy) / GRID) * GRID),
                }, false)
            }
        }
        const up = () => {
            setUndoStack(stack => [...stack.slice(-(HISTORY_LIMIT - 1)), interaction.before])
            setRedoStack([])
            setInteraction(null)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up, { once: true })
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [interaction, patchElement])

    const beginInteraction = (kind: Interaction['kind'], event: ReactPointerEvent, element: CanvasElement, scale: number) => {
        if (editingText) return
        event.preventDefault()
        setInteraction({
            kind, elementId: element.id, startX: event.clientX, startY: event.clientY,
            original: clone(element), before: clone(data), scale,
        })
    }

    const addElement = (element: CanvasElement) => {
        commit(current => {
            current.slides[active].elements.push(element)
            return current
        })
        setSelectedId(element.id)
    }
    const nextZ = Math.min(1000, Math.max(0, ...(slide?.elements.map(element => element.zIndex) || [])) + 1)

    const addText = () => addElement({
        id: uid('text'), type: 'text', x: 360, y: 270, width: 560, height: 110,
        rotation: 0, zIndex: nextZ, text: 'Введите текст',
        style: { fontFamily: 'Inter', fontSize: 36, fontWeight: '600', color: '#0F172A', lineHeight: 1.2 },
    })
    const addShape = () => addElement({
        id: uid('shape'), type: 'shape', shapeType: 'rect', x: 460, y: 250, width: 360, height: 220,
        rotation: 0, zIndex: nextZ, style: { backgroundColor: '#4F46E5', borderRadius: 18 },
    })

    const uploadImage = async (file?: File) => {
        if (!file) return
        if (!file.type.startsWith('image/')) { toast.error('Выберите изображение'); return }
        if (file.size > 10 * 1024 * 1024) { toast.error('Максимальный размер — 10 МБ'); return }
        const form = new FormData()
        form.append('file', file)
        try {
            const response = await apiClient.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
            const hash = response.data?.hash
            if (!hash) throw new Error('Сервер не вернул hash')
            addElement({
                id: uid('image'), type: 'image', assetHash: hash, x: 340, y: 150, width: 600, height: 420,
                rotation: 0, zIndex: nextZ, style: { objectFit: 'contain', borderRadius: 12 },
            })
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Не удалось загрузить изображение')
        } finally {
            if (uploadRef.current) uploadRef.current.value = ''
        }
    }

    const addSlide = () => {
        if (data.slides.length >= 24) { toast.error('Максимум 24 слайда'); return }
        commit(current => {
            current.slides.splice(active + 1, 0, { id: uid('slide'), background: '#FFFFFF', elements: [] })
            return current
        })
        setActive(active + 1)
        setSelectedId(null)
    }
    const duplicateSlide = () => {
        if (data.slides.length >= 24) { toast.error('Максимум 24 слайда'); return }
        commit(current => {
            const copy = clone(current.slides[active])
            copy.id = uid('slide')
            copy.elements = copy.elements.map(element => ({ ...element, id: uid(element.type) }))
            current.slides.splice(active + 1, 0, copy)
            return current
        })
        setActive(active + 1)
    }
    const deleteSlide = () => {
        if (data.slides.length <= 5) { toast.error('В презентации должно быть минимум 5 слайдов'); return }
        commit(current => {
            current.slides.splice(active, 1)
            return current
        })
        setActive(Math.max(0, active - 1))
        setSelectedId(null)
    }
    const moveSlide = (direction: -1 | 1) => {
        const target = active + direction
        if (target < 0 || target >= data.slides.length) return
        commit(current => {
            ;[current.slides[active], current.slides[target]] = [current.slides[target], current.slides[active]]
            return current
        })
        setActive(target)
    }

    const layer = (where: 'front' | 'back') => {
        if (!selected) return
        const zValues = slide.elements.map(element => element.zIndex)
        patchElement(selected.id, { zIndex: where === 'front' ? Math.min(1000, Math.max(...zValues) + 1) : Math.max(0, Math.min(...zValues) - 1) })
    }

    return (
        <div className="h-full min-h-0 flex flex-col bg-ink-100 text-ink-900">
            <div className="h-14 flex-shrink-0 flex items-center gap-1.5 px-3 bg-white border-b border-ink-200 overflow-x-auto">
                <ToolButton title="Добавить текст" onClick={addText}><Type /></ToolButton>
                <ToolButton title="Добавить фигуру" onClick={addShape}><Shapes /></ToolButton>
                <ToolButton title="Загрузить изображение" onClick={() => uploadRef.current?.click()}><ImagePlus /></ToolButton>
                <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={event => uploadImage(event.target.files?.[0])} />
                <span className="h-7 w-px bg-ink-200 mx-1" />
                <ToolButton title="Отменить (⌘Z)" onClick={undo} disabled={!undoStack.length}><Undo2 /></ToolButton>
                <ToolButton title="Повторить (⇧⌘Z)" onClick={redo} disabled={!redoStack.length}><Redo2 /></ToolButton>
                {selected && (
                    <>
                        <span className="h-7 w-px bg-ink-200 mx-1" />
                        <ToolButton title="На передний план" onClick={() => layer('front')}><BringToFront /></ToolButton>
                        <ToolButton title="На задний план" onClick={() => layer('back')}><SendToBack /></ToolButton>
                        {selected.type === 'text' && (
                            <>
                                {(['left', 'center', 'right'] as const).map(align => (
                                    <ToolButton key={align} title={`Выравнивание: ${align}`} active={selected.style.textAlign === align}
                                        onClick={() => patchElement(selected.id, { style: { ...selected.style, textAlign: align } })}>
                                        {align === 'left' ? <AlignLeft /> : align === 'center' ? <AlignCenter /> : <AlignRight />}
                                    </ToolButton>
                                ))}
                                <input
                                    type="number"
                                    min={8}
                                    max={160}
                                    value={selected.style.fontSize || 24}
                                    onChange={event => patchElement(selected.id, { style: { ...selected.style, fontSize: Number(event.target.value) } })}
                                    className="w-16 h-8 rounded border border-ink-200 px-2 text-xs"
                                    title="Размер шрифта"
                                />
                                <input
                                    type="color"
                                    value={selected.style.color || '#0F172A'}
                                    onChange={event => patchElement(selected.id, { style: { ...selected.style, color: event.target.value } })}
                                    className="w-8 h-8 rounded border border-ink-200 p-0.5"
                                    title="Цвет текста"
                                />
                            </>
                        )}
                    </>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" leftIcon={<X className="w-4 h-4" />} onClick={onCancel} disabled={saving}>Отмена</Button>
                <Button variant="primary" size="sm" leftIcon={<Save className="w-4 h-4" />} onClick={() => onSave(data)} loading={saving}>Сохранить</Button>
            </div>

            <div className="flex-1 min-h-0 flex">
                <aside className="w-40 flex-shrink-0 bg-white border-r border-ink-200 flex flex-col">
                    <div className="p-2 grid grid-cols-4 gap-1 border-b border-ink-100">
                        <ToolButton title="Добавить слайд" onClick={addSlide}><Plus /></ToolButton>
                        <ToolButton title="Дублировать слайд" onClick={duplicateSlide}><Copy /></ToolButton>
                        <ToolButton title="Слайд выше" onClick={() => moveSlide(-1)} disabled={active === 0}><ChevronUp /></ToolButton>
                        <ToolButton title="Слайд ниже" onClick={() => moveSlide(1)} disabled={active === data.slides.length - 1}><ChevronDown /></ToolButton>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {data.slides.map((item, index) => (
                            <button key={item.id} type="button" onClick={() => { setActive(index); setSelectedId(null) }}
                                className={`w-full rounded-md border-2 overflow-hidden ${active === index ? 'border-brand-500 shadow-sm' : 'border-transparent hover:border-ink-300'}`}>
                                <TinySlide slide={item} />
                                <span className="flex items-center justify-between px-2 py-1 bg-white text-[10px] text-ink-500">
                                    <span>Слайд {index + 1}</span>
                                    {active === index && <Trash2 className="w-3 h-3 hover:text-danger-600" onClick={event => { event.stopPropagation(); deleteSlide() }} />}
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>

                <ScaledSlide slide={slide} className="flex-1 min-w-0 min-h-0">
                    {scale => (
                        <PresentationCanvasSlide
                            slide={slide}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onPointerDown={(event, element) => beginInteraction('move', event, element, scale)}
                            onResizePointerDown={(event, element) => beginInteraction('resize', event, element, scale)}
                            onEditText={element => setEditingText(element.id)}
                        />
                    )}
                </ScaledSlide>

                <aside className="w-56 flex-shrink-0 bg-white border-l border-ink-200 flex flex-col">
                    <div className="h-11 px-3 flex items-center gap-2 border-b border-ink-100 text-xs font-bold">
                        <Layers3 className="w-4 h-4" /> Слои
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {[...slide.elements].sort((a, b) => b.zIndex - a.zIndex).map(element => (
                            <button key={element.id} type="button" onClick={() => setSelectedId(element.id)}
                                className={`w-full flex items-center gap-2 rounded px-2 py-2 text-left text-xs ${selectedId === element.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-ink-50'}`}>
                                {element.type === 'text' ? <Type className="w-3.5 h-3.5" /> : element.type === 'image' ? <ImagePlus className="w-3.5 h-3.5" /> : <Shapes className="w-3.5 h-3.5" />}
                                <span className="truncate flex-1">{element.type === 'text' ? element.text || 'Текст' : element.type === 'image' ? 'Изображение' : 'Фигура'}</span>
                            </button>
                        ))}
                    </div>
                    {selected && (
                        <button type="button" onClick={() => {
                            commit(current => {
                                current.slides[active].elements = current.slides[active].elements.filter(element => element.id !== selected.id)
                                return current
                            })
                            setSelectedId(null)
                        }} className="m-2 h-9 rounded text-xs font-semibold text-danger-600 hover:bg-danger-50">
                            Удалить объект
                        </button>
                    )}
                </aside>
            </div>

            {editingText && selected?.type === 'text' && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setEditingText(null)}>
                    <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl p-4" onMouseDown={event => event.stopPropagation()}>
                        <label className="block text-xs font-bold text-ink-700 mb-2">Редактирование текста</label>
                        <textarea
                            autoFocus
                            value={selected.text || ''}
                            onChange={event => patchElement(selected.id, { text: event.target.value })}
                            rows={8}
                            className="w-full rounded-lg border border-ink-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
                        />
                        <div className="flex justify-end mt-3">
                            <Button variant="primary" size="sm" onClick={() => setEditingText(null)}>Готово</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ToolButton({
    title, onClick, disabled, active, children,
}: {
    title: string
    onClick: () => void
    disabled?: boolean
    active?: boolean
    children: ReactNode
}) {
    return (
        <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
            className={`w-8 h-8 rounded-md inline-flex items-center justify-center transition-colors [&>svg]:w-4 [&>svg]:h-4 ${
                active ? 'bg-brand-100 text-brand-700' : 'text-ink-600 hover:bg-ink-100'
            } disabled:opacity-30`}>
            {children}
        </button>
    )
}
