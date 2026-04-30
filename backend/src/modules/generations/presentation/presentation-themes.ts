import { SlideThemeId } from './slide-doc.types';

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

export const PRESENTATION_THEMES: Record<SlideThemeId, SlideTheme> = {
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

export function pickTheme(id?: string): SlideTheme {
  if (id && id in PRESENTATION_THEMES) return PRESENTATION_THEMES[id as SlideThemeId];
  return PRESENTATION_THEMES.indigo;
}
