import React, { useEffect, useRef } from 'react';
import { Slide, SlideTheme } from '@/types/slide-doc';

interface Props {
  slide: Slide;
  theme: SlideTheme;
}

const Bullets: React.FC<{ items?: string[]; small?: boolean }> = ({ items, small }) => {
  if (!items?.length) return null;
  return (
    <ul className="slide-doc-bullets" data-size={small ? 'sm' : 'md'}>
      {items.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
};

const Math: React.FC<{ formulas?: string[] }> = ({ formulas }) => {
  if (!formulas?.length) return null;
  return (
    <div className="slide-doc-math">
      {formulas.map((f, i) => (
        <div key={i}>{`\\[${f}\\]`}</div>
      ))}
    </div>
  );
};

export const SlideDocSlide: React.FC<Props> = ({ slide, theme }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mj = (typeof window !== 'undefined' ? (window as any).MathJax : null);
    if (mj?.typesetPromise && ref.current) {
      const node = ref.current;
      setTimeout(() => mj.typesetPromise([node]).catch(() => undefined), 0);
    }
  }, [slide]);

  const cssVars: React.CSSProperties = {
    ['--accent' as any]: theme.accent,
    ['--accent-soft' as any]: theme.accentSoft,
    ['--text' as any]: theme.text,
    ['--text-muted' as any]: theme.textMuted,
    ['--surface' as any]: theme.surface,
    ['--border' as any]: theme.border,
    ['--bg' as any]: theme.bg,
  };

  const c = slide.content;
  const head = (title: string, subtitle?: string) => (
    <header className="slide-doc-head">
      <h1>{title}</h1>
      {subtitle && <p className="slide-doc-subtitle">{subtitle}</p>}
      <div className="slide-doc-bar" />
    </header>
  );

  const renderBody = () => {
    switch (slide.layout) {
      case 'title':
        return (
          <div className="slide-doc-cover">
            <h1 className="slide-doc-cover-title">{c.title}</h1>
            {c.subtitle && <p className="slide-doc-cover-subtitle">{c.subtitle}</p>}
            <div className="slide-doc-cover-bar" />
          </div>
        );

      case 'agenda':
      case 'bullets':
      case 'summary':
        return (
          <>
            {head(c.title, c.subtitle)}
            <div className="slide-doc-body">
              <Bullets items={c.bullets} />
              {c.paragraph && <p className="slide-doc-paragraph">{c.paragraph}</p>}
              <Math formulas={c.math} />
            </div>
            {c.footnote && <footer className="slide-doc-footnote">{c.footnote}</footer>}
          </>
        );

      case 'two-column':
        return (
          <>
            {head(c.title)}
            <div className="slide-doc-body slide-doc-two-col">
              <div className="slide-doc-col">
                {c.leftColumn?.heading && <h2>{c.leftColumn.heading}</h2>}
                <Bullets items={c.leftColumn?.bullets} small />
                {c.leftColumn?.paragraph && <p>{c.leftColumn.paragraph}</p>}
              </div>
              <div className="slide-doc-col">
                {c.rightColumn?.heading && <h2>{c.rightColumn.heading}</h2>}
                <Bullets items={c.rightColumn?.bullets} small />
                {c.rightColumn?.paragraph && <p>{c.rightColumn.paragraph}</p>}
              </div>
            </div>
          </>
        );

      case 'image-text':
        return (
          <>
            {head(c.title)}
            <div className="slide-doc-body slide-doc-image-text">
              <div className="slide-doc-text-side">
                <Bullets items={c.bullets} />
                {c.paragraph && <p className="slide-doc-paragraph">{c.paragraph}</p>}
                <Math formulas={c.math} />
              </div>
              <div className="slide-doc-image-side">
                {slide.image?.url ? (
                  <img src={slide.image.url} alt={slide.image.alt || c.title} />
                ) : (
                  <div className="slide-doc-image-placeholder" />
                )}
              </div>
            </div>
          </>
        );

      case 'quote':
        return (
          <>
            {head(c.title)}
            <blockquote className="slide-doc-quote">
              <p>«{c.quote?.text}»</p>
              {c.quote?.attribution && <cite>— {c.quote.attribution}</cite>}
            </blockquote>
          </>
        );

      case 'quiz': {
        const q = c.quiz;
        return (
          <>
            {head(c.title)}
            <div className="slide-doc-body">
              <p className="slide-doc-quiz-question">{q?.question}</p>
              <ol className="slide-doc-quiz-options">
                {q?.options?.map((o, i) => (
                  <li key={i} data-correct={i === q.answerIndex}>{o}</li>
                ))}
              </ol>
            </div>
          </>
        );
      }

      default:
        return (
          <>
            {head(c.title)}
            <div className="slide-doc-body">
              <Bullets items={c.bullets} />
            </div>
          </>
        );
    }
  };

  return (
    <div ref={ref} className="slide-doc-slide" data-layout={slide.layout} style={cssVars}>
      {renderBody()}
      <SlideDocStyles />
    </div>
  );
};

