import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FilesService } from '../../files/files.service';
import {
  PRESENTATION_COLORS,
  PresentationData,
  PresentationSlide,
} from './presentation-template.service';
import { LOGO_BASE64 } from '../generation.constants';

export const PRESENTATION_CANVAS_WIDTH = 1280;
export const PRESENTATION_CANVAS_HEIGHT = 720;

const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const CanvasElementStyleSchema = z.object({
  fontSize: z.number().finite().min(8).max(160).optional(),
  fontFamily: z.enum(['Inter', 'Georgia', 'Arial', 'Courier New']).optional(),
  fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  color: ColorSchema.optional(),
  backgroundColor: ColorSchema.optional(),
  borderColor: ColorSchema.optional(),
  borderWidth: z.number().finite().min(0).max(20).optional(),
  borderRadius: z.number().finite().min(0).max(200).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  lineHeight: z.number().finite().min(0.8).max(3).optional(),
  objectFit: z.enum(['contain', 'cover']).optional(),
}).strict();

export const CanvasElementSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['text', 'image', 'shape']),
  x: z.number().finite().min(-2560).max(3840),
  y: z.number().finite().min(-1440).max(2160),
  // Тонкие линии/разделители из legacy-конвертера имеют толщину 1–2 px.
  // Интерактивный resize всё равно держит пользовательские объекты >= 24 px.
  width: z.number().finite().min(1).max(2560),
  height: z.number().finite().min(1).max(1440),
  rotation: z.number().finite().min(-360).max(360).default(0),
  zIndex: z.number().int().min(0).max(1000),
  text: z.string().max(20_000).optional(),
  assetHash: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
  shapeType: z.enum(['rect', 'ellipse', 'line']).optional(),
  style: CanvasElementStyleSchema.default({}),
}).strict();

export const CanvasSlideSchema = z.object({
  id: z.string().min(1).max(100),
  background: ColorSchema,
  elements: z.array(CanvasElementSchema).max(100),
}).strict();

export const CanvasPresentationSchema = z.object({
  format: z.literal('presentation-canvas-v1'),
  version: z.literal(1),
  width: z.literal(PRESENTATION_CANVAS_WIDTH),
  height: z.literal(PRESENTATION_CANVAS_HEIGHT),
  topic: z.string().min(1).max(500),
  audience: z.string().min(1).max(200),
  style: z.enum(['modern', 'academic', 'creative', 'corporate']),
  color: z.enum(['indigo', 'emerald', 'violet', 'blue', 'slate']),
  slides: z.array(CanvasSlideSchema).min(5).max(24),
}).strict();

export type CanvasPresentation = z.infer<typeof CanvasPresentationSchema>;
export type CanvasSlide = z.infer<typeof CanvasSlideSchema>;
export type CanvasElement = z.infer<typeof CanvasElementSchema>;

type TextStyle = NonNullable<CanvasElement['style']>;

function textElement(
  id: string,
  text: string | undefined,
  frame: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>,
  style: TextStyle,
  zIndex = 1,
): CanvasElement {
  return {
    id,
    type: 'text',
    ...frame,
    rotation: 0,
    zIndex,
    text: text ?? '',
    style: {
      fontFamily: 'Inter',
      color: '#0F172A',
      lineHeight: 1.25,
      ...style,
    },
  };
}

function shapeElement(
  id: string,
  frame: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>,
  style: TextStyle,
  shapeType: 'rect' | 'ellipse' | 'line' = 'rect',
  zIndex = 0,
): CanvasElement {
  return {
    id,
    type: 'shape',
    shapeType,
    ...frame,
    rotation: 0,
    zIndex,
    style,
  };
}

function bullets(items?: string[]): string {
  return (items ?? []).map((item) => `• ${item}`).join('\n');
}

