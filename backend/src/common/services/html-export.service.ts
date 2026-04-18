import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser() {
    if (!this.browserPromise) {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ];

      this.browserPromise = chromium
        .launch({ headless: true, args })
        .catch((err) => {
          console.error('[HtmlExport] Failed to launch browser:', err);
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
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
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });

      try {
        console.log('[HtmlExport] Waiting for MathJax...');
        await page
          .waitForFunction(() => (window as any).MathJax, { timeout: 10000 })
          .catch(() => null);

        await page.evaluate(async () => {
          if ((window as any).MathJax && (window as any).MathJax.typesetPromise) {
            await (window as any).MathJax.typesetPromise();
          }
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.warn('[HtmlExport] MathJax rendering warning:', e);
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
