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

    const looksLikeHtml =
      /<!DOCTYPE html/i.test(processed) ||
      /<html[\s>]/i.test(processed) ||
      /<body[\s>]/i.test(processed) ||
      /<\/?[a-z][\s\S]*>/i.test(processed);

    return looksLikeHtml ? this.ensureHtmlDocument(processed) : this.wrapPlainTextAsHtml(text);
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
   * Конвертирует HTML в DOCX. Стратегия:
   *   1. Рендерим обычный PDF через Playwright — там уже всё: дизайн-система,
   *      MathJax, картинки, разрывы страниц. Это «эталон вида».
   *   2. Прогоняем PDF через LibreOffice в headless-режиме
   *      (`soffice --infilter="writer_pdf_import" --convert-to docx`).
   *      LibreOffice импортирует PDF, восстанавливая поток текста и таблиц
   *      (они остаются редактируемыми), а формулы и сложные элементы кладёт
   *      как inline-картинки в правильных местах.
   *   3. Если LibreOffice недоступен (локальная dev-машина без soffice) —
   *      fallback на старый html-to-docx, чтобы экспорт не падал.
   */
  async htmlToDocx(html: string): Promise<Buffer> {
    const pdfBuffer = await this.htmlToPdf(html);
    try {
      return await this.pdfToDocxViaSoffice(pdfBuffer);
    } catch (e: any) {
      this.docxLogger.warn(
        `LibreOffice PDF→DOCX недоступен (${e?.message ?? e}). ` +
        `Fallback на html-to-docx — дизайн будет упрощён.`,
      );
      return this.htmlToDocxFallback(html);
    }
  }

  private async pdfToDocxViaSoffice(pdfBuffer: Buffer): Promise<Buffer> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-'));
    const inputPdf = path.join(tmpDir, `${randomUUID()}.pdf`);
    await fs.writeFile(inputPdf, pdfBuffer);

    // soffice пишет конвертированный файл с тем же base-name, но другим расширением
    const outputDocx = inputPdf.replace(/\.pdf$/i, '.docx');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('soffice', [
        '--headless',
        '--infilter=writer_pdf_import',
        '--convert-to', 'docx',
        '--outdir', tmpDir,
        inputPdf,
      ], { stdio: 'pipe' });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('soffice timeout (60s)'));
      }, 60_000);

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
      .replace(/<mjx-container[\s\S]*?<\/mjx-container>/gi, '')
      .replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/gi, '')
      // Картинки в base64 (LOGO_PLACEHOLDER → огромный data:image/png) ломают
      // парсер html-to-docx. Заменяем такие <img> пустой строкой.
      .replace(/<img\b[^>]*src=["']data:[^"']+["'][^>]*>/gi, '')
      // Незаменённые LOGO_PLACEHOLDER — тоже убираем.
      .replace(/<img\b[^>]*src=["']LOGO_PLACEHOLDER["'][^>]*>/gi, '')
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
