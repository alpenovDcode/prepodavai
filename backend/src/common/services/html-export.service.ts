import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

@Injectable()
export class HtmlExportService implements OnModuleDestroy {
  private browserPromise: Promise<puppeteer.Browser> | null = null;

  private async getBrowser() {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
    });
    await page.waitForFunction(() => (window as any).MathJax && (window as any).MathJax.typesetPromise);
    await page.evaluate(() => (window as any).MathJax.typesetPromise && (window as any).MathJax.typesetPromise());
    await new Promise((resolve) => setTimeout(resolve, 200));
    const pdfBuffer = (await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    })) as Buffer;
    await page.close();
    return pdfBuffer;
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}

