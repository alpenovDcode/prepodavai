import { Injectable, Logger } from '@nestjs/common';
import PptxGenJS from 'pptxgenjs';
import axios from 'axios';
import { Slide, SlideDoc } from './slide-doc.types';
import { pickTheme, SlideTheme } from './presentation-themes';
import { FilesService } from '../../files/files.service';

/**
 * Server-side PPTX export from a SlideDoc.
 *
 * Uses pptxgenjs primitives (no rasterization), so output is editable in
 * PowerPoint/Keynote/Slides. Layouts mirror the HTML renderer 1:1 — same
 * theme tokens, same content shape.
 */
@Injectable()
export class PresentationPptxService {
  private readonly logger = new Logger(PresentationPptxService.name);

  constructor(private readonly filesService: FilesService) {}

  async docToPptx(doc: SlideDoc): Promise<Buffer> {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9'; // 10" × 5.625"
    const theme = pickTheme(doc.themeId);

    for (const slide of doc.slides) {
      const presSlide = await this.renderSlide(pres, slide, theme);
      if (slide.speakerNotes?.trim() && presSlide?.addNotes) {
        presSlide.addNotes(slide.speakerNotes.trim());
      }
    }

    const data = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
    return data;
  }

  private async renderSlide(
    pres: PptxGenJS,
    slide: Slide,
    theme: SlideTheme,
  ): Promise<any> {
    const s: any = pres.addSlide();
    s.background = { color: this.toHex(theme.bg) };

    const c = slide.content;

    switch (slide.layout) {
      case 'title':
        s.addText(c.title, {
          x: 0.6, y: 1.8, w: 8.8, h: 1.6,
          fontFace: 'Inter',
          fontSize: 44,
          bold: true,
          color: this.toHex(theme.text),
        });
        if (c.subtitle) {
          s.addText(c.subtitle, {
            x: 0.6, y: 3.4, w: 8.8, h: 0.8,
            fontFace: 'Inter',
            fontSize: 22,
            color: this.toHex(theme.textMuted),
          });
        }
        s.addShape('rect', {
          x: 0.6, y: 4.4, w: 1.2, h: 0.08,
          fill: { color: this.toHex(theme.accent) },
          line: { color: this.toHex(theme.accent) },
        });
        return s;

      case 'two-column':
        this.addHead(s, c.title, theme);
        this.addColumn(s, theme, c.leftColumn, 0.6, 1.6, 4.3);
        this.addColumn(s, theme, c.rightColumn, 5.2, 1.6, 4.3);
        return s;

      case 'image-text': {
        this.addHead(s, c.title, theme);
        if (c.bullets?.length) {
          this.addBullets(s, c.bullets, 0.6, 1.6, 4.3, 3.4, theme);
        } else if (c.paragraph) {
          s.addText(c.paragraph, {
            x: 0.6, y: 1.6, w: 4.3, h: 3.4,
            fontFace: 'Inter', fontSize: 16, color: this.toHex(theme.text),
          });
        }
        if (slide.image?.url) {
          try {
            const buffer = await this.fetchImageBuffer(slide.image.url);
            s.addImage({
              data: `data:image/png;base64,${buffer.toString('base64')}`,
              x: 5.2, y: 1.6, w: 4.3, h: 3.2,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to embed image: ${e.message}`);
          }
        }
        return s;
      }

      case 'quote':
        this.addHead(s, c.title, theme);
        s.addShape('rect', {
          x: 0.6, y: 1.7, w: 8.8, h: 3,
          fill: { color: this.toHex(theme.accentSoft, theme.bg) },
          line: { color: this.toHex(theme.accent), width: 2 },
        });
        s.addText(`«${c.quote?.text || ''}»`, {
          x: 0.9, y: 1.9, w: 8.2, h: 2.2,
          fontFace: 'Inter', fontSize: 22, italic: true,
          color: this.toHex(theme.text),
        });
        if (c.quote?.attribution) {
          s.addText(`— ${c.quote.attribution}`, {
            x: 0.9, y: 4.1, w: 8.2, h: 0.5,
            fontFace: 'Inter', fontSize: 14,
            color: this.toHex(theme.textMuted),
          });
        }
        return s;

      case 'quiz': {
        this.addHead(s, c.title, theme);
        s.addText(c.quiz?.question || '', {
          x: 0.6, y: 1.6, w: 8.8, h: 0.7,
          fontFace: 'Inter', fontSize: 20, bold: true,
          color: this.toHex(theme.text),
        });
        const options = c.quiz?.options || [];
        const startY = 2.4;
        const optH = Math.min(0.6, 3 / Math.max(options.length, 1));
        options.forEach((opt, i) => {
          const isCorrect = i === c.quiz?.answerIndex;
          const y = startY + i * (optH + 0.12);
          s.addShape('rect', {
            x: 0.6, y, w: 8.8, h: optH,
            fill: { color: isCorrect ? this.toHex(theme.accentSoft, theme.surface) : this.toHex(theme.surface) },
            line: { color: this.toHex(isCorrect ? theme.accent : theme.border) },
          });
          const letter = String.fromCharCode(65 + i);
          s.addText(`${letter}. ${opt}`, {
            x: 0.85, y: y + 0.05, w: 8.4, h: optH - 0.1,
            fontFace: 'Inter', fontSize: 14,
            bold: isCorrect,
            color: this.toHex(theme.text),
          });
        });
        return s;
      }

      default:
        this.addHead(s, c.title, theme);
        if (c.bullets?.length) this.addBullets(s, c.bullets, 0.6, 1.6, 8.8, 3.4, theme);
        if (c.paragraph) {
          s.addText(c.paragraph, {
            x: 0.6, y: 1.6, w: 8.8, h: 3.4,
            fontFace: 'Inter', fontSize: 16,
            color: this.toHex(theme.text),
          });
        }
    }
    return s;
  }

  private addHead(s: any, title: string, theme: SlideTheme) {
    s.addText(title, {
      x: 0.6, y: 0.4, w: 8.8, h: 0.8,
      fontFace: 'Inter', fontSize: 28, bold: true,
      color: this.toHex(theme.text),
    });
    s.addShape('rect', {
      x: 0.6, y: 1.25, w: 0.7, h: 0.06,
      fill: { color: this.toHex(theme.accent) },
      line: { color: this.toHex(theme.accent) },
    });
  }

  private addColumn(
    s: any,
    theme: SlideTheme,
    col: { heading?: string; bullets?: string[]; paragraph?: string } | undefined,
    x: number,
    y: number,
    w: number,
  ) {
    if (!col) return;
    s.addShape('rect', {
      x, y, w, h: 3.4,
      fill: { color: this.toHex(theme.surface) },
      line: { color: this.toHex(theme.border) },
    });
    s.addShape('rect', {
      x, y, w: 0.06, h: 3.4,
      fill: { color: this.toHex(theme.accent) },
      line: { color: this.toHex(theme.accent) },
    });
    if (col.heading) {
      s.addText(col.heading, {
        x: x + 0.2, y: y + 0.15, w: w - 0.3, h: 0.5,
        fontFace: 'Inter', fontSize: 16, bold: true,
        color: this.toHex(theme.accent),
      });
    }
    if (col.bullets?.length) {
      this.addBullets(s, col.bullets, x + 0.2, y + 0.7, w - 0.3, 2.6, theme);
    } else if (col.paragraph) {
      s.addText(col.paragraph, {
        x: x + 0.2, y: y + 0.7, w: w - 0.3, h: 2.6,
        fontFace: 'Inter', fontSize: 14,
        color: this.toHex(theme.text),
      });
    }
  }

  private addBullets(
    s: any,
    bullets: string[],
    x: number,
    y: number,
    w: number,
    h: number,
    theme: SlideTheme,
  ) {
    s.addText(
      bullets.map((b) => ({ text: b, options: { bullet: { code: '25A0' } } })),
      {
        x, y, w, h,
        fontFace: 'Inter', fontSize: 16,
        color: this.toHex(theme.text),
        paraSpaceAfter: 6,
      },
    );
  }

  /**
   * Convert "#rrggbb" / "rgba(...)" / named to a 6-digit hex without "#".
   * pptxgenjs accepts "RRGGBB" only; alpha channel is dropped (PPTX has no
   * background opacity at the shape-fill level for our use), so for accentSoft
   * we approximate via blending against fallback.
   */
  private toHex(color: string, fallback: string = '#FFFFFF'): string {
    const stripHash = (c: string) => c.replace('#', '').toUpperCase();
    if (color.startsWith('#')) return stripHash(color);
    const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
    if (rgba) {
      const r = parseInt(rgba[1], 10);
      const g = parseInt(rgba[2], 10);
      const b = parseInt(rgba[3], 10);
      const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1;
      if (a >= 0.99) {
        return [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
      }
      // Blend against fallback
      const fallbackHex = stripHash(fallback);
      const fr = parseInt(fallbackHex.slice(0, 2), 16);
      const fg = parseInt(fallbackHex.slice(2, 4), 16);
      const fb = parseInt(fallbackHex.slice(4, 6), 16);
      const blend = (c: number, f: number) => Math.round(c * a + f * (1 - a));
      return [blend(r, fr), blend(g, fg), blend(b, fb)]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
    return stripHash(fallback);
  }

  /**
   * Read image bytes for embedding into PPTX. Prefer local FilesService for
   * /api/files/{hash} URLs — avoids hairpin-NAT failures when the pod can't
   * reach its own public domain.
   */
  private async fetchImageBuffer(url: string): Promise<Buffer> {
    const localMatch = url.match(/\/api\/files\/([a-f0-9]{32})/i);
    if (localMatch) {
      const file = await this.filesService.getFile(localMatch[1]);
      if (file?.buffer) return file.buffer;
    }
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(res.data);
  }
}
