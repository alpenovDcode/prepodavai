'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

export default function SalesAdvisorPage() {
    const router = useRouter()
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [result, setResult] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setImageFile(file)
            const reader = new FileReader()
            reader.onloadend = () => {
                setImagePreview(reader.result as string)
            }
            reader.readAsDataURL(file)
            setResult(null)
            setError(null)
        }
    }

    const handleAnalyze = async () => {
        if (!imageFile) return

        setIsAnalyzing(true)
        setError(null)

        try {
            // Загружаем файл
            const formData = new FormData()
            formData.append('file', imageFile)

            const uploadResponse = await apiClient.post('/files/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            const imageHash = uploadResponse.data.hash

            // Запускаем анализ
            const analysisResponse = await apiClient.post('/generate/sales-advisor', {
                imageHash
            })

            const requestId = analysisResponse.data.requestId

            // Polling для получения результата
            let attempts = 0
            const maxAttempts = 60

            const pollResult = async () => {
                const statusResponse = await apiClient.get(`/generate/status/${requestId}`)
                const status = statusResponse.data

                if (status.status === 'completed') {
                    setResult(status.result?.htmlResult || status.result?.content || 'Анализ завершен')
                    setIsAnalyzing(false)
                } else if (status.status === 'failed') {
                    setError(status.error || 'Ошибка при анализе')
                    setIsAnalyzing(false)
                } else if (attempts < maxAttempts) {
                    attempts++
                    setTimeout(pollResult, 2000)
                } else {
                    setError('Превышено время ожидания')
                    setIsAnalyzing(false)
                }
            }

            pollResult()
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Ошибка при анализе')
            setIsAnalyzing(false)
        }
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <div className="sticky top-0 z-20 backdrop-blur-lg bg-white/90 border-b border-[#D8E6FF] shadow-sm">
                <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="w-9 h-9 rounded-xl bg-[#D8E6FF] border border-[#D8E6FF] hover:bg-[#FF7E58] hover:border-[#FF7E58] transition active:scale-95"
                        >
                            <i className="fas fa-arrow-left text-[#FF7E58]"></i>
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-black">ИИ-продажник</h1>
                            <p className="text-xs text-black/70">Анализ диалогов с клиентами</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="p-4">
                <div className="max-w-5xl mx-auto">
                    {/* Upload card */}
                    <div className="rounded-3xl border border-[#D8E6FF] bg-white shadow-md overflow-hidden">
                        <div className="p-6">
                            <h2 className="text-xl font-bold text-black mb-4">Загрузите скриншот диалога</h2>

                            {/* File input */}
                            <div className="mb-6">
                                <label className="block w-full">
                                    <div className="border-2 border-dashed border-[#D8E6FF] rounded-xl p-8 text-center cursor-pointer hover:border-[#FF7E58] transition">
                                        <i className="fas fa-cloud-upload-alt text-4xl text-[#FF7E58] mb-3"></i>
                                        <p className="text-sm text-black/70">
                                            Нажмите или перетащите изображение
                                        </p>
                                        <p className="text-xs text-black/50 mt-1">
                                            PNG, JPG до 10MB
                                        </p>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {/* Image preview */}
                            {imagePreview && (
                                <div className="mb-6">
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        className="w-full max-w-2xl mx-auto rounded-xl border border-[#D8E6FF] shadow-lg"
                                    />
                                </div>
                            )}

                            {/* Analyze button */}
                            {imageFile && !result && (
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing}
                                    className="w-full py-3 bg-[#FF7E58] text-white rounded-xl font-medium hover:shadow-lg transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Анализирую...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-magic mr-2"></i>
                                            Проанализировать диалог
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
                                    <i className="fas fa-exclamation-circle mr-2"></i>
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Result card */}
                    {result && (
                        <div className="mt-4 rounded-3xl border border-[#D8E6FF] bg-white shadow-md overflow-hidden animate-fade-in">
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#FF7E58] flex items-center justify-center">
                                            <i className="fas fa-check text-white"></i>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-black">Результат анализа</h3>
                                            <p className="text-xs text-black/70">Рекомендации по продажам</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setResult(null)
                                            setImageFile(null)
                                            setImagePreview(null)
                                        }}
                                        className="px-3 py-2 bg-[#D8E6FF] border border-[#D8E6FF] text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 transition active:scale-95"
                                    >
                                        <i className="fas fa-times mr-1"></i>Закрыть
                                    </button>
                                </div>

                                {/* Result content */}
                                <div
                                    className="prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: result }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