function convertSlide(
  slide: PresentationSlide,
  index: number,
  accent: string,
  dark: boolean,
): CanvasSlide {
  const id = `slide-${index + 1}`;
  const textColor = dark ? '#FFFFFF' : '#0F172A';
  const muted = dark ? '#C7C9D9' : '#475569';
  const background = dark ? '#0B0B14' : '#FFFFFF';
  const titleStyle: TextStyle = {
    fontSize: 42,
    fontWeight: '800',
    color: textColor,
    lineHeight: 1.12,
  };
  const bodyStyle: TextStyle = {
    fontSize: 24,
    fontWeight: '400',
    color: muted,
    lineHeight: 1.45,
  };
  const elements: CanvasElement[] = [
    shapeElement(`${id}-accent`, { x: 0, y: 0, width: 8, height: 720 }, {
      backgroundColor: accent,
    }),
  ];

  switch (slide.layout) {
    case 'title':
      elements.push(
        textElement(`${id}-eyebrow`, slide.eyebrow, { x: 80, y: 105, width: 1040, height: 40 }, {
          fontSize: 16, fontWeight: '700', color: accent,
        }),
        textElement(`${id}-title`, slide.title, { x: 80, y: 175, width: 1080, height: 205 }, {
          ...titleStyle, fontSize: 68,
        }),
        textElement(`${id}-subtitle`, slide.subtitle, { x: 80, y: 405, width: 940, height: 115 }, {
          ...bodyStyle, fontSize: 29,
        }),
        textElement(`${id}-meta`, slide.meta, { x: 80, y: 630, width: 800, height: 30 }, {
          fontSize: 14, fontWeight: '500', color: muted,
        }),
      );
      break;
    case 'two-column':
      elements.push(
        textElement(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, titleStyle),
        textElement(`${id}-left-title`, slide.leftTitle, { x: 80, y: 165, width: 500, height: 50 }, {
          fontSize: 23, fontWeight: '700', color: accent,
        }),
        textElement(`${id}-left`, slide.leftText, { x: 80, y: 225, width: 500, height: 385 }, bodyStyle),
        shapeElement(`${id}-divider`, { x: 635, y: 165, width: 2, height: 445 }, {
          backgroundColor: dark ? '#313142' : '#E2E8F0',
        }),
        textElement(`${id}-right-title`, slide.rightTitle, { x: 695, y: 165, width: 500, height: 50 }, {
          fontSize: 23, fontWeight: '700', color: accent,
        }),
        textElement(`${id}-right`, slide.rightText, { x: 695, y: 225, width: 500, height: 385 }, bodyStyle),
      );
      break;
    case 'quote':
      elements.push(
        textElement(`${id}-quote-mark`, '“', { x: 70, y: 90, width: 120, height: 130 }, {
          fontFamily: 'Georgia', fontSize: 112, fontWeight: '700', color: accent,
        }),
        textElement(`${id}-quote`, slide.text, { x: 135, y: 220, width: 1010, height: 285 }, {
          ...titleStyle, fontFamily: 'Georgia', fontSize: 42, fontStyle: 'italic',
        }),
        textElement(`${id}-author`, slide.author, { x: 135, y: 545, width: 900, height: 45 }, {
          fontSize: 18, fontWeight: '600', color: muted,
        }),
      );
      break;
    case 'summary': {
      elements.push(
        textElement(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, titleStyle),
      );
      const items = slide.items ?? [];
      items.forEach((item, itemIndex) => {
        const col = itemIndex % 2;
        const row = Math.floor(itemIndex / 2);
        const x = 80 + col * 565;
        const y = 160 + row * 142;
        elements.push(
          shapeElement(`${id}-card-${itemIndex}`, { x, y, width: 525, height: 116 }, {
            backgroundColor: dark ? '#181824' : '#F8FAFC',
            borderColor: dark ? '#313142' : '#E2E8F0',
            borderWidth: 1,
            borderRadius: 14,
          }),
          textElement(`${id}-item-${itemIndex}`, item, { x: x + 24, y: y + 18, width: 477, height: 82 }, {
            fontSize: 19, fontWeight: '600', color: textColor, lineHeight: 1.3,
          }, 2),
        );
      });
      break;
    }
    case 'content':
      elements.push(
        textElement(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, titleStyle),
        textElement(`${id}-content`, (slide.paragraphs ?? []).join('\n\n'), {
          x: 80, y: 165, width: 1090, height: 450,
        }, bodyStyle),
      );
      break;
    case 'image-text':
      elements.push(
        textElement(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, titleStyle),
        textElement(`${id}-items`, bullets(slide.items), { x: 80, y: 165, width: 535, height: 450 }, bodyStyle),
        shapeElement(`${id}-image-placeholder`, { x: 675, y: 165, width: 500, height: 400 }, {
          backgroundColor: dark ? '#181824' : '#F1F5F9',
          borderColor: dark ? '#313142' : '#CBD5E1',
          borderWidth: 1,
          borderRadius: 18,
        }),
        textElement(`${id}-image-label`, 'Добавьте изображение', {
          x: 760, y: 335, width: 330, height: 45,
        }, { fontSize: 18, fontWeight: '600', color: muted, textAlign: 'center' }, 2),
      );
      break;
    case 'bullets':
    default:
      elements.push(
        textElement(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, titleStyle),
        textElement(`${id}-items`, bullets(slide.items), { x: 100, y: 160, width: 1050, height: 465 }, bodyStyle),
      );
      break;
  }

  return { id, background, elements };
}

