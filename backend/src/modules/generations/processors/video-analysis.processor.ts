
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { AssemblyAiService } from '../../integrations/assemblyai.service';
import { LOGO_BASE64 } from '../generation.constants';

export interface VideoAnalysisJobData {
    generationRequestId: string;
    videoHash: string;
    videoUrl: string; // Public URL resolved by service
    analysisType: 'sales' | 'methodological'; // 'sales' or 'methodological'
}

@Processor('video-analysis')
export class VideoAnalysisProcessor extends WorkerHost {
    private readonly logger = new Logger(VideoAnalysisProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly assemblyAiService: AssemblyAiService,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
    }

    async process(job: Job<VideoAnalysisJobData>): Promise<void> {
        const { generationRequestId, videoUrl, analysisType } = job.data;
        this.logger.log(`Processing Video Analysis for ${generationRequestId} (${analysisType})`);

        try {
            // 1. Transcribe Video
            this.logger.log(`Starting transcription for ${videoUrl}`);
            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 10,
                message: 'Транскрибация видео...'
            });

            const transcript = await this.assemblyAiService.transcribeFile(videoUrl);
            this.logger.log(`Transcription completed. Length: ${transcript.length}`);

            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 40,
                message: 'Анализ текста...'
            });

            // 2. Generate Analysis via Replicate
            const analysis = await this.generateAnalysis(transcript, analysisType);

            // 3. Format Result
            // We verify if analysis already contains the logo wrapper or if we need to wrap it.
            // The prompt now asks for full HTML, but we wrap it for safety regarding the "Video Analysis" header managed by the backend logic if needed.
            // However, the prompt asks to return ONLY HTML.

            // Construct the final HTML with logos
            const htmlResult = `
                <div class="video-analysis-result" style="font-family: sans-serif; max-width: 800px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 80px;" />
                    </div>
                    
                    ${analysis}

                    <div style="text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                        <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 50px; opacity: 0.7;" />
                    </div>

                    <div style="margin-top: 20px;">
                        <details>
                            <summary style="cursor: pointer; padding: 10px; background: #f0f0f0; border-radius: 5px;">📄 Показать полную транскрипцию</summary>
                            <div style="margin-top: 10px; max-height: 300px; overflow-y: auto; background: #f9f9f9; padding: 15px; border-radius: 5px; font-size: 0.9em; line-height: 1.5;">
                                ${transcript}
                            </div>
                        </details>
                    </div>
                </div>
            `;

            // 4. Complete
            await this.generationHelpers.completeGeneration(generationRequestId, {
                htmlResult,
                sections: [
                    { title: 'Анализ', content: analysis },
                    { title: 'Транскрипция', content: transcript }
                ]
            });

        } catch (error: any) {
            this.logger.error(`Video Analysis failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(generationRequestId, error.message);
            throw error;
        }
    }

    private async generateAnalysis(transcript: string, type: 'sales' | 'methodological'): Promise<string> {
        const systemPrompt = type === 'sales'
            ? "Ты — профессиональный эксперт по продажам в EdTech и аудиту вебинаров. Твоя задача — провести глубокий, критический и конструктивный разбор предоставленного текста видео-урока. Ты не просто пересказываешь, а анализируешь эффективность каждого этапа продажи. Твой тон — экспертный, вдохновляющий, но требовательный. ТВОЯ ЦЕЛЬ: Помочь эксперту кратно увеличить конверсию в продажу."
            : "Ты — методический директор ведущей EdTech-платформы. Твоя задача — провести глубокий педагогический аудит урока. Ты оцениваешь не только контент, но и то, как он доносится (методология, психология, вовлечение). Твой тон — конструктивный, поддерживающий, академически точный.";

        const userPrompt = `
ПРОАНАЛИЗИРУЙ СЛЕДУЮЩУЮ ТРАНСКРИПЦИЮ ВИДЕО-УРОКА.

---
ТИП АУДИТА: ${type === 'sales' ? '💰 ПРОДАЮЩАЯ СТРУКТУРА И КОНВЕРСИЯ' : '🎓 МЕТОДИКА И КАЧЕСТВО ОБУЧЕНИЯ'}
---

Твоя задача — вернуть **ТОЛЬКО HTML-КОД** готового отчета. Не пиши никаких вступительных слов вроде "Вот ваш отчет" или "На основе транскрипции". Сразу начинай с тега <div> или заголовков.

СТРУКТУРА ОТЧЕТА И КРИТЕРИИ АНАЛИЗА:

1.  **📊 ЭКСПРЕСС-РЕЗЮМЕ (Введение)**
    *   Общая оценка урока/вебинара по 10-балльной шкале.
    *   Главное впечатление (в 2-3 предложениях).
    *   3 ключевых плюса и 3 точки роста.

2.  **🔎 ДЕТАЛЬНЫЙ РАЗБОР ПО БЛОКАМ**
    ${type === 'sales' ? `
    *   **🔥 Крючок и Обещание (Hook):**
        *   Есть ли захват внимания в первые 30 секунд?
        *   Озвучен ли "Big Promise" (Главное обещание результата)?
    *   **📢 Проблематизация и Боли:**
        *   Насколько точно описаны проблемы ЦА?
        *   Есть ли присоединение ("У меня тоже так было")?
    *   **🌟 Авторитет (Почему вы?):**
        *   Продана ли экспертность (кейсы, цифры, опыт)?
    *   **🎯 Презентация решения (Продукт/Метод):**
        *   Понятна ли логика метода?
        *   Закрыты ли возражения (дорого, нет времени, не получится)?
    *   **🎁 Оффер и Призыв (CTA):**
        *   Насколько конкретен призыв к действию?
        *   Есть ли дедлайн/дефицит?
    ` : `
    *   **🧭 Структура и Целеполагание:**
        *   Есть ли четкое введение и обозначение целей урока?
        *   Логичны ли переходы между частями?
    *   **🧠 Качество объяснения:**
        *   Доступность языка, использование метафор и примеров.
        *   Баланс теории и практики.
    *   **🤝 Вовлечение и Интерактив:**
        *   Как спикер удерживает внимание? (Вопросы, задания, смена темпа).
    *   **🎨 Визуализация и Подача:**
        *   (Оцени косвенно по тексту) Насколько структурирована речь? Нет ли "воды"?
    *   **🏁 Закрепление и Рефлексия:**
        *   Было ли подведение итогов?
        *   Понятен ли следующий шаг для ученика?
    `}

3.  **💡 ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ (Action Plan)**
    *   Напиши 3-5 конкретных советов: "Что изменить прямо сейчас, чтобы стало лучше".
    *   Приведи примеры удачных фраз, которые можно было бы сказать.

ТРЕБОВАНИЯ К ОФОРМЛЕНИЮ (ВАЖНО!):
*   Используй **ЭМОДЗИ** 🎨 во всех заголовках и ключевых пунктах для визуальной легкости.
*   Используй теги <h3>, <h4> для заголовков.
*   Используй <ul>, <li> для списков.
*   Используй <strong>жирный шрифт</strong> для акцентов.
*   Используй блоки <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 10px 0;"> для цитат или инсайтов.
*   **НЕ ИСПОЛЬЗУЙ** теги <html>, <head>, <body>. Верни только содержимое (body content).
*   **МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ (ЕСЛИ ЕСТЬ):**
    *   Строчные: \`\\(...\\)\`. ЗАПРЕЩЕНО \`$\`!
    *   Блочные: \`\\[...\\]\`. ЗАПРЕЩЕНО \`$$\`!

ТЕКСТ ТРАНСКРИПЦИИ ДЛЯ АНАЛИЗА:
${transcript.substring(0, 30000)}
`;

        return this.runReplicatePrediction('anthropic/claude-3.5-haiku', {
            system_prompt: systemPrompt,
            prompt: userPrompt,
            max_tokens: 3000
        });
    }

    private async runReplicatePrediction(version: string, input: any): Promise<string> {
        // Re-using logic similar to LessonPreparationProcessor
        // Ideally this should be in a shared service, but for now copying is safer than refactoring the massive service
        try {
            const response = await axios.post(
                `https://api.replicate.com/v1/models/${version}/predictions`,
                {
                    input: input,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.replicateToken}`,
                        'Content-Type': 'application/json',
                    }
                }
            );

            let prediction = response.data;
            const predictionId = prediction.id;

            while (['starting', 'processing'].includes(prediction.status)) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const statusRes = await axios.get(
                    `https://api.replicate.com/v1/predictions/${predictionId}`,
                    {
                        headers: { 'Authorization': `Bearer ${this.replicateToken}` }
                    }
                );
                prediction = statusRes.data;
            }

            if (prediction.status === 'succeeded') {
                return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
            } else {
                throw new Error(`Replicate failed: ${prediction.error}`);
            }
        } catch (error: any) {
            this.logger.error(`Replicate API Error: ${error.message}`);
            throw error;
        }
    }
}