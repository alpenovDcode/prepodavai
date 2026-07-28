import { z } from 'zod'
import type { PresentationData, PresentationSlide } from '@/components/v2/PresentationSlideEditor'

export const PRESENTATION_CANVAS_WIDTH = 1280
export const PRESENTATION_CANVAS_HEIGHT = 720
export const PRESENTATION_CANVAS_FORMAT = 'presentation-canvas-v1' as const

const color = z.string().regex(/^#[0-9a-f]{6}$/i)

export const CanvasElementStyleSchema = z.object({
    fontSize: z.number().min(8).max(160).optional(),
    fontFamily: z.enum(['Inter', 'Georgia', 'Arial', 'Courier New']).optional(),
    fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    color: color.optional(),
    backgroundColor: color.optional(),
    borderColor: color.optional(),
    borderWidth: z.number().min(0).max(20).optional(),
    borderRadius: z.number().min(0).max(200).optional(),
    opacity: z.number().min(0).max(1).optional(),
    lineHeight: z.number().min(0.8).max(3).optional(),
    objectFit: z.enum(['contain', 'cover']).optional(),
}).strict()

export const CanvasElementSchema = z.object({
    id: z.string().min(1).max(100),
    type: z.enum(['text', 'image', 'shape']),
    x: z.number().min(-2560).max(3840),
    y: z.number().min(-1440).max(2160),
    width: z.number().min(8).max(2560),
    height: z.number().min(8).max(1440),
    rotation: z.number().min(-360).max(360),
    zIndex: z.number().int().min(0).max(1000),
    text: z.string().max(20_000).optional(),
    assetHash: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
    shapeType: z.enum(['rect', 'ellipse', 'line']).optional(),
    style: CanvasElementStyleSchema,
}).strict()

export const CanvasSlideSchema = z.object({
    id: z.string().min(1).max(100),
    background: color,
    elements: z.array(CanvasElementSchema).max(100),
}).strict()

export const CanvasPresentationSchema = z.object({
    format: z.literal(PRESENTATION_CANVAS_FORMAT),
    version: z.literal(1),
    width: z.literal(PRESENTATION_CANVAS_WIDTH),
    height: z.literal(PRESENTATION_CANVAS_HEIGHT),
    topic: z.string().min(1).max(500),
    audience: z.string().min(1).max(200),
    style: z.enum(['modern', 'academic', 'creative', 'corporate']),
    color: z.enum(['indigo', 'emerald', 'violet', 'blue', 'slate']),
    slides: z.array(CanvasSlideSchema).min(5).max(24),
}).strict()

export type CanvasPresentation = z.infer<typeof CanvasPresentationSchema>
export type CanvasSlide = z.infer<typeof CanvasSlideSchema>
export type CanvasElement = z.infer<typeof CanvasElementSchema>
export type CanvasElementStyle = z.infer<typeof CanvasElementStyleSchema>

const accents: Record<string, string> = {
    indigo: '#4F46E5',
    emerald: '#10B981',
    violet: '#8B5CF6',
    blue: '#2563EB',
    slate: '#1E293B',
}

const makeText = (
    id: string,
    text: string | undefined,
    frame: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>,
    style: CanvasElementStyle,
    zIndex = 1,
): CanvasElement => ({
    id, type: 'text', ...frame, rotation: 0, zIndex, text: text || '',
    style: { fontFamily: 'Inter', color: '#0F172A', lineHeight: 1.25, ...style },
})

const makeShape = (
    id: string,
    frame: Pick<CanvasElement, 'x' | 'y' | 'width' | 'height'>,
    style: CanvasElementStyle,
    shapeType: 'rect' | 'ellipse' | 'line' = 'rect',
    zIndex = 0,
): CanvasElement => ({ id, type: 'shape', shapeType, ...frame, rotation: 0, zIndex, style })

function convertSlide(slide: PresentationSlide, index: number, accent: string, dark: boolean): CanvasSlide {
    const id = `slide-${index + 1}`
    const textColor = dark ? '#FFFFFF' : '#0F172A'
    const muted = dark ? '#C7C9D9' : '#475569'
    const background = dark ? '#0B0B14' : '#FFFFFF'
    const title: CanvasElementStyle = { fontSize: 42, fontWeight: '800', color: textColor, lineHeight: 1.12 }
    const body: CanvasElementStyle = { fontSize: 24, fontWeight: '400', color: muted, lineHeight: 1.45 }
    const elements: CanvasElement[] = [
        makeShape(`${id}-accent`, { x: 0, y: 0, width: 8, height: 720 }, { backgroundColor: accent }),
    ]

    if (slide.layout === 'title') {
        elements.push(
            makeText(`${id}-eyebrow`, slide.eyebrow, { x: 80, y: 105, width: 1040, height: 40 }, { fontSize: 16, fontWeight: '700', color: accent }),
            makeText(`${id}-title`, slide.title, { x: 80, y: 175, width: 1080, height: 205 }, { ...title, fontSize: 68 }),
            makeText(`${id}-subtitle`, slide.subtitle, { x: 80, y: 405, width: 940, height: 115 }, { ...body, fontSize: 29 }),
            makeText(`${id}-meta`, slide.meta, { x: 80, y: 630, width: 800, height: 30 }, { fontSize: 14, fontWeight: '500', color: muted }),
        )
    } else if (slide.layout === 'two-column') {
        elements.push(
            makeText(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, title),
            makeText(`${id}-left-title`, slide.leftTitle, { x: 80, y: 165, width: 500, height: 50 }, { fontSize: 23, fontWeight: '700', color: accent }),
            makeText(`${id}-left`, slide.leftText, { x: 80, y: 225, width: 500, height: 385 }, body),
            makeShape(`${id}-divider`, { x: 635, y: 165, width: 2, height: 445 }, { backgroundColor: dark ? '#313142' : '#E2E8F0' }),
            makeText(`${id}-right-title`, slide.rightTitle, { x: 695, y: 165, width: 500, height: 50 }, { fontSize: 23, fontWeight: '700', color: accent }),
            makeText(`${id}-right`, slide.rightText, { x: 695, y: 225, width: 500, height: 385 }, body),
        )
    } else if (slide.layout === 'quote') {
        elements.push(
            makeText(`${id}-quote-mark`, '“', { x: 70, y: 90, width: 120, height: 130 }, { fontFamily: 'Georgia', fontSize: 112, fontWeight: '700', color: accent }),
            makeText(`${id}-quote`, slide.text, { x: 135, y: 220, width: 1010, height: 285 }, { ...title, fontFamily: 'Georgia', fontSize: 42, fontStyle: 'italic' }),
            makeText(`${id}-author`, slide.author, { x: 135, y: 545, width: 900, height: 45 }, { fontSize: 18, fontWeight: '600', color: muted }),
        )
    } else if (slide.layout === 'summary') {
        elements.push(makeText(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, title))
        ;(slide.items || []).forEach((item, itemIndex) => {
            const x = 80 + (itemIndex % 2) * 565
            const y = 160 + Math.floor(itemIndex / 2) * 142
            elements.push(
                makeShape(`${id}-card-${itemIndex}`, { x, y, width: 525, height: 116 }, {
                    backgroundColor: dark ? '#181824' : '#F8FAFC',
                    borderColor: dark ? '#313142' : '#E2E8F0', borderWidth: 1, borderRadius: 14,
                }),
                makeText(`${id}-item-${itemIndex}`, item, { x: x + 24, y: y + 18, width: 477, height: 82 }, {
                    fontSize: 19, fontWeight: '600', color: textColor, lineHeight: 1.3,
                }, 2),
            )
        })
    } else if (slide.layout === 'content') {
        elements.push(
            makeText(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, title),
            makeText(`${id}-content`, (slide.paragraphs || []).join('\n\n'), { x: 80, y: 165, width: 1090, height: 450 }, body),
        )
    } else if (slide.layout === 'image-text') {
        elements.push(
            makeText(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, title),
            makeText(`${id}-items`, (slide.items || []).map(item => `• ${item}`).join('\n'), { x: 80, y: 165, width: 535, height: 450 }, body),
            makeShape(`${id}-image-placeholder`, { x: 675, y: 165, width: 500, height: 400 }, {
                backgroundColor: dark ? '#181824' : '#F1F5F9', borderColor: dark ? '#313142' : '#CBD5E1',
                borderWidth: 1, borderRadius: 18,
            }),
            makeText(`${id}-image-label`, 'Добавьте изображение', { x: 760, y: 335, width: 330, height: 45 }, {
                fontSize: 18, fontWeight: '600', color: muted, textAlign: 'center',
            }, 2),
        )
    } else {
        elements.push(
            makeText(`${id}-title`, slide.title, { x: 80, y: 58, width: 1120, height: 70 }, title),
            makeText(`${id}-items`, (slide.items || []).map(item => `• ${item}`).join('\n'), { x: 100, y: 160, width: 1050, height: 465 }, body),
        )
    }
    return { id, background, elements }
}

export function convertPresentationDataToCanvas(data: PresentationData): CanvasPresentation {
    const style = ['modern', 'academic', 'creative', 'corporate'].includes(data.style)
        ? data.style as CanvasPresentation['style']
        : 'modern'
    const colorKey = ['indigo', 'emerald', 'violet', 'blue', 'slate'].includes(data.color)
        ? data.color as CanvasPresentation['color']
        : 'indigo'
    return {
        format: PRESENTATION_CANVAS_FORMAT,
        version: 1,
        width: PRESENTATION_CANVAS_WIDTH,
        height: PRESENTATION_CANVAS_HEIGHT,
        topic: data.topic || 'Презентация',
        audience: data.audience || 'students',
        style,
        color: colorKey,
        slides: data.slides.map((slide, index) => convertSlide(slide, index, accents[colorKey], style === 'creative')),
    }
}

export function parseCanvasPresentation(value: unknown): CanvasPresentation | null {
    const parsed = CanvasPresentationSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}
