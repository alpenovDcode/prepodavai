'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import AssignMaterialModal from './AssignMaterialModal'
import { useRouter } from 'next/navigation'
import { getGenerationTypeLabel, getGenerationTypeIcon } from '@/lib/utils/translations'

function getImageUrl(result: any): string | null {
    if (!result) return null
    if (typeof result === 'string' && (result.startsWith('http') || result.startsWith('data:image'))) return result
    if (result?.imageUrl) return result.imageUrl
    if (result?.imageUrls?.[0]) return result.imageUrls[0]
    if (typeof result?.content === 'string' && (result.content.startsWith('http') || result.content.startsWith('data:image'))) return result.content
    if (result?.content?.imageUrl) return result.content.imageUrl
    return null
}

async function downloadGeneration(generation: Generation, typeLabel: string) {
    const result = generation.result as any
    if (!result) return

    // Audio
    const audioUrl = result?.audioUrl || result?.content?.audioUrl
    if (audioUrl) {
        const a = document.createElement('a')
        a.href = audioUrl
        a.download = `audio-${generation.id}.mp3`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        return
    }

    // Image
    const imageUrl = getImageUrl(result)
    if (imageUrl) {
        try {
            const response = await fetch(imageUrl)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl; a.download = `image-${generation.id}.png`
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            window.URL.revokeObjectURL(blobUrl)
        } catch {
            const a = document.createElement('a')
            a.href = imageUrl; a.download = `image-${generation.id}.png`; a.target = '_blank'
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }
        return
    }

    // HTML — открываем в новом окне и вызываем печать (сохранение в PDF)
    const content = result?.htmlResult || result?.content || result?.result
    if (content && typeof content === 'string') {
        const safeName = typeLabel.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') || 'result'
        const autoPrint = `<script>window.onload=function(){setTimeout(function(){window.print()},600)}<\/script>`
        const hasHead = /<\/head>/i.test(content)
        const html = hasHead
            ? content.replace(/<\/head>/i, `${autoPrint}</head>`)
            : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeName}</title>${autoPrint}</head><body>${content}</body></html>`
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    }
}

interface Generation {
    id: string
    generationType: string
    status: string
    createdAt: string
    result?: any // Add result type if known
}

interface Lesson {
    id: string
    title: string
    topic: string
    grade?: string
    duration?: number
    generations: Generation[]
    createdAt: string
}

interface Class {
    id: string
    name: string
}

interface Student {
    id: string
    name: string
    class: { name: string }
}

interface CourseDetailPageProps {
    id: string
}

export default function CourseDetailPage({ id }: CourseDetailPageProps) {
    const [lesson, setLesson] = useState<Lesson | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    // Assignment Modal State
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [assignGenerationId, setAssignGenerationId] = useState<string | undefined>(undefined)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)

    useEffect(() => {
        const fetchLesson = async () => {
            try {
                const response = await apiClient.get(`/lessons/${id}`)
                setLesson(response.data)
            } catch (error) {
                console.error('Failed to fetch lesson:', error)
                // Handle error (e.g. redirect to list)
            } finally {
                setLoading(false)
            }
        }

        fetchLesson()
    }, [id])

    const handleAssignClick = () => {
        setAssignGenerationId(undefined)
        setShowAssignModal(true)
    }

    const handleAssignGeneration = (e: React.MouseEvent, generationId: string) => {
        e.stopPropagation()
        setAssignGenerationId(generationId)
        setShowAssignModal(true)
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!lesson) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-medium text-black-900">Урок не найден</h3>
                <button
                    onClick={() => router.back()}
                    className="text-primary-600 font-medium hover:text-primary-700 mt-4"
                >
                    &larr; Вернуться назад
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={() => router.back()}
                    className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-2"
                >
                    <i className="fas fa-arrow-left"></i>
                    Назад к списку
                </button>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{lesson.title}</h1>
                        <div className="flex items-center gap-4 text-gray-600">
                            {lesson.grade && (
                                <span className="flex items-center gap-1">
                                    <i className="fas fa-graduation-cap"></i>
                                    {lesson.grade} класс
                                </span>
                            )}
                            {lesson.duration && (
                                <span className="flex items-center gap-1">
                                    <i className="fas fa-clock"></i>
                                    {lesson.duration} мин
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <i className="fas fa-calendar"></i>
                                {new Date(lesson.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleAssignClick}
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition flex items-center gap-2 shadow-md"
                        >
                            <i className="fas fa-paper-plane"></i>
                            Выдать ученикам
                        </button>
                        <button
                            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            onClick={async () => {
                                if (confirm('Вы уверены, что хотите удалить этот урок?')) {
                                    try {
                                        await apiClient.delete(`/lessons/${lesson.id}`)
                                        router.push('/dashboard/courses')
                                    } catch (error) {
                                        console.error('Failed to delete lesson:', error)
                                    }
                                }
                            }}
                        >
                            <i className="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Generations List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-black-900">Материалы урока</h2>
                </div>
                <div className="divide-y divide-gray-100">
                    {lesson.generations.map((generation) => (
                        <div
                            key={generation.id}
                            className="p-6 hover:bg-gray-50 transition cursor-pointer"
                            onClick={() => {
                                if (generation.status === 'completed') {
                                    router.push(`/dashboard/courses/${lesson.id}/materials/${generation.id}`)
                                }
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${generation.status === 'completed' ? 'bg-green-100 text-green-600' :
                                        generation.status === 'failed' ? 'bg-red-100 text-red-600' :
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                        {generation.status === 'completed' && (generation.generationType === 'photosession' || generation.generationType === 'image' || generation.generationType === 'image_generation') ? (
                                            <img 
                                                src={(generation as any).result?.imageUrl || (generation as any).result?.imageUrls?.[0] || (generation as any).outputData?.imageUrl || (generation as any).outputData?.imageUrls?.[0]} 
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <i className={`fas ${getGenerationTypeIcon(generation.generationType)}`}></i>
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900 hover:text-primary-600 transition">
                                            {getGenerationTypeLabel(generation.generationType)}
                                        </h4>
                                        <p className="text-sm text-gray-500">
                                            {new Date(generation.createdAt).toLocaleString('ru-RU')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {generation.status === 'completed' ? (
                                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                            Готово
                                        </span>
                                    ) : generation.status === 'failed' ? (
                                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                                            Ошибка
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium flex items-center gap-2">
                                            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
                                            В процессе
                                        </span>
                                    )}

                                    {generation.status === 'completed' && (
                                        <>
                                            <button
                                                className="p-2 text-gray-400 hover:text-primary-600 transition"
                                                title="Просмотреть"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    router.push(`/dashboard/courses/${lesson.id}/materials/${generation.id}`)
                                                }}
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                            <button
                                                className="p-2 text-gray-400 hover:text-blue-600 transition disabled:opacity-40"
                                                title="Скачать"
                                                disabled={downloadingId === generation.id}
                                                onClick={async (e) => {
                                                    e.stopPropagation()
                                                    setDownloadingId(generation.id)
                                                    try {
                                                        await downloadGeneration(generation, getGenerationTypeLabel(generation.generationType))
                                                    } finally {
                                                        setDownloadingId(null)
                                                    }
                                                }}
                                            >
                                                <i className={`fas ${downloadingId === generation.id ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                                            </button>
                                            <button
                                                className="px-3 py-1.5 text-sm font-medium text-primary-600 border border-primary-200 hover:bg-primary-50 rounded-lg transition flex items-center gap-1.5"
                                                title="Выдать этот материал ученику или классу"
                                                onClick={(e) => handleAssignGeneration(e, generation.id)}
                                            >
                                                <i className="fas fa-paper-plane text-xs"></i>
                                                Выдать
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    {lesson.generations.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            Нет сгенерированных материалов для этого урока.
                        </div>
                    )}
                </div>
            </div>

            {/* Assign Modal */}
            {lesson && (
                <AssignMaterialModal
                    isOpen={showAssignModal}
                    onClose={() => { setShowAssignModal(false); setAssignGenerationId(undefined) }}
                    lessonId={lesson.id}
                    generationId={assignGenerationId}
                />
            )}
        </div>
    )
}
