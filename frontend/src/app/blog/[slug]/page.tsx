import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { getAllPosts, getPostBySlug, formatDate } from '@/lib/blog'
import RegisterCTA from '@/components/blog/RegisterCTA'
import TelegramCTA from '@/components/blog/TelegramCTA'
import BotCTA from '@/components/blog/BotCTA'
import ReadingProgress from '@/components/blog/ReadingProgress'

export const revalidate = 86400

const mdxComponents = { RegisterCTA, TelegramCTA, BotCTA }

const mdxOptions = {
  mdxOptions: { remarkPlugins: [remarkGfm] },
}

export async function generateStaticParams() {
  return getAllPosts().map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  if (!post) return {}
  const url = `https://prepodavai.ru/blog/${post.slug}`
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    authors: [{ name: 'ПреподавAI' }],
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: 'Преподавай',
      locale: 'ru_RU',
      type: 'article',
      publishedTime: post.date,
    },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description },
    alternates: { canonical: url },
  }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    keywords: post.keywords?.join(', '),
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: 'ПреподавAI' },
    publisher: {
      '@type': 'Organization',
      name: 'ПреподавAI',
      logo: { '@type': 'ImageObject', url: 'https://prepodavai.ru/logo-prepodavai.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://prepodavai.ru/blog/${post.slug}` },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f6', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#1a1a1a' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <ReadingProgress slug={post.slug} />

      <style>{`
        /* ── Animations ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes heroBlob {
          0%,100% { transform: scale(1) translateY(0); }
          50%      { transform: scale(1.06) translateY(-12px); }
        }
        .anim-fade-up  { animation: fadeUp 0.6s cubic-bezier(.22,1,.36,1) both; }
        .anim-delay-1  { animation-delay: .08s; }
        .anim-delay-2  { animation-delay: .16s; }
        .anim-delay-3  { animation-delay: .26s; }
        .anim-delay-4  { animation-delay: .36s; }

        /* ── Header nav ── */
        .nav-link { transition: color .15s, background .15s; }
        .nav-link:hover { color: #1a120c !important; background: #f0ede8; border-radius: 8px; }

        /* ── Prose ── */
        .article-prose h2 {
          font-size: 26px; font-weight: 800; margin: 48px 0 16px;
          color: #1a120c; letter-spacing: -.025em; line-height: 1.2;
          padding-bottom: 10px; border-bottom: 2px solid #f0ede8;
        }
        .article-prose h3 {
          font-size: 20px; font-weight: 700; margin: 36px 0 12px;
          color: #1a120c; letter-spacing: -.015em;
        }
        .article-prose p {
          font-size: 17.5px; line-height: 1.8; color: #374151; margin: 0 0 22px;
        }
        .article-prose ul { margin: 0 0 22px; padding: 0; list-style: none; }
        .article-prose ul li {
          font-size: 17px; line-height: 1.75; color: #374151;
          margin-bottom: 10px; padding-left: 28px; position: relative;
        }
        .article-prose ul li::before {
          content: ''; position: absolute; left: 0; top: 11px;
          width: 8px; height: 8px; border-radius: 50%;
          background: linear-gradient(135deg, #f97316, #ea580c);
        }
        .article-prose ol { margin: 0 0 22px; padding-left: 24px; }
        .article-prose ol li { font-size: 17px; line-height: 1.75; color: #374151; margin-bottom: 10px; }
        .article-prose strong { color: #1a120c; font-weight: 700; }
        .article-prose a { color: #f97316; text-decoration: underline; text-underline-offset: 3px; }
        .article-prose blockquote {
          margin: 28px 0; padding: 20px 24px;
          border-left: 4px solid #f97316;
          background: #fff9f5; border-radius: 0 12px 12px 0;
          font-style: italic; color: #555;
        }

        /* ── Tables ── */
        .article-prose table {
          width: 100%; border-collapse: collapse; margin: 28px 0;
          font-size: 15px; border-radius: 12px; overflow: hidden;
          box-shadow: 0 4px 14px rgba(20,16,12,.06);
        }
        .article-prose thead th {
          background: #1a120c; color: white; padding: 13px 16px;
          text-align: left; font-weight: 700; font-size: 13px;
          letter-spacing: .03em; text-transform: uppercase;
        }
        .article-prose thead th:first-child { border-radius: 12px 0 0 0; }
        .article-prose thead th:last-child  { border-radius: 0 12px 0 0; }
        .article-prose tbody tr { transition: background .12s; }
        .article-prose tbody tr:hover { background: #fef9f5; }
        .article-prose tbody tr:nth-child(even) { background: #fafaf8; }
        .article-prose tbody tr:nth-child(even):hover { background: #fef9f5; }
        .article-prose tbody td {
          padding: 12px 16px; border-bottom: 1px solid #f0ede8;
          vertical-align: top; color: #374151;
        }
        .article-prose tbody tr:last-child td { border-bottom: none; }

        /* ── Mobile ── */
        @media (max-width: 720px) {
          .post-hero { padding: 40px 18px 32px !important; }
          .post-title { font-size: 26px !important; }
          .post-desc  { font-size: 16px !important; }
          .article-prose table { display: block; overflow-x: auto; }
          .article-prose h2 { font-size: 22px; }
          .article-prose p, .article-prose ul li { font-size: 16px; }
        }
      `}</style>

      {/* ── Sticky header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(20px)',
        background: 'rgba(248,248,246,0.93)',
        borderBottom: '1px solid #ebebeb',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 72, gap: 24,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 800, fontSize: 18,
            boxShadow: '0 4px 14px rgba(249,115,22,0.32)',
          }}>П</div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1a120c', letterSpacing: '-0.01em' }}>
            Преподавай
          </span>
        </Link>
        <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Link href="/blog" className="nav-link" style={{ padding: '8px 14px', color: '#666', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
            ← Все статьи
          </Link>
          <a href="https://prepodavai.ru/?auth=register" style={{
            padding: '8px 18px', background: '#f97316', color: 'white',
            borderRadius: 9, fontWeight: 600, fontSize: 14, textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(249,115,22,0.28)',
          }}>
            Начать бесплатно
          </a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Blob */}
        <div aria-hidden style={{
          position: 'absolute', top: -120, right: -80, width: 500, height: 500,
          background: `radial-gradient(circle, ${post.accent}22 0%, transparent 68%)`,
          animation: 'heroBlob 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -60, left: -40, width: 320, height: 320,
          background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="post-hero" style={{ maxWidth: 800, margin: '0 auto', padding: '56px 24px 48px', position: 'relative' }}>
          {/* Breadcrumbs */}
          <nav className="anim-fade-up" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#aaa', marginBottom: 24 }}>
            <Link href="/" style={{ color: '#aaa', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <Link href="/blog" style={{ color: '#aaa', textDecoration: 'none' }}>Блог</Link>
            <span>/</span>
            <span style={{ color: '#888' }}>{post.category}</span>
          </nav>

          {/* Emoji + Category */}
          <div className="anim-fade-up anim-delay-1" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 52, lineHeight: 1 }}>{post.emoji}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{
                padding: '5px 14px', borderRadius: 99,
                background: post.accent + '18', color: post.accent,
                fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
              }}>{post.category}</span>
              <span style={{ color: '#ccc' }}>·</span>
              <span style={{ color: '#999', fontSize: 13 }}>{post.readTime}</span>
              <span style={{ color: '#ccc' }}>·</span>
              <span style={{ color: '#999', fontSize: 13 }}>{formatDate(post.date)}</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="post-title anim-fade-up anim-delay-2" style={{
            fontSize: 38, lineHeight: 1.12, fontWeight: 800,
            letterSpacing: '-.03em', color: '#1a120c', margin: '0 0 20px',
          }}>
            {post.title}
          </h1>

          {/* Description */}
          <p className="post-desc anim-fade-up anim-delay-3" style={{
            fontSize: 18, lineHeight: 1.65, color: '#555', margin: 0,
          }}>
            {post.description}
          </p>

          {/* Divider */}
          <div className="anim-fade-up anim-delay-4" style={{
            marginTop: 36,
            height: 1,
            background: 'linear-gradient(90deg, #f0ede8 0%, transparent 100%)',
          }} />
        </div>
      </div>

      {/* ── Article body ── */}
      <main className="article-prose anim-fade-up anim-delay-4" style={{ maxWidth: 800, margin: '0 auto', padding: '8px 24px 96px' }}>
        <MDXRemote source={post.content} components={mdxComponents} options={mdxOptions} />
      </main>

      {/* ── Share bar ── */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 32px' }}>
        <div style={{
          padding: '20px 24px',
          background: 'white',
          borderRadius: 14,
          border: '1px solid #f0ede8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 14,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1a120c' }}>
            Понравилась статья? Поделитесь с коллегами
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`https://t.me/share/url?url=https://prepodavai.ru/blog/${post.slug}&text=${encodeURIComponent(post.title)}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                padding: '8px 16px', borderRadius: 9,
                background: '#0088cc', color: 'white',
                textDecoration: 'none', fontSize: 13, fontWeight: 600,
              }}
            >
              Telegram
            </a>
            <a
              href={`https://vk.com/share.php?url=https://prepodavai.ru/blog/${post.slug}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                padding: '8px 16px', borderRadius: 9,
                background: '#4C75A3', color: 'white',
                textDecoration: 'none', fontSize: 13, fontWeight: 600,
              }}
            >
              ВКонтакте
            </a>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid #ebe9e4', padding: '28px 24px',
        textAlign: 'center', color: '#aaa', fontSize: 14,
      }}>
        <Link href="/blog" style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600 }}>
          ← Все статьи блога
        </Link>
        <span style={{ margin: '0 16px', color: '#e0ddd8' }}>|</span>
        <Link href="/" style={{ color: '#888', textDecoration: 'none' }}>
          prepodavai.ru
        </Link>
      </footer>
    </div>
  )
}
