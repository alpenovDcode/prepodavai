import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = 'Блог Преподавай — методика и инструменты для репетиторов'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f8f8f6',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 65%)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              color: 'white',
              fontWeight: 800,
              fontSize: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(249,115,22,0.35)',
            }}
          >
            П
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a120c' }}>
            Преподавай
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1 }}>📚</div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: '#1a120c',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            Блог Преподавай
          </div>
          <div style={{ fontSize: 28, color: '#555', lineHeight: 1.4, maxWidth: 980 }}>
            Методика, инструменты и истории репетиторов. Как вести учеников, готовиться к урокам и не выгорать.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 20,
            color: '#888',
          }}
        >
          <div>prepodavai.ru/blog</div>
          <div style={{ fontWeight: 600, color: '#f97316' }}>Все статьи →</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
