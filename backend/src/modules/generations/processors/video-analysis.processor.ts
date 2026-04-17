import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { AssemblyAiService } from '../../integrations/assemblyai.service';
import { FilesService } from '../../files/files.service';
import { LOGO_BASE64 } from '../generation.constants';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlPostprocessorService } from '../../../common/services/html-postprocessor.service';

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
  private readonly yandexToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly generationHelpers: GenerationHelpersService,
    private readonly assemblyAiService: AssemblyAiService,
    private readonly filesService: FilesService,
    private readonly prisma: PrismaService,
    private readonly htmlPostprocessor: HtmlPostprocessorService,
  ) {
    super();
    this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
    this.yandexToken = this.configService.get<string>('YANDEX_OAUTH_TOKEN');
  }

  async process(job: Job<VideoAnalysisJobData>): Promise<void> {
    const { generationRequestId, videoUrl, videoHash, analysisType } = job.data;
    this.logger.log(`Processing Video Analysis for ${generationRequestId} (${analysisType})`);

    // Fetch userId to comply with FilesService security requirements
    const generation = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      select: { userId: true },
    });
    const userId = generation?.userId;

    let finalVideoUrl = videoUrl;

    try {
      // 0. Resolve Yandex.Disk link if needed
      if (finalVideoUrl && (finalVideoUrl.includes('disk.yandex.ru') || finalVideoUrl.includes('yadi.sk'))) {
        this.logger.log(`Resolving Yandex.Disk link: ${finalVideoUrl}`);
        finalVideoUrl = await this.resolveYandexDiskLink(finalVideoUrl);
      }

      // 1. Transcribe Video
      this.logger.log(`Starting transcription for ${finalVideoUrl}`);
      await this.generationHelpers.updateProgress(generationRequestId, {
        percent: 10,
        message: 'Транскрибация видео...',
      });

      const transcript = await this.assemblyAiService.transcribeFile(finalVideoUrl);
      this.logger.log(`Transcription completed. Length: ${transcript.length}`);

      await this.generationHelpers.updateProgress(generationRequestId, {
        percent: 40,
        message: 'Анализ текста...',
      });

      // 2. Generate Analysis via Replicate
      const analysis = await this.generateAnalysis(transcript, analysisType);

      // 3. Format Result
      const htmlResult = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            :root {
              --primary: #4f46e5;
              --primary-light: #eef2ff;
              --text-main: #1f2937;
              --text-muted: #6b7280;
              --bg: #ffffff;
              --card-bg: #f9fafb;
              --border: #e5e7eb;
            }

            body {
              font-family: 'Inter', -apple-system, sans-serif;
              line-height: 1.6;
              color: var(--text-main);
              background: var(--bg);
              margin: 0;
              padding: 0;
            }

            .container {
              max-width: 820px;
              margin: 0 auto;
              padding: 40px 20px;
            }

            .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid var(--primary-light);
            }

            .logo {
              max-height: 60px;
              margin-bottom: 15px;
            }

            h1, h2, h3 {
              color: var(--primary);
              margin-top: 1.5em;
              margin-bottom: 0.5em;
            }

            h1 { font-size: 24px; font-weight: 700; border-left: 4px solid var(--primary); padding-left: 15px; }
            h2 { font-size: 20px; font-weight: 600; }
            
            p { margin-bottom: 1.2em; }
            
            ul, ol { margin-bottom: 1.2em; padding-left: 1.5em; }
            li { margin-bottom: 0.5em; }

            .transcript-section {
              margin-top: 50px;
              border-top: 1px solid var(--border);
              padding-top: 30px;
            }

            details {
              background: var(--card-bg);
              border-radius: 12px;
              border: 1px solid var(--border);
              overflow: hidden;
            }

            summary {
              padding: 15px 20px;
              cursor: pointer;
              font-weight: 600;
              color: var(--primary);
              user-select: none;
              transition: background 0.2s;
            }

            summary:hover {
              background: var(--primary-light);
            }

            .transcript-content {
              padding: 20px;
              font-size: 14px;
              max-height: 400px;
              overflow-y: auto;
              background: white;
              border-top: 1px solid var(--border);
              line-height: 1.8;
              white-space: pre-line;
            }

            .footer {
              text-align: center;
              margin-top: 60px;
              color: var(--text-muted);
              font-size: 12px;
            }

            .footer img {
              max-height: 40px;
              opacity: 0.5;
              filter: grayscale(1);
              margin-bottom: 10px;
            }

            @media print {
              body { padding: 0; background: white; }
              .container { max-width: 100%; padding: 0; }
              .no-print { display: none; }
              details[open] { border: none; }
              summary { display: none; }
              .transcript-content { max-height: none; overflow: visible; }
            }
          </style>
        </head>
        <body>
            <div class="header">
              <img src="LOGO_PLACEHOLDER" alt="Prepodavai.ru" class="logo" />
              <h1 style="border: none; padding: 0; margin: 0; font-size: 28px;">ОТЧЕТ ОБ АНАЛИЗЕ ВИДЕО</h1>
            </div>
            
            <div class="content">
              ${analysis}
            </div>

            <div class="transcript-section no-print">
              <details>
                <summary>📄 Показать полную транскрипцию урока</summary>
                <div class="transcript-content">
                  ${transcript}
                </div>
              </details>
            </div>

            <div class="footer">
              <img src="LOGO_PLACEHOLDER" alt="Logo" />
              <p>&copy; ${new Date().getFullYear()} Prepodavai.ru — Платформа для роста преподавателей</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // 4. Post-process and Complete
      const finalizedHtml = this.htmlPostprocessor.process(htmlResult);

      await this.generationHelpers.completeGeneration(generationRequestId, {
        htmlResult: finalizedHtml,
        sections: [
          { title: 'Анализ', content: analysis },
          { title: 'Транскрибация', content: transcript },
        ],
      });

      // 5. Cleanup - Delete video from server after successful analysis
      if (videoHash && !videoHash.startsWith('http')) {
        this.logger.log(`Cleaning up video file: ${videoHash}`);
        try {
          await this.filesService.deleteFile(videoHash, userId);
        } catch (cleanupError: any) {
          this.logger.warn(`Failed to delete video file ${videoHash}: ${cleanupError.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Video Analysis failed: ${error.message}`, error.stack);
      await this.generationHelpers.failGeneration(generationRequestId, error.message);
      throw error;
    }
  }

  private async generateAnalysis(
    transcript: string,
    type: 'sales' | 'methodological',
  ): Promise<string> {
    // ═══════════════════════════════════════════════════════════════════
// ПЕРЕПИСАННЫЙ ПРОМПТ ДЛЯ АНАЛИЗА ТРАНСКРИПЦИИ УРОКА
// ═══════════════════════════════════════════════════════════════════

const systemPrompt =
  type === 'sales'
    ? `Ты — старший аналитик отдела качества EdTech-платформы с 10-летним опытом в продажах образовательных услуг. Ты прошёл обучение по методологиям SPIN, Sandler и Challenger Sale и адаптировал их под контекст онлайн-репетиторства.

Твоя задача — провести детальный аудит ПРОБНОГО УРОКА как продающего касания. Ты анализируешь не абстрактно, а ЦИТИРУЯ КОНКРЕТНЫЕ РЕПЛИКИ из транскрипции — и объясняя, что в них работает или не работает.

ПРИНЦИПЫ АНАЛИЗА:
- Каждый тезис подкрепляй цитатой из транскрипции (бери точные слова преподавателя или ученика).
- Если чего-то не было на уроке — прямо скажи «этого не прозвучало» и объясни, почему это критично.
- Не хвали за то, чего нет. Не придумывай того, что не сказано.
- Различай: преподаватель ДУМАЕТ, что продаёт → и то, что РЕАЛЬНО считывает ученик.
- Тон: прямой, конкретный, без воды. Как обратная связь от наставника, а не комплименты от HR.`

    : `Ты — методический директор с опытом в когнитивной психологии и instructional design. Ты владеешь таксономией Блума, принципами Мейера (мультимедийное обучение), моделью ADDIE и концепцией зоны ближайшего развития Выготского.

Твоя задача — провести глубокий педагогический аудит урока, опираясь на КОНКРЕТНЫЕ МОМЕНТЫ из транскрипции, а не на общие слова.

ПРИНЦИПЫ АНАЛИЗА:
- Каждый тезис подкрепляй цитатой или пересказом конкретного момента из транскрипции.
- Если чего-то не было — скажи прямо «этот элемент отсутствовал» и объясни последствия.
- Оценивай не только ЧТО говорится, а КАК: темп, переходы, реакция на ответы ученика.
- Различай: учитель объяснил → и ученик ПОНЯЛ (ищи маркеры понимания в репликах ученика).
- Тон: конструктивный, конкретный, с позиции «вот что можно сделать лучше и почему это сработает».`;

const userPrompt = `
ПРОАНАЛИЗИРУЙ ТРАНСКРИПЦИЮ ВИДЕО-УРОКА.

ТИП АУДИТА: ${type === 'sales' ? '🎯 АУДИТ ПРОБНОГО УРОКА (КОНВЕРСИЯ В ПОКУПКУ)' : '🎓 ПЕДАГОГИЧЕСКИЙ АУДИТ (МЕТОДИКА И КАЧЕСТВО)'}

ПРАВИЛА РАБОТЫ С ТРАНСКРИПЦИЕЙ:
1. Внимательно прочитай ВЕСЬ текст. Не анализируй только начало.
2. Когда цитируешь — бери РЕАЛЬНЫЕ слова из текста, а не перефразируй.
3. Оформляй цитаты так: <blockquote>«точная цитата»</blockquote>
4. Если в транскрипции есть ошибки распознавания — не обращай на них внимания, анализируй смысл.

СТРУКТУРА ОТЧЁТА (возвращай ТОЛЬКО HTML, без вступлений, сразу с <div>):

${type === 'sales' ? `

<h3>📊 ЭКСПРЕСС-ОЦЕНКА</h3>
Таблица с баллами 1–10 по каждому блоку:
| Блок | Балл | Комментарий в 1 предложение |
- Выявление потребностей
- Самопрезентация и доверие
- Демонстрация экспертности на уроке
- Презентация ценности продолжения
- Закрытие (CTA)
- Общее впечатление
Итого: средний балл.
Главный вывод: купил бы этот ученик или нет, и ПОЧЕМУ (1–2 предложения).

<h3>🔎 ДЕТАЛЬНЫЙ РАЗБОР</h3>

<h4>🤝 1. Выявление потребностей (первые 3–5 минут)</h4>
Анализируй:
- Какие вопросы задал преподаватель? Перечисли их с цитатами.
- Были ли ОТКРЫТЫЕ вопросы (расскажи, опиши, как ты видишь…) или только ЗАКРЫТЫЕ (да/нет)?
- Узнал ли преподаватель: а) конкретную цель ученика, б) дедлайн/срочность, в) прошлый опыт обучения (что не сработало), г) критерии выбора преподавателя?
- Были ли «вопросы-боль» по SPIN: «Что будет, если не подготовиться?», «Как это влияет на…?»
- ЦИТИРУЙ конкретные реплики и оценивай: этот вопрос раскрыл потребность или нет?

