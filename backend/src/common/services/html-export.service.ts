import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';

const MATHJAX_SNIPPET = `
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['\\\\(','\\\\)'],['$','$']],
      displayMath: [['\\\\[','\\\\]'],['$$','$$']]
    }
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

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

  /** Injects MathJax if HTML has LaTeX but no MathJax script already */
  private ensureMathJax(html: string): string {
    const hasLatex = /\\[([]|\\frac|\\cdot|\\times|\\sqrt|\$\$/.test(html);
    if (!hasLatex) return html;
    if (/mathjax/i.test(html)) return html;

    // Inject before </head>; fall back to prepending
    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${MATHJAX_SNIPPET}\n</head>`);
    }
    return MATHJAX_SNIPPET + html;
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
      const processedHtml = this.ensureMathJax(html);
      const needsMathJax = /mathjax/i.test(processedHtml);

      // 'load' waits for all scripts (including MathJax CDN) to finish loading
      await page.setContent(processedHtml, { waitUntil: 'load', timeout: 60000 });

      if (needsMathJax) {
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
