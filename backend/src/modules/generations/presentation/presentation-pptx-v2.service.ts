import { Injectable, Logger } from '@nestjs/common';
import {
  PresentationData,
  PresentationSlide,
  PRESENTATION_COLORS,
  PresentationColor,
} from './presentation-template.service';
import { LOGO_BASE64 } from '../generation.constants';

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

    data.slides.forEach((slide, idx) => {
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

      this.renderLayout(s, slide, { COL, isDark, fgText, fgSoft });

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
      if (note) s.addNotes(String(note));
    });

    const buf = await pres.write({ outputType: 'nodebuffer' });
    return buf as Buffer;
  }

  private renderLayout(
    s: any,
    slide: PresentationSlide,
    ctx: { COL: any; isDark: boolean; fgText: string; fgSoft: string },
  ) {
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
        s.addText(slide.title || '', {
          x: 0.6, y: 2.2, w: 12, h: 2.4,
          fontSize: 54, fontFace: 'Inter', bold: true, color: fgText,
        });
        if (slide.subtitle) {
          s.addText(slide.subtitle, {
            x: 0.6, y: 4.6, w: 11, h: 1.2,
            fontSize: 22, fontFace: 'Inter', color: fgSoft,
          });
        }
        if (slide.meta) {
          s.addText(slide.meta, {
            x: 0.6, y: 6.6, w: 8, h: 0.4,
            fontSize: 11, fontFace: 'Inter', color: COL.textMute, charSpacing: 150,
          });
        }
        // Цветной акцент-блок снизу справа (как .accent-block в corporate.html)
        s.addShape('rect', { x: 11.3, y: 6.8, w: 1.5, h: 0.1, fill: { color: COL.accent } });
        break;
      }

      case 'bullets': {
        s.addText(slide.title || '', {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const items = slide.items ?? [];
        const startY = 2.0;
        const lineH = items.length > 5 ? 0.55 : 0.7;
        items.forEach((item, i) => {
          // Bullet точка
          s.addShape('ellipse', {
            x: 0.7, y: startY + i * lineH + 0.18, w: 0.12, h: 0.12,
            fill: { color: COL.accent }, line: { color: COL.accent, width: 0 },
          });
          s.addText(item, {
            x: 1.0, y: startY + i * lineH, w: 11.5, h: lineH,
            fontSize: items.length > 5 ? 16 : 18, fontFace: 'Inter', color: fgSoft, valign: 'top',
          });
        });
        break;
      }

      case 'two-column': {
        s.addText(slide.title || '', {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const colY = 2.0;
        const colW = 5.7;
        // LEFT
        s.addText(slide.leftTitle || '', {
          x: 0.6, y: colY, w: colW, h: 0.5,
          fontSize: 16, fontFace: 'Inter', bold: true, color: COL.accent,
          charSpacing: 100,
        });
        s.addText(slide.leftText || '', {
          x: 0.6, y: colY + 0.6, w: colW, h: 4,
          fontSize: 14, fontFace: 'Inter', color: fgSoft, valign: 'top',
        });
        // Separator
        s.addShape('line', {
          x: 6.65, y: colY, w: 0, h: 4.5,
          line: { color: COL.border, width: 1 },
        });
        // RIGHT
        s.addText(slide.rightTitle || '', {
          x: 7.0, y: colY, w: colW, h: 0.5,
          fontSize: 16, fontFace: 'Inter', bold: true, color: COL.accent,
          charSpacing: 100,
        });
        s.addText(slide.rightText || '', {
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
        s.addText(slide.text || '', {
          x: 1.0, y: 2.3, w: 11.5, h: 3.5,
          fontSize: 32, fontFace: 'Inter', italic: true, color: fgText,
        });
        if (slide.author) {
          s.addText(`— ${slide.author}`, {
            x: 1.0, y: 6.0, w: 11.5, h: 0.5,
            fontSize: 14, fontFace: 'Inter', bold: true, color: COL.textMute,
            charSpacing: 200,
          });
        }
        break;
      }

      case 'summary': {
        s.addText(slide.title || '', {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const items = slide.items ?? [];
        const cols = 2;
        const rows = Math.ceil(items.length / cols);
        const cellW = 6.0;
        const cellH = Math.min(1.4, 4.5 / rows);
        items.forEach((item, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const x = 0.6 + c * (cellW + 0.4);
          const y = 2.0 + r * (cellH + 0.2);
          // карточка-фон
          s.addShape('rect', {
            x, y, w: cellW, h: cellH,
            fill: { color: ctx.isDark ? '1A1A2E' : 'F8FAFC' },
            line: { color: COL.border, width: 0.5 },
          });
          // номер
          s.addText(String(i + 1).padStart(2, '0'), {
            x: x + 0.2, y: y + 0.15, w: 0.8, h: 0.4,
            fontSize: 12, fontFace: 'Inter', bold: true, color: COL.accent,
            charSpacing: 150,
          });
          // текст
          s.addText(item, {
            x: x + 0.2, y: y + 0.55, w: cellW - 0.4, h: cellH - 0.65,
            fontSize: 13, fontFace: 'Inter', bold: true, color: fgText, valign: 'top',
          });
        });
        break;
      }

      case 'content':
      default: {
        s.addText(slide.title || '', {
          x: 0.6, y: 0.9, w: 12, h: 0.8,
          fontSize: 32, fontFace: 'Inter', bold: true, color: fgText,
        });
        const text = (slide.paragraphs && slide.paragraphs.length)
          ? slide.paragraphs.join('\n\n')
          : (slide.text || '');
        s.addText(text, {
          x: 0.6, y: 2.0, w: 12, h: 5,
          fontSize: 16, fontFace: 'Inter', color: fgSoft, valign: 'top',
          paraSpaceAfter: 12,
        });
        break;
      }
    }
  }
}