const SlideDocStyles: React.FC = () => (
  <style jsx>{`
    .slide-doc-slide {
      width: 100%;
      height: 100%;
      padding: 4% 6%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      overflow: hidden;
    }
    .slide-doc-head { margin-bottom: 3%; }
    .slide-doc-head h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: var(--text);
    }
    .slide-doc-subtitle {
      margin: 8px 0 0;
      font-size: clamp(16px, 1.8vw, 22px);
      color: var(--text-muted);
      font-weight: 500;
    }
    .slide-doc-bar {
      margin-top: 14px;
      width: 64px; height: 4px;
      background: var(--accent);
      border-radius: 2px;
    }
    .slide-doc-body { flex: 1; min-height: 0; }
    .slide-doc-bullets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .slide-doc-bullets li {
      font-size: clamp(16px, 2vw, 24px);
      line-height: 1.45;
      padding-left: 24px;
      position: relative;
      color: var(--text);
    }
    .slide-doc-bullets[data-size='sm'] li { font-size: clamp(14px, 1.5vw, 20px); }
    .slide-doc-bullets li::before {
      content: '';
      position: absolute; left: 0; top: 0.55em;
      width: 9px; height: 9px;
      background: var(--accent);
      border-radius: 2px;
    }
    .slide-doc-paragraph { font-size: clamp(16px, 1.8vw, 22px); line-height: 1.5; margin: 0 0 12px; }
    .slide-doc-math { font-size: clamp(16px, 1.8vw, 22px); margin: 16px 0; }
    .slide-doc-footnote { font-size: 12px; color: var(--text-muted); margin-top: 14px; }

    .slide-doc-cover { display: flex; flex-direction: column; justify-content: center; height: 100%; }
    .slide-doc-cover-title { margin: 0; font-size: clamp(40px, 6vw, 64px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
    .slide-doc-cover-subtitle { margin: 14px 0 0; font-size: clamp(20px, 2.5vw, 28px); color: var(--text-muted); }
    .slide-doc-cover-bar { margin-top: 28px; width: 96px; height: 6px; background: var(--accent); border-radius: 3px; }

    .slide-doc-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; height: 100%; }
    .slide-doc-col {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: 12px;
      padding: 18px 22px;
    }
    .slide-doc-col h2 { margin: 0 0 10px; font-size: clamp(18px, 1.8vw, 24px); color: var(--accent); font-weight: 600; }

    .slide-doc-image-text { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; height: 100%; align-items: center; }
    .slide-doc-image-side {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      aspect-ratio: 4/3;
    }
    .slide-doc-image-side img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .slide-doc-image-placeholder { width: 100%; height: 100%; background: var(--accent-soft); }

    .slide-doc-quote {
      margin: 24px 0 0; padding: 28px 36px;
      background: var(--accent-soft);
      border-left: 6px solid var(--accent);
      border-radius: 8px;
      font-size: clamp(20px, 2.4vw, 28px);
      line-height: 1.5;
    }
    .slide-doc-quote p { margin: 0; font-style: italic; }
    .slide-doc-quote cite { display: block; margin-top: 14px; font-size: 16px; color: var(--text-muted); font-style: normal; }

    .slide-doc-quiz-question { font-size: clamp(18px, 2vw, 26px); font-weight: 600; margin: 0 0 18px; }
    .slide-doc-quiz-options { margin: 0; padding-left: 0; list-style: none; counter-reset: q; display: flex; flex-direction: column; gap: 10px; }
    .slide-doc-quiz-options li {
      counter-increment: q;
      font-size: clamp(15px, 1.7vw, 22px);
      padding: 10px 16px 10px 44px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      position: relative;
    }
    .slide-doc-quiz-options li::before {
      content: counter(q, upper-alpha);
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      font-weight: 700; color: var(--accent);
    }
    .slide-doc-quiz-options li[data-correct='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
      font-weight: 600;
    }
  `}</style>
);
