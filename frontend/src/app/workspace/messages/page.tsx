'use client'

import { useState } from 'react'
import { Send, RefreshCw, Loader2, Maximize2 } from 'lucide-react'
import { useGenerations } from '@/lib/hooks/useGenerations'
import RichTextEditor from '@/components/workspace/RichTextEditor'
import AssignTaskButton from '@/components/AssignTaskButton'

// Pre-defined prompts from config.ts
const messagePrompts: Record<string, { label: string, value: string }[]> = {
    meeting: [
        {
            label: 'Собрание по итогам четверти',
            value: JSON.stringify({ date: '25 декабря 2024, 18:00', topic: 'Итоги первой четверти', location: 'Актовый зал школы' }, null, 2)
        },
        {
            label: 'Собрание по подготовке к экзаменам',
            value: JSON.stringify({ date: '15 января 2025, 19:00', topic: 'Подготовка к ОГЭ и ЕГЭ', location: 'Кабинет 205' }, null, 2)
        },
        {
            label: 'Собрание по внеклассной работе',
            value: JSON.stringify({ date: '10 февраля 2025, 17:30', topic: 'Планирование внеклассных мероприятий', location: 'Учительская' }, null, 2)
        },
        {
            label: 'Собрание по безопасности',
            value: JSON.stringify({ date: '5 марта 2025, 18:30', topic: 'Безопасность детей в школе и дома', location: 'Актовый зал школы' }, null, 2)
        }
    ],
    progress: [
        {
            label: 'Отличные результаты по математике',
            value: JSON.stringify({ studentName: 'Иванов Иван', subject: 'Математика', achievements: 'Успешно решает задачи повышенной сложности', recommendations: 'Участвовать в математических конкурсах' }, null, 2)
        },
        {
            label: 'Хороший прогресс по русскому языку',
            value: JSON.stringify({ studentName: 'Петрова Мария', subject: 'Русский язык', achievements: 'Улучшила грамотность, стала лучше писать сочинения', recommendations: 'Больше читать художественную литературу' }, null, 2)
        },
        {
            label: 'Успехи по английскому языку',
            value: JSON.stringify({ studentName: 'Сидоров Алексей', subject: 'Английский язык', achievements: 'Расширил словарный запас, улучшил произношение', recommendations: 'Смотреть фильмы на английском' }, null, 2)
        },
        {
            label: 'Достижения по биологии',
            value: JSON.stringify({ studentName: 'Козлова Анна', subject: 'Биология', achievements: 'Отлично усваивает материал, интерес к исследованиям', recommendations: 'Посещать биологические кружки' }, null, 2)
        }
    ],
    reminder: [
        {
            label: 'Напоминание о контрольной работе',
            value: JSON.stringify({ event: 'Контрольная работа по алгебре', date: '20 декабря 2024', details: 'Тема: "Квадратные уравнения". Принести калькулятор' }, null, 2)
        },
        {
            label: 'Напоминание о родительском собрании',
            value: JSON.stringify({ event: 'Родительское собрание', date: '28 декабря 2024, 18:00', details: 'Обсуждение итогов четверти и планов на каникулы' }, null, 2)
        },
        {
            label: 'Напоминание о сдаче проекта',
            value: JSON.stringify({ event: 'Сдача проекта по истории', date: '15 января 2025', details: 'Тема: "Великая Отечественная война".' }, null, 2)
        },
        {
            label: 'Напоминание об экскурсии',
            value: JSON.stringify({ event: 'Экскурсия в музей', date: '12 февраля 2025, 10:00', details: 'Сбор у главного входа школы. Взять сменную обувь' }, null, 2)
        }
    ],
    'thank-you': [
        {
            label: 'Благодарность за помощь в организации',
            value: JSON.stringify({ recipient: 'Родительскому комитету', reason: 'За помощь в организации новогоднего праздника' }, null, 2)
        },
        {
            label: 'Благодарность за участие в субботнике',
            value: JSON.stringify({ recipient: 'Ученикам и родителям', reason: 'За активное участие в школьном субботнике' }, null, 2)
        },
        {
            label: 'Благодарность за спонсорскую помощь',
            value: JSON.stringify({ recipient: 'ООО "Образование"', reason: 'За спонсорскую помощь в приобретении материалов' }, null, 2)
        }
    ]
}

