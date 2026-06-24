#!/usr/bin/env node
// Пинг IndexNow для новых/обновлённых URL блога.
// Поддерживается Яндексом, Bing, Seznam, Naver, Yep. Google НЕ поддерживает —
// для Google полагаемся на sitemap.xml + ручной "Запросить индексирование" в Search Console.
//
// Использование:
//   npm run indexnow                — пингует все статьи блога + /blog
//   npm run indexnow -- /custom/url — пингует один конкретный URL
//
// Запускать после деплоя прода. Повторные пинги безвредны.

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const HOST = 'prepodavai.ru'
const BASE_URL = `https://${HOST}`
const KEY = '146c3b553d0cd25104bfefd668927d18'
const KEY_LOCATION = `${BASE_URL}/${KEY}.txt`
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

function getBlogUrls() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.warn(`[indexnow] ${BLOG_DIR} не найден — пингую только /blog`)
    return [`${BASE_URL}/blog`]
  }
  const slugs = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.mdx'))
    .map(f => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, f), 'utf-8')
      const { data } = matter(raw)
      return data.slug || f.replace('.mdx', '')
    })
  return [
    `${BASE_URL}/blog`,
    ...slugs.map(s => `${BASE_URL}/blog/${s}`),
  ]
}

async function ping(urls) {
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  }
  console.log(`[indexnow] Отправляю ${urls.length} URL в ${ENDPOINT}`)
  urls.forEach(u => console.log(`  → ${u}`))

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })

  // IndexNow: 200 = принято, 202 = принято с задержкой валидации ключа,
  // 400 = bad request, 403 = ключ не валиден, 422 = url не принадлежит хосту, 429 = throttling
  const text = await res.text().catch(() => '')
  if (res.status === 200 || res.status === 202) {
    console.log(`[indexnow] OK (HTTP ${res.status}) — Яндекс/Bing получили URL, обход в течение минут/часов`)
    return
  }
  console.error(`[indexnow] FAIL HTTP ${res.status}: ${text || '(пустой ответ)'}`)
  process.exit(1)
}

const argUrl = process.argv[2]
const urls = argUrl
  ? [argUrl.startsWith('http') ? argUrl : `${BASE_URL}${argUrl.startsWith('/') ? '' : '/'}${argUrl}`]
  : getBlogUrls()

if (!urls.length) {
  console.error('[indexnow] Нет URL для отправки')
  process.exit(1)
}

ping(urls).catch(err => {
  console.error('[indexnow] Exception:', err)
  process.exit(1)
})
