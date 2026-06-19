'use client'

import { trackGoal } from '@/lib/analytics'

export default function BotCTA({ text = 'Попробовать ИИ-бота' }: { text?: string }) {
  return (
    <div style={{
      margin: '40px 0', padding: '28px 32px',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      border: '1.5px solid #bbf7d0', borderRadius: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 20, flexWrap: 'wrap',
      position: 'relative', overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -30, right: -30,
        width: 140, height: 140,
        background: 'radial-gradient(circle, rgba(34,197,94,0.14) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, background: '#22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0, boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
        }}>🤖</div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#14532d', lineHeight: 1.3 }}>
            ИИ-бот в Telegram
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#166534', lineHeight: 1.4 }}>
            Генерирует материалы прямо в мессенджере. Без регистрации.
          </p>
        </div>
      </div>
      <a
        href="https://t.me/prepodavai_bot"
        target="_blank" rel="noopener noreferrer"
        onClick={() => trackGoal('cta_bot_click')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '11px 22px', background: '#22c55e', color: 'white',
          borderRadius: 11, textDecoration: 'none',
          fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(34,197,94,0.34)',
        }}
      >
        {text} →
      </a>
    </div>
  )
}
