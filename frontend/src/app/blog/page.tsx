import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts, type PostMeta } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Блог Преподавай — методика и инструменты для преподавателей',
  description:
    'Практические статьи о методике преподавания, ИИ-инструментах, работе с учениками и родителями. Для репетиторов и школьных учителей.',
  openGraph: {
    title: 'Блог Преподавай — методика и инструменты для преподавателей',
    description: 'Практические статьи о методике преподавания, ИИ-инструментах, работе с учениками и родителями.',
    url: 'https://prepodavai.ru/blog',
    siteName: 'Преподавай',
    locale: 'ru_RU',
    type: 'website',
  },
  alternates: { canonical: 'https://prepodavai.ru/blog' },
}

export default function BlogPage() {
  const posts = getAllPosts()
  const featured = posts[0] ?? null
  const rest = posts.slice(1)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f8f6',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#1a1a1a',
      }}
    >
      <style>{`
        @keyframes floatBlob { 0%, 100% { transform: translateX(-50%) translateY(0px); } 50% { transform: translateX(-50%) translateY(-20px); } }
        .post-card { transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s; }
        .post-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(20,16,12,.08); }
        @media (max-width: 720px) {
          .hero-title { font-size: 40px !important; }
          .hero-sub { font-size: 16px !important; }
          .posts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Sticky header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(20px)',
          background: 'rgba(248,248,246,0.93)',
          borderBottom: '1px solid #ebebeb',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 72,
          gap: 24,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 800,
              fontSize: 18,
              boxShadow: '0 4px 14px rgba(249,115,22,0.32)',
            }}
          >
            П
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1a120c', letterSpacing: '-0.01em' }}>
            Преподавай
          </span>
        </Link>
        <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link
            href="/"
            style={{ padding: '8px 14px', color: '#555', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}
          >
            ← На главную
          </Link>
          <a
            href="https://prepodavai.ru/?auth=register&utm_source=blog&utm_medium=article&utm_campaign=blog_cta&utm_content=list_register"
            style={{
              padding: '8px 18px',
              background: '#f97316',
              color: 'white',
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Начать бесплатно
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: '88px 24px 56px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -180,
            left: '50%',
            width: 900,
            height: 480,
            background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, transparent 65%)',
            pointerEvents: 'none',
            animation: 'floatBlob 9s ease-in-out infinite',
          }}
        />
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 16px',
              borderRadius: 99,
              background: 'white',
              border: '1.5px solid #fdba74',
              color: '#ea580c',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(249,115,22,0.14)',
              marginBottom: 24,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            Свежие материалы — каждую неделю
          </div>
          <h1
            className="hero-title"
            style={{
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: '#1a120c',
              margin: 0,
            }}
          >
            Блог Преподавай
          </h1>
          <p
            className="hero-sub"
            style={{
              fontSize: 19,
              lineHeight: 1.55,
              color: '#555',
              margin: '20px auto 0',
              maxWidth: 580,
            }}
          >
            Методика, инструменты ИИ для учителей и истории тех,
            кто уже сэкономил себе 8 часов в неделю на подготовке.
          </p>
        </div>
      </section>

      {/* Featured post */}
      {featured && (
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 32px' }}>
          <FeaturedPost post={featured} />
        </section>
      )}

      {/* Grid */}
      {rest.length > 0 && (
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
          <div
            className="posts-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}
          >
            {rest.map(p => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* Newsletter / CTA */}
      <section style={{ padding: '0 24px 96px' }}>
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            background: 'linear-gradient(135deg, #1a120c 0%, #2c1a0e 100%)',
            borderRadius: 24,
            padding: '48px 40px',
            color: 'white',
            textAlign: 'center',
            boxShadow: '0 24px 60px rgba(20,16,12,0.18)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -100,
              right: -80,
              width: 280,
              height: 280,
              background: 'radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Не пропускайте новые статьи
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.7)',
              margin: '14px auto 28px',
              maxWidth: 520,
            }}
          >
            Раз в неделю — одна свежая публикация в Telegram-канале.
            Без спама, без рекламы, только методика и инструменты.
          </p>
          <a
            href="https://t.me/+vKbOpx63gzA3ZGMy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 26px',
              background: '#f97316',
              color: 'white',
              borderRadius: 11,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 15,
              boxShadow: '0 8px 22px rgba(249,115,22,0.36)',
            }}
          >
            Подписаться в Telegram →
          </a>
        </div>
      </section>
    </div>
  )
}

function FeaturedPost({ post }: { post: PostMeta }) {
  return (
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article
        className="post-card"
        style={{
          cursor: 'pointer',
          background: 'white',
          borderRadius: 24,
          border: '1px solid #ebe9e4',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '5fr 4fr',
          minHeight: 320,
          boxShadow: '0 6px 22px rgba(20,16,12,0.04)',
        }}
      >
        <div
          style={{
            padding: '44px 44px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span
                style={{
                  padding: '5px 12px',
                  borderRadius: 99,
                  background: post.accent + '18',
                  color: post.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {post.category}
              </span>
              <span style={{ color: '#999', fontSize: 13 }}>· Главное</span>
            </div>
            <h2
              style={{
                fontSize: 32,
                lineHeight: 1.18,
                fontWeight: 800,
                margin: 0,
                color: '#1a120c',
                letterSpacing: '-0.02em',
              }}
            >
              {post.title}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#555', margin: '18px 0 0' }}>
              {post.description}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28, fontSize: 13, color: '#888' }}>
            <span>{post.date}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ccc' }} />
            <span>{post.readTime}</span>
          </div>
        </div>
        <div
          style={{
            background: `linear-gradient(135deg, ${post.accent}26 0%, ${post.accent}10 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 120,
          }}
        >
          <span aria-hidden>{post.emoji}</span>
        </div>
      </article>
    </Link>
  )
}

function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
      <article
        className="post-card"
        style={{
          cursor: 'pointer',
          background: 'white',
          borderRadius: 18,
          border: '1px solid #ebe9e4',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 14px rgba(20,16,12,0.04)',
          height: '100%',
        }}
      >
        <div
          style={{
            height: 140,
            background: `linear-gradient(135deg, ${post.accent}24 0%, ${post.accent}0c 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
          }}
        >
          <span aria-hidden>{post.emoji}</span>
        </div>
        <div style={{ padding: '22px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 99,
                background: post.accent + '18',
                color: post.accent,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {post.category}
            </span>
          </div>
          <h3
            style={{
              fontSize: 17,
              lineHeight: 1.32,
              fontWeight: 700,
              margin: 0,
              color: '#1a120c',
              letterSpacing: '-0.01em',
            }}
          >
            {post.title}
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#666', margin: '12px 0 0', flex: 1 }}>
            {post.description}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, fontSize: 12, color: '#999' }}>
            <span>{post.date}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ccc' }} />
            <span>{post.readTime}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}
