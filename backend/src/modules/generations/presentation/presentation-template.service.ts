import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReplicateService } from '../../replicate/replicate.service';
import { LOGO_BASE64 } from '../generation.constants';

/**
 * Стили презентаций. Каждый — отдельный HTML-шаблон в backend/src/templates/presentations/.
 * Если стиль из UI не распознан — fallback на modern.
 */
export const PRESENTATION_STYLES = ['modern', 'academic', 'creative', 'corporate'] as const;
export type PresentationStyle = (typeof PRESENTATION_STYLES)[number];

/**
 * Цветовые темы — палитра подставляется в CSS-vars шаблона.
 * Ключи синхронизированы с UI (см. UI: ЦВЕТОВАЯ ТЕМА swatches).
 */
export const PRESENTATION_COLORS = {
  indigo:  { name: 'Математика / IT', accent: '#4F46E5', light: '#EEF2FF', dark: '#3730A3' },
  emerald: { name: 'Биология',         accent: '#10B981', light: '#ECFDF5', dark: '#047857' },
  violet:  { name: 'Гуманитарные',     accent: '#8B5CF6', light: '#F5F3FF', dark: '#6D28D9' },
  blue:    { name: 'Физика',           accent: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8' },
  slate:   { name: 'Универсальная',    accent: '#1E293B', light: '#F1F5F9', dark: '#0F172A' },
} as const;
export type PresentationColor = keyof typeof PRESENTATION_COLORS;

export interface PresentationParams {
  topic: string;
  text?: string;        // тезисы/исходный текст
  slidesCount?: number; // 5..24
  audience?: string;    // 'Школьники' | 'Студенты' | 'Учителя' | свободная строка
  style?: PresentationStyle;
  color?: PresentationColor;
}

/**
 * Layouts шаблона. На фронте/в промпте — только эти типы.
 * Расширять можно добавив новый case в renderSlide() в HTML-шаблонах.
 */
export const PRESENTATION_LAYOUTS = [
  'title', 'bullets', 'two-column', 'quote', 'summary', 'content', 'image-text',
] as const;
export type PresentationLayout = (typeof PRESENTATION_LAYOUTS)[number];

export interface PresentationSlide {
  layout: PresentationLayout;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  items?: string[];
  leftTitle?: string;
  leftText?: string;
  rightTitle?: string;
  rightText?: string;
  text?: string;
  author?: string;
  paragraphs?: string[];
  meta?: string;
  imageUrl?: string;  // для image-text layout
  imageAlt?: string;
}

export interface PresentationData {
  topic: string;
  audience: string;
  style: PresentationStyle;
  color: PresentationColor;
  slides: PresentationSlide[];
}

@Injectable()
export class PresentationTemplateService {
  private readonly logger = new Logger(PresentationTemplateService.name);

  constructor(private readonly replicate: ReplicateService) {}

  /**
   * Главная точка входа. Делает 3 вещи:
   *   1. Просит LLM вернуть JSON со слайдами по заданной теме/тезисам.
   *   2. Загружает HTML-шаблон под стиль (modern/academic/creative/corporate).
   *   3. Подставляет {{DATA}}, {{LOGO_URL}}, цветовые CSS-vars.
   *
   * НЕ генерирует картинки — в шаблонах их нет (по требованию: «убрать генерацию картинок»).
   */
  async generate(params: PresentationParams): Promise<{ html: string; data: PresentationData }> {
    const style = (params.style && PRESENTATION_STYLES.includes(params.style))
      ? params.style : 'modern';
    const color = (params.color && params.color in PRESENTATION_COLORS)
      ? params.color : 'indigo';
    const audience = params.audience?.trim() || 'Школьники';
    const slidesCount = clamp(params.slidesCount ?? 10, 5, 24);

    const prompt = this.buildPrompt({
      topic: params.topic,
      text: params.text || '',
      slidesCount,
      audience,
    });

    const rawJson = await this.callLLM(prompt);
    const slides = this.parseSlides(rawJson, slidesCount);

    const data: PresentationData = {
      topic: params.topic,
      audience,
      style,
      color,
      slides,
    };

    const html = await this.renderHtml(data);
    return { html, data };
  }

  /**
   * Промпт для LLM. Короткий, строго JSON, без HTML/CSS/JS. Запрещены картинки.
   * Логика «1-я → 3-я → 10-я генерация» сохранена через payload.nth в analytics-events.
   */
  private buildPrompt(p: { topic: string; text: string; slidesCount: number; audience: string }): string {
    return `Ты — методист и дизайнер презентаций. Сгенерируй данные для презентации.

ТЕМА: ${p.topic}
АУДИТОРИЯ: ${p.audience}
КОЛИЧЕСТВО СЛАЙДОВ: ${p.slidesCount}
${p.text ? `ИСХОДНЫЕ ТЕЗИСЫ/ТЕКСТ:\n${p.text}\n` : ''}

🔥 ГЛАВНОЕ ПРАВИЛО — НАПОЛНЕНИЕ КАЖДОГО СЛАЙДА:
Каждый слайд должен содержать МНОГО важного, осмысленного текста по теме.
Это не презентация-тизер, а полноценный учебный материал. Преподаватель
будет показывать его как самостоятельный источник знаний — без устной
подачи слайды должны учить.

ЗАПРЕЩЕНО:
  ❌ Короткие тезисы из 1-3 слов («Появление жизни», «Важно знать»)
  ❌ Пустые общие фразы без конкретики
  ❌ Один и тот же факт переписанный в разных словах
  ❌ Вода и «филлерный» текст

ОБЯЗАТЕЛЬНО:
  ✅ Каждое утверждение — с конкретикой: цифра, дата, имя, термин, пример
  ✅ Bullet или параграф = одна мысль развёрнутая до 1-3 предложений
  ✅ Логическая последовательность между слайдами (один развивает предыдущий)
  ✅ Тексты должны учить, а не просто называть

ТРЕБОВАНИЯ К КОЛИЧЕСТВУ ТЕКСТА НА СЛАЙДЕ (СТРОГО):

  • "title" — обложка
      subtitle: развёрнутый подзаголовок, 12-25 слов, объясняющий о чём
                презентация и почему это важно. НЕ односложное название.
      eyebrow: 2-4 слова (категория / класс / раздел)

  • "bullets" — 4-6 пунктов
      Каждый item: 1-2 полных предложения, 15-30 слов, с фактом/числом/примером.
      ПЛОХО:   "Появление многоклеточных"
      ХОРОШО:  "Около 1,5 млрд лет назад появились первые многоклеточные —
                это позволило клеткам специализироваться и образовать ткани."

  • "two-column" — сравнение или две стороны темы
      leftText и rightText: КАЖДЫЙ по 3-5 содержательных предложений (50-90 слов).
      С цифрами, именами, примерами. Колонки должны быть параллельны по структуре.

  • "content" — глубокий разбор раздела
      paragraphs: массив из 2-4 параграфов, КАЖДЫЙ — 3-5 предложений (60-120 слов).
      Развивай мысль: факт → пояснение → пример или следствие.
      Используй термины в скобках после первого упоминания.

  • "quote" — цитата научного авторитета по теме
      text: настоящая фраза реального учёного/мыслителя по теме (можно перевод).
      author: имя автора + краткий регалия в одну строку ("Чарльз Дарвин, биолог").

  • "summary" — итоги в виде содержательных тезисов
      4-6 items, каждый — 1 полное предложение 12-25 слов с ключевым выводом.
      НЕ просто заголовки разделов. Каждый — самостоятельная важная мысль.

СТРУКТУРА ВСЕЙ ПРЕЗЕНТАЦИИ:
  • Слайд 1: title (обложка)
  • Слайд 2: bullets — что узнаем сегодня (краткий план)
  • Слайды 3..N-2: разнообразие layouts (bullets, two-column, content, quote)
    Чередуй типы — не более 2 одинаковых подряд.
    Минимум 2 content-слайда с глубоким разбором.
  • Предпоследний слайд: quote с реальной цитатой или content с выводами
  • Последний слайд: summary с ключевыми итогами

ТЕХНИЧЕСКИЕ ПРАВИЛА:
1. Верни ТОЛЬКО валидный JSON-массив слайдов, без markdown, без комментариев.
2. Никаких HTML-тегов в текстовых полях.
3. Никаких ссылок на картинки — слайды только текстовые.
4. Формулы — в LaTeX, оборачивай в $...$ (inline) или $$...$$ (block).
   Внутри формул только латиница и спецсимволы LaTeX, кириллица в формулах ЗАПРЕЩЕНА.
5. Каждый слайд имеет поле "layout".
6. Размер JSON: ровно ${p.slidesCount} слайдов.

ПЕРЕД ОТПРАВКОЙ ПРОВЕРЬ САМ СЕБЯ (мысленно, в ответ не пиши):
  □ Каждый bullet содержит конкретный факт/число/имя?
  □ Каждый paragraph в content — это полноценный обучающий абзац,
    а не одно предложение?
  □ leftText/rightText в two-column — это развёрнутые куски,
    а не пара слов?
  □ subtitle на title слайде объясняет суть, а не повторяет title?
  □ summary items — это содержательные выводы, а не заголовки?
Если хоть один пункт не выполнен — перепиши слайд плотнее.

ПРИМЕР НАСЫЩЕННОГО content-слайда (это образец качества, НЕ копируй текст):
{
  "layout":"content",
  "title":"Кембрийский взрыв",
  "paragraphs":[
    "Около 541 млн лет назад произошло событие, которое биологи называют кембрийским взрывом. За относительно короткий по геологическим меркам период — около 20-25 млн лет — на Земле появились почти все известные типы животных, включая хордовых, членистоногих и моллюсков. До этого жизнь была представлена в основном простыми мягкотелыми формами.",
    "Главными драйверами взрыва учёные считают три фактора: резкий рост концентрации кислорода в атмосфере (с 4% до 15%), появление активного хищничества и возникновение зрения как нового сенсорного канала. Эти факторы вместе запустили эволюционную гонку вооружений: появились панцири, шипы, быстрые мышцы.",
    "Ископаемые этого периода найдены в сланцах Бёрджес в Канаде и Чэнцзяне в Китае. Среди самых известных находок — Anomalocaris (хищник до метра длиной) и Hallucigenia (червь с шипами). Эти отпечатки позволяют реконструировать целые экосистемы кембрия."
  ]
}

Верни массив ровно из ${p.slidesCount} слайдов в формате JSON. Каждый слайд
должен быть наполнен текстом по требованиям выше.`;
  }

  /**
   * Вызов LLM. Тот же стек что у games — Gemini-3-Flash через Replicate.
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      // max_tokens поднят до 16000 — иначе при 12+ слайдах с насыщенными
      // параграфами (60-120 слов каждый) ответ обрезается, JSON-массив
      // получается ломаный, парсер потом пытается восстановить и не всегда
      // успешно. Температура чуть ниже стандартной — содержательный учебный
      // текст требует точности, а не креативности.
      const raw = await this.replicate.createCompletion(prompt, 'meta/llama-4-maverick-instruct', {
        max_tokens: 16000,
        temperature: 0.55,
      });
      this.logger.debug(`Presentation LLM response: ${raw.length} chars`);
      return raw;
    } catch (e: any) {
      this.logger.error(`Presentation LLM failed: ${e?.message}`);
      throw new Error('Не удалось сгенерировать содержимое презентации');
    }
  }

  /**
   * Парсит ответ LLM. Терпим к мусору вокруг JSON и к типичным «грязным» паттернам,
   * которые любит выдавать модель:
   *   — markdown ```json ... ```
   *   — smart-quotes "«»"
   *   — комментарии //
   *   — НЕвалидные backslash-escapes (\frac, \( и т.д. — LaTeX-команды
   *     ломают JSON.parse, потому что \f в JSON — это form-feed, а не "\\f")
   *   — trailing commas ,]
   *   — обрезанный ответ (ставим } и ] до победного)
   *   — control characters внутри строк (модель вставляет реальный \n вместо \\n)
   */
  private parseSlides(raw: string, expected: number): PresentationSlide[] {
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('LLM вернул не JSON-массив');

    let json = m[0];

    // 1) smart quotes → обычные
    json = json.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    // 2) однострочные // комментарии
    json = json.replace(/\/\/[^\n]*/g, '');

    // 3) НЕВАЛИДНЫЕ escape-последовательности.
    //    Валидные JSON-escapes: \" \\ \/ \b \f \n \r \t \uXXXX
    //    LaTeX-команды (\frac, \ln, \(, \[) и одиночные \ в кириллице ломают JSON.
    //    Переэкранируем их в \\X.
    json = json.replace(/\\(u[0-9a-fA-F]{4}|[^])/g, (match, group1) => {
      // \uXXXX оставляем как есть
      if (group1.length === 5 && group1.startsWith('u')) return match;
      const ch = group1;
      // Валидные одиночные escapes JSON
      if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(ch)) return match;
      // Невалидный — экранируем backslash
      return '\\\\' + ch;
    });

    // 4) trailing commas перед ] или }
    json = json.replace(/,(\s*[\]}])/g, '$1');

    // 5) реальные переводы строки внутри строковых значений — заменяем на пробел.
    //    JSON запрещает literal newlines внутри "..." — модель иногда их вставляет.
    //    Простая эвристика: считаем кавычки и заменяем \n/\r на пробел, если мы внутри строки.
    json = this.escapeRawNewlinesInStrings(json);

    let parsed: any[];
    try {
      parsed = JSON.parse(json);
    } catch (e: any) {
      this.logger.warn(`JSON parse failed: ${e?.message}. Trying recovery...`);
      // Recovery: режем до последнего ']' и пытаемся снова
      const lastBracket = json.lastIndexOf(']');
      if (lastBracket > 0) {
        const truncated = json.slice(0, lastBracket + 1);
        try {
          parsed = JSON.parse(truncated);
        } catch (e2: any) {
          this.logger.error(`JSON recovery failed: ${e2?.message}. First 200 chars: ${json.slice(0, 200)}`);
          throw new Error('Невалидный JSON от LLM (после recovery)');
        }
      } else {
        throw new Error('Невалидный JSON от LLM');
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LLM вернул пустой список слайдов');
    }

    // Валидация и нормализация. Незнакомые layouts → content.
    const slides: PresentationSlide[] = parsed.map((s: any) => {
      const layout: PresentationLayout = PRESENTATION_LAYOUTS.includes(s?.layout)
        ? s.layout : 'content';
      return {
        layout,
        title: s.title || undefined,
        subtitle: s.subtitle || undefined,
        eyebrow: s.eyebrow || undefined,
        items: Array.isArray(s.items) ? s.items.map(String) : undefined,
        leftTitle: s.leftTitle || undefined,
        leftText: s.leftText || undefined,
        rightTitle: s.rightTitle || undefined,
        rightText: s.rightText || undefined,
        text: s.text || undefined,
        author: s.author || undefined,
        paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs.map(String) : undefined,
        meta: s.meta || undefined,
        imageUrl: s.imageUrl || undefined,
        imageAlt: s.imageAlt || undefined,
      };
    });

    if (Math.abs(slides.length - expected) > 2) {
      this.logger.warn(`Expected ${expected} slides, got ${slides.length}`);
    }
    return slides;
  }

  /**
   * Заменяет literal \n / \r внутри строковых значений JSON на \\n / \\r.
   * LLM иногда вставляет настоящие переводы строки в "...", что ломает JSON.parse.
   *
   * Проходимся посимвольно с отслеживанием контекста: внутри строки / снаружи.
   * Escape-последовательности (\") учитываем, чтобы не сломать состояние in_string.
   */
  private escapeRawNewlinesInStrings(input: string): string {
    let out = '';
    let inString = false;
    let escapeNext = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escapeNext) {
        out += ch;
        escapeNext = false;
        continue;
      }
      if (ch === '\\' && inString) {
        out += ch;
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        out += ch;
        continue;
      }
      if (inString) {
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { out += '\\r'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }
      }
      out += ch;
    }
    return out;
  }

  /**
   * Загружает HTML-шаблон, подставляет {{DATA}}, {{TITLE}}, {{TOPIC}},
   * цветовые vars и LOGO_URL.
   * Публичный — используется и в generate(), и в migration-скрипте для
   * пересборки HTML из уже существующего PresentationData без LLM-вызова.
   */
  async renderHtml(data: PresentationData): Promise<string> {
    // HTML-шаблоны лежат в src/templates/ — tsc build их не копирует в dist,
    // поэтому путь строим от process.cwd() (= /app в Docker), а не от __dirname.
    // Та же логика что в games.service.ts:30.
    const templatesDir = path.join(process.cwd(), 'src', 'templates', 'presentations');
    const tplPath = path.join(templatesDir, `${data.style}.html`);
    let tpl: string;
    try {
      tpl = await fs.readFile(tplPath, 'utf-8');
    } catch (e: any) {
      this.logger.warn(`Template ${data.style} not found at ${tplPath}, falling back to modern: ${e?.message}`);
      tpl = await fs.readFile(path.join(templatesDir, 'modern.html'), 'utf-8');
    }

    const palette = PRESENTATION_COLORS[data.color];
    const title = data.slides[0]?.title || data.topic;
    const dataJson = JSON.stringify({ slides: data.slides });

    return tpl
      .replace(/\{\{ACCENT\}\}/g, palette.accent)
      .replace(/\{\{ACCENT_LIGHT\}\}/g, palette.light)
      .replace(/\{\{ACCENT_DARK\}\}/g, palette.dark)
      .replace(/\{\{LOGO_URL\}\}/g, LOGO_BASE64)
      .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
      .replace(/\{\{TOPIC\}\}/g, escapeHtml(data.topic))
      // {{DATA}} в самом конце — содержит JSON, иначе replace может попасть в строки.
      .replace(/\{\{DATA\}\}/g, dataJson);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
