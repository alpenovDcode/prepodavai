import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<puppeteer.Browser> | null = null;

  private async getBrowser() {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Critical for Docker
          '--disable-gpu',
        ],
      });
    }
    return this.browserPromise;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Используем domcontentloaded для ускорения и избежания таймаутов при загрузке внешних ресурсов
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Пытаемся отрендерить формулы, но не падаем если не выйдет
      try {
        // Ждем немного, чтобы скрипты могли подгрузиться (если они есть)
        await new Promise(resolve => setTimeout(resolve, 500));

        await page.evaluate(async () => {
          if ((window as any).MathJax) {
            await (window as any).MathJax.typesetPromise?.();
          }
        });
      } catch (e) {
        console.warn('MathJax rendering failed in PDF export:', e);
      }

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
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

