import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { getAllPosts, getPostBySlug, formatDate } from '@/lib/blog'
import RegisterCTA from '@/components/blog/RegisterCTA'
import TelegramCTA from '@/components/blog/TelegramCTA'
import BotCTA from '@/components/blog/BotCTA'

export const revalidate = 86400

const mdxComponents = { RegisterCTA, TelegramCTA, BotCTA }

export async function generateStaticParams() {
  return getAllPosts().map(post => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
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
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
    alternates: { canonical: url },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string }
}) {
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
      logo: {
        '@type': 'ImageObject',
        url: 'https://prepodavai.ru/logo-prepodavai.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://prepodavai.ru/blog/${post.slug}`,
    },
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8f8f6',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#1a1a1a',
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <style>{`
        @media (max-width: 720px) {
          .article-title { font-size: 28px !important; }
          .article-body { padding: 0 18px 64px !important; }
          .article-header-inner { padding: 40px 18px 32px !important; }
        }
        .prose h2 { font-size: 24px; font-weight: 800; margin: 40px 0 16px; color: #1a120c; letter-spacing: -0.02em; }
        .prose h3 { font-size: 19px; font-weight: 700; margin: 32px 0 12px; color: #1a120c; }
        .prose p { font-size: 17px; line-height: 1.75; color: #333; margin: 0 0 20px; }
        .prose ul { margin: 0 0 20px; padding-left: 24px; }
        .prose ul li { font-size: 17px; line-height: 1.75; color: #333; margin-bottom: 8px; }
        .prose ol { margin: 0 0 20px; padding-left: 24px; }
        .prose ol li { font-size: 17px; line-height: 1.75; color: #333; margin-bottom: 8px; }
        .prose strong { color: #1a120c; font-weight: 700; }
        .prose table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 15px; }
        .prose thead th { background: #1a120c; color: white; padding: 10px 14px; text-align: left; font-weight: 700; }
        .prose thead th:first-child { border-radius: 8px 0 0 0; }
        .prose thead th:last-child { border-radius: 0 8px 0 0; }
        .prose tbody tr:nth-child(even) { background: #f5f3ef; }
        .prose tbody td { padding: 10px 14px; border-bottom: 1px solid #ebe9e4; vertical-align: top; }
        @media (max-width: 600px) {
          .prose table { display: block; overflow-x: auto; }
        }
      `}</style>

      {/* Header */}
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
            href="/blog"
            style={{ padding: '8px 14px', color: '#555', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}
          >
            ← Все статьи
          </Link>
          <a
            href="https://prepodavai.ru/?auth=register"
            style={{
              padding: '8px 18px',
              background: '#f97316',
              color: 'white',
              border: 'none',
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

      {/* Article header */}
      <header
        style={{ maxWidth: 800, margin: '0 auto', padding: '56px 24px 40px' }}
        className="article-header-inner"
      >
        {/* Breadcrumbs */}
        <nav style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#999', marginBottom: 20 }}>
          <Link href="/" style={{ color: '#999', textDecoration: 'none' }}>Главная</Link>
          <span>/</span>
          <Link href="/blog" style={{ color: '#999', textDecoration: 'none' }}>Блог</Link>
          <span>/</span>
          <span style={{ color: '#555' }}>{post.category}</span>
        </nav>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
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
          <span style={{ color: '#bbb', fontSize: 13 }}>·</span>
          <span style={{ color: '#999', fontSize: 13 }}>{post.readTime}</span>
          <span style={{ color: '#bbb', fontSize: 13 }}>·</span>
          <span style={{ color: '#999', fontSize: 13 }}>{formatDate(post.date)}</span>
        </div>

        <h1
          className="article-title"
          style={{
            fontSize: 36,
            lineHeight: 1.15,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#1a120c',
            margin: 0,
          }}
        >
          {post.title}
        </h1>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            color: '#555',
            margin: '20px 0 0',
          }}
        >
          {post.description}
        </p>
      </header>

      {/* Article body */}
      <main
        className="prose article-body"
        style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 96px' }}
      >
        <MDXRemote source={post.content} components={mdxComponents} />
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #ebe9e4',
          padding: '32px 24px',
          textAlign: 'center',
          color: '#999',
          fontSize: 14,
        }}
      >
        <Link href="/blog" style={{ color: '#f97316', textDecoration: 'none', fontWeight: 600 }}>
          ← Все статьи блога
        </Link>
        <span style={{ margin: '0 16px', color: '#e0ddd8' }}>|</span>
        <Link href="/" style={{ color: '#555', textDecoration: 'none' }}>
          prepodavai.ru
        </Link>
      </footer>
    </div>
  )
}
