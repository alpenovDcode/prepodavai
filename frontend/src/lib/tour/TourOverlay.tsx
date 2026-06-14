'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTourContext } from './TourContext'

const TOUR_CSS = `
  .tour-overlay { position: fixed; inset: 0; z-index: 9998; pointer-events: none; }
  .tour-overlay.is-active { pointer-events: auto; }
  .tour-overlay-bg { position: absolute; inset: 0; background: rgba(15,12,8,0); transition: background .35s ease; pointer-events: none; }
  .tour-overlay.is-active .tour-overlay-bg { background: rgba(15,12,8,.55); pointer-events: auto; }
  .tour-spotlight {
    position: fixed; pointer-events: none; z-index: 9999;
    border-radius: 14px;
    box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 9999px rgba(15,12,8,0);
    transition: top .4s cubic-bezier(.22,1,.36,1), left .4s cubic-bezier(.22,1,.36,1),
                width .4s cubic-bezier(.22,1,.36,1), height .4s cubic-bezier(.22,1,.36,1),
                box-shadow .35s ease;
  }
  .tour-overlay.is-active .tour-spotlight {
    box-shadow: 0 0 0 4px rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6);
    animation: tourPulse 2.2s ease-out infinite;
  }
  @keyframes tourPulse {
    0%   { box-shadow: 0 0 0 4px  rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6); }
    50%  { box-shadow: 0 0 0 10px rgba(249,115,22,.15), 0 0 0 9999px rgba(15,12,8,.6); }
    100% { box-shadow: 0 0 0 4px  rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6); }
  }
  .tour-tooltip {
    position: fixed; z-index: 10000;
    background: white; border-radius: 18px;
    box-shadow: 0 24px 64px rgba(0,0,0,.22), 0 4px 12px rgba(0,0,0,.08);
    padding: 22px 24px 18px;
    width: 380px; max-width: calc(100vw - 32px);
    font-family: 'Inter', system-ui, sans-serif;
    transition: opacity .3s ease, top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1);
    opacity: 0; pointer-events: none;
  }
  .tour-tooltip.is-visible { opacity: 1; pointer-events: auto; }
  .tour-tooltip.is-modal { width: 460px; padding: 36px 32px 28px; text-align: center; }
  .tour-step-label { font-size: 11px; font-weight: 700; color: #f97316; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
  .tour-tooltip h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px; color: #1a120c; line-height: 1.25; }
  .tour-tooltip.is-modal h3 { font-size: 24px; }
  .tour-tooltip p { font-size: 14px; color: #666; line-height: 1.6; margin: 0 0 16px; }
  .tour-tooltip.is-modal p { font-size: 15.5px; }
  .tour-illustration { font-size: 52px; text-align: center; margin-bottom: 8px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(249,115,22,.3)); }
  .tour-progress { height: 4px; background: #f3f0ec; border-radius: 99px; overflow: hidden; margin-bottom: 14px; }
  .tour-progress-bar { height: 100%; background: linear-gradient(90deg, #f97316, #f59e0b); border-radius: 99px; transition: width .4s cubic-bezier(.22,1,.36,1); }
  .tour-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .tour-tooltip.is-modal .tour-actions { justify-content: center; }
  .tour-btn { border: none; cursor: pointer; font-family: inherit; border-radius: 10px; padding: 10px 22px; font-weight: 700; font-size: 14px; transition: transform .15s ease, box-shadow .15s ease; }
  .tour-btn-primary { background: #f97316; color: white; box-shadow: 0 4px 14px rgba(249,115,22,.32); }
  .tour-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(249,115,22,.4); }
  .tour-tooltip.is-modal .tour-btn-primary { padding: 13px 32px; font-size: 15px; }
  .tour-btn-ghost { background: transparent; color: #888; font-weight: 500; padding: 8px 14px; font-size: 13px; }
  .tour-btn-ghost:hover { color: #1a120c; }
  .tour-close { position: absolute; top: 12px; right: 14px; background: none; border: none; cursor: pointer; color: #ccc; font-size: 22px; line-height: 1; padding: 4px; }
  .tour-close:hover { color: #888; }
  .tour-tooltip.is-modal .tour-close { display: none; }
`

function positionTooltip(
  rect: DOMRect | null,
  placement: string,
  tipW: number,
  tipH: number,
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 16

  if (!rect) {
    return { top: Math.max(24, (vh - tipH) / 2), left: Math.max(24, (vw - tipW) / 2) }
  }

  let top = 0, left = 0
  switch (placement) {
    case 'top':    top = rect.top - tipH - gap;               left = rect.left + rect.width / 2 - tipW / 2; break
    case 'bottom': top = rect.top + rect.height + gap;         left = rect.left + rect.width / 2 - tipW / 2; break
    case 'left':   top = rect.top + rect.height / 2 - tipH / 2; left = rect.left - tipW - gap; break
    default:       top = rect.top + rect.height / 2 - tipH / 2; left = rect.left + rect.width + gap; break
  }

  return {
    top:  Math.max(16, Math.min(top,  vh - tipH - 16)),
    left: Math.max(16, Math.min(left, vw - tipW - 16)),
  }
}

