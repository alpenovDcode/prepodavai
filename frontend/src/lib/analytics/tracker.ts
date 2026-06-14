/**
 * Клиентский tracker для воронок.
 *
 * Что делает:
 *   1. При первом визите создаёт `anonId` в cookie (живёт 365 дней).
 *   2. При первом landing захватывает UTM из query string и сохраняет в sessionStorage —
 *      используется во всех событиях сессии.
 *   3. Шлёт события на бэк в `POST /analytics/track` или батчем в `/analytics/track/batch`.
 *   4. Использует `sendBeacon` при unload — события не теряются при закрытии вкладки.
 *
 * Использование:
 *   import { track } from '@/lib/analytics/tracker'
 *   track('click', { eventName: 'cta_register', payload: { variant: 'A' } })
 *
 * Автоматический page_view — через <AnalyticsProvider> в root layout.
 */

import { apiClient } from '@/lib/api/client'

const ANON_COOKIE = 'prpd_anon'
const UTM_KEY = 'prpd_utm_v1'
const SESSION_KEY = 'prpd_sid_v1'
const QUEUE_KEY = 'prpd_q_v1'

/** На сколько дней хранится anonId. */
const ANON_TTL_DAYS = 365

export interface TrackEvent {
    eventType: string
    eventName?: string
    payload?: Record<string, any>
}

interface SerializedEvent extends TrackEvent {
    anonId?: string | null
    sessionId?: string | null
    utmSource?: string | null
    utmMedium?: string | null
    utmCampaign?: string | null
    utmContent?: string | null
    utmTerm?: string | null
}

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days: number) {
    if (typeof document === 'undefined') return
    const expires = new Date(Date.now() + days * 86400 * 1000).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

// ─── anonId ────────────────────────────────────────────────────────────────────

/**
 * Возвращает текущий anonId или создаёт новый. Идемпотентно — одинаковый
 * результат на одном устройстве в течение года.
 */
export function getAnonId(): string {
    if (typeof window === 'undefined') return ''
    let id = getCookie(ANON_COOKIE)
    if (!id) {
        id = 'a_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
        setCookie(ANON_COOKIE, id, ANON_TTL_DAYS)
    }
    return id
}

/**
 * Возвращает sessionId — живёт один день в sessionStorage. Сбрасывается при
 * закрытии вкладки. Нужен для bounce-rate расчётов.
 */
export function getSessionId(): string {
    if (typeof window === 'undefined') return ''
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
        sid = 's_' + Math.random().toString(36).slice(2, 10)
        sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
}

// ─── UTM capture ───────────────────────────────────────────────────────────────

interface CapturedUtm {
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmContent?: string
    utmTerm?: string
}

/**
 * Захватывает UTM из текущего URL и сохраняет в sessionStorage. Если в URL UTM
 * нет — оставляет сохранённый (важно при переходах внутри сайта без UTM).
 */
export function captureUtm(): CapturedUtm {
    if (typeof window === 'undefined') return {}
    let stored: CapturedUtm = {}
    try {
        const raw = sessionStorage.getItem(UTM_KEY)
        if (raw) stored = JSON.parse(raw)
    } catch { /* ignore */ }

    const params = new URLSearchParams(window.location.search)
    const fresh: CapturedUtm = {
        utmSource:   params.get('utm_source')   ?? stored.utmSource,
        utmMedium:   params.get('utm_medium')   ?? stored.utmMedium,
        utmCampaign: params.get('utm_campaign') ?? stored.utmCampaign,
        utmContent:  params.get('utm_content')  ?? stored.utmContent,
        utmTerm:     params.get('utm_term')     ?? stored.utmTerm,
    }
    // Сохраняем только если что-то есть.
    if (Object.values(fresh).some(v => v)) {
        try { sessionStorage.setItem(UTM_KEY, JSON.stringify(fresh)) } catch { /* over quota */ }
    }
    return fresh
}

function getCurrentUtm(): CapturedUtm {
    if (typeof window === 'undefined') return {}
    try {
        const raw = sessionStorage.getItem(UTM_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch { return {} }
}

// ─── Outgoing queue ────────────────────────────────────────────────────────────

/**
 * Буфер событий, который скидывается батчем раз в 2 секунды
 * или при `beforeunload` / `pagehide` через sendBeacon.
 */
let queue: SerializedEvent[] = []
let flushTimer: any = null

function loadQueue() {
    if (typeof window === 'undefined') return
    try {
        const raw = sessionStorage.getItem(QUEUE_KEY)
        if (raw) queue = JSON.parse(raw)
    } catch { /* ignore */ }
}

function persistQueue() {
    if (typeof window === 'undefined') return
    try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch { /* ignore */ }
}

async function flushNow(): Promise<void> {
    if (!queue.length) return
    const batch = queue.splice(0, queue.length)
    persistQueue()
    try {
        await apiClient.post('/analytics/track/batch', { events: batch })
    } catch {
        // Возвращаем в очередь, чтобы попробовать позже. Но если очередь уже большая —
        // обрезаем, чтобы не съесть всю память.
        queue = [...batch.slice(-50), ...queue].slice(0, 100)
        persistQueue()
    }
}

function scheduleFlush() {
    if (typeof window === 'undefined') return
    if (flushTimer) return
    flushTimer = setTimeout(() => {
        flushTimer = null
        flushNow()
    }, 2000)
}

/**
 * Шлёт всю очередь синхронно через sendBeacon перед закрытием вкладки.
 * navigator.sendBeacon переживает unload, в отличие от обычного fetch.
 */
function flushBeacon() {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon || !queue.length) return
    const base = (apiClient.defaults.baseURL || '').replace(/\/$/, '')
    const url = `${base}/analytics/track/batch`
    const blob = new Blob([JSON.stringify({ events: queue })], { type: 'application/json' })
    try {
        navigator.sendBeacon(url, blob)
        queue = []
        persistQueue()
    } catch { /* ignore */ }
}

// Инициализация: один раз при первом импорте.
let initialized = false
function ensureInit() {
    if (initialized || typeof window === 'undefined') return
    initialized = true
    loadQueue()
    captureUtm() // зафиксировать UTM из текущего URL
    getAnonId()  // создать cookie если нет

    window.addEventListener('beforeunload', flushBeacon)
    // pagehide надёжнее, чем beforeunload, на мобильных Safari.
    window.addEventListener('pagehide', flushBeacon)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushBeacon()
    })
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Основная функция трекинга. Идемпотентная по вызовам — событие добавляется
 * в очередь и шлётся батчем.
 */
export function track(eventType: string, opts: Omit<TrackEvent, 'eventType'> = {}) {
    if (typeof window === 'undefined') return
    ensureInit()
    const utm = getCurrentUtm()
    queue.push({
        eventType,
        eventName: opts.eventName,
        payload: opts.payload,
        anonId: getAnonId(),
        sessionId: getSessionId(),
        utmSource: utm.utmSource,
        utmMedium: utm.utmMedium,
        utmCampaign: utm.utmCampaign,
        utmContent: utm.utmContent,
        utmTerm: utm.utmTerm,
    })
    persistQueue()
    scheduleFlush()
}

/**
 * Шлём флаш немедленно — например после клика на «Зарегистрироваться»,
 * чтобы событие click точно ушло до редиректа.
 */
export function flush() {
    return flushNow()
}

/**
 * Хук для очистки UTM. Вызывать после успешной регистрации, чтобы при следующем
 * визите без новых UTM не атрибуцировать старому источнику навечно.
 */
export function clearUtm() {
    if (typeof window === 'undefined') return
    try { sessionStorage.removeItem(UTM_KEY) } catch { /* ignore */ }
}
