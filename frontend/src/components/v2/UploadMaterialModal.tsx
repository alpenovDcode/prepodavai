'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, FileText, ImageIcon, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Modal } from '@/components/ui/v2/Modal'
import { Button } from '@/components/ui/v2/Button'
import { cn } from '@/lib/utils/cn'

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileLabel(file: File): { icon: typeof FileText; tag: string } {
    if (file.type === 'application/pdf') return { icon: FileText, tag: 'PDF' }
    return { icon: ImageIcon, tag: file.type === 'image/png' ? 'PNG' : 'JPG' }
}

export interface UploadMaterialModalProps {
    isOpen: boolean
    onClose: () => void
    /** Вызывается после успешной загрузки — родитель может обновить список. */
    onUploaded?: (generationId: string) => void
}

export function UploadMaterialModal({ isOpen, onClose, onUploaded }: UploadMaterialModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const reset = useCallback(() => {
        setFile(null)
        setTitle('')
        setError(null)
        setUploading(false)
        setDragOver(false)
    }, [])

    const handleClose = useCallback(() => {
        if (uploading) return
        reset()
        onClose()
    }, [uploading, reset, onClose])

    const validate = (f: File): string | null => {
        if (!ALLOWED_MIMES.includes(f.type)) return 'Поддерживаются только PDF, JPG и PNG.'
        if (f.size > MAX_SIZE_BYTES) return `Максимальный размер 50 MB (выбрано ${formatSize(f.size)}).`
        if (f.size === 0) return 'Файл пустой.'
        return null
    }

    const accept = (f: File) => {
        const err = validate(f)
        if (err) {
            setError(err)
            setFile(null)
            return
        }
        setError(null)
        setFile(f)
        // Префилл названия из имени файла без расширения
        if (!title) {
            const dot = f.name.lastIndexOf('.')
            setTitle(dot > 0 ? f.name.slice(0, dot) : f.name)
        }
    }

    const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) accept(f)
    }

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) accept(f)
    }

    const onSubmit = async () => {
        if (!file || uploading) return
        setUploading(true)
        setError(null)
        try {
            const fd = new FormData()
            fd.append('file', file)
            if (title.trim()) fd.append('title', title.trim())
            const res = await apiClient.post('/generate/upload-material', fd)
            const generationId: string | undefined = res.data?.generationId
            if (!generationId) throw new Error('Сервер не вернул generationId')
            toast.success('Материал загружен')
            onUploaded?.(generationId)
            reset()
            onClose()
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Не удалось загрузить файл'
            setError(typeof msg === 'string' ? msg : 'Ошибка загрузки')
        } finally {
            setUploading(false)
        }
    }

    const FilePreviewIcon = file ? fileLabel(file).icon : null

    return (
        <Modal open={isOpen} onClose={handleClose} title="Загрузить материал" size="md">
            <div className="flex flex-col gap-4">
                {!file ? (
                    <div
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={cn(
                            'cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                            dragOver
                                ? 'border-[var(--brand-400)] bg-[var(--brand-50)]'
                                : 'border-ink-200 bg-ink-50 hover:border-ink-300 hover:bg-ink-100',
                        )}
                    >
                        <Upload className="w-8 h-8 text-ink-400 mx-auto mb-3" />
                        <p className="text-[14px] font-semibold text-ink-800">
                            Перетащите файл сюда или нажмите для выбора
                        </p>
                        <p className="text-[12px] text-ink-500 mt-1">
                            PDF, JPG или PNG, до 50 MB
                        </p>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="hidden"
                            onChange={onPick}
                        />
                    </div>
                ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3">
                        {FilePreviewIcon && <FilePreviewIcon className="w-6 h-6 text-ink-500" />}
                        <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-ink-800 truncate">{file.name}</p>
                            <p className="text-[12px] text-ink-500">
                                {fileLabel(file).tag} · {formatSize(file.size)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={uploading}
                            className="p-1 rounded hover:bg-ink-100 disabled:opacity-50"
                            aria-label="Убрать файл"
                        >
                            <X className="w-4 h-4 text-ink-500" />
                        </button>
                    </div>
                )}

                <div>
                    <label htmlFor="upload-material-title" className="block text-[12px] font-semibold text-ink-700 mb-1">
                        Название (опционально)
                    </label>
                    <input
                        id="upload-material-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Например: Учебник Алгебра 7 класс"
                        disabled={uploading}
                        className="w-full h-10 px-3 rounded-lg border border-ink-200 bg-white text-[14px] outline-none focus:border-[var(--brand-400)] focus:ring-2 focus:ring-[var(--brand-100)] disabled:opacity-60"
                    />
                </div>

                {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={handleClose} disabled={uploading}>
                        Отмена
                    </Button>
                    <Button
                        variant="primary"
                        onClick={onSubmit}
                        disabled={!file || uploading}
                        leftIcon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    >
                        {uploading ? 'Загрузка…' : 'Загрузить'}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