export function convertPresentationDataToCanvas(data: PresentationData): CanvasPresentation {
  const palette = PRESENTATION_COLORS[data.color] ?? PRESENTATION_COLORS.indigo;
  const dark = data.style === 'creative';
  return {
    format: 'presentation-canvas-v1',
    version: 1,
    width: PRESENTATION_CANVAS_WIDTH,
    height: PRESENTATION_CANVAS_HEIGHT,
    topic: data.topic,
    audience: data.audience,
    style: data.style,
    color: data.color,
    slides: data.slides.map((slide, index) =>
      convertSlide(slide, index, palette.accent, dark),
    ),
  };
}

@Injectable()
export class PresentationCanvasService {
  constructor(private readonly filesService: FilesService) {}

  parse(value: unknown): CanvasPresentation {
    return CanvasPresentationSchema.parse(value);
  }

  async renderHtml(
    input: CanvasPresentation,
    options: { userId?: string; embedAssets?: boolean } = {},
  ): Promise<string> {
    const data = this.parse(input);
    const assets = new Map<string, string>();

    if (options.embedAssets && options.userId) {
      const hashes = new Set<string>();
      data.slides.forEach((slide) => {
        slide.elements.forEach((element) => {
          if (element.type === 'image' && element.assetHash) hashes.add(element.assetHash);
        });
      });
      await Promise.all(
        [...hashes].map(async (hash) => {
          const file = await this.filesService.getFileForUser(hash, options.userId!);
          if (!file || !file.mimeType.startsWith('image/')) return;
          assets.set(hash, `data:${file.mimeType};base64,${file.buffer.toString('base64')}`);
        }),
      );
    }

    const slidesHtml = data.slides
      .map((slide, index) => this.renderSlide(slide, index, data.slides.length, assets))
      .join('');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(data.topic)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111827;font-family:Inter,Arial,sans-serif}
.stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.slide{position:absolute;width:${data.width}px;height:${data.height}px;overflow:hidden;display:none;transform-origin:center center;box-shadow:0 20px 55px rgba(0,0,0,.28)}
.slide.active{display:block}
.el{position:absolute;white-space:pre-wrap;overflow:hidden;box-sizing:border-box}
.el-text{overflow-wrap:anywhere}
.el-image{display:block}
.nav{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.86);color:#fff;z-index:2000}
.nav button{width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
.nav button:disabled{opacity:.35}
.counter{min-width:62px;text-align:center;font-size:13px;font-weight:700}
@page{size:${data.width}px ${data.height}px;margin:0}
@media print{
  html,body{width:${data.width}px!important;height:auto!important;overflow:visible!important;background:#fff!important}
  .stage{display:block!important;width:${data.width}px!important;height:auto!important}
  .slide{position:relative!important;display:block!important;transform:none!important;box-shadow:none!important;page-break-after:always!important;break-after:page!important}
  .slide:last-child{page-break-after:auto!important;break-after:auto!important}
  .nav{display:none!important}
}
</style>
</head>
<body>
<div class="stage" id="stage">${slidesHtml}</div>
<div class="nav"><button id="prev" aria-label="Назад">←</button><span class="counter" id="counter">1 / ${data.slides.length}</span><button id="next" aria-label="Вперёд">→</button></div>
<script>
(function(){
  var slides=Array.from(document.querySelectorAll('.slide')),current=0;
  function fit(){
    var scale=Math.min(window.innerWidth/${data.width},window.innerHeight/${data.height});
    slides.forEach(function(slide){slide.style.transform='scale('+scale+')'});
  }
  function show(next){
    current=Math.max(0,Math.min(slides.length-1,next));
    slides.forEach(function(slide,index){slide.classList.toggle('active',index===current)});
    document.getElementById('counter').textContent=(current+1)+' / '+slides.length;
    document.getElementById('prev').disabled=current===0;
    document.getElementById('next').disabled=current===slides.length-1;
    if(window.MathJax&&window.MathJax.typesetPromise)window.MathJax.typesetPromise([slides[current]]).catch(function(){});
  }
  document.getElementById('prev').onclick=function(){show(current-1)};
  document.getElementById('next').onclick=function(){show(current+1)};
  document.addEventListener('keydown',function(event){
    if(event.key==='ArrowLeft')show(current-1);
    if(event.key==='ArrowRight'||event.key===' ')show(current+1);
  });
  window.addEventListener('resize',fit);
  fit();show(0);
})();
</script>
<script>
window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)'],['$','$']],displayMath:[['\\\\[','\\\\]'],['$$','$$']]},options:{enableMenu:false}};
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</body>
</html>`;
  }

  private renderSlide(
    slide: CanvasSlide,
    index: number,
    total: number,
    assets: Map<string, string>,
  ): string {
    const elements = [...slide.elements]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((element) => this.renderElement(element, assets))
      .join('');
    return `<section class="slide${index === 0 ? ' active' : ''}" data-slide="${index}" style="background:${slide.background}">${elements}<img alt="" src="${LOGO_BASE64}" style="position:absolute;right:28px;bottom:22px;width:34px;height:34px;opacity:.45;object-fit:contain;z-index:1001"><div style="position:absolute;left:28px;bottom:25px;font-size:12px;color:#94A3B8;z-index:1001">${index + 1} / ${total}</div></section>`;
  }

  private renderElement(element: CanvasElement, assets: Map<string, string>): string {
    const style = element.style ?? {};
    const base = [
      `left:${element.x}px`,
      `top:${element.y}px`,
      `width:${element.width}px`,
      `height:${element.height}px`,
      `z-index:${element.zIndex}`,
      `transform:rotate(${element.rotation}deg)`,
      `opacity:${style.opacity ?? 1}`,
      style.backgroundColor ? `background:${style.backgroundColor}` : '',
      style.borderColor ? `border:${style.borderWidth ?? 1}px solid ${style.borderColor}` : '',
      style.borderRadius != null ? `border-radius:${style.borderRadius}px` : '',
    ].filter(Boolean);

    if (element.type === 'image') {
      const src = element.assetHash ? assets.get(element.assetHash) : undefined;
      if (!src) {
        return `<div class="el" style="${base.join(';')};background:#E2E8F0;border:1px dashed #94A3B8;border-radius:12px"></div>`;
      }
      return `<img class="el el-image" alt="" src="${src}" style="${base.join(';')};object-fit:${style.objectFit ?? 'contain'}">`;
    }

    if (element.type === 'shape') {
      if (element.shapeType === 'line') {
        return `<div class="el" style="${base.join(';')};height:${Math.max(2, style.borderWidth ?? 2)}px;background:${style.borderColor ?? style.backgroundColor ?? '#0F172A'}"></div>`;
      }
      if (element.shapeType === 'ellipse') base.push('border-radius:50%');
      return `<div class="el" style="${base.join(';')}"></div>`;
    }

    base.push(
      `font-family:${cssFont(style.fontFamily ?? 'Inter')}`,
      `font-size:${style.fontSize ?? 24}px`,
      `font-weight:${style.fontWeight ?? '400'}`,
      `font-style:${style.fontStyle ?? 'normal'}`,
      `text-align:${style.textAlign ?? 'left'}`,
      `color:${style.color ?? '#0F172A'}`,
      `line-height:${style.lineHeight ?? 1.25}`,
    );
    return `<div class="el el-text" style="${base.join(';')}">${escapeHtml(element.text ?? '').replace(/\n/g, '<br>')}</div>`;
  }
}

function cssFont(font: CanvasElement['style']['fontFamily']): string {
  if (font === 'Courier New') return '"Courier New",monospace';
  return `${font},Arial,sans-serif`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