<h4>🌟 2. Самопрезентация</h4>
Анализируй:
- В какой момент и какими словами преподаватель рассказал о себе? Цитата.
- Была ли «история результата» (пример ученика: «Мой ученик Вася за 3 месяца сдал на 90+»)?
- Преподаватель позиционировал себя как эксперта или как «ещё одного репетитора»?
- Чувствуется ли уверенность и энергия в подаче, или преподаватель стесняется говорить о себе?
- Был ли «социальный якорь»: опыт, количество учеников, образование, публикации?

<h4>💡 3. Демонстрация экспертности внутри урока</h4>
Анализируй:
- Показал ли преподаватель свою методику В ДЕЙСТВИИ (а не просто рассказал)?
- Был ли «wow-момент» — когда ученик узнал что-то неожиданное/полезное?
- Адаптировал ли преподаватель сложность под уровень ученика? Как именно?
- Дал ли ученику ощущение прогресса: «видишь, ты уже понял это за 10 минут»?

<h4>🎁 4. Презентация ценности и закрытие</h4>
Анализируй:
- Был ли МОСТ от пробного к платному: «На уроке мы затронули X, а на курсе мы разберём Y»?
- Объяснил ли преподаватель формат, частоту, длительность и стоимость?
- Был ли чёткий CTA: «Давай запланируем первое занятие на…»?
- Или урок просто закончился без предложения? Цитируй финальные реплики.
- Создал ли преподаватель СРОЧНОСТЬ: «До экзамена осталось N месяцев, если начнём сейчас…»?

