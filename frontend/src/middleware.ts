import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge-middleware: маршрутизация на уровне Next.js до того, как запрос
 * попадёт в страницу или API-роут.
 *
 * Главная цель — публичные smart-link redirects вида prepodavai.ru/g/<slug>:
 *
 * Раньше это работало через `rewrites()` в next.config.js — Next.js Node
 * проксировал запрос на api.prepodavai.ru/api/g/<slug> и стримил ответ
 * обратно. Проблема: при cross-origin destination Node-runtime внутри
 * Next.js по дефолту СЛЕДУЕТ за 302 (fetch redirect:'follow'), хватает
 * HTML-превью https://t.me/<bot> (без ?start=... — оно стирается на
 * странице превью!) и отдаёт его юзеру. До бота start-payload не доходит.
 *
 * Фикс: middleware возвращает Edge-redirect 307 → браузер сам ходит на
 * api.prepodavai.ru/api/g/<slug>, тот 302-редиректит на t.me с правильным
 * start, телега открывает бота с токеном.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (pathname.startsWith('/g/')) {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    // backend mounted под global prefix 'api'
    const target = `${apiBase}/api${pathname}${search}`
    // 307 = Temporary Redirect (сохраняет метод и тело; GET остаётся GET).
    // Используем absolute URL, чтобы браузер пошёл напрямую на api-домен.
    return NextResponse.redirect(target, 307)
  }
}

export const config = {
  // Скопировать matcher из next.config (см. rewrites). Это значительно
  // быстрее, чем матчить всё подряд: middleware вызывается только на /g/*.
  matcher: ['/g/:slug*'],
}
