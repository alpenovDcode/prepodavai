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
  /* Force backgrounds and colors to render in PDF */
  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  /* SVG: prevent height collapse when only viewBox is set, no explicit width/height */
  svg {
    display: block;
    overflow: visible;
  }
  .svg-container {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .svg-container svg {
    max-width: 100% !important;
    height: auto !important;
  }

  /* Input/textarea: make form fields visually present in PDF */
  input[type="text"],
  input[type="number"],
  input[type="email"] {
    -webkit-appearance: none !important;
    appearance: none !important;
    border: 1px solid #9ca3af !important;
    background-color: #ffffff !important;
    min-height: 28px !important;
    display: inline-block !important;
    color: #111827 !important;
  }
  .inline-input {
    border: none !important;
    border-bottom: 1.5px solid #374151 !important;
    background: transparent !important;
    min-width: 80px !important;
    display: inline-block !important;
  }
  textarea {
    -webkit-appearance: none !important;
    appearance: none !important;
    border: 1px solid #9ca3af !important;
    background-color: #ffffff !important;
    color: #111827 !important;
    display: block !important;
    min-height: 60px !important;
  }
  input[type="radio"],
  input[type="checkbox"] {
    -webkit-appearance: auto !important;
    appearance: auto !important;
    display: inline-block !important;
    width: 16px !important;
    height: 16px !important;
  }
</style>`;

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly htmlPostprocessor: HtmlPostprocessorService) {
    console.log('[HtmlExportService] Initialized');
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
    //    This ensures that the postprocessor has <body> tags to find insertion points for branding.
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
<div class="container">
${bodyContent}
</div>
</body>
</html>`;
    }

    // 2. Run through common post-processing (branding normalization, logo replacement, MathJax, cleanup)
    //    We run it on the FULL document to guarantee branding blocks are injected correctly.
    let processed = this.htmlPostprocessor.process(fullHtml);

    // 3. Remove Google Fonts @import — external CDN not available in Docker environment
    processed = processed.replace(
      /@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com[^'")]+['"]?\)\s*;?/g,
      '',
    );


    // 4. Neutralize @media print blocks.
    processed = processed.replace(/@media\s+print\b/gi, '@media not all');

    // 5. Inject CSS that forces color/background rendering before </head>
    if (/<\/head>/i.test(processed)) {
      processed = processed.replace(/<\/head>/i, `${PDF_FORCE_STYLES}\n</head>`);
    } else {
      processed = PDF_FORCE_STYLES + processed;
    }

    // 6. Final safety check for MathJax
    processed = this.htmlPostprocessor.ensureMathJaxScript(processed);

    return processed;
  }


  async htmlToPdf(html: string): Promise<Buffer> {
    console.log(`[HtmlExport] Starting PDF generation, HTML length: ${html.length}`);
    // Log first 300 chars to debug CSS presence
    console.log(`[HtmlExport] HTML preview: ${html.slice(0, 300).replace(/\n/g, ' ')}`);

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
      await page.setViewportSize({ width: 794, height: 1123 });

      // Use screen media to avoid any additional print-mode overrides
      await page.emulateMedia({ media: 'screen' });

      // networkidle ensures CDN scripts (MathJax, fonts) finish loading before PDF
      await page.setContent(processedHtml, { waitUntil: 'networkidle', timeout: 60000 });

      // Pre-PDF DOM fixes: replace form elements with styled divs (PDF renderer
      // treats <input>/<textarea> as invisible AcroForm fields) and fix SVG dimensions.
      await page.evaluate(() => {
        // ── 1. SVGs: set explicit width/height from viewBox so height doesn't collapse ──
        document.querySelectorAll<SVGSVGElement>('svg').forEach((svg) => {
          const vb = svg.viewBox?.baseVal;
          if (vb && vb.width > 0 && vb.height > 0) {
            if (!svg.hasAttribute('width'))  svg.setAttribute('width',  String(Math.round(vb.width)));
            if (!svg.hasAttribute('height')) svg.setAttribute('height', String(Math.round(vb.height)));
          }
          svg.style.display   = 'block';
          svg.style.overflow  = 'visible';
          svg.style.maxWidth  = '100%';
        });

        // ── 2. input[type="text"] → styled div/span ──
        document.querySelectorAll<HTMLInputElement>('input[type="text"]').forEach((input) => {
          const isInline = input.classList.contains('inline-input');
          if (isInline) {
            const span = document.createElement('span');
            span.style.cssText =
              'display:inline-block;min-width:120px;height:1.3em;' +
              'border-bottom:1.5px solid #374151;vertical-align:bottom;margin:0 2px;';
            input.parentNode?.replaceChild(span, input);
          } else {
            const div = document.createElement('div');
            const h = Math.max(input.offsetHeight || 0, 32);
            div.style.cssText =
              `display:block;width:100%;height:${h}px;` +
              'border:1px solid #d1d5db;border-radius:6px;background:#fff;' +
              'box-sizing:border-box;margin:4px 0;';
            input.parentNode?.replaceChild(div, input);
          }
        });

        // ── 3. textarea → styled div ──
        document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((textarea) => {
          const div = document.createElement('div');
          const h = Math.max(textarea.offsetHeight || 0, 100);
          div.style.cssText =
            `display:block;width:100%;height:${h}px;` +
            'border:1px solid #d1d5db;border-radius:6px;background:#fff;' +
            'box-sizing:border-box;margin:4px 0;';
          textarea.parentNode?.replaceChild(div, textarea);
        });

        // ── 4. input[type="radio"] → visual circle span ──
        document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
          const span = document.createElement('span');
          span.style.cssText =
            'display:inline-block;width:15px;height:15px;border:2px solid #6b7280;' +
            'border-radius:50%;background:#fff;vertical-align:middle;flex-shrink:0;';
          radio.parentNode?.replaceChild(span, radio);
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
