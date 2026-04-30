// Canonical SlideDoc schema — single source of truth for presentations.
//
// The same shape is rendered to HTML on the backend (for PDF export) and on
// the frontend (player + editor). LLM is asked to return JSON matching this
// schema via structured output, NOT raw HTML strings.
//
// Backend mirror: backend/src/modules/generations/presentation/slide-doc.types.ts
// Frontend mirror: frontend/src/types/slide-doc.ts

export type SlideThemeId = 'indigo' | 'emerald' | 'violet' | 'blue' | 'slate';

export type SlideLayout =
  | 'title'        // big title + subtitle (cover slide)
  | 'agenda'       // bulleted list, no image
  | 'bullets'      // headline + bulleted body
  | 'two-column'   // left text / right text
  | 'image-text'   // left image / right text
  | 'quote'        // pull-quote / definition
  | 'quiz'         // question + options
  | 'summary';     // recap / homework

export interface SlideImageSpec {
  prompt: string;        // English prompt for image model
  url?: string;          // populated after image generation
  alt?: string;
}

export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets?: string[];
  paragraph?: string;
  leftColumn?: { heading?: string; bullets?: string[]; paragraph?: string };
  rightColumn?: { heading?: string; bullets?: string[]; paragraph?: string };
  quote?: { text: string; attribution?: string };
  quiz?: { question: string; options: string[]; answerIndex: number };
  math?: string[];       // LaTeX snippets, rendered alongside body
  footnote?: string;
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  content: SlideContent;
  image?: SlideImageSpec;
  speakerNotes?: string;
}

export interface SlideDoc {
  version: 1;
  topic: string;
  audience?: string;
  durationMinutes?: number;
  themeId: SlideThemeId;
  slides: Slide[];
  createdAt: string;
}

// Outline returned by the first LLM pass — cheap, fast, lets UI show progress.
export interface SlideOutlineItem {
  layout: SlideLayout;
  title: string;
  needsImage: boolean;
  imageHint?: string;
}

export interface PresentationOutline {
  themeId: SlideThemeId;
  topic: string;
  slides: SlideOutlineItem[];
}
