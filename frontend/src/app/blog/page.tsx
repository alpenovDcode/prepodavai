'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Блог Преподавай — обзорная страница.
 *
 * Пока контента в БД нет — рендерим красивый «coming soon»-каркас с
 * рубриками и анонсами трёх первых статей. Когда подключим CMS / БД,
 * заменим статичный массив POSTS на загрузку с бэка, сохранив верстку.
 *
 * Дизайн — в стиле лендинга: тёплый фон #f8f8f6, оранжевый бренд #f97316,
 * sticky-шапка с blur, плавные hover-эффекты.
 */

type Post = {
    slug: string
    title: string
    excerpt: string
    category: string
    readTime: string
    date: string
    accent: string
    emoji: string
}

const POSTS: Post[] = [
    {
        slug: 'how-ai-saves-teacher-time',
        title: 'Как ИИ-генератор экономит учителю 8 часов в неделю',
        excerpt: 'Считаем по шагам: где учитель тратит время на подготовку, какие шаги ИИ забирает на себя и сколько в итоге освобождается на класс и семью.',
        category: 'Практика',
        readTime: '6 мин',
        date: '16 июня',
        accent: '#f97316',
        emoji: '⏱️',
    },
    {
        slug: 'worksheet-vs-textbook',
        title: 'Рабочий лист vs учебник: где они дополняют друг друга',
        excerpt: 'Учебник даёт теорию. Рабочий лист — отрабатывает её на конкретных задачах под темп и интересы класса. Как сочетать без перегрузки.',
        category: 'Методика',
        readTime: '8 мин',
        date: '14 июня',
        accent: '#10b981',
        emoji: '📋',
    },
    {
        slug: 'mini-games-engagement',
        title: 'Мини-игры на уроке: 5 сценариев, которые работают',
        excerpt: 'Memory, флеш-карты, «Миллионер», кроссворд, «Правда или ложь» — в каких темах и на каком этапе урока они дают максимум вовлечённости.',
        category: 'Инструменты',
        readTime: '5 мин',
        date: '11 июня',
        accent: '#fbbf24',
        emoji: '🎮',
    },
    {
        slug: 'feedback-without-burnout',
        title: 'Обратная связь без выгорания: как формулировать комментарии',
        excerpt: 'Шаблоны коротких, тёплых и точных комментариев к работам. Что писать в дневник, а что — в чат с родителями.',
        category: 'Коммуникация',
        readTime: '7 мин',
        date: '8 июня',
        accent: '#8b5cf6',
        emoji: '💬',
    },
    {
        slug: 'parents-relations',
        title: '«Сначала факт, потом эмоции» — формула сообщения родителям',
        excerpt: 'Три правила, которые превращают неприятный разговор о поведении или оценках в нормальную деловую переписку. С примерами.',
        category: 'Коммуникация',
        readTime: '4 мин',
        date: '5 июня',
        accent: '#0ea5e9',
        emoji: '✉️',
    },
    {
        slug: 'lesson-planning-in-30min',
        title: 'План урока за 30 минут: пошаговый алгоритм',
        excerpt: 'От темы до карточки активностей и тайминга — что зафиксировать на бумаге, чтобы не сорваться по времени и не утонуть в импровизации.',
        category: 'Методика',
        readTime: '9 мин',
        date: '1 июня',
        accent: '#ef4444',
        emoji: '📅',
    },
]

const CATEGORIES = ['Все', 'Методика', 'Практика', 'Инструменты', 'Коммуникация']

