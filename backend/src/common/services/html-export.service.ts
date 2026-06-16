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

    // DEDUP: если в БД лежит НЕСКОЛЬКО HTML-документов подряд (артефакт
    // пересохранения в редакторе — баг, исправляемый отдельно), берём
    // только первый. Иначе экспорт DOCX/PDF выдаёт каждое задание 2-3 раза.
    processed = this.takeFirstHtmlDocument(processed);

    const looksLikeHtml =
      /<!DOCTYPE html/i.test(processed) ||
      /<html[\s>]/i.test(processed) ||
      /<body[\s>]/i.test(processed) ||
      /<\/?[a-z][\s\S]*>/i.test(processed);

    return looksLikeHtml ? this.ensureHtmlDocument(processed) : this.wrapPlainTextAsHtml(text);
  }

  /**
   * Если строка содержит несколько слепленных HTML-документов (например,
   * `<!DOCTYPE>...</html><!DOCTYPE>...</html>`) — возвращаем только первый.
   * Делается через первый `</html>`: если после него снова попадается
   * `<!DOCTYPE>` или `<html>`, обрезаем до конца первого документа.
   * Аналогичная логика есть на фронте в MaterialViewer.normalizeResultPayload.
   */
  private takeFirstHtmlDocument(html: string): string {
    const htmlEnd = html.match(/<\/html\s*>/i);
    if (!htmlEnd || htmlEnd.index === undefined) return html;
    const endIdx = htmlEnd.index + htmlEnd[0].length;
    const tail = html.slice(endIdx);
    if (/<!DOCTYPE\s+html|<html[\s>]/i.test(tail)) {
      return html.slice(0, endIdx);
    }
    // Ещё кейс: документ без `<html>` обёртки, но с двумя `<body>` подряд
    // (редко, но встречается после некоторых правок).
    return html;
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
    let rendered: string;
    try {
      rendered = await this.renderHtmlForDocx(html);
      this.docxLogger.log(`Pre-render OK, длина=${rendered.length}`);
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

  async htmlToPdf(html: string, options?: { blockExternalRequests?: boolean }): Promise<Buffer> {
    console.log(`[HtmlExport] Starting PDF generation, HTML length: ${html.length}`);

    let browser: Browser;
    let page: Page;

    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
    } catch (launchError) {
      console.error('[HtmlExport] Browser launch or page creation failed:', launchError);
      throw new Error('Failed to initialize PDF generator engine.');
    }

    try {
      const processedHtml = this.prepareHtml(html);
      const hasMathJax = /<script[^>]+src=["'][^"']*mathjax[^"']*["']/i.test(processedHtml);

      // A4 at 96 DPI = 794×1123. Совпадение viewport со страницей PDF
      // нужно, чтобы page.pdf() считал высоту страницы так же, как layout —
      // иначе строки перед разрывом стабильно «съезжают».
      await page.setViewportSize({ width: 794, height: 1123 });

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
        await page.setContent(processedHtml, { waitUntil: 'networkidle', timeout: 60000 });
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
            () => typeof (window as any).MathJax !== 'undefined',
            { timeout: 15000 },
          );
          await page.evaluate(async () => {
            const mj = (window as any).MathJax;
            if (mj?.typesetPromise) await mj.typesetPromise();
          });
        } catch (e) {
          console.warn('[HtmlExport] MathJax rendering warning:', e);
        }
      }

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
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
