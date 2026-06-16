'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

/**
 * Заглушка страницы статьи. Пока контента нет — рендерим уважительное
 * «скоро будет», ссылку на главную и обратно в блог. Когда подключим CMS,
 * заменим тело на реальный текст статьи по `slug`.
 */
export default function BlogPostStub() {
    const { slug } = useParams() as { slug?: string }
    return (
        <div style={{
            minHeight: '100vh',
            background: '#f8f8f6',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: '#1a1a1a',
            display: 'flex', flexDirection: 'column',
        }}>
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
                <Link href="/blog" style={{
                    padding: '8px 14px', color: '#555', textDecoration: 'none',
                    borderRadius: 8, fontSize: 14, fontWeight: 500,
                }}>
                    ← Все статьи
                </Link>
            </header>

            <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 24px' }}>
                <div style={{ maxWidth: 560, textAlign: 'center' }}>
                    <div style={{ fontSize: 84, marginBottom: 16, lineHeight: 1 }}>📝</div>
                    <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#1a120c' }}>
                        Статья скоро появится
                    </h1>
                    <p style={{ fontSize: 16, lineHeight: 1.65, color: '#555', margin: '18px auto 28px', maxWidth: 460 }}>
                        Мы готовим материал «{slug}» — выпустим в ближайшие дни.
                        Хотите узнать первым? Подпишитесь на Telegram-канал, мы анонсируем все новые статьи там.
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/blog" style={{
                            padding: '11px 22px', borderRadius: 11,
                            background: 'white', border: '1.5px solid #e5e3df',
                            color: '#1a120c', textDecoration: 'none',
                            fontWeight: 600, fontSize: 14,
                        }}>
                            Назад в блог
                        </Link>
                        <a
                            href="https://t.me/prepodavai_news"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                padding: '11px 22px', borderRadius: 11,
                                background: '#f97316', color: 'white',
                                textDecoration: 'none',
                                fontWeight: 700, fontSize: 14,
                                boxShadow: '0 8px 22px rgba(249,115,22,0.32)',
                            }}
                        >
                            Подписаться на канал →
                        </a>
                    </div>
                </div>
            </main>
        </div>
    )
}