export default function BlogPage() {
    const router = useRouter()
    return (
        <div style={{
            minHeight: '100vh',
            background: '#f8f8f6',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: '#1a1a1a',
        }}>
            <style>{`
                @keyframes floatBlob { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
                .post-card { transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s; }
                .post-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(20,16,12,.08); }
                .cat-pill { transition: background .15s, color .15s; }
                @media (max-width: 720px) {
                    .hero-title { font-size: 40px !important; }
                    .hero-sub { font-size: 16px !important; }
                    .posts-grid { grid-template-columns: 1fr !important; }
                    .breadcrumbs { padding: 0 18px !important; }
                }
            `}</style>

            {/* Sticky header — повторяет лендинг */}
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
                <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Link href="/" style={{ padding: '8px 14px', color: '#555', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
                        ← На главную
                    </Link>
                    <button
                        onClick={() => router.push('/?auth=login')}
                        style={{
                            padding: '8px 18px', background: '#f97316', color: 'white',
                            border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                        }}
                    >
                        Начать бесплатно
                    </button>
                </nav>
            </header>

            {/* Hero */}
            <section style={{
                position: 'relative', overflow: 'hidden',
                padding: '88px 24px 56px', textAlign: 'center',
            }}>
                <div aria-hidden style={{
                    position: 'absolute', top: -180, left: '50%',
                    width: 900, height: 480,
                    background: 'radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, transparent 65%)',
                    pointerEvents: 'none',
                    animation: 'floatBlob 9s ease-in-out infinite',
                    transform: 'translateX(-50%)',
                }} />
                <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '7px 16px', borderRadius: 99,
                        background: 'white', border: '1.5px solid #fdba74',
                        color: '#ea580c', fontSize: 13, fontWeight: 700,
                        boxShadow: '0 4px 14px rgba(249,115,22,0.14)',
                        marginBottom: 24,
                    }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                        Свежие материалы — каждую неделю
                    </div>
                    <h1 className="hero-title" style={{
                        fontSize: 56, lineHeight: 1.05, fontWeight: 800,
                        letterSpacing: '-0.025em', color: '#1a120c', margin: 0,
                    }}>
                        Блог Преподавай
                    </h1>
                    <p className="hero-sub" style={{
                        fontSize: 19, lineHeight: 1.55, color: '#555',
                        margin: '20px auto 0', maxWidth: 580,
                    }}>
                        Методика, инструменты ИИ для учителей и истории тех,
                        кто уже сэкономил себе 8 часов в неделю на подготовке.
                    </p>
                </div>
            </section>

            {/* Categories */}
            <section style={{
                padding: '0 24px 28px', maxWidth: 1100, margin: '0 auto',
                display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
            }}>
                {CATEGORIES.map((c, i) => (
                    <button
                        key={c}
                        className="cat-pill"
                        type="button"
                        style={{
                            padding: '8px 18px',
                            borderRadius: 99,
                            border: '1.5px solid ' + (i === 0 ? '#1a120c' : '#e5e3df'),
                            background: i === 0 ? '#1a120c' : 'white',
                            color: i === 0 ? 'white' : '#555',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                            if (i === 0) return
                            e.currentTarget.style.background = '#1a120c'
                            e.currentTarget.style.color = 'white'
                            e.currentTarget.style.borderColor = '#1a120c'
                        }}
                        onMouseLeave={(e) => {
                            if (i === 0) return
                            e.currentTarget.style.background = 'white'
                            e.currentTarget.style.color = '#555'
                            e.currentTarget.style.borderColor = '#e5e3df'
                        }}
                    >
                        {c}
                    </button>
                ))}
            </section>

            {/* Featured */}
            <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 32px' }}>
                <FeaturedPost post={POSTS[0]} />
            </section>

            {/* Grid */}
            <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
                <div className="posts-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 22,
                }}>
                    {POSTS.slice(1).map((p) => (
                        <PostCard key={p.slug} post={p} />
                    ))}
                </div>
            </section>

            {/* Newsletter / CTA */}
            <section style={{ padding: '0 24px 96px' }}>
                <div style={{
                    maxWidth: 920, margin: '0 auto',
                    background: 'linear-gradient(135deg, #1a120c 0%, #2c1a0e 100%)',
                    borderRadius: 24,
                    padding: '48px 40px',
                    color: 'white',
                    textAlign: 'center',
                    boxShadow: '0 24px 60px rgba(20,16,12,0.18)',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div aria-hidden style={{
                        position: 'absolute', top: -100, right: -80,
                        width: 280, height: 280,
                        background: 'radial-gradient(circle, rgba(249,115,22,0.20) 0%, transparent 70%)',
                        pointerEvents: 'none',
                    }} />
                    <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                        Не пропускайте новые статьи
                    </h2>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', margin: '14px auto 28px', maxWidth: 520 }}>
                        Раз в неделю — одна свежая публикация в Telegram-канале.
                        Без спама, без рекламы, только методика и инструменты.
                    </p>
                    <a
                        href="https://t.me/prepodavai_news"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 10,
                            padding: '12px 26px',
                            background: '#f97316', color: 'white',
                            borderRadius: 11, textDecoration: 'none',
                            fontWeight: 700, fontSize: 15,
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

function FeaturedPost({ post }: { post: Post }) {
    const router = useRouter()
    return (
        <article
            className="post-card"
            onClick={() => router.push(`/blog/${post.slug}`)}
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
            <div style={{ padding: '44px 44px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <span style={{
                            padding: '5px 12px', borderRadius: 99,
                            background: post.accent + '18', color: post.accent,
                            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>{post.category}</span>
                        <span style={{ color: '#999', fontSize: 13 }}>· Главное</span>
                    </div>
                    <h2 style={{
                        fontSize: 32, lineHeight: 1.18, fontWeight: 800,
                        margin: 0, color: '#1a120c', letterSpacing: '-0.02em',
                    }}>
                        {post.title}
                    </h2>
                    <p style={{
                        fontSize: 16, lineHeight: 1.65, color: '#555',
                        margin: '18px 0 0',
                    }}>
                        {post.excerpt}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28, fontSize: 13, color: '#888' }}>
                    <span>{post.date}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ccc' }} />
                    <span>{post.readTime}</span>
                </div>
            </div>
            <div style={{
                background: `linear-gradient(135deg, ${post.accent}26 0%, ${post.accent}10 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 120,
            }}>
                <span aria-hidden>{post.emoji}</span>
            </div>
        </article>
    )
}

function PostCard({ post }: { post: Post }) {
    const router = useRouter()
    return (
        <article
            className="post-card"
            onClick={() => router.push(`/blog/${post.slug}`)}
            style={{
                cursor: 'pointer',
                background: 'white',
                borderRadius: 18,
                border: '1px solid #ebe9e4',
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 4px 14px rgba(20,16,12,0.04)',
            }}
        >
            <div style={{
                height: 140,
                background: `linear-gradient(135deg, ${post.accent}24 0%, ${post.accent}0c 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 64,
            }}>
                <span aria-hidden>{post.emoji}</span>
            </div>
            <div style={{ padding: '22px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{
                        padding: '4px 10px', borderRadius: 99,
                        background: post.accent + '18', color: post.accent,
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{post.category}</span>
                </div>
                <h3 style={{
                    fontSize: 17, lineHeight: 1.32, fontWeight: 700,
                    margin: 0, color: '#1a120c', letterSpacing: '-0.01em',
                }}>
                    {post.title}
                </h3>
                <p style={{
                    fontSize: 14, lineHeight: 1.55, color: '#666',
                    margin: '12px 0 0', flex: 1,
                }}>
                    {post.excerpt}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, fontSize: 12, color: '#999' }}>
                    <span>{post.date}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#ccc' }} />
                    <span>{post.readTime}</span>
                </div>
            </div>
        </article>
    )
}
