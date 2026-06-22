import { Injectable, Logger } from '@nestjs/common';
import {
  PresentationData,
  PresentationSlide,
  PRESENTATION_COLORS,
  PresentationColor,
} from './presentation-template.service';
import { LOGO_BASE64 } from '../generation.constants';
import { MathRendererService } from './math-renderer.service';

// pptxgenjs не имеет нормальных типов для default import под тот tsconfig что есть в проекте.
// games.service делает то же самое — этот паттерн стандартный для проекта.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PptxGenJS: any = require('pptxgenjs');

/**
 * Упрощённый PPTX-экспорт из PresentationData (JSON-данные шаблонной презентации).
 *
 * Раньше PPTX дублировал HTML-рендеринг (300+ строк). Теперь — простой маппинг
 * JSON → слайды pptxgenjs. Layouts ровно те же что и в HTML-шаблонах:
 *   title, bullets, two-column, quote, summary, content.
 *
 * Цвета берутся из PRESENTATION_COLORS[data.color] — синхронно с CSS-vars в HTML.
 * Логотип 32×32 в правом нижнем углу КАЖДОГО слайда (как в HTML-шаблонах).
 */
@Injectable()
export class PresentationPptxV2Service {
  private readonly logger = new Logger(PresentationPptxV2Service.name);

  constructor(private readonly mathRenderer: MathRendererService) {}

  async build(data: PresentationData): Promise<Buffer> {
    const palette = PRESENTATION_COLORS[(data.color as PresentationColor) ?? 'indigo'];
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 inches (16:9)
    pres.title = data.slides[0]?.title || data.topic;
    pres.author = 'Преподавай';
    pres.company = 'Преподавай';

    // Палитра — снимаем `#`, pptxgenjs хочет hex без префикса.
    const COL = {
      accent:     palette.accent.replace('#', ''),
      accentDark: palette.dark.replace('#', ''),
      text:       '0F172A',
      textSoft:   '475569',
      textMute:   '94A3B8',
      bg:         data.style === 'creative' ? '0B0B14' : 'FFFFFF',
      surface:    data.style === 'creative' ? '13131F' : 'FFFFFF',
      border:     'E2E8F0',
    };

    const isDark = data.style === 'creative';
    const fgText = isDark ? 'FFFFFF' : COL.text;
    const fgSoft = isDark ? 'C7C9D9' : COL.textSoft;

    for (let idx = 0; idx < data.slides.length; idx++) {
      const slide = data.slides[idx];
      const s: any = pres.addSlide();
      s.background = { color: COL.bg };

      // Header: номер слайда + тема (минималистично, шапки нет на title-слайде)
      if (slide.layout !== 'title') {
        s.addText(`${String(idx + 1).padStart(2, '0')} / ${String(data.slides.length).padStart(2, '0')}`, {
          x: 0.5, y: 0.3, w: 2, h: 0.3,
          fontSize: 10, fontFace: 'Inter', bold: true, color: COL.accent,
        });
        if (data.topic) {
          s.addText(data.topic, {
            x: 2.5, y: 0.3, w: 8, h: 0.3,
            fontSize: 10, fontFace: 'Inter', color: COL.textMute, align: 'right',
          });
        }
      }

      await this.renderLayout(s, slide, { COL, isDark, fgText, fgSoft });

      // Логотип 32×32 (≈ 0.33×0.33 inch) — на каждом слайде в правом нижнем углу
      try {
        s.addImage({
          data: LOGO_BASE64,
          x: 12.6, y: 7.05, w: 0.4, h: 0.4,
          transparency: 50,
        });
      } catch (e: any) {
        this.logger.warn(`Logo embed failed: ${e?.message}`);
      }

      // Speaker note: первая значимая строка слайда
      const note = slide.subtitle || slide.text || slide.items?.[0] || '';
      if (note) s.addNotes(this.latex(String(note)));
    }

    const buf = await pres.write({ outputType: 'nodebuffer' });
    return buf as Buffer;
  }