export function TourOverlay() {
  const { isActive, currentStep, stepIdx, totalSteps, config, end, next, prev } = useTourContext()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [spotStyle, setSpotStyle] = useState<React.CSSProperties>({ display: 'none' })
  const [tipStyle, setTipStyle] = useState<React.CSSProperties>({ top: 0, left: 0 })
  const [scrollTick, setScrollTick] = useState(0)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
    if (!document.getElementById('tour-overlay-css')) {
      const s = document.createElement('style')
      s.id = 'tour-overlay-css'
      s.textContent = TOUR_CSS
      document.head.appendChild(s)
    }
  }, [])

  const doPosition = useCallback(() => {
    if (!currentStep) return
    const isModal = 'isModal' in currentStep

    let rect: DOMRect | null = null

    if (!isModal && 'target' in currentStep && currentStep.target) {
      const el = document.querySelector<HTMLElement>(currentStep.target)
      if (el) {
        const r = el.getBoundingClientRect()
        const pad = ('padding' in currentStep ? currentStep.padding : undefined) ?? 8
        setSpotStyle({ display: 'block', top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
        rect = r
      } else {
        setSpotStyle({ display: 'none' })
      }
    } else {
      setSpotStyle({ display: 'none' })
    }

    const placement = !isModal && 'placement' in currentStep ? (currentStep.placement ?? 'right') : 'right'
    const tipW = isModal ? 460 : 380
    const tipH = tooltipRef.current?.offsetHeight ?? 220

    const pos = positionTooltip(rect, placement, tipW, tipH)
    setTipStyle({ top: pos.top, left: pos.left })
    setVisible(true)

    requestAnimationFrame(() => {
      if (!tooltipRef.current) return
      const fixedPos = positionTooltip(rect, placement, tipW, tooltipRef.current.offsetHeight)
      setTipStyle({ top: fixedPos.top, left: fixedPos.left })
    })
  }, [currentStep])

  useEffect(() => {
    if (!isActive || !currentStep) { setVisible(false); return }
    if (scrollTimerRef.current) { clearTimeout(scrollTimerRef.current); scrollTimerRef.current = null }
    setVisible(false)

    const isModal = 'isModal' in currentStep
    if (!isModal && 'target' in currentStep && currentStep.target) {
      const el = document.querySelector<HTMLElement>(currentStep.target)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.bottom < 20 || r.top > window.innerHeight - 20) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          scrollTimerRef.current = setTimeout(() => { scrollTimerRef.current = null; setScrollTick(t => t + 1) }, 420)
          return
        }
      }
    }
    doPosition()
  }, [isActive, stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollTick > 0) doPosition()
  }, [scrollTick, doPosition])

  useEffect(() => {
    if (!isActive) return
    let raf = 0
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { doPosition(); raf = 0 }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', doPosition)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', doPosition); if (raf) cancelAnimationFrame(raf) }
  }, [isActive, doPosition])

  if (!mounted || !isActive || !currentStep) return null

  const isModal = 'isModal' in currentStep
  const isFirst = stepIdx === 0
  const isLast  = stepIdx === totalSteps - 1

  // Progress: count only non-modal steps
  const allSteps   = config?.steps ?? []
  const nonModalTotal = allSteps.filter(s => !('isModal' in s)).length
  const nonModalIdx   = allSteps.slice(0, stepIdx + 1).filter(s => !('isModal' in s)).length

  const illustration  = 'illustration' in currentStep ? currentStep.illustration : undefined
  const primaryLabel  = 'primaryLabel' in currentStep ? currentStep.primaryLabel : undefined

  return createPortal(
    <div className="tour-overlay is-active">
      <div className="tour-overlay-bg" onClick={() => end(false)} />
      <div className="tour-spotlight" style={spotStyle} />
      <div
        ref={tooltipRef}
        className={`tour-tooltip${isModal ? ' is-modal' : ''}${visible ? ' is-visible' : ''}`}
        style={tipStyle}
      >
        {!isModal && (
          <button className="tour-close" aria-label="Закрыть" onClick={() => end(false)}>×</button>
        )}

        {!isModal && nonModalTotal > 0 && (
          <div className="tour-step-label">Шаг {nonModalIdx} из {nonModalTotal}</div>
        )}

        {illustration && <div className="tour-illustration">{illustration}</div>}

        <h3>{currentStep.title}</h3>
        <p>{currentStep.body}</p>

        {!isModal && nonModalTotal > 0 && (
          <div className="tour-progress">
            <div className="tour-progress-bar" style={{ width: `${(nonModalIdx / nonModalTotal) * 100}%` }} />
          </div>
        )}

        <div className="tour-actions">
          {!isModal && (
            <button className="tour-btn tour-btn-ghost" onClick={isFirst ? () => end(false) : prev}>
              {isFirst ? 'Пропустить — я разберусь' : '← Назад'}
            </button>
          )}
          <button className="tour-btn tour-btn-primary" onClick={next}>
            {primaryLabel ?? (isLast ? 'Готово' : 'Дальше →')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
