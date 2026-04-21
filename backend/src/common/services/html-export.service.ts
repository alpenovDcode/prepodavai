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

  private prepareHtml(html: string, options?: { isWysiwyg?: boolean }): string {
    // 1. If Wysiwyg mode is enabled, we trust the frontend's HTML entirely.
    //    We skip branding normalization and design system styles.
    if (options?.isWysiwyg) {
      let processed = html;
      
      // Neutralize @media print blocks to ensure screen styles are used.
      processed = processed.replace(/@media\s+print\b/gi, '@media not all');

      // Inject only the critical technical PDF overrides
      if (processed.includes('</head>')) {
        processed = processed.replace('</head>', `${PDF_FORCE_STYLES}\n</head>`);
      } else if (processed.includes('<html')) {
        processed = processed.replace(/<html([^>]*)>/i, `<html$1><head>${PDF_FORCE_STYLES}</head>`);
      } else {
        processed = `<head>${PDF_FORCE_STYLES}</head>${processed}`;
      }
      
      return processed;
    }

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


  async htmlToPdf(html: string, options?: { isWysiwyg?: boolean }): Promise<Buffer> {
    console.log(`[HtmlExport] Starting PDF generation (isWysiwyg: ${!!options?.isWysiwyg}), HTML length: ${html.length}`);
    
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
      const processedHtml = this.prepareHtml(html, options);
      const hasMathJax = /<script[^>]+src=["'][^"']*mathjax[^"']*["']/i.test(processedHtml);

      // A4 at 96 DPI = 794px wide — prevents content overflow/clipping
      await page.setViewportSize({ width: 850, height: 1100 });

      // Use screen media to avoid any additional print-mode overrides
      await page.emulateMedia({ media: 'screen' });

      // networkidle ensures CDN scripts (MathJax, fonts) finish loading before PDF
      await page.setContent(processedHtml, { waitUntil: 'networkidle', timeout: 60000 });

      // Pre-PDF DOM transformation:
      //   SVGs  → PNG via canvas (guarantees rendering; page.pdf() drops SVGs inconsistently)
      //   inputs/textareas → styled divs (PDF treats form fields as invisible AcroForm objects)
      await page.evaluate(async () => {
        // ── helpers ──────────────────────────────────────────────────────────────
        function svgDims(svg: SVGSVGElement): { w: number; h: number } {
          const vb = svg.viewBox?.baseVal;
          const rc = svg.getBoundingClientRect();
          const w = Math.round((vb && vb.width  > 0 ? vb.width  : rc.width)  || 400);
          const h = Math.round((vb && vb.height > 0 ? vb.height : rc.height) || 200);
          return { w, h };
        }

        async function svgToPng(svg: SVGSVGElement): Promise<string | null> {
          try {
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const svgStr = new XMLSerializer().serializeToString(svg);
            const { w, h } = svgDims(svg);

            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            await new Promise<void>((res) => {
              const img = new Image();
              img.onload  = () => { ctx.drawImage(img, 0, 0, w, h); res(); };
              img.onerror = () => res();
              img.src = `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
            });

            return canvas.toDataURL('image/png');
          } catch {
            return null;
          }
        }
        // ─────────────────────────────────────────────────────────────────────────

        // 1. SVG → <img src="data:image/png;base64,…">
        for (const svg of Array.from(document.querySelectorAll<SVGSVGElement>('svg'))) {
          const { w, h } = svgDims(svg);
          const png = await svgToPng(svg);
          if (png) {
            const img = document.createElement('img');
            img.src = png;
            img.width  = w;
            img.height = h;
            img.style.cssText = 'display:block;max-width:100%;';
            svg.parentNode?.replaceChild(img, svg);
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
