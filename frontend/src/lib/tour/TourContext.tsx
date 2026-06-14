'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { TourStep, TourConfig } from './types'
import { TOUR_CONFIGS, matchTourConfig } from './tourSteps'

interface TourContextValue {
  isActive: boolean
  currentStep: TourStep | null
  stepIdx: number
  totalSteps: number
  config: TourConfig | null
  hasConfig: boolean
  start: () => void
  end: (completed?: boolean) => void
  next: () => void
  prev: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isActive, setIsActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [config, setConfig] = useState<TourConfig | null>(null)

  // Refs for stable callbacks
  const configRef = useRef<TourConfig | null>(null)
  const stepIdxRef = useRef(0)
  configRef.current = config
  stepIdxRef.current = stepIdx

  // Stable end — no external deps, uses refs
  // Всегда пишем storageKey, чтобы тур не стартовал повторно при следующем заходе
  const end = useCallback((_completed?: boolean) => {
    setIsActive(false)
    if (configRef.current) {
      try { localStorage.setItem(configRef.current.storageKey, '1') } catch {}
    }
  }, [])

  const next = useCallback(() => {
    const cfg = configRef.current
    if (!cfg) return
    if (stepIdxRef.current >= cfg.steps.length - 1) {
      end(true)
    } else {
      setStepIdx(i => i + 1)
    }
  }, [end])

  const prev = useCallback(() => {
    if (stepIdxRef.current > 0) setStepIdx(i => i - 1)
  }, [])

  const start = useCallback(() => {
    if (!configRef.current) return
    setIsActive(true)
    setStepIdx(0)
  }, [])

  // Pathname change: reset tour, pick config, autostart
  useEffect(() => {
    setIsActive(false)
    setStepIdx(0)

    const key = matchTourConfig(pathname)
    const cfg = key ? TOUR_CONFIGS[key] ?? null : null
    setConfig(cfg)

    if (!cfg || cfg.autostart === false) return

    let visited = false
    try { visited = !!localStorage.getItem(cfg.storageKey) } catch {}
    if (visited) return

    const timer = setTimeout(() => {
      setIsActive(true)
      setStepIdx(0)
    }, 800)
    return () => clearTimeout(timer)
  }, [pathname])

  // Keyboard shortcuts when tour is active
  useEffect(() => {
    if (!isActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { end(false) }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { next() }
      else if (e.key === 'ArrowLeft') { prev() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isActive, end, next, prev])

  const currentStep = config ? (config.steps[stepIdx] ?? null) : null

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      stepIdx,
      totalSteps: config?.steps.length ?? 0,
      config,
      hasConfig: !!config,
      start,
      end,
      next,
      prev,
    }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTourContext(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTourContext must be inside TourProvider')
  return ctx
}
