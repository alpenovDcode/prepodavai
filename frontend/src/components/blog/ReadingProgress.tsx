'use client'

import { useEffect, useRef, useState } from 'react'
import { trackGoal } from '@/lib/analytics'

const SCROLL_MILESTONES = [25, 50, 75, 90, 100]

export default function ReadingProgress({ slug }: { slug: string }) {
  const [progress, setProgress] = useState(0)
  const reachedRef = useRef<Set<number>>(new Set())
  const startRef = useRef<number>(Date.now())

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement
      const pct = el.scrollHeight - el.clientHeight > 0
        ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
        : 0

      setProgress(pct)

      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !reachedRef.current.has(m)) {
          reachedRef.current.add(m)
          trackGoal(`article_scroll_${m}`, { slug })
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [slug])

  // Время на странице при уходе
  useEffect(() => {
    const onUnload = () => {
      const sec = Math.round((Date.now() - startRef.current) / 1000)
      const maxScroll = Math.max(...Array.from(reachedRef.current), 0)

      if (sec >= 300) trackGoal('article_time_5min', { slug, seconds: sec })
      else if (sec >= 120) trackGoal('article_time_2min', { slug, seconds: sec })
      else if (sec >= 60)  trackGoal('article_time_1min', { slug, seconds: sec })
      else if (sec >= 30)  trackGoal('article_time_30s',  { slug, seconds: sec })

      // Дочитал до конца = скролл 90%+ и провёл 60+ сек
      if (maxScroll >= 90 && sec >= 60) {
        trackGoal('article_finished', { slug })
      }
    }

    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [slug])

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0,
        zIndex: 100, height: 3,
        width: `${progress}%`,
        background: 'linear-gradient(90deg, #f97316, #ea580c)',
        transition: 'width 0.1s linear',
        borderRadius: '0 2px 2px 0',
      }}
    />
  )
}
