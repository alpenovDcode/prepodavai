'use client'

import { trackGoal } from '@/lib/analytics'

export default function RegisterCTA({ text = 'Начать бесплатно' }: { text?: string }) {
  return (
    <div style={{
      margin: '40px 0', padding: '32px 36px',
      background: 'linear-gradient(135deg, #1a120c 0%, #2c1a0e 100%)',
      borderRadius: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 20, flexWrap: 'wrap',
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 16px 40px rgba(20,16,12,0.18)',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -40, right: -40,
        width: 180, height: 180,
        background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>🚀</span>
          <p style={{ margin: 0, color: 'white', fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>
            ПреподавAI — бесплатно
          </p>
        </div>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.5, paddingLeft: 34 }}>
          11 инструментов для подготовки урока · 1000+ преподавателей
        </p>
      </div>
      <a
        href="https://prepodavai.ru/?auth=register"
        onClick={() => trackGoal('cta_register_click')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '13px 26px',
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          color: 'white', borderRadius: 12,
          textDecoration: 'none', fontWeight: 700, fontSize: 15,
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(249,115,22,0.44)',
        }}
      >
        {text} →
      </a>
    </div>
  )
}