<h3>🔴 КРИТИЧЕСКИЕ ОШИБКИ</h3>
Перечисли 2–4 самых серьёзных промаха, которые напрямую убивают конверсию. Для каждого:
- Что именно произошло (цитата).
- Почему это проблема.
- Как должно было быть (пример альтернативной фразы).

<h3>💡 ACTION PLAN: 5 КОНКРЕТНЫХ ДЕЙСТВИЙ</h3>
Для каждого действия:
- ЧТО делать (одно предложение).
- СКРИПТ: точная фраза, которую можно выучить и использовать.
- КОГДА в уроке применять (начало / середина / финал).

Пример формата:
«В первые 2 минуты задай вопрос-боль: "Расскажи, ты уже пробовал готовиться? Что не сработало?"»

` : `

<h3>📊 ЭКСПРЕСС-ОЦЕНКА</h3>
Таблица с баллами 1–10:
| Блок | Балл | Комментарий |
- Целеполагание и структура
- Качество объяснения (доступность, примеры)
- Проверка понимания (обратная связь)
- Вовлечение и интерактив
- Адаптация под ученика
- Закрепление и рефлексия
Итого: средний балл.
Главный вывод: вынес ли ученик с урока конкретный навык/знание? (1–2 предложения).

<h3>🔎 ДЕТАЛЬНЫЙ РАЗБОР</h3>

