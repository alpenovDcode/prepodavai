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
   * Рендерит LaTeX → SVG → PNG (через @resvg/resvg-js, pure WASM, без браузера).
   * Возвращает data-URI PNG и пропорции (в дюймах при 72 DPI).
   * PowerPoint понимает PNG идеально (в отличие от SVG с <use>-ссылками).
   */
  async renderToPng(
    latex: string,
    opts: { color?: string; display?: boolean; fontPx?: number } = {},
  ): Promise<{ dataUri: string; widthInch: number; heightInch: number } | null> {
    const fontPx = opts.fontPx ?? 18;
    const svgResult = await this.renderToSvg(latex, opts);
    if (!svgResult) return null;

    try {
      /* eslint-disable @typescript-eslint/no-var-requires */
      const { Resvg } = require('@resvg/resvg-js');
      /* eslint-enable */

      // MathJax SVG задаёт размеры в ex (~0.5 em). Считаем нужную ширину PNG в пикселях.
      // 1 em ≈ fontPx, 1 ex ≈ fontPx*0.5. Целимся в DPI=192 (retina-чёткость).
      const targetDpi = 192;
      const widthPx  = Math.max(40, Math.ceil(svgResult.widthEm * fontPx * (targetDpi / 96)));

      const resvg = new Resvg(svgResult.svg, {
        fitTo: { mode: 'width', value: widthPx },
        font: { loadSystemFonts: false },
        background: 'rgba(255,255,255,0)',  // прозрачный фон
      });
      const png = resvg.render().asPng();
      const dataUri = `data:image/png;base64,${png.toString('base64')}`;

      // Возвращаем размер в ДЮЙМАХ для pptxgenjs (1 inch = 72pt при fontPx).
      const emToInch = fontPx / 72;
      return {
        dataUri,
        widthInch:  svgResult.widthEm  * emToInch,
        heightInch: svgResult.heightEm * emToInch,
      };
    } catch (e: any) {
      this.logger.warn(`[math] SVG→PNG failed for "${latex.slice(0, 60)}": ${e?.message}`);
      return null;
    }
  }

  /**
   * Внутренний рендер SVG. Кэшируем по latex+color+display, чтобы один и тот же
   * `$\frac{a}{b}$` не пересобирался на каждый слайд.
   */
  private async renderToSvg(
    latex: string,
    opts: { color?: string; display?: boolean } = {},
  ): Promise<{ svg: string; widthEm: number; heightEm: number } | null> {
    if (!latex?.trim()) return null;
    const color = (opts.color ?? '#0F172A').toLowerCase();
    const display = opts.display !== false;
    const cacheKey = `${color}|${display ? 'd' : 'i'}|${latex}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      await this.ensureInited();
      const node = this.html.convert(latex, { display });
      let svg: string = this.adaptor.innerHTML(node);
      // Цвет: заменяем currentColor на нужный hex прямо в атрибутах.
      // НЕ трогаем style — MathJax уже добавил vertical-align, дублирование
      // атрибута ломает resvg ("attribute 'style' is already defined").
      const colHex = color.startsWith('#') ? color : '#' + color;
      svg = svg
        .replace(/fill="currentColor"/g, `fill="${colHex}"`)
        .replace(/stroke="currentColor"/g, `stroke="${colHex}"`);

      const wMatch = svg.match(/width="([0-9.]+)ex"/);
      const hMatch = svg.match(/height="([0-9.]+)ex"/);
      const widthEm  = wMatch ? parseFloat(wMatch[1]) * 0.5 : 4;
      const heightEm = hMatch ? parseFloat(hMatch[1]) * 0.5 : 1.5;

      const result = { svg, widthEm, heightEm };
      this.cache.set(cacheKey, result);
      return result;
    } catch (e: any) {
      this.logger.warn(`[math] LaTeX→SVG failed for "${latex.slice(0, 60)}": ${e?.message}`);
      return null;
    }
  }

}
