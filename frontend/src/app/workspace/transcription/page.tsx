'use client'

import { useState, useRef, useEffect } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { downloadPdf } from '@/lib/utils/downloadPdf'
import { FileAudio, RefreshCw, Loader2, Maximize2, UploadCloud, Copy, FileText, Download, Edit3, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import GenerationCostBadge from '@/components/workspace/GenerationCostBadge'

export default function TranscriptionGenerator() {
    const [fileHash, setFileHash] = useState('')
    const [fileName, setFileName] = useState('')
    const [language, setLanguage] = useState('ru')
    const [isUploading, setIsUploading] = useState(false)
    const [localContent, setLocalContent] = useState('')
    const [errorMsg, setErrorMsg] = useState('')

    const [editMode, setEditMode] = useState(false)
    const [copied, setCopied] = useState(false)
    const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config')
    const [isMobile, setIsMobile] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)

    const { generateAndWait, isGenerating } = useGenerations()

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setIsUploading(true)
        setLocalContent('')
        setErrorMsg('')

        try {
            // Simulated upload delay
            await new Promise(resolve => setTimeout(resolve, 800))
            setFileHash('simulated_audio_hash_' + Date.now())
        } catch (error) {
            console.error('Upload failed', error)
            setErrorMsg('Ошибка загрузки аудиофайла')
            setFileName('Ошибка загрузки')
        } finally {
            setIsUploading(false)
        }
    }

    const generate = async () => {
        if (!fileHash) return;

        try {
            setErrorMsg('')
            setLocalContent('<p>Выполняется транскрибация... Пожалуйста, подождите. Это может занять несколько минут в зависимости от длины файла.</p>')
            setEditMode(false)
            if (isMobile) setActiveTab('preview')

            const params = {
                fileHash,
                language
            }

            const status = await generateAndWait({ type: 'transcription', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap; font-family: sans-serif; padding: 20px;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось получить расшифровку.</p>')
        } catch (e: any) {
            console.error('Generation failed:', e)
            setErrorMsg(`Ошибка при транскрибации: ${e.message}`)
            setLocalContent('')
        }
    }

    const toggleEditMode = () => {
        setEditMode(!editMode)
    }

    useEffect(() => {
        if (!editMode && iframeRef.current && localContent) {
            const iframeDoc = iframeRef.current.contentDocument;
            if (iframeDoc) {
                const handleClick = () => {
                    setEditMode(true);
                };
                iframeDoc.body.addEventListener('click', handleClick);
                iframeDoc.body.style.cursor = 'text';

                return () => {
                    iframeDoc.body.removeEventListener('click', handleClick);
                };
            }
        }
    }, [editMode, localContent]);

    const handleDownloadPdf = async () => {
        try {
            await downloadPdf(localContent)
        } catch {
            toast.error('Не удалось сформировать PDF')
        }
    }

    const handleCopy = async () => {
        if (!localContent) return
        try {
            const tempDiv = document.createElement('div')
            tempDiv.innerHTML = DOMPurify.sanitize(localContent)
            const textToCopy = tempDiv.innerText || tempDiv.textContent || ''
            await navigator.clipboard.writeText(textToCopy)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            await navigator.clipboard.writeText(localContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const languages = [
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'Английский' },
        { value: 'auto', label: 'Автоопределение' }
    ]

    return (
        <div className="flex flex-col md:flex-row w-full h-full bg-[#F9FAFB] overflow-hidden">
            {/* Mobile Tab Switcher */}
            {isMobile && (
                <div className="flex p-2 bg-white border-b border-gray-100 gap-2 flex-shrink-0">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'config' ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Загрузка
                    </button>
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'preview' ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 bg-gray-50'}`}
                    >
                        Текст
                    </button>
                </div>
            )}

            {/* Configurator Sidebar */}
            <div className={`
                ${isMobile && activeTab !== 'config' ? 'hidden' : 'flex'}
                w-full md:w-[320px] bg-white border-r border-gray-200 flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]
            `}>
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                        <FileAudio className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-lg">Транскрибация</h2>
                            <GenerationCostBadge operationType="transcription" />
                        </div>
                        <p className="text-xs text-gray-500 font-medium">Преподавай 2.0</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Аудио/Видео файл</label>

                            <div className="mt-2 text-center">
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-cyan-100 border-dashed rounded-xl cursor-pointer bg-cyan-50/50 hover:bg-cyan-50 transition-colors">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                                        {isUploading ? (
                                            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-2" />
                                        ) : (
                                            <UploadCloud className="w-8 h-8 text-cyan-500 mb-2" />
                                        )}
                                        <p className="text-xs font-bold text-gray-700 truncate max-w-full">
                                            {fileName || "Нажмите для загрузки"}
                                        </p>
                                        {!fileName && <p className="text-[10px] text-gray-400 mt-1">mp3, wav, mp4</p>}
                                    </div>
                                    <input type="file" className="hidden" accept="audio/*,video/*" onChange={handleFileChange} disabled={isUploading} />
                                </label>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 text-center">Максимальный размер: 50MB</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Язык записи</label>
                            <select
                                value={language}
                                onChange={e => setLanguage(e.target.value)}
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 transition-all text-gray-900"
                            >
                                {languages.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || isUploading || !fileHash}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 p-px font-bold shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Начать транскрибацию'}</span>
                        </div>
                    </button>
                    {errorMsg && <p className="mt-3 text-[11px] text-center text-red-500 font-bold bg-red-50 p-2 rounded-lg">{errorMsg}</p>}
                </div>
            </div>

            {/* Viewer Area */}
            <div className={`
                ${isMobile && activeTab !== 'preview' ? 'hidden' : 'flex'}
                flex-1 flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full
            `}>
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Toolbar Header */}
                    <div className="h-14 md:h-16 border-b border-gray-100 px-3 md:px-5 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">ТРАНСКРИБ</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            {localContent && !localContent.includes('Выполняется транскрибация') && (
                                <button
                                    onClick={toggleEditMode}
                                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-lg transition-all ${editMode
                                        ? 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {editMode ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                                    <span className="hidden xs:inline">{editMode ? 'Просмотр' : 'Редактировать'}</span>
                                </button>
                            )}
                            <button
                                onClick={handleCopy}
                                disabled={!localContent || isGenerating}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{copied ? 'Готово!' : 'Копировать'}</span>
                            </button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={!localContent || isGenerating}
                                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg transition-all disabled:opacity-40"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        {isGenerating ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 p-6 text-center">
                                <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
                                <div className="space-y-1">
                                    <p className="font-bold text-gray-900">Выполняется транскрибация...</p>
                                    <p className="text-sm text-gray-400 max-w-[280px]">Это может занять несколько минут в зависимости от размера файла.</p>
                                </div>
                            </div>
                        ) : !localContent ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-4">
                                <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center">
                                    <FileText className="w-10 h-10 text-gray-200" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-gray-700">Текст появится здесь</h3>
                                    <p className="text-sm text-gray-400 max-w-[320px]">
                                        Загрузите аудио или видео файл в меню настройки, чтобы получить расшифровку.
                                    </p>
                                </div>
                                {isMobile && (
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className="mt-2 px-6 py-2 bg-cyan-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                                    >
                                        Перейти к загрузке
                                    </button>
                                )}
                            </div>
                        ) : editMode ? (
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                            />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                srcDoc={localContent}
                                className="w-full h-full border-0 bg-white"
                                sandbox="allow-scripts allow-popups allow-modals"
                                title="Результат транскрибации"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
