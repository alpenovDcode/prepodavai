import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<puppeteer.Browser> | null = null;

  private getChromePath(): string | undefined {
    // On Apple Silicon, Puppeteer's bundled x64 Chrome runs via Rosetta → timeout
    // Use the system-installed arm64 Chrome instead
    if (process.platform === 'darwin') {
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      ];
      const fs = require('fs');
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    }
    return undefined; // use puppeteer's bundled Chrome on Linux/Windows
  }

  private async getBrowser() {
    if (!this.browserPromise) {
      const executablePath = this.getChromePath();
      this.browserPromise = puppeteer.launch({
        headless: true, // Revert to true to fix typescript types
        timeout: 60000, // 60 seconds
        executablePath: executablePath || process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      }).catch(err => {
        console.error('[HtmlExport] Failed to launch browser:', err);
        this.browserPromise = null;
        throw err;
      });
    }
    return this.browserPromise;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    console.log(`[HtmlExport] Starting PDF generation, HTML length: ${html.length}`);
    let browser: puppeteer.Browser;
    let page: puppeteer.Page;

    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
    } catch (launchError) {
      console.error('[HtmlExport] Browser launch or page creation failed:', launchError);
      throw new Error('Failed to initialize PDF generator engine.');
    }

    try {
      // Используем domcontentloaded для ускорения и избежания таймаутов при загрузке внешних ресурсов
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Пытаемся отрендерить формулы с более надежным ожиданием
      try {
        // 1. Ждем появления объекта MathJax
        console.log('[HtmlExport] Waiting for MathJax...');
        await page.waitForFunction(() => (window as any).MathJax, { timeout: 10000 }).catch(() => null);

        // 2. Запускаем рендеринг и ждем его завершения
        await page.evaluate(async () => {
          if ((window as any).MathJax && (window as any).MathJax.typesetPromise) {
            console.log('[HtmlExport] MathJax found, starting typeset');
            await (window as any).MathJax.typesetPromise();
          } else {
            console.log('[HtmlExport] MathJax NOT found');
          }
        });

        // 3. Даем еще немного времени на перерисовку (иногда нужно для сложных формул)
        await new Promise(resolve => setTimeout(resolve, 500));
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
        await page.close().catch(e => console.error('[HtmlExport] Error closing page:', e));
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

