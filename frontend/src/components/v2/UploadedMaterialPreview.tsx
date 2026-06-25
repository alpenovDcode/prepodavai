'use client'

import { Loader2 } from 'lucide-react'
import { useAuthedFileUrl } from '@/hooks/useAuthedFileUrl'

/**
 * Превью загруженного учителем материала (PDF / JPG / PNG).
 *
 * Используется и в GradingPageV2, и в AssignmentOverviewV2 — везде, где
 * учителю нужно увидеть сам выданный файл. PDF тянется через blob URL
 * (см. useAuthedFileUrl) для обхода X-Frame-Options.
 */
export function UploadedMaterialPreview({ outputData }: { outputData: any }) {
    const out = typeof outputData === 'object' && outputData ? outputData : {}
    const fileUrl: string | undefined = out.fileUrl || out.url
    const mimeType: string | undefined = out.mimeType
    const originalName: string | undefined = out.originalName
    const isPdf = mimeType === 'application/pdf'
    const pdfAuth = useAuthedFileUrl(isPdf ? fileUrl || null : null)
    if (!fileUrl) return null
    return (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-ink-100 bg-ink-50/40">
                <span className="text-[12px] font-bold text-ink-700 uppercase tracking-wide">
                    Материал учителя {originalName ? `· ${originalName}` : ''}
                </span>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[12px] text-ink-500 hover:text-ink-700 underline">
                    Открыть в новой вкладке
                </a>
            </div>
            {isPdf ? (
                <div className="relative bg-white" style={{ minHeight: 520, height: '65vh' }}>
                    {pdfAuth.loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
                            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                        </div>
                    )}
                    {pdfAuth.error ? (
                        <div className="p-6 text-center text-[13px] text-ink-500">Не удалось загрузить PDF.</div>
                    ) : pdfAuth.blobUrl ? (
                        <iframe src={pdfAuth.blobUrl} title={originalName || 'Материал'} className="w-full h-full border-0 bg-white" />
                    ) : null}
                </div>
            ) : (
                <div className="flex justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl} alt={originalName || 'Материал'} className="max-w-full max-h-[60vh] h-auto object-contain rounded-md" />
                </div>
            )}
        </div>
    )
}
