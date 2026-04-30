import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import { SlideDoc } from './slide-doc.types';
import { PresentationRendererService } from './presentation-renderer.service';

const MATHJAX_SCRIPT = `<script>
window.MathJax = {
  loader: { load: ['[tex]/mhchem'] },
  tex: {
    inlineMath: [['\\\\(', '\\\\)']],
    displayMath: [['\\\\[', '\\\\]']],
    processEscapes: true,
    packages: { '[+]': ['mhchem'] }
  },
  options: { enableMenu: false },
  startup: { typeset: true }
};
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

/**
 * Dedicated PDF service for presentations.
 * Landscape 1280×720, no A4 styling, no form-field handling — slides are
 * read-only by design.
 */
@Injectable()
export class PresentationPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PresentationPdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly renderer: PresentationRendererService) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium
        .launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        })
        .catch((err) => {
          this.logger.error(`Browser launch failed: ${err.message}`);
          this.browserPromise = null;
          throw err;
        });
    }
    return this.browserPromise;
  }

  async docToPdf(doc: SlideDoc): Promise<Buffer> {
    const html = this.injectMathJax(this.renderer.renderDeckHtml(doc));
    const hasMath = doc.slides.some((s) => (s.content.math?.length ?? 0) > 0);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });

      if (hasMath) {
        try {
          await page.waitForFunction(() => typeof (window as any).MathJax !== 'undefined', {
            timeout: 15000,
          });
          await page.evaluate(async () => {
            const mj = (window as any).MathJax;
            if (mj?.typesetPromise) await mj.typesetPromise();
          });
        } catch (e: any) {
          this.logger.warn(`MathJax warning: ${e.message}`);
        }
      }

      const pdf = await page.pdf({
        width: '1280px',
        height: '720px',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: false,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private injectMathJax(html: string): string {
    if (html.includes('</head>')) {
      return html.replace('</head>', `${MATHJAX_SCRIPT}\n</head>`);
    }
    return `<head>${MATHJAX_SCRIPT}</head>${html}`;
  }

  async onModuleDestroy() {
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      if (browser) await browser.close().catch(() => undefined);
      this.browserPromise = null;
    }
  }
}
