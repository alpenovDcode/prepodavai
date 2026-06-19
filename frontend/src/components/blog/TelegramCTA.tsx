'use client'

import { trackGoal } from '@/lib/analytics'

export default function TelegramCTA({ text = 'Подписаться на канал' }: { text?: string }) {
  return (
    <div style={{
      margin: '40px 0', padding: '28px 32px',
      background: 'linear-gradient(135deg, #e8f4fd 0%, #dbeeff 100%)',
      border: '1.5px solid #bae6fd', borderRadius: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 20, flexWrap: 'wrap',
      position: 'relative', overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -30, right: -30,
        width: 140, height: 140,
        background: 'radial-gradient(circle, rgba(0,136,204,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, background: '#0088cc',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0, boxShadow: '0 4px 14px rgba(0,136,204,0.3)',
        }}>✈️</div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#0c4a6e', lineHeight: 1.3 }}>
            Telegram-канал Преподавай
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#075985', lineHeight: 1.4 }}>
            Методика, инструменты и истории из практики — раз в неделю
          </p>
        </div>
      </div>
      <a
        href="https://t.me/+vKbOpx63gzA3ZGMy"
        target="_blank" rel="noopener noreferrer"
        onClick={() => trackGoal('cta_telegram_click')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '11px 22px', background: '#0088cc', color: 'white',
          borderRadius: 11, textDecoration: 'none',
          fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(0,136,204,0.32)',
        }}
      >
        {text} →
      </a>
    </div>
  )
}
