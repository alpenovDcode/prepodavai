import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<puppeteer.Browser> | null = null;

  private getChromePath(): string | undefined {
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
    // На Linux явно возвращаем путь из переменной окружения
    if (process.platform === 'linux') {
      return process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    }
    return undefined;
  }

  private async getBrowser() {
    if (!this.browserPromise) {
      const executablePath = this.getChromePath();
      console.log(`[HtmlExport] Using Chrome at: ${executablePath}`);

      // Разные аргументы для Linux (Docker) и macOS
      const isLinux = process.platform === 'linux';
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-in-process-stack-traces',
        '--log-level=3',
        '--disable-software-rasterizer',
        // УБРАНЫ --no-zygote и --single-process — они конфликтуют с crashpad в Docker
        ...(isLinux
          ? [
              '--disable-crash-reporter',
              '--crash-dumps-dir=/tmp',
              '--no-zygote',
              '--single-process',
              '--no-first-run',
              '--disable-background-networking',
              '--disable-default-apps',
              '--disable-sync',
              '--metrics-recording-only',
              '--mute-audio',
              '--no-default-browser-check',
              '--safebrowsing-disable-auto-update',
            ]
          : []),
      ];

      this.browserPromise = puppeteer
        .launch({
          headless: true,
          timeout: 60000,
          executablePath,
          args,
        })
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
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });

      try {
        console.log('[HtmlExport] Waiting for MathJax...');
        await page
          .waitForFunction(() => (window as any).MathJax, { timeout: 10000 })
          .catch(() => null);

        await page.evaluate(async () => {
          if ((window as any).MathJax && (window as any).MathJax.typesetPromise) {
            console.log('[HtmlExport] MathJax found, starting typeset');
            await (window as any).MathJax.typesetPromise();
          } else {
            console.log('[HtmlExport] MathJax NOT found');
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
