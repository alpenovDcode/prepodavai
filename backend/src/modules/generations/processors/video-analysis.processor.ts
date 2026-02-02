
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { AssemblyAiService } from '../../integrations/assemblyai.service';

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
            const htmlResult = `
                <div class="video-analysis-result">
                    <h2>Видео Разбор (${analysisType === 'sales' ? 'Продажи' : 'Методический'})</h2>
                    <div class="analysis-content">
                        ${analysis}
                    </div>
                    <details>
                        <summary>Транскрипция (Сырой текст)</summary>
                        <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 0.8em;">${transcript}</pre>
                    </details>
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
            ? "Ты — эксперт по продажам образовательных услуг. Твоя специализация — аудит вебинаров и пробных уроков. Ты знаешь, что продает не просто контент, а структура: 'Обещание результата' -> 'Авторитет' -> 'Методика' -> 'Кейсы' -> 'Призыв'. Твоя задача — проанализировать транскрипцию и дать оценку, насколько учитель следует этой формуле."
            : "Ты — методический директор EdTech-платформы. Твоя задача — оценить педагогическое качество урока. Ты ищешь баланс между пользой, интерактивом и диагностикой знаний.";

        const userPrompt = `
Проведи аудит приложенной транскрипции видео-урока.

ТИП АНАЛИЗА: ${type === 'sales' ? 'ПРОДАЮЩАЯ СТРУКТУРА И УТП' : 'МЕТОДИКА И ПЕДАГОГИЧЕСКИЙ ДИЗАЙН'}

Твоя задача — проверить наличие обязательных блоков успешной самопрезентации и оформить ответ в визуальном стиле продающих постов (с эмодзи).

${type === 'sales' ? `
ИСПОЛЬЗУЙ СЛЕДУЮЩИЕ КРИТЕРИИ (на основе успешных шаблонов УТП):

1. **🔥 Крючок и Обещание (Hook):**
   - Есть ли яркое начало с обещанием конкретного результата (баллы ЕГЭ, "заговоришь за месяц", "уверенность")?
   - Обозначена ли "Миссия" преподавателя?

2. **📢 Проблематизация ("Это для вас, если..."):**
   - Назвал ли учитель боли клиента (страх экзамена, каша в голове, скука)?
   - Попал ли в целевую аудиторию?

3. **🌟 Авторитет и Личность ("Кто я?"):**
   - Были ли озвучены регалии: 🎓 Образование, 🏆 Достижения, 💡 Опыт в годах или цифрах?
   - Вызывает ли спикер доверие как эксперт?

4. **🎯 Методика и "Почему я?":**
   - Объяснено ли, *как* достигается результат? (✨ Индивидуальный подход, 🧠 Без зубрежки, 💻 Интерактив/Нейросети)?
   - Показана ли уникальность подхода?

5. **🏅 Результаты и Социальное доказательство:**
   - Были ли приведены кейсы (✅ "Было/Стало") или статистика (средний балл)?

6. **🎁 Призыв к действию (CTA):**
   - Был ли оффер (бесплатная диагностика, подарок, чек-лист)?
   - Есть ли дедлайн или ограничение мест (❗ "Осталось 3 места")?
   - Четкая инструкция 📩 "Пишите в чат".

` : `
ИСПОЛЬЗУЙ СЛЕДУЮЩИЕ КРИТЕРИИ (Методический аудит):

1. **🧭 Структура и Тайминг:** Было ли введение, основная часть и заключение? Соблюден ли темп?
2. **🤝 Вовлечение и Интерактивность:** Использовались ли вопросы, диалог, игровые механики (✨), или это был монолог?
3. **🧠 Качество объяснения:** Насколько понятно объяснялся материал? Были ли примеры из жизни (💡)?
4. **💖 Эмоциональный фон:** Создана ли доверительная атмосфера? Была ли поддержка и похвала?
5. **📊 Диагностика:** Была ли попытка оценить уровень знаний ученика и наметить план (Individual Path)?
`}

ФОРМАТ ВЫВОДА (HTML):
Верни ответ строго в HTML.
ОБЯЗАТЕЛЬНО используй эмодзи в заголовках и пунктах списков, чтобы отчет выглядел визуально структурированным.

Пример структуры ответа:
<h3>📊 Общее резюме аудита</h3>
<p>Краткий вывод о качестве урока.</p>

<h3>🔎 Детальный разбор по блокам</h3>
<ul>
    <li>
        <strong>🔥 Крючок и Результат</strong><br>
        <em>Статус:</em> 🟢 Отлично / 🟡 Требует доработки / 🔴 Отсутствует<br>
        <em>Анализ:</em> ...текст анализа...<br>
        <em>Цитата:</em> "..."
    </li>
    <li>
        <strong>🎓 Авторитет и Экспертность</strong><br>
        <em>Статус:</em> ...<br>
        <em>Анализ:</em> Учитель не упомянул образование или опыт. Рекомендуется добавить цифры.<br>
    </li>
    <!-- И так далее по всем критериям -->
</ul>

<h3>🚀 ТОП-3 рекомендации по улучшению</h3>
<ul>
    <li>💡 <strong>Совет 1:</strong> ...</li>
    <li>🗣 <strong>Совет 2:</strong> ...</li>
    <li>🎁 <strong>Совет 3:</strong> ...</li>
</ul>

Тон: Профессиональный, энергичный, конструктивный.

ТРАНСКРИПЦИЯ:
${transcript.substring(0, 25000)} {/* Truncate to avoid context limit issues if massive */}
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