// Mirror of shared/types/presentation.ts. Keep in sync with
// backend/src/modules/generations/presentation/slide-doc.types.ts.

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

export interface SlideTheme {
  id: SlideThemeId;
  label: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  border: string;
}

export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
  indigo: {
    id: 'indigo',
    label: 'Математика / IT',
    bg: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#4f46e5',
    accentSoft: 'rgba(79,70,229,0.10)',
    border: '#e2e8f0',
  },
  emerald: {
    id: 'emerald',
    label: 'Естественные науки',
    bg: '#ffffff',
    surface: '#f0fdf4',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#059669',
    accentSoft: 'rgba(5,150,105,0.10)',
    border: '#dcfce7',
  },
  violet: {
    id: 'violet',
    label: 'Гуманитарные',
    bg: '#ffffff',
    surface: '#faf5ff',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#7c3aed',
    accentSoft: 'rgba(124,58,237,0.10)',
    border: '#ede9fe',
  },
  blue: {
    id: 'blue',
    label: 'История / Общее',
    bg: '#ffffff',
    surface: '#eff6ff',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#2563eb',
    accentSoft: 'rgba(37,99,235,0.10)',
    border: '#dbeafe',
  },
  slate: {
    id: 'slate',
    label: 'Нейтральная',
    bg: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#334155',
    accentSoft: 'rgba(51,65,85,0.10)',
    border: '#e2e8f0',
  },
};

export const pickSlideTheme = (id?: string): SlideTheme =>
  (id && id in SLIDE_THEMES ? SLIDE_THEMES[id as SlideThemeId] : SLIDE_THEMES.indigo);
