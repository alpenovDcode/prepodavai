import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { DesignSystemConfig } from '../../modules/generations/config/design-system.config';
import { HtmlPostprocessorService } from './html-postprocessor.service';

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

  @page {
    size: A4;
    margin: 0;
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

    return looksLikeHtml ? processed : this.wrapPlainTextAsHtml(text);
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

  private prepareHtml(html: string): string {
    // 1. Ensure we have a full document structure if it's just a fragment.
    let fullHtml = html;
    const hasHtmlTag = /<html/i.test(html);
    const hasBodyTag = /<body/i.test(html);

    if (!hasHtmlTag || !hasBodyTag) {
      const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
      const bodyContent = bodyMatch ? bodyMatch[1] : html;
      fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
${DesignSystemConfig.STYLES}
</head>
<body>
<div class="container worksheet-content formatted-content">
${bodyContent}
</div>
</body>
</html>`;
    } else {
      // Full HTML structure exists but may lack CSS (e.g. minimal wrapper from frontend).
      // Inject design system styles if no <style> block is present in <head>.
      const headMatch = /<head[\s\S]*?<\/head>/i.exec(fullHtml);
      const headContent = headMatch ? headMatch[0] : '';
      if (!/<style[\s>]/i.test(headContent)) {
        if (fullHtml.includes('</head>')) {
          fullHtml = fullHtml.replace('</head>', `${DesignSystemConfig.STYLES}\n</head>`);
        } else {
          fullHtml = fullHtml.replace(/<body/i, `<head>${DesignSystemConfig.STYLES}</head>\n<body`);
        }
      }
    }

    // 2. Run through common post-processing (branding normalization, logo replacement, MathJax, cleanup)
    let processed = this.htmlPostprocessor.process(fullHtml);

    // 3. Remove Google Fonts @import — external CDN not available in Docker environment
    processed = processed.replace(
      /@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com[^'")]+['"]?\)\s*;?/g,
      '',
    );


    // 4. Neutralize @media print blocks.
    processed = processed.replace(/@media\s+print\b/gi, '@media not all');

    // 5. Inject CSS that forces color/background rendering before </head>
    if (processed.includes('</head>')) {
      processed = processed.replace('</head>', `${PDF_FORCE_STYLES}\n</head>`);
    } else {
      processed = `<head>${PDF_FORCE_STYLES}</head>${processed}`;
    }

    // 6. Final safety check for MathJax
    processed = this.htmlPostprocessor.ensureMathJaxScript(processed);

    return processed;
  }


  async htmlToPdf(html: string): Promise<Buffer> {
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

      // A4 at 96 DPI = 794px wide — prevents content overflow/clipping
      await page.setViewportSize({ width: 850, height: 1100 });

      // Use screen media to avoid any additional print-mode overrides
      await page.emulateMedia({ media: 'screen' });

      // networkidle ensures CDN scripts (MathJax, fonts) finish loading before PDF
      await page.setContent(processedHtml, { waitUntil: 'networkidle', timeout: 60000 });

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
