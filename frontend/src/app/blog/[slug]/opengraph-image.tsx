import { ImageResponse } from 'next/og'
import { getPostBySlug } from '@/lib/blog'

export const runtime = 'nodejs'
export const alt = 'Преподавай — блог для репетиторов'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  const title = post?.title ?? 'Преподавай'
  const description = post?.description ?? 'Сервис для репетиторов с ИИ'
  const emoji = post?.emoji ?? '📚'
  const category = post?.category ?? 'Блог'
  const accent = post?.accent ?? '#f97316'

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
        {/* Accent blob */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}30 0%, transparent 65%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -160,
            left: -120,
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(249,115,22,0.10) 0%, transparent 70%)',
          }}
        />

        {/* Header: бренд */}
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
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#1a120c',
              letterSpacing: '-0.01em',
            }}
          >
            Преподавай
          </div>
        </div>

        {/* Center: emoji + category + title + description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</div>
            <div
              style={{
                padding: '8px 18px',
                borderRadius: 99,
                background: accent + '22',
                color: accent,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {category}
            </div>
          </div>
          <div
            style={{
              fontSize: title.length > 70 ? 48 : 56,
              fontWeight: 800,
              color: '#1a120c',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#555',
              lineHeight: 1.45,
              maxWidth: 980,
            }}
          >
            {description.length > 130 ? description.slice(0, 127) + '…' : description}
          </div>
        </div>

        {/* Footer */}
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
          <div style={{ fontWeight: 600, color: accent }}>Читать статью →</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