<h4>🧭 1. Структура и целеполагание</h4>
- Было ли вступление: «Сегодня мы разберём…, к концу урока ты сможешь…»? Цитата.
- Есть ли логическая структура: введение → объяснение → практика → итог?
- Или урок «поплыл» — перескакивал с темы на тему? Укажи конкретные моменты.
- Были ли переходы-связки между блоками: «Теперь, когда мы разобрали X, перейдём к Y»?

<h4>🧠 2. Качество объяснения</h4>
- Какой уровень таксономии Блума задействован? (запоминание → понимание → применение → анализ)
- Использует ли преподаватель ПРИМЕРЫ ИЗ ЖИЗНИ, метафоры, аналогии? Приведи цитаты.
- Есть ли «перегрузка»: слишком много нового за раз без пауз? Где именно?
- Говорит ли преподаватель монологом 5+ минут подряд? Отметь такие участки.
- Адаптирует ли язык под уровень ученика, или использует jargon без объяснения?

<h4>🤝 3. Проверка понимания и обратная связь</h4>
- Задаёт ли преподаватель ПРОВЕРОЧНЫЕ ВОПРОСЫ по ходу? Перечисли с цитатами.
- Как реагирует на ОШИБКИ ученика? Цитата. (Исправляет сразу / подводит к правильному / игнорирует)
- Есть ли момент, когда ученик явно НЕ ПОНЯЛ, а преподаватель пошёл дальше? Цитата.
- Использует ли scaffolding: «Давай разберём по шагам», «Что ты уже знаешь об этом?»

<h4>🎯 4. Вовлечение и интерактив</h4>
- Какова пропорция говорения: преподаватель vs ученик? (Оцени примерно: 90/10, 70/30, 50/50.)
- Есть ли АКТИВНЫЕ задания: «Попробуй сам», «Как ты думаешь…?»? Перечисли.
- Как преподаватель возвращает внимание, если ученик «залип»?
- Есть ли элементы геймификации, вызова, интриги?

<h4>🏁 5. Закрепление и рефлексия</h4>
- Было ли подведение итогов: «Сегодня мы узнали…»? Цитата.
- Дано ли домашнее задание или рекомендация к следующему уроку?
- Понимает ли ученик, ЧТО он узнал и ЗАЧЕМ это нужно?
- Есть ли «мост» к следующему уроку: «В следующий раз мы разберём…»?

<h3>🔴 КРИТИЧЕСКИЕ ОШИБКИ</h3>
2–4 самых серьёзных методических промаха. Для каждого:
- Конкретный момент (цитата).
- Какой принцип нарушен и почему это вредит обучению.
- Как переделать (пример альтернативного действия).

<h3>💡 ACTION PLAN: 5 КОНКРЕТНЫХ ДЕЙСТВИЙ</h3>
Для каждого:
- ЧТО делать (кратко).
- КАК именно (конкретный приём или фраза).
- ПРИМЕР из педагогической практики, почему это работает.

`}

ТРЕБОВАНИЯ К ОФОРМЛЕНИЮ HTML (СТРОГО):
- ВЕРНИ ТОЛЬКО ЧИСТЫЙ HTML. БЕЗ ТРОЙНЫХ КАВЫЧЕК (\`\`\`html).
- НИКАКИХ ВСТУПЛЕНИЙ И ЗАКЛЮЧЕНИЙ ОТ МОДЕЛИ. Сразу начинай и заканчивай HTML-тегами.
- Используй <h3>, <h4>, <ul>, <li>, <strong>, <blockquote> для цитат.
- Таблицу оценок делай через <table> с <th> и <td>.
- НЕ используй <html>, <head>, <body>, <style>.
- Эмодзи в заголовках — обязательно.
- Объём: развёрнутый анализ, не экономь на деталях. Каждый блок — минимум 3–5 пунктов.

ТРАНСКРИПЦИЯ:
${transcript.substring(0, 30000)}
`;

return this.runReplicatePrediction('google/gemini-3-flash', {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  max_tokens: 10000,
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
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${this.replicateToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      let prediction = response.data;
      const predictionId = prediction.id;

      while (['starting', 'processing'].includes(prediction.status)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusRes = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: { Authorization: `Bearer ${this.replicateToken}` },
          },
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

  private async resolveYandexDiskLink(url: string): Promise<string> {
    try {
      const apiUrl = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(
        url,
      )}`;
      const headers = this.yandexToken
        ? { Authorization: `OAuth ${this.yandexToken}` }
        : {};

      const response = await axios.get(apiUrl, { headers });
      if (response.data && response.data.href) {
        return response.data.href;
      }
      throw new Error('Yandex.Disk API did not return a download link');
    } catch (error: any) {
      this.logger.error(`Failed to resolve Yandex.Disk link: ${error.message}`);
      throw new Error(
        `Не удалось получить прямую ссылку на видео с Яндекс.Диска. Убедитесь, что ссылка публичная или проверьте OAuth токен.`,
      );
    }
  }
}