  /** Конвертирует LaTeX-разметку (в $...$ или голую) в Unicode-текст. */
  private latex(text: string): string {
    if (!text) return text;
    // Голый LaTeX вне $...$ тоже нужно обрабатывать: если есть \cmd или ^/_ — гоним через convert.
    const hasMath = text.includes('$') || /\\[a-zA-Z]+|[\^_][\{A-Za-z0-9]/.test(text);
    if (!hasMath) return text;

    const convert = (expr: string): string => {
      let s = expr.trim();

      // Греческие буквы
      const greek: [RegExp, string][] = [
        [/\\alpha/g,'α'],[/\\beta/g,'β'],[/\\gamma/g,'γ'],[/\\delta/g,'δ'],
        [/\\epsilon/g,'ε'],[/\\varepsilon/g,'ε'],[/\\zeta/g,'ζ'],[/\\eta/g,'η'],
        [/\\theta/g,'θ'],[/\\vartheta/g,'θ'],[/\\iota/g,'ι'],[/\\kappa/g,'κ'],
        [/\\lambda/g,'λ'],[/\\mu/g,'μ'],[/\\nu/g,'ν'],[/\\xi/g,'ξ'],
        [/\\pi/g,'π'],[/\\varpi/g,'π'],[/\\rho/g,'ρ'],[/\\varrho/g,'ρ'],
        [/\\sigma/g,'σ'],[/\\tau/g,'τ'],[/\\upsilon/g,'υ'],[/\\phi/g,'φ'],
        [/\\varphi/g,'φ'],[/\\chi/g,'χ'],[/\\psi/g,'ψ'],[/\\omega/g,'ω'],
        [/\\Gamma/g,'Γ'],[/\\Delta/g,'Δ'],[/\\Theta/g,'Θ'],[/\\Lambda/g,'Λ'],
        [/\\Xi/g,'Ξ'],[/\\Pi/g,'Π'],[/\\Sigma/g,'Σ'],[/\\Phi/g,'Φ'],
        [/\\Psi/g,'Ψ'],[/\\Omega/g,'Ω'],
      ];
      for (const [re, sym] of greek) s = s.replace(re, sym);

      // Операторы
      s = s.replace(/\\to\b/g,'→').replace(/\\rightarrow/g,'→').replace(/\\leftarrow/g,'←')
           .replace(/\\Rightarrow/g,'⇒').replace(/\\Leftrightarrow/g,'⟺')
           .replace(/\\infty/g,'∞').replace(/\\pm/g,'±').replace(/\\mp/g,'∓')
           .replace(/\\times/g,'×').replace(/\\div/g,'÷').replace(/\\cdot/g,'·')
           .replace(/\\neq/g,'≠').replace(/\\ne\b/g,'≠')
           .replace(/\\leq/g,'≤').replace(/\\le\b/g,'≤')
           .replace(/\\geq/g,'≥').replace(/\\ge\b/g,'≥')
           .replace(/\\approx/g,'≈').replace(/\\equiv/g,'≡').replace(/\\sim/g,'~')
           .replace(/\\in\b/g,'∈').replace(/\\notin/g,'∉')
           .replace(/\\subset/g,'⊂').replace(/\\supset/g,'⊃')
           .replace(/\\cup/g,'∪').replace(/\\cap/g,'∩')
           .replace(/\\forall/g,'∀').replace(/\\exists/g,'∃')
           .replace(/\\partial/g,'∂').replace(/\\nabla/g,'∇')
           .replace(/\\ldots/g,'…').replace(/\\cdots/g,'⋯');

      // Функции
      s = s.replace(/\\lim_\{([^}]+)\}/g,'lim($1)')
           .replace(/\\lim/g,'lim')
           .replace(/\\sum_\{([^}]*)\}\^\{([^}]*)\}/g,'Σ[$1→$2]')
           .replace(/\\sum/g,'Σ')
           .replace(/\\prod/g,'∏')
           .replace(/\\int_\{([^}]*)\}\^\{([^}]*)\}/g,'∫[$1→$2]')
           .replace(/\\int/g,'∫')
           .replace(/\\sqrt\{([^}]+)\}/g,'√($1)')
           .replace(/\\sqrt\s/g,'√')
           .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g,'($1)/($2)')
           .replace(/\\log/g,'log').replace(/\\ln/g,'ln')
           .replace(/\\sin/g,'sin').replace(/\\cos/g,'cos').replace(/\\tan/g,'tan')
           .replace(/\\sec/g,'sec').replace(/\\csc/g,'csc').replace(/\\cot/g,'cot')
           .replace(/\\arcsin/g,'arcsin').replace(/\\arccos/g,'arccos').replace(/\\arctan/g,'arctan')
           .replace(/\\exp/g,'exp').replace(/\\max/g,'max').replace(/\\min/g,'min')
           .replace(/\\det/g,'det').replace(/\\dim/g,'dim');

      // Верхние индексы в Unicode (0-9, n, x)
      const supMap: Record<string,string> = {
        '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
        'n':'ⁿ','i':'ⁱ','j':'ʲ','k':'ᵏ','m':'ᵐ','a':'ᵃ','b':'ᵇ','c':'ᶜ','+':'⁺','-':'⁻',
      };
      const subMap: Record<string,string> = {
        '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
        'n':'ₙ','i':'ᵢ','j':'ⱼ','k':'ₖ','m':'ₘ','a':'ₐ','x':'ₓ','+':'₊','-':'₋',
      };
      // Пробуем посимвольно конвертнуть весь содержимый ^{...} / _{...} в Unicode.
      // Если все символы маппятся — получаем красиво (Fₙ₋₁). Иначе — fallback ^(...) / _(...).
      const tryRun = (text: string, map: Record<string, string>): string | null => {
        let out = '';
        for (const ch of text) {
          if (map[ch]) out += map[ch];
          else return null;
        }
        return out;
      };
      s = s.replace(/\^\{([^}]+)\}/g, (_, g) => tryRun(g, supMap) ?? `^(${g})`);
      s = s.replace(/\^([0-9a-zA-Z+\-])/g, (_, g) => supMap[g] || `^${g}`);
      s = s.replace(/_\{([^}]+)\}/g, (_, g) => tryRun(g, subMap) ?? `_(${g})`);
      s = s.replace(/_([0-9a-zA-Z+\-])/g, (_, g) => subMap[g] || `_${g}`);

      // Убираем фигурные скобки и оставшиеся команды
      s = s.replace(/\{|\}/g, '').replace(/\\[a-zA-Z]+\s?/g, '');
      return s;
    };

    // Сначала $$...$$, потом $...$
    let out = text
      .replace(/\$\$([^$]+)\$\$/g, (_, e) => convert(e))
      .replace(/\$([^$\n]+?)\$/g, (_, e) => convert(e));
    // Голый LaTeX вне $...$ (n8n присылает без обёртки) — конвертим то, что осталось.
    if (/\\[a-zA-Z]+|[\^_][\{A-Za-z0-9]/.test(out)) {
      out = convert(out);
    }
    return out;
  }

  /** Целая ли строка — формула (LaTeX без кириллицы)? */
  private isPureFormula(text: string): boolean {
    if (!text) return false;
    if (/[А-Яа-яЁё]/.test(text)) return false;
    return /\\[a-zA-Z]+|[\^_][\{A-Za-z0-9]|\$/.test(text);
  }

  /**
   * Рендерит формульный bullet/строку как картинку через MathJax.
   * Если MathJax падает — fallback на текстовую версию с Unicode.
   * Возвращает true если успешно вставлено как картинка.
   */
  private async tryAddFormulaImage(
    s: any,
    latex: string,
    box: { x: number; y: number; w: number; h: number },
    color: string,
    fontPx: number,
  ): Promise<boolean> {
    // Убираем обёртки $...$ — MathJax ждёт чистый LaTeX.
    const raw = latex.replace(/^\s*\$\$?|\$\$?\s*$/g, '').trim();
    const img = await this.mathRenderer.renderToDataUri(raw, { color: '#' + color, display: true });
    if (!img) return false;
    // Em → дюймы. Базовый em ≈ fontPx/72. Прижимаем к высоте box.
    const emToInch = fontPx / 72;
    let w = img.widthEm * emToInch;
    let h = img.heightEm * emToInch;
    // Не вылезаем за box: масштабируем пропорционально.
    if (h > box.h) { const k = box.h / h; w *= k; h *= k; }
    if (w > box.w) { const k = box.w / w; w *= k; h *= k; }
    try {
      s.addImage({
        data: img.dataUri,
        x: box.x,
        y: box.y + Math.max(0, (box.h - h) / 2),
        w, h,
      });
      return true;
    } catch (e: any) {
      this.logger.warn(`[math] addImage failed: ${e?.message}`);
      return false;
    }
  }

  private async renderLayout(
    s: any,
    slide: PresentationSlide,
    ctx: { COL: any; isDark: boolean; fgText: string; fgSoft: string },
  ): Promise<void> {
    const { COL, fgText, fgSoft } = ctx;

    switch (slide.layout) {
      case 'title': {
        if (slide.eyebrow) {
          s.addText(slide.eyebrow, {
            x: 0.6, y: 1.6, w: 12, h: 0.4,
            fontSize: 12, fontFace: 'Inter', bold: true, color: COL.accent,
            charSpacing: 200,
          });
        }
        s.addText(this.latex(slide.title || ''), {
          x: 0.6, y: 2.2, w: 12, h: 2.4,
          fontSize: 54, fontFace: 'Inter', bold: true, color: fgText,
        });
        if (slide.subtitle) {
          s.addText(this.latex(slide.subtitle), {
            x: 0.6, y: 4.6, w: 11, h: 1.2,
            fontSize: 22, fontFace: 'Inter', color: fgSoft,
          });
        }
        if (slide.meta) {
          s.addText(this.latex(slide.meta), {
            x: 0.6, y: 6.6, w: 8, h: 0.4,
            fontSize: 11, fontFace: 'Inter', color: COL.textMute, charSpacing: 150,
          });
        }
        // Цветной акцент-блок снизу справа (как .accent-block в corporate.html)
        s.addShape('rect', { x: 11.3, y: 6.8, w: 1.5, h: 0.1, fill: { color: COL.accent } });
        break;
      }

      case 'bullets': {
        s.addText(this.latex(slide.title || ''), {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const items = slide.items ?? [];
        const startY = 2.0;
        const lineH = items.length > 5 ? 0.55 : 0.7;
        const fontPx = items.length > 5 ? 16 : 18;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          s.addShape('ellipse', {
            x: 0.7, y: startY + i * lineH + 0.18, w: 0.12, h: 0.12,
            fill: { color: COL.accent }, line: { color: COL.accent, width: 0 },
          });
          const box = { x: 1.0, y: startY + i * lineH, w: 11.5, h: lineH };
          const rendered = this.isPureFormula(item)
            ? await this.tryAddFormulaImage(s, item, box, fgSoft, fontPx)
            : false;
          if (!rendered) {
            s.addText(this.latex(item), {
              ...box,
              fontSize: fontPx, fontFace: 'Inter', color: fgSoft, valign: 'top',
            });
          }
        }
        break;
      }

      case 'two-column': {
        s.addText(this.latex(slide.title || ''), {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const colY = 2.0;
        const colW = 5.7;
        s.addText(this.latex(slide.leftTitle || ''), {
          x: 0.6, y: colY, w: colW, h: 0.5,
          fontSize: 16, fontFace: 'Inter', bold: true, color: COL.accent,
          charSpacing: 100,
        });
        s.addText(this.latex(slide.leftText || ''), {
          x: 0.6, y: colY + 0.6, w: colW, h: 4,
          fontSize: 14, fontFace: 'Inter', color: fgSoft, valign: 'top',
        });
        s.addShape('line', {
          x: 6.65, y: colY, w: 0, h: 4.5,
          line: { color: COL.border, width: 1 },
        });
        s.addText(this.latex(slide.rightTitle || ''), {
          x: 7.0, y: colY, w: colW, h: 0.5,
          fontSize: 16, fontFace: 'Inter', bold: true, color: COL.accent,
          charSpacing: 100,
        });
        s.addText(this.latex(slide.rightText || ''), {
          x: 7.0, y: colY + 0.6, w: colW, h: 4,
          fontSize: 14, fontFace: 'Inter', color: fgSoft, valign: 'top',
        });
        break;
      }

      case 'quote': {
        s.addText('"', {
          x: 0.6, y: 1.0, w: 1.5, h: 1.5,
          fontSize: 96, fontFace: 'Georgia', bold: true, color: COL.accent,
        });
        s.addText(this.latex(slide.text || ''), {
          x: 1.0, y: 2.3, w: 11.5, h: 3.5,
          fontSize: 32, fontFace: 'Inter', italic: true, color: fgText,
        });
        if (slide.author) {
          s.addText(`— ${this.latex(slide.author)}`, {
            x: 1.0, y: 6.0, w: 11.5, h: 0.5,
            fontSize: 14, fontFace: 'Inter', bold: true, color: COL.textMute,
            charSpacing: 200,
          });
        }
        break;
      }

      case 'summary': {
        s.addText(this.latex(slide.title || ''), {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const items = slide.items ?? [];
        const cols = 2;
        const rows = Math.ceil(items.length / cols);
        const cellW = 6.0;
        const cellH = Math.min(1.4, 4.5 / rows);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const r = Math.floor(i / cols);
          const c = i % cols;
          const x = 0.6 + c * (cellW + 0.4);
          const y = 2.0 + r * (cellH + 0.2);
          s.addShape('rect', {
            x, y, w: cellW, h: cellH,
            fill: { color: ctx.isDark ? '1A1A2E' : 'F8FAFC' },
            line: { color: COL.border, width: 0.5 },
          });
          s.addText(String(i + 1).padStart(2, '0'), {
            x: x + 0.2, y: y + 0.15, w: 0.8, h: 0.4,
            fontSize: 12, fontFace: 'Inter', bold: true, color: COL.accent,
            charSpacing: 150,
          });
          const box = { x: x + 0.2, y: y + 0.55, w: cellW - 0.4, h: cellH - 0.65 };
          const rendered = this.isPureFormula(item)
            ? await this.tryAddFormulaImage(s, item, box, fgText, 13)
            : false;
          if (!rendered) {
            s.addText(this.latex(item), {
              ...box,
              fontSize: 13, fontFace: 'Inter', bold: true, color: fgText, valign: 'top',
            });
          }
        }
        break;
      }

      case 'content':
      default: {
        s.addText(this.latex(slide.title || ''), {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const paras = (slide.paragraphs && slide.paragraphs.length)
          ? slide.paragraphs
          : (slide.text ? [slide.text] : []);
        // Раскладываем параграфы вертикально, формульные — как картинки.
        const startY = 2.0;
        const totalH = 5.0;
        const blockH = paras.length > 0 ? totalH / paras.length : totalH;
        for (let i = 0; i < paras.length; i++) {
          const p = paras[i];
          const box = { x: 0.6, y: startY + i * blockH, w: 12, h: blockH };
          const rendered = this.isPureFormula(p)
            ? await this.tryAddFormulaImage(s, p, box, fgSoft, 16)
            : false;
          if (!rendered) {
            s.addText(this.latex(p), {
              ...box,
              fontSize: 16, fontFace: 'Inter', color: fgSoft, valign: 'top',
              paraSpaceAfter: 12,
            });
          }
        }
        break;
      }
    }
  }
}
