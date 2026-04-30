import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser } from 'playwright';
import axios from 'axios';
import { Slide, SlideDoc } from './slide-doc.types';
import { PresentationRendererService } from './presentation-renderer.service';
import { FilesService } from '../../files/files.service';

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

  constructor(
    private readonly renderer: PresentationRendererService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Replace each slide.image.url with a data: URI so Chromium can render the
   * image without a network round-trip. Critical inside Docker/k8s where the
   * pod can't always reach its own public domain (hairpin NAT).
   *
   * Strategy:
   *   - URL matches /api/files/{hash} → read bytes from FilesService directly.
   *   - Other URL                     → fetch with axios (best-effort).
   * On any failure we drop the image (renderer falls back to placeholder block).
   */
  private async inlineImages(doc: SlideDoc): Promise<SlideDoc> {
    const inlined = { ...doc, slides: [...doc.slides] };
    await Promise.all(
      inlined.slides.map(async (slide: Slide, idx: number) => {
        const url = slide.image?.url;
        if (!url) return;
        try {
          const buffer = await this.fetchImageBuffer(url);
          if (!buffer) {
            inlined.slides[idx] = { ...slide, image: undefined };
            return;
          }
          const mime = this.guessMime(url, buffer);
          const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
          inlined.slides[idx] = {
            ...slide,
            image: { ...slide.image!, url: dataUri },
          };
        } catch (e: any) {
          this.logger.warn(`Image inline failed for slide ${idx + 1}: ${e.message}. Dropping image.`);
          inlined.slides[idx] = { ...slide, image: undefined };
        }
      }),
    );
    return inlined;
  }

  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    // Local files endpoint — read straight from disk.
    const localMatch = url.match(/\/api\/files\/([a-f0-9]{32})/i);
    if (localMatch) {
      const file = await this.filesService.getFile(localMatch[1]);
      return file?.buffer ?? null;
    }
    // Remote URL — last-resort network fetch.
    if (/^https?:\/\//i.test(url)) {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
      return Buffer.from(res.data);
    }
    // Already a data URI — let it through unchanged via the caller path.
    return null;
  }

  private guessMime(url: string, buffer: Buffer): string {
    if (buffer.length >= 4) {
      const sig = buffer.subarray(0, 4).toString('hex');
      if (sig.startsWith('89504e47')) return 'image/png';
      if (sig.startsWith('ffd8ff')) return 'image/jpeg';
      if (sig.startsWith('47494638')) return 'image/gif';
      if (buffer.subarray(0, 4).toString() === 'RIFF') return 'image/webp';
    }
    if (/\.png$/i.test(url)) return 'image/png';
    if (/\.jpe?g$/i.test(url)) return 'image/jpeg';
    if (/\.webp$/i.test(url)) return 'image/webp';
    return 'image/png';
  }

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
    // Inline images as data: URIs so Chromium doesn't have to reach the public
    // file URL (often unreachable from inside the same pod / docker network).
    const inlinedDoc = await this.inlineImages(doc);
    const html = this.injectMathJax(this.renderer.renderDeckHtml(inlinedDoc));
    const hasMath = inlinedDoc.slides.some((s) => (s.content.math?.length ?? 0) > 0);

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
