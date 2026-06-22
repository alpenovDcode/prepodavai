import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { HtmlPostprocessorService } from './html-postprocessor.service';
import { DesignSystemConfig } from '../../modules/generations/config/design-system.config';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// MathJax configuration is now managed via HtmlPostprocessorService

/**
 * Injected into every PDF to force color/background rendering.
 * Playwright's page.pdf() switches to print media internally, which may suppress
 * backgrounds even when printBackground:true is set. This overrides it.
 */
const PDF_FORCE_STYLES = `<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
    box-sizing: border-box;
  }

  body {
    background: white !important;
    color: #111827 !important;
    margin: 0 !important;
    padding: 0 !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .worksheet-content {
    background: white !important;
    padding: 40px !important;
    min-height: 100vh;
  }

  /* Force background colors for Tailwind utilities */
  .bg-gray-50 { background-color: #f9fafb !important; }
  .bg-blue-50 { background-color: #eff6ff !important; }
  .border-blue-100 { border-color: #dbeafe !important; }

  svg {
    display: block;
    overflow: visible;
  }
  .pdf-inline-input {
    display: inline-block;
    min-width: 80px;
    border-bottom: 1px solid #9ca3af !important;
    margin: 0 4px;
    padding: 0 2px;
  }
  
  .pdf-input-box {
    background-color: white !important;
    border: 1px solid #d1d5db !important;
    border-radius: 0.375rem !important;
    padding: 8px 12px !important;
    margin: 8px 0 !important;
    min-height: 40px !important;
    display: flex;
    align-items: center;
  }

  h1, h2, h3, h4, h5, h6 {
    break-after: avoid !important;
    page-break-after: avoid !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  table, figure, img, svg, blockquote, pre {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .question-block,
  .task,
  .exercise,
  .option-item,
  .options-list,
  .meta-info,
  .pdf-input-box,
  .pdf-textarea-box,
  .pdf-inline-input,
  li {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .teacher-answers-only {
    break-before: page !important;
    page-break-before: always !important;
  }
  p { orphans: 3; widows: 3; }

  @page {
    size: A4;
  }
</style>`;

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly htmlPostprocessor: HtmlPostprocessorService) {
    console.log('[HtmlExportService] Initialized');
  }

  /**
   * Unified input normalizer used by ALL PDF export paths (web export-pdf,
   * Telegram/MAX senders). Guarantees that `htmlToPdf` receives a sane string:
   *   - unwraps markdown fences / surrounding quotes
   *   - falls back to wrapping plain text in a minimal HTML doc
   * Kept here so the behaviour is identical across entry points.
   */
  normalizeIncomingHtml(raw: unknown): string {
    if (raw === null || raw === undefined) return this.wrapPlainTextAsHtml('');

    const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);

    let processed = text.trim();

    if (processed.startsWith('```')) {
      processed = processed
        .replace(/^```(?:html)?/i, '')
        .replace(/```$/, '')
        .trim();
    }

    if (
      (processed.startsWith('"') && processed.endsWith('"')) ||
      (processed.startsWith("'") && processed.endsWith("'"))
    ) {
      processed = processed.slice(1, -1);
    }

    // DEDUP отключён. Раньше здесь стояла защита от того, что save-edit
    // редактора иногда пишет в outputData.content несколько копий HTML.
    // Защита изредка отрезала валидный контент посреди тега (false-positive
    // на повторяющиеся фразы / text→html mapping попадал в base64) → PDF
    // обрывался на середине. Корневой баг (дубли в БД) надо чинить отдельно
    // в save-edit. Пока убираем dedup ради стабильности PDF.

    const looksLikeHtml =
      /<!DOCTYPE html/i.test(processed) ||
      /<html[\s>]/i.test(processed) ||
      /<body[\s>]/i.test(processed) ||
      /<\/?[a-z][\s\S]*>/i.test(processed);

    return looksLikeHtml ? this.ensureHtmlDocument(processed) : this.wrapPlainTextAsHtml(text);
  }

  /**
   * Защита от дублирующегося контента, который save-edit редактора положил
   * в БД (баг в саму операции PATCH — пока не починен). Ловим два паттерна:
   *
   *   1. Несколько `<!DOCTYPE>...</html>` подряд (внешний concat) — берём
   *      только первый документ.
   *   2. Внутри ОДНОГО документа несколько `<div class="container">` подряд
   *      (внутренний concat — фронт сохранил body раза 2-3 в один html).
   *      Оставляем первый `.container`, остальные срезаем.
   *   3. Несколько одинаковых `<h1>` — fallback, если структура отличается
   *      от ожидаемой. Срезаем до второго совпадения.
   *
   * Аналогичная логика есть на фронте в MaterialViewer.normalizeResultPayload,
   * но фронт ловит только кейс №1. Этот метод — последний рубеж перед
   * экспортом, чтобы PDF/DOCX не выходили с 3 копиями.
   */
  /**
   * BULLETPROOF дедуп через сырой текст. Алгоритм:
   *   1. Извлекаем body (если есть) или работаем со всем html.
   *   2. Получаем plain text (без тегов, без &nbsp;, нормализованные пробелы).
   *   3. Берём первые 200 символов как «фингерпринт» документа.
   *   4. Ищем точно такие же 200 символов в остатке текста.
   *   5. Если нашли — это копия документа. Маппим позицию обратно в html
   *      (учитывая теги между текстом) и обрезаем html там.
   * Ловит ЛЮБОЙ паттерн дублирования: <div class="container"> повторы,
   * 3 копии в одном body без обёрток, частичные дубли и т.д.
   */
  private nukeDuplicatesByRawText(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
    const bodyInner = bodyMatch ? bodyMatch[1] : html;
    const bodyOffsetInHtml = bodyMatch ? html.indexOf(bodyInner) : 0;
    if (bodyInner.length < 1000) return html;

    // Шаг 1: получаем plain text и одновременно строим маппинг
    // text-index → html-index (т.е. для каждого символа в plain text знаем,
    // где он лежит в исходном bodyInner). Entity-decoding опускаем —
    // фингерпринт ищет ту же строку, что лежит в обоих копиях; разница
    // декодирования не повлияет (она консистентна).
    const textChars: string[] = [];
    const textToHtml: number[] = [];
    let inTag = false;
    for (let i = 0; i < bodyInner.length; i++) {
      const c = bodyInner[i];
      if (c === '<') { inTag = true; continue; }
      if (c === '>') { inTag = false; continue; }
      if (inTag) continue;
      // Сворачиваем подряд идущие whitespaces в один пробел
      if (/\s/.test(c)) {
        if (textChars.length === 0 || textChars[textChars.length - 1] !== ' ') {
          textChars.push(' ');
          textToHtml.push(i);
        }
        continue;
      }
      textChars.push(c);
      textToHtml.push(i);
    }

    const text = textChars.join('').trim();
    if (text.length < 500) return html;

    // Шаг 2: фингерпринт = первые 200 символов текста.
    // Чтобы избежать совпадений с боковыми элементами (header/footer),
    // пропускаем первые 50 символов (там обычно «Ученик: ___» / лого alt).
    const fingerprintStart = 50;
    const fingerprintLen = 200;
    if (text.length < fingerprintStart + fingerprintLen + 500) return html;
    const fingerprint = text.slice(fingerprintStart, fingerprintStart + fingerprintLen);

    // Шаг 3: ищем повтор фингерпринта В ОСТАТКЕ ТЕКСТА.
    const secondTextIdx = text.indexOf(fingerprint, fingerprintStart + fingerprintLen);
    if (secondTextIdx === -1) return html;

    // Шаг 4: маппим secondTextIdx обратно в позицию в bodyInner.
    // textToHtml[i] хранит позицию для i-го значимого символа.
    // Но у нас text был trimmed, надо пересчитать.
    const trimOffset = textChars.join('').indexOf(text); // обычно 0
    const realTextIdx = secondTextIdx + trimOffset;
    if (realTextIdx >= textToHtml.length) return html;
    const htmlPosInBody = textToHtml[realTextIdx];
    const absoluteHtmlPos = bodyOffsetInHtml + htmlPosInBody;

    // Шаг 5: обрезаем html. Закрывающие теги body/html допишем для валидности.
    const tailHasBodyClose = /<\/body\s*>/i.test(html.slice(absoluteHtmlPos));
    const tailHasHtmlClose = /<\/html\s*>/i.test(html.slice(absoluteHtmlPos));
    const suffix =
      '</div></div>' +
      (tailHasBodyClose ? '</body>' : '') +
      (tailHasHtmlClose ? '</html>' : '');
    return html.slice(0, absoluteHtmlPos) + suffix;
  }

  private takeFirstHtmlDocument(html: string): string {
    // 1. Срезаем повторные </html>
    const htmlEnd = html.match(/<\/html\s*>/i);
    if (htmlEnd && htmlEnd.index !== undefined) {
      const endIdx = htmlEnd.index + htmlEnd[0].length;
      const tail = html.slice(endIdx);
      if (/<!DOCTYPE\s+html|<html[\s>]/i.test(tail)) {
        html = html.slice(0, endIdx);
      }
    }

    // 2. Срезаем повторяющиеся `<div class="container">` верхнего уровня
    //    внутри одного документа. Идём по строке, считаем глубину <div>'ов,
    //    и как только встречаем ВТОРОЙ `<div class="container">` на глубине 0
    //    относительно первого — обрезаем там.
    const dedupedByContainer = this.dropRepeatedContainers(html);
    if (dedupedByContainer !== html) {
      this.docxLogger.log(
        `Контент содержал повторные <div class="container">, обрезаем ` +
        `до первого блока (было ${html.length}, стало ${dedupedByContainer.length})`,
      );
      html = dedupedByContainer;
    }

    // 3. Fallback: повторяющиеся одинаковые <h1>
    const dedupedByH1 = this.dropAfterRepeatedHeading(html, 'h1');
    if (dedupedByH1 !== html) {
      this.docxLogger.log(
        `Контент содержал повторяющиеся <h1>, обрезаем до второго ` +
        `(было ${html.length}, стало ${dedupedByH1.length})`,
      );
      html = dedupedByH1;
    }

    // 4. Кейс «дубль ВНУТРИ одного container/тайтла»: контент склеен так,
    //    что первый h2 (под-заголовок) встречается 2-3 раза. Ловим по
    //    h2 → h3 → h4 — какой найдём раньше.
    for (const tag of ['h2', 'h3', 'h4'] as const) {
      const deduped = this.dropAfterRepeatedHeading(html, tag);
      if (deduped !== html) {
        this.docxLogger.log(
          `Контент содержал повторяющиеся <${tag}>, обрезаем до второго ` +
          `(было ${html.length}, стало ${deduped.length})`,
        );
        html = deduped;
        break;
      }
    }

    // 5. Последний fallback: контент без заголовков совсем, но с
    //    повторяющимися «Задание №», «Упражнение №», «Вопрос №» и т.п. —
    //    типичные маркеры worksheet'а. Если первый такой маркер
    //    встречается 2+ раз, обрезаем до второго.
    const dedupedByMarker = this.dropAfterRepeatedMarker(html);
    if (dedupedByMarker !== html) {
      this.docxLogger.log(
        `Контент содержал повторяющиеся маркеры заданий, обрезаем ` +
        `(было ${html.length}, стало ${dedupedByMarker.length})`,
      );
      html = dedupedByMarker;
    }

    // 6. NUCLEAR fallback: берём первый «значимый» текстовый блок
    //    (>= 60 символов после очистки тегов) и ищем его повторение в
    //    остатке html. Если нашли — обрезаем там. Это ловит ВСЁ — даже
    //    дубли без структурных маркеров (одинаковых .container/h1/h2/задания).
    const dedupedNuclear = this.dropAfterRepeatedTextChunk(html);
    if (dedupedNuclear !== html) {
      this.docxLogger.log(
        `[nuclear] Найден повтор первого текстового блока, обрезаем ` +
        `(было ${html.length}, стало ${dedupedNuclear.length})`,
      );
      html = dedupedNuclear;
    }

    return html;
  }

  /**
   * Ищет первый значимый текстовый блок (text content >= 60 символов
   * внутри одного тега p, div, li, h1-h6, span). Если такая же строка
   * встречается ПОЗЖЕ в html, считаем что документ дублирован — обрезаем перед вторым
   * вхождением. Сравниваем нормализованный текст (без тегов, тримим whitespace).
   *
   * Это «ядерный» дедуп — ловит ситуации, когда копии документа склеены
   * без видимых структурных границ.
   */
  private dropAfterRepeatedTextChunk(html: string): string {
    // Берём body, если есть. Иначе весь html.
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
    const bodyStartOffset = bodyMatch ? html.indexOf(bodyMatch[1]) : 0;
    const haystack = bodyMatch ? bodyMatch[1] : html;

    // Извлекаем текстовые блоки с позициями относительно haystack.
    const blocks: Array<{ pos: number; text: string }> = [];
    const tagRe = /<(p|div|li|h[1-6]|span|td|article|section)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(haystack)) !== null) {
      const text = m[2]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 60) {
        blocks.push({ pos: m.index, text });
      }
    }
    if (blocks.length < 2) return html;

    // Первый блок — наш «фингерпринт». Ищем точно такой же текст ниже.
    const first = blocks[0];
    const duplicate = blocks.slice(1).find((b) => b.text === first.text);
    if (!duplicate) return html;

    // Маппим позицию обратно в полный html
    const absPos = bodyStartOffset + duplicate.pos;
    return this.truncateWithClosingTags(html, absPos);
  }

  /**
   * Находит ВСЕ позиции `<div class="container">` верхнего уровня и, если
   * их больше одного, возвращает HTML, обрезанный до начала второго.
   * Внутренние вложенные <div> в счёт не идут — балансируем теги.
   */
  private dropRepeatedContainers(html: string): string {
    const re = /<div\s[^>]*class\s*=\s*["'][^"']*\bcontainer\b[^"']*["'][^>]*>/gi;
    const matches: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) matches.push(m.index);
    if (matches.length < 2) return html;

    // Проверяем, что второй .container лежит на ВЕРХНЕМ уровне относительно
    // первого: между концом первого и началом второго число открытых <div>
    // должно сбалансироваться в 0.
    const firstStart = matches[0];
    const secondStart = matches[1];
    const between = html.slice(firstStart, secondStart);
    const opens = (between.match(/<div\b[^>]*>/gi) || []).length;
    const closes = (between.match(/<\/div\s*>/gi) || []).length;
    if (opens !== closes) {
      // Контейнеры вложенные — это нормальный случай, не дедупим.
      return html;
    }

    // Обрезаем перед началом второго .container, добавляем </body></html>
    // если они были в исходнике.
    const head = html.slice(0, secondStart);
    const tailHasBodyClose = /<\/body\s*>/i.test(html.slice(secondStart));
    const tailHasHtmlClose = /<\/html\s*>/i.test(html.slice(secondStart));
    const suffix =
      (tailHasBodyClose ? '</body>' : '') + (tailHasHtmlClose ? '</html>' : '');
    return head + suffix;
  }

  /**
   * Если в HTML 2+ заголовков указанного тега с одинаковым текстом, обрезаем
   * до второго. Работает для h1/h2/h3/h4.
   */
  private dropAfterRepeatedHeading(html: string, tag: 'h1' | 'h2' | 'h3' | 'h4'): string {
    const headings: Array<{ index: number; text: string }> = [];
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text) continue;
      headings.push({ index: m.index, text });
    }
    if (headings.length < 2) return html;
    const firstText = headings[0].text;
    const secondMatch = headings.slice(1).find((h) => h.text === firstText);
    if (!secondMatch) return html;
    return this.truncateWithClosingTags(html, secondMatch.index);
  }

  /**
   * Ловит повторяющиеся «Задание №1», «Упражнение 1», «Вопрос 1», «Task 1»,
   * «Question 1» — типичные маркеры worksheet/quiz. Берём первое совпадение
   * с цифрой 1 (или без цифры — первый маркер), и если такой же текст
   * встречается ещё раз, обрезаем там.
   */
  private dropAfterRepeatedMarker(html: string): string {
    // Текст без тегов — на нём ищем маркеры (но позицию маппим обратно в html).
    const markerRe = /(?:Задание|Упражнение|Вопрос|Задача|Task|Exercise|Question)\s*(?:№|#|N|No\.?)?\s*1[.\s)]/gi;
    const matches: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(html)) !== null) {
      matches.push(m.index);
      if (matches.length >= 2) break;
    }
    if (matches.length < 2) return html;
    return this.truncateWithClosingTags(html, matches[1]);
  }

  /**
   * Обрезает html перед позицией `pos`, дописывая закрывающие `</body></html>`,
   * если они присутствовали в хвосте — иначе документ может стать невалидным.
   */
  private truncateWithClosingTags(html: string, pos: number): string {
    const tailHasBodyClose = /<\/body\s*>/i.test(html.slice(pos));
    const tailHasHtmlClose = /<\/html\s*>/i.test(html.slice(pos));
    // Также закроем потенциально открытые .container/section/div верхнего
    // уровня, в которых лежит первая копия — проще всего добавить пару
    // </div> для страховки (Word/soffice их съедят без последствий).
    const suffix =
      '</div></div>' + // страховка для .container и обёрток
      (tailHasBodyClose ? '</body>' : '') +
      (tailHasHtmlClose ? '</html>' : '');
    return html.slice(0, pos) + suffix;
  }

  private ensureHtmlDocument(html: string): string {
    const trimmed = html.trim();
    if (/<!DOCTYPE html/i.test(trimmed)) return trimmed;
    if (/<html[\s>]/i.test(trimmed)) return `<!DOCTYPE html>\n${trimmed}`;
    const styleBlocks: string[] = [];
    const body = trimmed.replace(/<style[\s\S]*?<\/style>/gi, (m) => { styleBlocks.push(m); return ''; });
    return `<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8"/>\n${styleBlocks.join('\n')}\n</head>\n<body>\n${body.trim()}\n</body>\n</html>`;
  }

  private wrapPlainTextAsHtml(text: string): string {
    const escaped = (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>PrepodavAI Result</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.6;
      padding: 24px;
      background: #ffffff;
      color: #1a1a1a;
    }
    p { margin: 12px 0; }
  </style>
</head>
<body>
  <p>${escaped}</p>
</body>
</html>`;
  }

  // Счётчик использований браузера. После N рендеров перезапускаем —
  // Chromium со временем «бэйкает» память (особенно после страниц с тяжёлыми
  // SVG/MathJax), и через 50-100 PDF render деградирует до пустых страниц.
  private pageCount = 0;
  private static readonly BROWSER_RECYCLE_AFTER = 50;

  // Семафор: не пускаем больше N PDF одновременно. Каждая страница ест
  // 100-200 МБ, на 2-CPU контейнере 5+ параллельно даёт OOM → kill процесса
  // Chromium → пустые PDF до перезапуска пода. Лимит держим консервативный.
  private inFlight = 0;
  private waitQueue: Array<() => void> = [];
  private static readonly MAX_CONCURRENCY = 2;

  private async acquireSlot(): Promise<void> {
    if (this.inFlight < HtmlExportService.MAX_CONCURRENCY) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    this.inFlight++;
  }

  private releaseSlot(): void {
    this.inFlight--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private async recycleBrowserIfNeeded(): Promise<void> {
    if (this.pageCount < HtmlExportService.BROWSER_RECYCLE_AFTER) return;
    console.log(`[HtmlExport] Recycling browser after ${this.pageCount} pages`);
    await this.forceRecycleBrowser();
  }

  private async forceRecycleBrowser(): Promise<void> {
    const old = this.browserPromise;
    this.browserPromise = null;
    this.pageCount = 0;
    if (old) {
      try {
        const b = await old;
        await b.close();
      } catch (e) {
        console.warn('[HtmlExport] Error closing old browser:', (e as Error).message);
      }
    }
  }

  private async getBrowser() {
    if (!this.browserPromise) {
      this.browserPromise = chromium
        .launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        })
        .catch((err) => {
          console.error('[HtmlExport] Failed to launch browser:', err);
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  /**
   * Подготавливает HTML к рендеру в PDF, минимально вмешиваясь в верстку.
   *
   * Используем `processForRender` — лёгкий вариант пост-процесса:
   *   - LOGO_PLACEHOLDER → base64 (идемпотентно, no-op если уже заменён)
   *   - MathJax-скрипт подключается если в контенте есть формулы
   *   - снятие markdown-обёрток (защитный шаг)
   *
   * Деструктивные шаги (rebuildMatchedDiv для header/footer, инжекция
   * DesignSystemConfig.STYLES) НЕ выполняются — иначе кастомные header/SVG от
   * AI перезаписываются, и PDF расходится с тем, что пользователь видит в
   * iframe на фронте.
   */
  private prepareHtml(html: string): string {
    let processed = html;

    // 1. Если пришёл фрагмент без <html>/<body> — оборачиваем в шаблон с
    //    дизайн-системой (CSS, шрифты, контейнер), чтобы PDF не выходил
    //    «голым текстом». Это типичный кейс после правки в редакторе, когда
    //    в outputData.content попадает body innerHTML без head/style.
    if (!/<html/i.test(processed) || !/<body/i.test(processed)) {
      // Если фрагмент уже обёрнут в .container — не дублируем.
      const innerWrapped = /class\s*=\s*["'][^"']*\bcontainer\b/i.test(processed)
        ? processed
        : `<div class="container">${processed}</div>`;
      processed = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  ${DesignSystemConfig.STYLES}
</head>
<body>${innerWrapped}</body>
</html>`;
    }

    // 2. Лёгкий пост-процесс: LOGO_PLACEHOLDER → base64, MathJax-скрипт.
    //    Без rebuildMatchedDiv и прочих деструктивных мутаций.
    processed = this.htmlPostprocessor.processForRender(processed);

    // 3. Убираем Google Fonts @import — внешний CDN недоступен из Docker.
    processed = processed.replace(
      /@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com[^'")]+['"]?\)\s*;?/g,
      '',
    );

    // 4. Инжектим PDF_FORCE_STYLES (force colors/backgrounds, SVG visible,
    //    плюс правила пагинации: break-inside/break-before для смысловых
    //    блоков). Не трогаем авторские @media print — там зашиты разрывы
    //    страниц от стратегий (`.teacher-answers-only` и т.п.).
    if (processed.includes('</head>')) {
      processed = processed.replace('</head>', `${PDF_FORCE_STYLES}\n</head>`);
    } else if (/<html/i.test(processed)) {
      processed = processed.replace(/<html([^>]*)>/i, `<html$1><head>${PDF_FORCE_STYLES}</head>`);
    } else {
      processed = `<head>${PDF_FORCE_STYLES}</head>${processed}`;
    }

    return processed;
  }


  private readonly docxLogger = new Logger('HtmlToDocx');

  /**
   * Конвертирует HTML в DOCX. Стратегия (HTML→DOCX напрямую, БЕЗ PDF):
   *
   *   1. Pre-render в Playwright:
   *      - принудительно переключаем MathJax на SVG-вывод (CHTML использует
   *        свой шрифт и в Word рендерится мусором);
   *      - typeset формул, mjx-container → inline SVG / data-URI img;
   *      - <input>/<textarea> → подчёркнутые span'ы (форм-поля Word всё равно
   *        не поймёт, а заголовки worksheet'ов опираются на line отсюда);
   *      - чистим scripts/meta/link, schedule-only @media print и т.п.;
   *      - сериализуем итоговый DOM в строку.
   *
   *   2. Сохраняем во временный .html и запускаем soffice:
   *      `soffice --headless --convert-to docx:"MS Word 2007 XML" input.html`.
   *      LibreOffice импортирует HTML как обычный документ — заголовки/абзацы/
   *      списки/таблицы становятся НАТИВНЫМИ Word-стилями (редактируемыми),
   *      inline-стили подхватываются, SVG-формулы попадают как картинки в
   *      правильных местах потока текста.
   *
   *   3. Если soffice недоступен (локальная dev-машина) — fallback на
   *      html-to-docx с упрощённым дизайном.
   *
   * Результат: DOCX, который выглядит близко к веб-материалу, при этом ВСЁ
   * редактируемое — текст, таблицы, заголовки, списки — кроме формул
   * (они картинки, иначе их рендер в Word без MathJax-плагина невозможен).
   */
  async htmlToDocx(html: string): Promise<Buffer> {
    // DEBUG: считаем сколько раз встречается «Задание №1» во входе.
    // Это даёт точку отсчёта: если 1 — дубль создаётся ниже, если 3 — мой
    // dedup не сработал.
    const taskOneCount = (html.match(/Задание\s*№?\s*1[.\s)]/gi) || []).length;
    const containerCount = (html.match(/<div[^>]*\bcontainer\b/gi) || []).length;
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    this.docxLogger.log(
      `[diag-in] html=${html.length}b, «Задание №1»=${taskOneCount}, ` +
      `.container=${containerCount}, <h1>=${h1Count}`,
    );

    let rendered: string;
    try {
      rendered = await this.renderHtmlForDocx(html);
      const renderedTaskOne = (rendered.match(/Задание\s*№?\s*1[.\s)]/gi) || []).length;
      this.docxLogger.log(
        `Pre-render OK, длина=${rendered.length}, ` +
        `«Задание №1» в pre-rendered=${renderedTaskOne}`,
      );
    } catch (e: any) {
      this.docxLogger.warn(
        `Playwright pre-render для DOCX упал (${e?.message ?? e}). ` +
        `Используем сырой HTML — формулы не будут отрисованы.`,
      );
      rendered = this.prepareHtmlForDocx(html);
    }

    try {
      const buf = await this.htmlToDocxViaSoffice(rendered);
      this.docxLogger.log(`soffice HTML→DOCX успешно, размер=${buf.length}`);
      return buf;
    } catch (e: any) {
      this.docxLogger.warn(
        `LibreOffice HTML→DOCX недоступен (${e?.message ?? e}). ` +
        `Fallback на html-to-docx — используем тот же pre-rendered HTML.`,
      );
      // ВАЖНО: в fallback тоже отдаём rendered (с SVG/PNG-формулами),
      // а не сырой html. Иначе формулы ушли бы как raw LaTeX `\(...\)`.
      return this.htmlToDocxFallback(rendered);
    }
  }

  /**
   * Прогоняет HTML через Playwright, чтобы:
   *   - MathJax выдал SVG-формулы (вместо CHTML, который Word не понимает);
   *   - inputs/textareas стали span/p с подчёркиванием;
   *   - SVG получили явные width/height (без них soffice вставляет 0×0);
   *   - все скрипты и MathJax-ассистивный MML были выкинуты.
   * Возвращает сериализованный итоговый HTML.
   */
  private async renderHtmlForDocx(html: string): Promise<string> {
    // Стартовый HTML с дизайн-системой/MathJax-скриптом — переиспользуем
    // тот же prepareHtml, что и для PDF: получаем валидный документ с CSS.
    let prepared = this.prepareHtml(html);

    // Полностью сносим ЛЮБЫЕ старые MathJax-блоки (и config, и loader CHTML)
    // и подкладываем СВОЙ SVG-вариант. Так мы не зависим от того, в каком
    // виде MathJax попал в исходный HTML (это могло меняться от ветки к ветке).
    prepared = prepared
      .replace(/<script[^>]*>\s*window\.MathJax[\s\S]*?<\/script>/gi, '')
      .replace(/<script[^>]+src=["'][^"']*mathjax[^"']*["'][^>]*>\s*<\/script>/gi, '');

    const hasFormulas = /\\\(|\\\[|\$\$|\\(?:frac|sqrt|sum|int|prod|lim|cdot|times|alpha|beta|gamma|delta|theta|lambda|mu|sigma|phi|omega|infty|text|mathbb|mathcal|sin|cos|tan|log|ln|to|leq|geq|neq|approx|ce)\b|\\begin\{[a-z*]+\}/i.test(prepared);

    if (hasFormulas) {
      const SVG_MATHJAX = `
<script>
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true,
    packages: { '[+]': ['mhchem'] }
  },
  svg: { fontCache: 'none', scale: 1.0, internalSpeechTitles: false },
  options: { enableMenu: false },
  startup: {
    typeset: false,
    ready: function() {
      window.MathJax.startup.defaultReady();
      window.__mjxReady = true;
    }
  }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-svg.js"></script>`;
      if (/<head[\s>]/i.test(prepared)) {
        prepared = prepared.replace(/<head([^>]*)>/i, `<head$1>${SVG_MATHJAX}`);
      } else {
        prepared = SVG_MATHJAX + prepared;
      }
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewportSize({ width: 1100, height: 1400 });
      // domcontentloaded даёт быстрый коммит. networkidle для async скриптов
      // ненадёжен — даже когда MathJax не успел загрузиться. Дальше явно
      // ждём `window.MathJax` и `typesetPromise`.
      await page.setContent(prepared, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      if (hasFormulas) {
        try {
          // 1. Ждём, пока MathJax CDN-скрипт скачается и инициализируется
          await page.waitForFunction(
            () => typeof (window as any).MathJax !== 'undefined' && !!(window as any).MathJax.startup,
            null,
            { timeout: 30_000, polling: 200 },
          );
          // 2. Ждём startup-промис (MathJax готов к работе)
          await page.evaluate(async () => {
            const mj = (window as any).MathJax;
            if (mj.startup?.promise) await mj.startup.promise;
          });
          // 3. Принудительный typeset всей страницы (свой, не auto)
          await page.evaluate(async () => {
            const mj = (window as any).MathJax;
            if (mj.typesetPromise) await mj.typesetPromise([document.body]);
          });
          // 4. На всякий случай — ещё короткая пауза для финализации SVG
          await page.waitForTimeout(300);
        } catch (e) {
          this.docxLogger.warn(`MathJax typeset не дождался: ${(e as Error).message}`);
        }
      }

      // Pre-DOCX DOM-преобразования: всё, что Word не поймёт, заменяем.
      // ВАЖНО: SVG конвертим в PNG (через canvas), а не оставляем SVG —
      // html-to-docx (fallback) SVG не понимает, soffice понимает с трудом.
      // PNG — самый совместимый формат для inline-картинок в .docx.
      await page.evaluate(async () => {
        const svgToPng = async (svg: SVGSVGElement, scale = 2): Promise<{ url: string; w: number; h: number } | null> => {
          try {
            const rect = svg.getBoundingClientRect();
            const vb = (svg as any).viewBox?.baseVal;
            const baseW = rect.width > 0 ? rect.width : (vb?.width || 200);
            const baseH = rect.height > 0 ? rect.height : (vb?.height || 50);
            const w = Math.max(Math.round(baseW), 16);
            const h = Math.max(Math.round(baseH), 12);
            svg.setAttribute('width', String(w));
            svg.setAttribute('height', String(h));
            if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const xml = new XMLSerializer().serializeToString(svg);
            const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

            return await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = w * scale;
                  canvas.height = h * scale;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) { resolve(null); return; }
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  resolve({ url: canvas.toDataURL('image/png'), w, h });
                } catch { resolve(null); }
              };
              img.onerror = () => resolve(null);
              img.src = dataUrl;
            });
          } catch { return null; }
        };

        // 1. MathJax SVG → inline PNG
        const mathSvgs = Array.from(document.querySelectorAll<SVGSVGElement>('mjx-container svg, mjx-container > svg'));
        for (const svg of mathSvgs) {
          const result = await svgToPng(svg, 2);
          if (!result) continue;
          const img = document.createElement('img');
          img.src = result.url;
          img.setAttribute('width', String(result.w));
          img.setAttribute('height', String(result.h));
          img.style.cssText = `display:inline-block;vertical-align:middle;width:${result.w}px;height:${result.h}px;`;
          const container = svg.closest('mjx-container');
          if (container?.parentNode) container.parentNode.replaceChild(img, container);
        }
        // Сносим ассистивный MathJax-mml и любые оставшиеся mjx-container
        document.querySelectorAll('mjx-assistive-mml, mjx-container').forEach((n) => n.remove());

        // 2. Обычные SVG (графики/иллюстрации) → PNG
        for (const svg of Array.from(document.querySelectorAll<SVGSVGElement>('svg'))) {
          const result = await svgToPng(svg, 2);
          if (!result) continue;
          const img = document.createElement('img');
          img.src = result.url;
          img.setAttribute('width', String(result.w));
          img.setAttribute('height', String(result.h));
          img.style.cssText = `display:block;margin:12px auto;max-width:100%;`;
          svg.parentNode?.replaceChild(img, svg);
        }

        // 3. input[type=text]/number/email → подчёркнутый span (или строка для
        //    inline-input). textarea → блок с подчёркиванием.
        document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"], input[type="email"], input:not([type])').forEach((inp) => {
          const val = inp.value || inp.getAttribute('value') || '';
          const span = document.createElement('span');
          span.textContent = val || '               ';
          span.style.cssText = 'display:inline-block;min-width:140px;border-bottom:1px solid #374151;padding:0 4px;';
          inp.parentNode?.replaceChild(span, inp);
        });
        document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((ta) => {
          const val = ta.value || ta.textContent || '';
          const lines = Math.max(parseInt(ta.getAttribute('rows') || '3', 10) || 3, 3);
          const div = document.createElement('div');
          div.style.cssText = 'border:1px solid #d1d5db;border-radius:6px;padding:8px 12px;margin:8px 0;min-height:60px;white-space:pre-wrap;';
          div.textContent = val || Array(lines).fill('').map(() => '_'.repeat(60)).join('\n');
          ta.parentNode?.replaceChild(div, ta);
        });

        // 4. radio/checkbox → крестик/кружок (Word не показывает AcroForm)
        document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]').forEach((r) => {
          const checked = r.checked || r.hasAttribute('checked');
          const span = document.createElement('span');
          span.textContent = checked ? '☒' : '☐';
          span.style.cssText = 'display:inline-block;margin-right:6px;font-size:14px;';
          r.parentNode?.replaceChild(span, r);
        });

        // 5. Сносим scripts/meta/link/noscript — soffice игнорирует и так,
        //    но они увеличивают размер input HTML.
        document.querySelectorAll('script, noscript, meta[http-equiv], link[rel="preconnect"], link[rel="dns-prefetch"]').forEach((n) => n.remove());

        // 6. @import url(https://fonts.googleapis...) в инлайн-стилях
        //    закомментируем — soffice пытается их резолвить и виснет.
        document.querySelectorAll<HTMLStyleElement>('style').forEach((s) => {
          s.textContent = (s.textContent || '').replace(
            /@import\s+url\(['"]?https?:\/\/[^)'"]+['"]?\)\s*;?/gi,
            '',
          );
        });
      });

      const final = await page.content();
      return final;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async htmlToDocxViaSoffice(html: string): Promise<Buffer> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-html-'));
    const inputHtml = path.join(tmpDir, `${randomUUID()}.html`);
    await fs.writeFile(inputHtml, html, 'utf8');

    // soffice пишет конвертированный файл с тем же base-name, но другим
    // расширением. Имя выходного файла — input.docx в outdir.
    const outputDocx = inputHtml.replace(/\.html$/i, '.docx');

    // soffice требует writable user-profile. У контейнерного пользователя
    // nestjs нет своего $HOME, поэтому без явного -env:UserInstallation
    // soffice падает с "User installation could not be completed" /
    // "/home/nestjs/.cache/dconf: Permission denied".
    const userProfileDir = path.join(tmpDir, 'soffice-profile');
    await fs.mkdir(userProfileDir, { recursive: true });
    const userInstallationUrl = `file://${userProfileDir}`;

    await new Promise<void>((resolve, reject) => {
      // `docx:"MS Word 2007 XML"` — современный .docx (Office 2007+).
      // Без явного фильтра soffice иногда выдаёт legacy .doc.
      const proc = spawn('soffice', [
        `-env:UserInstallation=${userInstallationUrl}`,
        '--headless',
        '--norestore',
        '--nofirststartwizard',
        '--convert-to', 'docx:MS Word 2007 XML',
        '--outdir', tmpDir,
        inputHtml,
      ], {
        stdio: 'pipe',
        env: {
          ...process.env,
          // HOME укажем во временный каталог — на случай если что-то ещё
          // полезет в $HOME/.config/libreoffice.
          HOME: userProfileDir,
        },
      });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('soffice timeout (90s)'));
      }, 90_000);

      proc.on('error', (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve();
        else reject(new Error(`soffice exit ${code}: ${stderr.slice(0, 500)}`));
      });
    });

    const buf = await fs.readFile(outputDocx);
    await fs.rm(tmpDir, { recursive: true, force: true });
    return buf;
  }

  private async htmlToDocxFallback(html: string): Promise<Buffer> {
    const prepared = this.prepareHtmlForDocx(html);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const HTMLtoDOCX = require('html-to-docx');
    const docxBuffer = await HTMLtoDOCX(prepared, null, {
      orientation: 'portrait',
      margins: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
      table: { row: { cantSplit: true } },
      font: 'Calibri',
      fontSize: 22,
      title: 'Документ',
    });
    return Buffer.isBuffer(docxBuffer)
      ? (docxBuffer as Buffer)
      : Buffer.from(docxBuffer as ArrayBuffer);
  }

  /**
   * Чистит HTML до того, что html-to-docx гарантированно проглотит:
   * выкидываем скрипты, мета, ссылки, фоновые картинки (base64), стили,
   * MathJax-контейнеры, упрощаем заголовок документа. Тело пробрасываем
   * как есть — таблицы, списки, заголовки, абзацы, инпуты (как подчёркивания).
   */
  private prepareHtmlForDocx(html: string): string {
    // Полная HTML-обёртка (если пришёл фрагмент — оборачиваем).
    let processed = /<html[\s>]/i.test(html)
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;

    processed = processed
      // полностью убираем скрипты, стили, мету, линки, шрифты
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<meta\b[^>]*>/gi, '')
      .replace(/<link\b[^>]*>/gi, '')
      // MathJax контейнеры рендерятся как HTML/MML — Word их не поймёт,
      // выкидываем; формулы останутся как plain-text-замена в alt.
      // (После pre-render формул уже не будет — будут <img src="data:image/png">)
      .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
      .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')
      // Сносим ТОЛЬКО SVG data-URIs (если pre-render оставил их), логотип
      // (header-logo/footer-logo с огромным data:image/png) и
      // незаменённые LOGO_PLACEHOLDER. PNG data:image/png формул — НЕ ТРОГАЕМ,
      // html-to-docx умеет их встраивать.
      .replace(/<img\b[^>]*src=["']data:image\/svg\+xml[^"']+["'][^>]*>/gi, '')
      .replace(/<img\b[^>]*class=["'][^"']*(?:header-logo|footer-logo)[^"']*["'][^>]*>/gi, '')
      .replace(/<img\b[^>]*src=["']LOGO_PLACEHOLDER["'][^>]*>/gi, '')
      // header-logo / footer-logo может прийти с атрибутами в другом порядке —
      // ловим оба варианта (class перед src).
      .replace(/<img\b[^>]*(?:header-logo|footer-logo)[^>]*src=["']data:[^"']+["'][^>]*>/gi, '')
      // input[type=text] оставляем как «_____» — для печати в Word удобнее.
      .replace(
        /<input\b[^>]*type=["']?text["']?[^>]*>/gi,
        '<span>_________________</span>',
      )
      .replace(
        /<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi,
        '<p>_____________________________________________________</p>',
      );

    // Меняем @import / @page внутри атрибутов style (если просочились).
    processed = processed.replace(/@page[^{]*\{[^}]*\}/gi, '');

    return processed;
  }

  async htmlToPdf(
    html: string,
    options?: { blockExternalRequests?: boolean; wideMargins?: boolean; landscape?: boolean },
  ): Promise<Buffer> {
    await this.acquireSlot();
    try {
      // Retry до 2 раз: если PDF получился подозрительно мал (<2KB) или вылетел,
      // ресайклим браузер и пробуем ещё раз. Это лечит:
      //   - временные сбои Chromium / OOM-крах между запросами
      //   - редкие случаи когда `page.pdf()` возвращает 0 байт
      //   - кратковременную недоступность MathJax CDN
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const pdf = await this.htmlToPdfOnce(html, options);
          if (pdf.length < 2048) {
            lastErr = new Error(`PDF подозрительно мал: ${pdf.length} байт`);
            console.warn(`[HtmlExport] Attempt ${attempt}: ${lastErr.message}, recycling browser`);
            await this.forceRecycleBrowser();
            continue;
          }
          return pdf;
        } catch (err) {
          lastErr = err;
          console.warn(`[HtmlExport] Attempt ${attempt} failed:`, (err as Error).message);
          await this.forceRecycleBrowser();
        }
      }
      throw lastErr ?? new Error('PDF rendering failed after retries');
    } finally {
      this.releaseSlot();
    }
  }

  private async htmlToPdfOnce(
    html: string,
    options?: { blockExternalRequests?: boolean; wideMargins?: boolean; landscape?: boolean },
  ): Promise<Buffer> {
    console.log(`[HtmlExport] Starting PDF generation, HTML length: ${html.length}`);
    await this.recycleBrowserIfNeeded();

    let browser: Browser;
    let page: Page;

    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      this.pageCount++;
    } catch (launchError) {
      console.error('[HtmlExport] Browser launch or page creation failed:', launchError);
      throw new Error('Failed to initialize PDF generator engine.');
    }

    try {
      const processedHtml = this.prepareHtml(html);
      const hasMathJax = /<script[^>]+src=["'][^"']*mathjax[^"']*["']/i.test(processedHtml);

      // A4 portrait 96 DPI = 794×1123; landscape = 1123×794.
      // Viewport должен совпадать с размером страницы PDF — иначе 100vh/100vw
      // в слайдах считаются неверно и строки съезжают.
      await page.setViewportSize(
        options?.landscape ? { width: 1123, height: 794 } : { width: 794, height: 1123 },
      );

      if (options?.blockExternalRequests) {
        // Bot context: block external HTTP requests to prevent hanging.
        // Allow cdn.jsdelivr.net for MathJax (needed to render LaTeX formulas in PDFs).
        await page.route('**/*', (route) => {
          const url = route.request().url();
          if (
            (url.startsWith('http://') || url.startsWith('https://')) &&
            !url.includes('cdn.jsdelivr.net')
          ) {
            route.abort().catch(() => {});
          } else {
            route.continue().catch(() => {});
          }
        });
        await page.setContent(processedHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        // domcontentloaded даёт быстрый и предсказуемый старт. networkidle
        // 60s часто либо рано отпускает (async MathJax ещё грузится), либо
        // зависает на медленных шрифтах. Всё, что нам реально нужно
        // (шрифты/картинки/MathJax), мы дальше явно дождёмся через
        // waitForFunction перед page.pdf().
        await page.setContent(processedHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      // Pre-PDF DOM transformation:
      //   SVGs  → ensure explicit dims for PDF engine
      //   inputs/textareas → styled divs (PDF treats form fields as invisible AcroForm objects)
      await page.evaluate(async () => {
        // 1. Ensure SVGs have explicit dimensions (Chromium PDF engine needs them)
        // ROOT CAUSE: 'height: auto' on SVG collapses to 0px when Chromium switches to print
        // media for page.pdf(). Only <text> nodes survive as PDF text layer — shapes disappear.
        // FIX: read actual layout dims in screen media (before the switch), set explicit px values
        // as inline styles (highest CSS specificity, survive the media switch).
        for (const svg of Array.from(document.querySelectorAll<SVGSVGElement>('svg'))) {
          try {
            const vb = (svg as any).viewBox?.baseVal;
            const rc = svg.getBoundingClientRect();

            // Compute width: prefer actual rendered width, else viewBox, else 500px default
            const rawW = rc.width > 0 ? rc.width : (vb && vb.width > 0 ? vb.width : 500);
            // Cap at usable PDF page width (A4 minus margins ~750px) to avoid overflow
            const w = Math.min(rawW, 750);

            // Compute height: prefer actual rendered height (correct in screen media),
            // else use viewBox aspect ratio (ensures correct proportions when rc is 0)
            const h = rc.height > 0
              ? rc.height
              : (vb && vb.width > 0 && vb.height > 0 ? w * (vb.height / vb.width) : 300);

            svg.setAttribute('width', Math.round(w).toString());
            svg.setAttribute('height', Math.round(h).toString());

            // Inline styles survive print-media switch; they override CSS 'height: auto'
            svg.style.cssText += `;display:block;width:${Math.round(w)}px;height:${Math.round(h)}px;max-width:100%;margin:16px auto;overflow:visible;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;
          } catch (e) {
            console.error('[HtmlExport] SVG processing error:', e);
          }
        }

        // 2. input[type="text"] → contentful span or bordered div
        document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="number"], input[type="email"]').forEach((inp) => {
          const val = inp.value || inp.getAttribute('value') || '';
          if (inp.classList.contains('inline-input')) {
            const span = document.createElement('span');
            span.className = 'pdf-inline-input';
            span.textContent = val;
            span.style.cssText = 'display:inline-block;min-width:120px;min-height:1.3em;border-bottom:1.5px solid #374151;vertical-align:bottom;margin:0 2px;padding:0 5px;';
            inp.parentNode?.replaceChild(span, inp);
          } else {
            const div = document.createElement('div');
            div.className = 'pdf-input-box';
            div.textContent = val;
            div.style.cssText = `display:flex;align-items:center;width:100%;min-height:${Math.max(inp.offsetHeight || 0, 32)}px;border:1px solid #d1d5db;border-radius:6px;background:#fff;box-sizing:border-box;margin:4px 0;padding:4px 12px;color:#111827;`;
            inp.parentNode?.replaceChild(div, inp);
          }
        });

        // 3. textarea → bordered div (preserves visual height and value)
        document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((ta) => {
          const val = ta.value || ta.innerHTML || '';
          const div = document.createElement('div');
          div.className = 'pdf-textarea-box';
          div.textContent = val;
          div.style.cssText = `display:block;width:100%;min-height:${Math.max(ta.offsetHeight || 0, 80)}px;border:1px solid #d1d5db;border-radius:6px;background:#fff;box-sizing:border-box;margin:4px 0;padding:8px 12px;color:#111827;white-space:pre-wrap;`;
          ta.parentNode?.replaceChild(div, ta);
        });

        // 4. radio → drawn circle (PDF AcroForm radios are invisible)
        document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) => {
          const isChecked = r.checked || r.hasAttribute('checked');
          const span = document.createElement('span');
          span.style.cssText = `display:inline-block;width:16px;height:16px;border:2px solid #6b7280;border-radius:50%;background:#fff;vertical-align:middle;flex-shrink:0;position:relative;margin-right:8px;`;
          if (isChecked) {
            const dot = document.createElement('span');
            dot.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#3b82f6;border-radius:50%;';
            span.appendChild(dot);
          }
          r.parentNode?.replaceChild(span, r);
        });
      });

      if (hasMathJax) {
        try {
          console.log('[HtmlExport] Waiting for MathJax typesetting...');
          await page.waitForFunction(
            () => typeof (window as any).MathJax !== 'undefined' && !!(window as any).MathJax.startup,
            { timeout: 15000 },
          );
          await page.evaluate(async () => {
            const mj = (window as any).MathJax;
            if (mj?.startup?.promise) await mj.startup.promise;
            if (mj?.typesetPromise) await mj.typesetPromise();
          });
        } catch (e) {
          console.warn('[HtmlExport] MathJax rendering warning:', e);
        }
      }

      // Ждём, что:
      //   - шрифты загружены (document.fonts.ready) — иначе ширина строк
      //     меняется после print-media switch, и последняя строка съезжает
      //     на следующую страницу или обрывается;
      //   - все <img> завершили загрузку (complete && naturalHeight > 0) —
      //     иначе картинки приходят в PDF пустыми блоками;
      //   - тело имеет ненулевую высоту — защита от пустых PDF.
      try {
        await page.waitForFunction(
          () => {
            const fontsReady = (document as any).fonts?.ready ? true : true;
            const imgs = Array.from(document.images || []);
            const allImgs = imgs.every((img) =>
              img.complete && (img.naturalWidth > 0 || img.getAttribute('src')?.startsWith('data:'))
            );
            const bodyHeight = document.body?.scrollHeight ?? 0;
            return fontsReady && allImgs && bodyHeight > 100;
          },
          { timeout: 10_000, polling: 250 },
        );
        // Дополнительный буфер на финальный layout (особенно полезно после
        // DOM-мутаций: input → div, SVG dims, radio circles).
        await page.waitForTimeout(300);
      } catch (e) {
        console.warn(
          '[HtmlExport] Settle-wait timeout, рендерим как есть:',
          (e as Error).message,
        );
      }

      // Стандартные поля 20px тянутся от ранних типов генераций (worksheet,
      // quiz и т.п.), где внутри уже есть `.container` с собственным padding.
      // У Вау-урока контент рендерится «во всю страницу» без container'а —
      // в этом случае wideMargins даёт нормальные поля документа.
      // Для landscape (презентации) поля нулевые — слайды сами задают padding.
      const pdfMargins = options?.landscape
        ? { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        : options?.wideMargins
          ? { top: '40px', right: '50px', bottom: '40px', left: '50px' }
          : { top: '20px', right: '20px', bottom: '20px', left: '20px' };

      const pdf = await page.pdf({
        format: 'A4',
        landscape: options?.landscape ?? false,
        printBackground: true,
        margin: pdfMargins,
        preferCSSPageSize: false,
      });

      console.log(`[HtmlExport] PDF generated successfully, size: ${pdf.length}`);
      return Buffer.from(pdf);
    } catch (renderError) {
      console.error('[HtmlExport] PDF Rendering failed:', renderError);
      throw renderError;
    } finally {
      if (page) {
        await page.close().catch((e) => console.error('[HtmlExport] Error closing page:', e));
      }
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}
