// Mirror of shared/types/presentation.ts (backend tsconfig has rootDir: src,
// so we duplicate rather than reach outside). Keep in sync.

export type SlideThemeId = 'indigo' | 'emerald' | 'violet' | 'blue' | 'slate';

export type SlideLayout =
  | 'title'
  | 'agenda'
  | 'bullets'
  | 'two-column'
  | 'image-text'
  | 'quote'
  | 'quiz'
  | 'summary';

export interface SlideImageSpec {
  prompt: string;
  url?: string;
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
  math?: string[];
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

export const SLIDE_LAYOUTS: SlideLayout[] = [
  'title',
  'agenda',
  'bullets',
  'two-column',
  'image-text',
  'quote',
  'quiz',
  'summary',
];

export const SLIDE_THEME_IDS: SlideThemeId[] = ['indigo', 'emerald', 'violet', 'blue', 'slate'];
