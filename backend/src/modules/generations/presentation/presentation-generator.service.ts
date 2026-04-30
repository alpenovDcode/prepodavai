import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ReplicateService } from '../../replicate/replicate.service';
import {
  PRESENTATION_SYSTEM_PROMPT,
  buildOutlinePrompt,
  buildSlideContentPrompt,
  buildGlossaryPrompt,
  OutlineParams,
} from './presentation-prompts';
import {
  PresentationOutline,
  Slide,
  SlideContent,
  SlideDoc,
  SlideImageSpec,
  SlideLayout,
  SlideOutlineItem,
  SLIDE_LAYOUTS,
  SLIDE_THEME_IDS,
  SlideThemeId,
} from './slide-doc.types';
import { validateSlide } from './slide-validation';

const TEXT_MODEL = 'google/gemini-3-flash';
const IMAGE_MODEL_PRIMARY = 'black-forest-labs/flux-2-pro';
const IMAGE_MODEL_FALLBACK = 'black-forest-labs/flux-schnell';

const safeId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const stripJsonFence = (raw: string): string =>
  raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

const tryParseJson = <T,>(raw: string): T | null => {
  const cleaned = stripJsonFence(raw);
  const firstBrace = cleaned.search(/[{[]/);
  if (firstBrace === -1) return null;
  const trimmed = cleaned.slice(firstBrace);
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const lastClose = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (lastClose <= 0) return null;
    try {
      return JSON.parse(trimmed.slice(0, lastClose + 1)) as T;
    } catch {
      return null;
    }
  }
};

/**
 * Per-layout aspect ratio for image generation. Matches the slot dimensions
 * in the renderer (image-text uses ~50% width × ~70% height — closest to 1:1).
 */
const aspectForLayout = (layout: SlideLayout): string => {
  switch (layout) {
    case 'image-text':
      return '1:1';
    case 'title':
      return '16:9';
    default:
      return '4:3';
  }
};

const hashKey = (s: string): string =>
  crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

export interface RawFailureSink {
  capture(stage: string, raw: string, meta: Record<string, any>): void;
}

export interface GenerateDocParams {
  topic: string;
  audience?: string;
  durationMinutes?: number;
  numSlides?: number;
  themeId?: SlideThemeId;
  onSlideReady?: (index: number, slide: Slide) => void;
  failureSink?: RawFailureSink;
}

@Injectable()
export class PresentationGeneratorService {
  private readonly logger = new Logger(PresentationGeneratorService.name);

  /**
   * In-memory image URL cache.
   * Key = sha256(prompt + model + aspect). Value = remote URL from Replicate.
   * Replicate's URLs expire (typically 1 hour) — entries past TTL are evicted.
   * The cache pays off when (a) the same SlideDoc is regenerated quickly, or
   * (b) two slides happen to ask for the same illustration. Persistent
   * de-duplication across generations is the rehost-to-FilesService step in
   * the processor (separate concern).
   */
  private imageCache = new Map<string, { url: string; ts: number }>();
  private readonly IMAGE_CACHE_TTL_MS = 50 * 60 * 1000; // 50 min — under Replicate's URL expiry

  constructor(private readonly replicate: ReplicateService) {}

  async generate(params: GenerateDocParams): Promise<SlideDoc> {
    const numSlides = Math.max(3, Math.min(params.numSlides ?? 7, 15));

    const outline = await this.generateOutline(
      { topic: params.topic, audience: params.audience, durationMinutes: params.durationMinutes, numSlides },
      params.failureSink,
    );

    const themeId = params.themeId ?? outline.themeId;
    this.logger.log(
      `Outline ready: theme=${themeId}, ${outline.slides.length} slides`,
    );

    // Glossary pre-stage — pins terminology for cross-slide consistency.
    const glossary = await this.generateGlossary(
      params.topic,
      params.audience,
      outline,
      params.failureSink,
    );
    if (glossary.length) {
      this.logger.log(`Glossary fixed ${glossary.length} terms`);
    }

    const slides: Slide[] = await Promise.all(
      outline.slides.map(async (item, idx) => {
        const slide = await this.generateSlideContent(
          params.topic,
          params.audience,
          glossary,
          item,
          idx,
          outline.slides.length,
          params.failureSink,
        );
        params.onSlideReady?.(idx, slide);
        return slide;
      }),
    );

    await this.populateImages(slides, params.failureSink);

    return {
      version: 1,
      topic: params.topic,
      audience: params.audience,
      durationMinutes: params.durationMinutes,
      themeId,
      slides,
      createdAt: new Date().toISOString(),
    };
  }

  private async generateOutline(
    params: OutlineParams,
    sink?: RawFailureSink,
  ): Promise<PresentationOutline> {
    const prompt = `${PRESENTATION_SYSTEM_PROMPT}\n\n${buildOutlinePrompt(params)}`;
    const raw = await this.replicate.createCompletion(prompt, TEXT_MODEL, {
      max_tokens: 2048,
      temperature: 0.5,
    });

    const parsed = tryParseJson<PresentationOutline>(raw);
    if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      this.logger.error(`Outline parse failed. Raw preview: ${raw.slice(0, 500)}`);
      sink?.capture('outline', raw, { topic: params.topic });
      return this.fallbackOutline(params);
    }

    return {
      themeId: this.coerceTheme(parsed.themeId),
      topic: parsed.topic || params.topic,
      slides: parsed.slides
        .slice(0, params.numSlides)
        .map((s) => this.coerceOutlineItem(s)),
    };
  }

  private async generateGlossary(
    topic: string,
    audience: string | undefined,
    outline: PresentationOutline,
    sink?: RawFailureSink,
  ): Promise<Array<{ term: string; definition: string }>> {
    const prompt = `${PRESENTATION_SYSTEM_PROMPT}\n\n${buildGlossaryPrompt({
      topic,
      audience,
      slideTitles: outline.slides.map((s) => s.title),
    })}`;
    let raw = '';
    try {
      raw = await this.replicate.createCompletion(prompt, TEXT_MODEL, {
        max_tokens: 800,
        temperature: 0.3,
      });
    } catch (e: any) {
      this.logger.warn(`Glossary stage failed: ${e.message}. Continuing without glossary.`);
      return [];
    }
    const parsed = tryParseJson<{ terms: Array<{ term: string; definition: string }> }>(raw);
    if (!parsed?.terms?.length) {
      sink?.capture('glossary', raw, { topic });
      return [];
    }
    return parsed.terms
      .filter((t) => t?.term && t?.definition)
      .slice(0, 12)
      .map((t) => ({
        term: String(t.term).trim().slice(0, 80),
        definition: String(t.definition).trim().slice(0, 200),
      }));
  }

  private async generateSlideContent(
    topic: string,
    audience: string | undefined,
    glossary: Array<{ term: string; definition: string }>,
    outlineItem: SlideOutlineItem,
    index: number,
    total: number,
    sink?: RawFailureSink,
  ): Promise<Slide> {
    const prompt = `${PRESENTATION_SYSTEM_PROMPT}\n\n${buildSlideContentPrompt({
      topic,
      audience,
      outlineItem,
      index,
      total,
      glossary,
    })}`;

    const attempt = async (): Promise<Slide> => {
      const raw = await this.replicate.createCompletion(prompt, TEXT_MODEL, {
        max_tokens: 1500,
        temperature: 0.7,
      });
      const parsed = tryParseJson<{
        content: SlideContent;
        image?: SlideImageSpec;
        speakerNotes?: string;
      }>(raw);

      if (!parsed?.content?.title) {
        sink?.capture('slide-content', raw, { index, layout: outlineItem.layout });
        throw new Error('Slide content missing title');
      }

      const slide: Slide = {
        id: safeId('slide'),
        layout: outlineItem.layout,
        content: parsed.content,
        image: outlineItem.needsImage && parsed.image?.prompt ? parsed.image : undefined,
        speakerNotes: parsed.speakerNotes,
      };
      return validateSlide(slide);
    };

    try {
      return await attempt();
    } catch (e: any) {
      this.logger.warn(
        `Slide ${index + 1} content gen failed (${e.message}); retrying once.`,
      );
      try {
        return await attempt();
      } catch (e2: any) {
        this.logger.error(
          `Slide ${index + 1} content gen failed twice (${e2.message}); using fallback.`,
        );
        return this.fallbackSlide(outlineItem);
      }
    }
  }

  private async populateImages(slides: Slide[], sink?: RawFailureSink): Promise<void> {
    await Promise.all(
      slides.map(async (slide) => {
        if (!slide.image?.prompt) return;
        const aspect = aspectForLayout(slide.layout);
        const url = await this.fetchImageWithCache(slide.image.prompt, aspect, sink);
        if (url) {
          slide.image.url = url;
        } else {
          this.logger.warn(`No image URL for slide ${slide.id}; clearing image.`);
          slide.image = undefined;
        }
      }),
    );
  }

  private async fetchImageWithCache(
    prompt: string,
    aspect: string,
    sink?: RawFailureSink,
  ): Promise<string | null> {
    const now = Date.now();
    const key = hashKey(`${IMAGE_MODEL_PRIMARY}|${aspect}|${prompt}`);
    const hit = this.imageCache.get(key);
    if (hit && now - hit.ts < this.IMAGE_CACHE_TTL_MS) {
      return hit.url;
    }
    if (hit) this.imageCache.delete(key);

    // Try primary, then fallback. Both failures → null (slide will drop image).
    try {
      const url = await this.replicate.createImage(prompt, IMAGE_MODEL_PRIMARY, aspect);
      this.imageCache.set(key, { url, ts: now });
      return url;
    } catch (e1: any) {
      this.logger.warn(
        `Image (${IMAGE_MODEL_PRIMARY}) failed: ${e1.message}. Trying ${IMAGE_MODEL_FALLBACK}.`,
      );
      sink?.capture('image-primary', e1.message || String(e1), { prompt, aspect });
      try {
        const url = await this.replicate.createImage(prompt, IMAGE_MODEL_FALLBACK, aspect);
        // Cache fallback under same key — better than re-failing on primary next time.
        this.imageCache.set(key, { url, ts: now });
        return url;
      } catch (e2: any) {
        this.logger.error(
          `Image fallback (${IMAGE_MODEL_FALLBACK}) also failed: ${e2.message}.`,
        );
        sink?.capture('image-fallback', e2.message || String(e2), { prompt, aspect });
        return null;
      }
    }
  }

  private coerceTheme(id: any): SlideThemeId {
    return SLIDE_THEME_IDS.includes(id) ? id : 'indigo';
  }

  private coerceOutlineItem(s: any): SlideOutlineItem {
    const layout = SLIDE_LAYOUTS.includes(s?.layout) ? s.layout : 'bullets';
    return {
      layout,
      title: typeof s?.title === 'string' ? s.title : 'Слайд',
      needsImage: !!s?.needsImage,
      imageHint: typeof s?.imageHint === 'string' ? s.imageHint : undefined,
    };
  }

  private fallbackOutline(params: OutlineParams): PresentationOutline {
    const slides: SlideOutlineItem[] = [
      { layout: 'title', title: params.topic, needsImage: false },
      { layout: 'agenda', title: 'Цели урока', needsImage: false },
    ];
    const middle = Math.max(0, params.numSlides - 4);
    for (let i = 0; i < middle; i++) {
      slides.push({
        layout: 'bullets',
        title: `Часть ${i + 1}`,
        needsImage: false,
      });
    }
    slides.push({ layout: 'quiz', title: 'Проверь себя', needsImage: false });
    slides.push({ layout: 'summary', title: 'Итоги', needsImage: false });
    return { themeId: 'indigo', topic: params.topic, slides: slides.slice(0, params.numSlides) };
  }

  private fallbackSlide(outlineItem: SlideOutlineItem): Slide {
    return {
      id: safeId('slide'),
      layout: outlineItem.layout,
      content: {
        title: outlineItem.title,
        bullets: ['Содержимое слайда временно недоступно. Перегенерируйте слайд.'],
      },
    };
  }
}
