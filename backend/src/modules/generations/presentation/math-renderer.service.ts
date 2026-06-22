import { Injectable, Logger } from '@nestjs/common';

// MathJax-full рендерит LaTeX → SVG прямо в Node, без браузера. Кэшируем по
// LaTeX-строке + цвету: один и тот же $\frac{a}{b}$ не пересобираем для каждого
// слайда. PPTX `addImage` принимает SVG через data:image/svg+xml;base64,...
@Injectable()
export class MathRendererService {
  private readonly logger = new Logger(MathRendererService.name);
  private readonly cache = new Map<string, { svg: string; widthEm: number; heightEm: number }>();
  private html: any = null;
  private adaptor: any = null;

  private async ensureInited() {
    if (this.html) return;
    // Динамический require — mathjax-full грузит ES-модули из CommonJS dist.
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { mathjax }     = require('mathjax-full/js/mathjax.js');
    const { TeX }         = require('mathjax-full/js/input/tex.js');
    const { SVG }         = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
    /* eslint-enable */

    this.adaptor = liteAdaptor();
    RegisterHTMLHandler(this.adaptor);
    const tex = new TeX({ packages: AllPackages });
    const svg = new SVG({ fontCache: 'none' });
    this.html = mathjax.document('', { InputJax: tex, OutputJax: svg });
  }

  /**
   * Рендерит LaTeX-выражение в SVG. Возвращает data-URI и пропорции (em).
   * Если рендер падает (битый LaTeX) — null, caller сделает fallback на текст.
   */
  async renderToDataUri(
    latex: string,
    opts: { color?: string; display?: boolean } = {},
  ): Promise<{ dataUri: string; widthEm: number; heightEm: number } | null> {
    if (!latex?.trim()) return null;
    const color = (opts.color ?? '#0F172A').toLowerCase();
    const display = opts.display !== false;
    const cacheKey = `${color}|${display ? 'd' : 'i'}|${latex}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        dataUri: this.svgToDataUri(cached.svg),
        widthEm: cached.widthEm,
        heightEm: cached.heightEm,
      };
    }

    try {
      await this.ensureInited();
      const node = this.html.convert(latex, { display });
      let svg: string = this.adaptor.innerHTML(node);
      // MathJax SVG использует currentColor — подставляем цвет в style/fill.
      svg = svg.replace('<svg ', `<svg style="color:${color};fill:${color}" `);

      // Размеры из атрибутов width/height (e.g. "5.123ex").
      const wMatch = svg.match(/width="([0-9.]+)ex"/);
      const hMatch = svg.match(/height="([0-9.]+)ex"/);
      const widthEm  = wMatch ? parseFloat(wMatch[1]) * 0.5 : 4;
      const heightEm = hMatch ? parseFloat(hMatch[1]) * 0.5 : 1.5;

      this.cache.set(cacheKey, { svg, widthEm, heightEm });
      return { dataUri: this.svgToDataUri(svg), widthEm, heightEm };
    } catch (e: any) {
      this.logger.warn(`[math] render failed for "${latex.slice(0, 60)}": ${e?.message}`);
      return null;
    }
  }

  private svgToDataUri(svg: string): string {
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
  }
}
