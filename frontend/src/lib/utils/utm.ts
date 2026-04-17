/**
 * UTM-трекинг: захват параметров из URL и хранение в localStorage.
 * Вызывается один раз при загрузке приложения.
 */

export interface UtmParams {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  utmLandingPage?: string;
  utmLinkId?: string;
}

const STORAGE_KEY = 'prepodavai_utm';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

interface StoredUtm {
  params: UtmParams;
  capturedAt: number;
}

/** Захватить UTM из текущего URL и сохранить в localStorage */
export function captureUtm(): void {
  if (typeof window === 'undefined') return;

  const search = new URLSearchParams(window.location.search);
  const source = search.get('utm_source');
  if (!source) return; // Нет UTM — не перезаписываем существующие

  const params: UtmParams = {
    utmSource: source,
    utmMedium: search.get('utm_medium') ?? undefined,
    utmCampaign: search.get('utm_campaign') ?? undefined,
    utmContent: search.get('utm_content') ?? undefined,
    utmTerm: search.get('utm_term') ?? undefined,
    utmLandingPage: window.location.pathname,
    utmLinkId: search.get('lid') ?? undefined,
  };

  const stored: StoredUtm = { params, capturedAt: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch { /* localStorage недоступен */ }
}

/** Получить сохранённые UTM-параметры (или null если нет / истёк TTL) */
export function getStoredUtm(): UtmParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored: StoredUtm = JSON.parse(raw);
    if (Date.now() - stored.capturedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored.params;
  } catch {
    return null;
  }
}

/** Очистить UTM после успешной регистрации */
export function clearUtm(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