export default function MessagesGenerator() {
    const [templateId, setTemplateId] = useState('meeting')
    const [selectedPromptIndex, setSelectedPromptIndex] = useState(0)

    // Initialize formData with the first prompt of the selected template
    const [formData, setFormData] = useState(messagePrompts['meeting'][0].value)
    const [draftText, setDraftText] = useState('')

    const [localContent, setLocalContent] = useState('<p>Выберите шаблон сообщения и заполните данные для его генерации.</p>')

    const { generateAndWait, isGenerating, activeGenerationId } = useGenerations()
    const hasResult = !isGenerating && !!localContent && !localContent.startsWith('<p>Выберите шаблон')

    const handleTemplateChange = (newTemplate: string) => {
        setTemplateId(newTemplate)
        setSelectedPromptIndex(0)
        setFormData(messagePrompts[newTemplate][0].value)
    }

    const handlePromptChange = (indexStr: string) => {
        const index = parseInt(indexStr)
        setSelectedPromptIndex(index)
        setFormData(messagePrompts[templateId][index].value)
    }

    const templates = [
        { value: 'meeting', label: 'Приглашение на собрание' },
        { value: 'progress', label: 'Отчёт об успеваемости' },
        { value: 'reminder', label: 'Напоминание' },
        { value: 'thank-you', label: 'Благодарность' }
    ]

    const generate = async () => {
        if (!formData) return;

        try {
            // Validate JSON
            JSON.parse(formData);

            setLocalContent('<p>Генерируем сообщение...</p>')
            const params = {
                templateId,
                formData,
                draftText
            }

            const status = await generateAndWait({ type: 'message', params })
            const resultData = status.result?.content || status.result

            let finalHtml = resultData
            if (typeof finalHtml === 'string' && !finalHtml.includes('<p>')) {
                finalHtml = `<div style="white-space: pre-wrap;">${finalHtml}</div>`
            }

            setLocalContent(finalHtml || '<p>Не удалось сгенерировать контент.</p>')

        } catch (e: any) {
            console.error('Generation failed:', e)
            if (e instanceof SyntaxError) {
                setLocalContent(`<p class="text-red-500">Ошибка: Неверный формат JSON в поле данных. Пожалуйста, проверьте правильность заполнения скобок и кавычек.</p>`)
            } else {
                setLocalContent(`<p class="text-red-500">Ошибка при генерации сообщения: ${e.message}</p>`)
            }
        }
    }

    return (
        <div className="flex w-full h-full bg-[#F9FAFB]">
            {/* Configurator Sidebar */}
            <div className="w-[340px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Send className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-lg">Шаблоны Сообщений</h2>
                        <p className="text-xs text-gray-500 font-medium">WORKSPACE V2</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-200">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Тип шаблона</label>
                            <select
                                value={templateId}
                                onChange={e => handleTemplateChange(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 placeholder-gray-400"
                            >
                                {templates.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Готовый сценарий</label>
                            <select
                                value={selectedPromptIndex}
                                onChange={e => handlePromptChange(e.target.value)}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 placeholder-gray-400"
                            >
                                {messagePrompts[templateId].map((opt, idx) => (
                                    <option key={idx} value={idx}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Данные (JSON формат)</label>
                            <p className="text-xs text-gray-500 mb-2">Вы можете изменить эти данные под вашу конкретную ситуацию.</p>
                            <textarea
                                value={formData}
                                onChange={e => setFormData(e.target.value)}
                                placeholder='{ "категория": "значение" }'
                                rows={6}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Ваш черновик (необязательно)</label>
                            <textarea
                                value={draftText}
                                onChange={e => setDraftText(e.target.value)}
                                placeholder="Вставьте ваш набросок текста, если хотите, чтобы алгоритм отталкивался от него..."
                                rows={3}
                                className="block w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none text-gray-900 placeholder-gray-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 bg-white">
                    <button
                        onClick={generate}
                        disabled={isGenerating || !formData.trim()}
                        className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 p-px font-semibold shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        <div className="relative flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-[11px] text-white">
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            <span>{isGenerating ? 'В процессе...' : 'Сгенерировать сообщение'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#F9FAFB] relative px-4 py-4 md:px-8 md:py-8 overflow-hidden h-full">
                <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-14 border-b border-gray-100 px-4 flex items-center justify-between bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold tracking-wide text-gray-500">ГОТОВОЕ СООБЩЕНИЕ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasResult && (
                                <AssignTaskButton
                                    generationId={activeGenerationId}
                                    topic="Сообщение"
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-sm disabled:opacity-60"
                                />
                            )}
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden relative bg-white">
                        <div className="absolute inset-0">
                            <RichTextEditor
                                content={localContent}
                                onChange={setLocalContent}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
