'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import AssignMaterialModal from './AssignMaterialModal'

interface AssignTaskButtonProps {
    generationId?: string | null
    lessonId?: string | null
    topic?: string
    grade?: string
    className?: string
    label?: string
}

export default function AssignTaskButton({
    generationId,
    lessonId,
    topic,
    grade,
    className,
    label = 'Выдать задание',
}: AssignTaskButtonProps) {
    const [preparing, setPreparing] = useState(false)
    const [modalLessonId, setModalLessonId] = useState<string | null>(lessonId ?? null)
    const [showModal, setShowModal] = useState(false)

    const handleClick = async () => {
        if (showModal || preparing) return
        if (modalLessonId) {
            setShowModal(true)
            return
        }
        setPreparing(true)
        try {
            const lessonRes = await apiClient.post('/lessons', {
                topic: topic || 'AI генерация',
                grade: grade,
            })
            const newLessonId = lessonRes.data.id as string

            if (generationId) {
                try {
                    await apiClient.post(`/generate/${generationId}/link-lesson`, {
                        lessonId: newLessonId,
                    })
                } catch (err) {
                    console.error('Failed to link generation to lesson:', err)
                }
            }

            setModalLessonId(newLessonId)
            setShowModal(true)
        } catch (error: any) {
            console.error('Failed to prepare assignment:', error)
            alert(error?.response?.data?.message || 'Ошибка при подготовке к выдаче')
        } finally {
            setPreparing(false)
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={handleClick}
                disabled={preparing}
                className={
                    className ||
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs md:text-sm font-semibold hover:bg-primary-700 transition disabled:opacity-60'
                }
            >
                <Share2 className="w-3.5 h-3.5" />
                <span>{preparing ? 'Готовим...' : label}</span>
            </button>
            {showModal && modalLessonId && (
                <AssignMaterialModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    lessonId={modalLessonId}
                    generationId={generationId || undefined}
                />
            )}
        </>
    )
}
