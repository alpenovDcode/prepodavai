'use client'
import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import AuthModal from './AuthModal'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'

function Reveal({ children, delay = 0, style = {} }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ ...style, opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(28px)', transition: `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

function CountUp({ to, fmt, duration = 1400 }: { to: number; fmt: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVal(to); return; }
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  return <div ref={ref}>{fmt(val)}</div>;
}

export default function LandingPage({ autoOpenAuth = false }: { autoOpenAuth?: boolean }) {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const carouselRef = useRef<HTMLDivElement>(null);
  const router = useRouter()

  useEffect(() => {
    if (autoOpenAuth) { setAuthMode('register'); setShowAuth(true); }
  }, [autoOpenAuth]);

  useEffect(() => {
    if (typeof window === 'undefined') return
    const referralCode = localStorage.getItem('prepodavai_referral_code')
    if (referralCode) { setAuthMode('register'); setShowAuth(true); }
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let frame: number;
    let pos = 0;
    const speed = 0.35;
    const step = () => {
      pos += speed;
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.scrollLeft = pos;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const pause = () => cancelAnimationFrame(frame);
    const resume = () => { frame = requestAnimationFrame(step); };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
    };
  }, []);

  const handleAuthSuccess = async () => {
    setShowAuth(false)
    const referralCode = localStorage.getItem('prepodavai_referral_code')
    if (referralCode) {
      try { await apiClient.post('/referrals/apply', { code: referralCode }) } catch (_) { /* ignore */ }
      finally { localStorage.removeItem('prepodavai_referral_code') }
    }
    router.push('/dashboard')
  }

  const openRegister = () => { setAuthMode('register'); setShowAuth(true); }
  const openLogin = () => { setAuthMode('login'); setShowAuth(true); }

  const DARK = "#1a1410";
  const DARK_DEEP = "#120e0a";

  const steps = [
    { n: "01", title: "Опишите тему урока", desc: "Введите тему, класс и уровень учеников. Можно одним предложением." },
    { n: "02", title: "Выберите формат", desc: "Рабочий лист, тест, план урока, презентация или всё сразу." },
    { n: "03", title: "Получите готовый материал", desc: "ИИ создаёт полноценный документ за секунды. Скачайте или сразу используйте." },
  ];

  const testimonials = [
    { name: "Елена К.", role: "Репетитор по математике", initials: "ЕК", color: "#f97316", text: "Раньше тратила 3–4 часа на подготовку вариантов. Теперь генерирую полный вариант ОГЭ за 5 минут. Честно, не верила пока не попробовала." },
    { name: "Дмитрий Р.", role: "Учитель физики, школа №47", initials: "ДР", color: "#7c3aed", text: "Рабочие листы с чертежами теперь готовятся автоматически. Сэкономил примерно 6 часов в неделю на одних только подготовках." },
    { name: "Анна М.", role: "Репетитор английского", initials: "АМ", color: "#0891b2", text: "После AI-аудита пробного урока конверсия выросла с 30% до 65%. Конкретно видно, где теряешь ученика." },
    { name: "Сергей В.", role: "Репетитор по русскому", initials: "СВ", color: "#059669", text: "Создаю материалы для 15 учеников индивидуально под каждого. Раньше это было физически невозможно — теперь обычная среда." },
    { name: "Ольга Т.", role: "Учитель химии", initials: "ОТ", color: "#e11d48", text: "Структурные формулы теперь не рисую в Paint и не ищу по интернету. Один запрос — и всё готово." },
    { name: "Марина С.", role: "Учитель биологии", initials: "МС", color: "#d97706", text: "Тур по платформе — лучший онбординг, что я видела. Дочка-айтишница потом ещё час сидела изучала, что я там делаю." },
    { name: "Игорь П.", role: "Преподаватель информатики", initials: "ИП", color: "#0891b2", text: "Платформа знает ФГОС лучше многих коллег. Планы уроков — без правок отдаю на проверку завучу." },
    { name: "Наталья Б.", role: "Завуч начальной школы", initials: "НБ", color: "#7c3aed", text: "Подключила 12 учителей. У всех нашёлся свой сценарий: кто-то делает квизы, кто-то — рабочие листы. Платформа гибкая." },
  ];

  const carouselItems = [
    {
      type: "Презентация", grade: "9 класс",
      bg: "linear-gradient(160deg, #2d1f15 0%, #1f1510 100%)",
      content: (
        <div style={{ padding: "24px 20px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Биология · 9 класс</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1.25, marginBottom: 14 }}>Эволюция животного мира</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 20 }}>Основные закономерности исторического развития организмов: от простейших до высокоорганизованных млекопитающих</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["#f97316","#fbbf24","#10b981"].map((c,i) => <div key={i} style={{ height: 4, borderRadius: 2, background: c, flex: i === 0 ? 2 : 1 }} />)}
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {["Слайд 1","Слайд 2","Слайд 3","Слайд 4"].map((s,i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "8px", fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center" as const }}>{s}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Рабочий лист", grade: "10 класс",
      bg: "white",
      content: (
        <div style={{ padding: "22px 18px", fontFamily: "'Times New Roman', serif", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ borderBottom: "2px solid #333", paddingBottom: 6, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>РАБОЧИЙ ЛИСТ</span>
            <span style={{ fontSize: 10, color: "#aaa" }}>10 класс · Химия</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#222", marginBottom: 8, fontFamily: "sans-serif" }}>Типы гибридизации атомов углерода</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.55, marginBottom: 10 }}>Выберите верные утверждения о гибридизации атомов углерода в органических соединениях:</div>
          {["sp³-гибридизация возникает при смешивании одной s- и трёх p-орбиталей, образуя тетраэдрическую форму молекулы", "В молекуле метана атом углерода находится в sp³-гибридизации"].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 7 }}>
              <div style={{ width: 13, height: 13, border: "1.5px solid #bbb", borderRadius: 3, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5 }}>{t}</div>
            </div>
          ))}
          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontFamily: "sans-serif" }}>Заполните пропуски:</div>
            <div style={{ borderBottom: "1px solid #bbb", height: 20, marginBottom: 6 }} />
            <div style={{ borderBottom: "1px solid #bbb", height: 20 }} />
          </div>
        </div>
      )
    },
    {
      type: "Инфографика", grade: "8 класс",
      bg: "#faf6ef",
      content: (
        <div style={{ padding: "22px 18px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ textAlign: "center" as const, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#2d1b00", letterSpacing: "0.02em", lineHeight: 1.3 }}>АНАЛИЗ ХАРАКТЕРА ГЕРОЯ</div>
            <div style={{ fontSize: 11, color: "#8b6914", marginTop: 4 }}>Ключевые вопросы для исследования</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { l: "МОТИВЫ И ЦЕЛИ", q: "Что движет героем?\nЖелания · Страсти · Внутренний мир", accent: false },
              { l: "ПОСТУПКИ И РЕШЕНИЯ", q: "Как действует герой?\nВыбор · Конфликты · Изменения", accent: false },
              { l: "ЛИТЕРАТУРНЫЙ ГЕРОЙ", q: "Образ в тексте", accent: true },
              { l: "ВЛИЯНИЕ НА ДРУГИХ", q: "Как герой взаимодействует?\nОтношения · Диалог", accent: false },
            ].map((x, i) => (
              <div key={i} style={{ background: x.accent ? "#f59e0b" : "rgba(0,0,0,0.06)", borderRadius: 8, padding: "10px", textAlign: "center" as const }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: x.accent ? "white" : "#5c3d00", letterSpacing: "0.04em", marginBottom: 4 }}>{x.l}</div>
                <div style={{ fontSize: 9, color: x.accent ? "rgba(255,255,255,0.85)" : "#8b6914", lineHeight: 1.45, whiteSpace: "pre-line" as const }}>{x.q}</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Презентация", grade: "6 класс",
      bg: "linear-gradient(160deg, #2d1f15, #1f1510)",
      content: (
        <div style={{ padding: "24px 20px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 11, color: "#fb923c", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Математика · 6 класс</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1.25, marginBottom: 16 }}>Ноль и единица под корнем</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {[
              "Существуют два случая, которые нужно запомнить.",
              "Корень из нуля = 0, так как только 0 при умножении на 0 даёт 0.",
              "√1 = 1, так как 1 в квадрате = 1.",
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", paddingLeft: 12, borderLeft: "2px solid #f97316", lineHeight: 1.5 }}>{t}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Рабочий лист", grade: "7 класс",
      bg: "white",
      content: (
        <div style={{ padding: "22px 18px", fontFamily: "'Times New Roman', serif", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ borderBottom: "2px solid #333", paddingBottom: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>РАБОЧИЙ ЛИСТ</div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Русский язык · 7 класс</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, fontFamily: "sans-serif", color: "#222" }}>Правописание приставок</div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>1. Вставьте пропущенные буквы:</div>
          {["пр_ехать в город", "пр_красный вид", "пр_школьный участок", "пр_морский берег"].map((t, i) => (
            <div key={i} style={{ paddingLeft: 12, marginBottom: 5, color: "#555", fontSize: 11 }}>{i + 1}. {t}</div>
          ))}
          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5, fontFamily: "sans-serif" }}>Объясните правило:</div>
            <div style={{ borderBottom: "1px solid #bbb", height: 20, marginBottom: 6 }} />
            <div style={{ borderBottom: "1px solid #bbb", height: 20 }} />
          </div>
        </div>
      )
    },
    {
      type: "Тест", grade: "5 класс",
      bg: "#fffbf0",
      content: (
        <div style={{ padding: "22px 18px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>ТЕСТ · История</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: "#1a1a1a", lineHeight: 1.3 }}>Древний Египет</div>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 10, fontWeight: 600 }}>1. Как называлась главная река Египта?</div>
          {["Тигр", "Нил", "Евфрат", "Инд"].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", color: i === 1 ? "#16a34a" : "#777", fontWeight: i === 1 ? 700 : 400, fontSize: 12 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${i === 1 ? "#16a34a" : "#ddd"}`, background: i === 1 ? "#16a34a" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i === 1 && <span style={{ color: "white", fontSize: 8 }}>✓</span>}
              </div>
              {a}
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: "#555", fontWeight: 600 }}>2. Кто возглавлял государство?</div>
        </div>
      )
    },
  ];

  const allItems = [...carouselItems, ...carouselItems];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1a1a1a" }}>
      <style>{`
        @keyframes heroFadeUp { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes floatBlob { 0%, 100% { transform: translateX(-50%) translateY(0) scale(1); } 50% { transform: translateX(-50%) translateY(24px) scale(1.06); } }
        @keyframes pulseDot { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.45); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
        @keyframes caretBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .hero-anim > * { opacity: 0; animation: heroFadeUp .8s cubic-bezier(.22,1,.36,1) forwards; }
        .hero-anim > *:nth-child(1) { animation-delay: .05s; }
        .hero-anim > *:nth-child(2) { animation-delay: .18s; }
        .hero-anim > *:nth-child(3) { animation-delay: .32s; }
        .hero-anim > *:nth-child(4) { animation-delay: .46s; }
        .btn-cta { transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
        .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(249,115,22,.4) !important; filter: brightness(1.05); }
        .btn-cta:active { transform: translateY(0) scale(.98); }
        .btn-ghost { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .btn-ghost:hover { transform: translateY(-2px); border-color: #fdba74 !important; box-shadow: 0 6px 18px rgba(0,0,0,.08) !important; }
        .btn-ghost:active { transform: translateY(0); }
        .carousel-card { transition: transform .3s ease, box-shadow .3s ease; }
        .carousel-card:hover { transform: translateY(-8px); box-shadow: 0 24px 60px rgba(0,0,0,.45) !important; }
        .testi-card { transition: transform .25s ease, box-shadow .25s ease; }
        .testi-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,.08); }
        .step-wrap .step-icon { transition: transform .25s ease, box-shadow .25s ease; }
        .step-wrap:hover .step-icon { transform: translateY(-4px) scale(1.06); }
        .preview-shell { transition: transform .4s cubic-bezier(.22,1,.36,1), box-shadow .4s ease; }
        .preview-shell:hover { transform: translateY(-6px); box-shadow: 0 36px 80px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.07) !important; }
        @media (max-width: 820px) { .hdr-nav { display: none !important; } }
        html { scroll-behavior: smooth; scroll-padding-top: 80px; }
        @keyframes vmarquee-up { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes vmarquee-down { from { transform: translateY(-50%); } to { transform: translateY(0); } }
        .vmarquee-col { animation-duration: 38s; animation-timing-function: linear; animation-iteration-count: infinite; }
        .vmarquee-col:hover { animation-play-state: paused; }
        .vmarquee-mask { mask-image: linear-gradient(to bottom, transparent 0, black 8%, black 92%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 8%, black 92%, transparent 100%); }
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ticker-track { animation: ticker 32s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes barRise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .progress-bar { transform-origin: bottom; animation: barRise .9s cubic-bezier(.22,1,.36,1) forwards; }
        .bento-cell { transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease, border-color .3s ease; }
        .bento-cell:hover { transform: translateY(-6px); }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: "rgba(248,248,246,0.93)", borderBottom: "1px solid #ebebeb", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 72, gap: 24 }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
            <img src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em" }}>Преподавай</span>
        </a>
        <nav className="hdr-nav" style={{ display: "flex", gap: 4, alignItems: "center", flex: 1, justifyContent: "center" }}>
          {[
            { label: "О нас", href: "#about" },
            { label: "Отзывы", href: "#reviews" },
            { label: "Контакты", href: "#contacts" },
            { label: "Блог", href: "/blog" },
          ].map(item => (
            <a key={item.href} href={item.href}
              onClick={(e) => {
                // Анкорные пункты (#about / #reviews / ...) — мягко скроллим;
                // обычные ссылки (/blog) — даём навигации сработать как есть.
                if (item.href.startsWith('#')) {
                  e.preventDefault();
                  const el = document.querySelector(item.href);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              style={{ padding: "8px 14px", color: "#555", textDecoration: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, transition: "color .15s, background .15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#1a120c"; e.currentTarget.style.background = "rgba(0,0,0,.04)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "#555"; e.currentTarget.style.background = "transparent" }}>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={openLogin} style={{ padding: "7px 16px", background: "transparent", color: "#666", border: "none", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: "pointer" }}>Войти</button>
          <button className="btn-cta" onClick={openRegister} style={{ padding: "8px 18px", background: "#f97316", color: "white", border: "none", borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Начать бесплатно</button>
        </div>
      </header>
      <div id="top" style={{ position: "absolute", top: 0 }} aria-hidden />

      {/* ── HERO ── */}
      <section style={{ background: "#f8f8f6", padding: "88px 24px 64px", position: "relative", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #d1d1cc 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.45, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -200, left: "50%", width: 900, height: 500, background: "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 65%)", pointerEvents: "none", animation: "floatBlob 9s ease-in-out infinite" }} />
        <div className="hero-anim" style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 22px", borderRadius: 99, background: "white", border: "1.5px solid #fdba74", fontSize: 15, fontWeight: 700, color: "#ea580c", marginBottom: 32, boxShadow: "0 4px 16px rgba(249,115,22,0.18)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulseDot 2s ease-out infinite" }} />
            Абсолютно бесплатно
          </div>
          <h1 style={{ fontSize: "clamp(38px, 5.5vw, 68px)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.04em", margin: "0 0 22px", color: "#1a120c" }}>
            Меньше рутины —
            <br />
            <span style={{ background: "linear-gradient(95deg, #f97316 20%, #f59e0b 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>больше классных уроков</span>
          </h1>
          <p style={{ fontSize: 17, color: "#777", maxWidth: 480, margin: "0 auto 38px", lineHeight: 1.7, fontWeight: 400 }}>
            ИИ-платформа для учителей и репетиторов: рабочие листы, тесты и планы уроков — за минуты, не часы.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-cta" onClick={openRegister} style={{ padding: "14px 32px", background: "#f97316", color: "white", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(249,115,22,0.28)" }}>
              Попробовать бесплатно
            </button>
            <button className="btn-ghost" onClick={openLogin} style={{ padding: "14px 28px", background: "white", color: "#555", border: "1px solid #e0e0e0", borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              Войти в аккаунт
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ background: "white", borderTop: "1px solid #ebebeb", borderBottom: "1px solid #ebebeb", padding: "0 32px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { to: 1000, fmt: (v: number) => `${v.toLocaleString('ru-RU')}+`, label: "учителей" },
            { to: 50000, fmt: (v: number) => `${v.toLocaleString('ru-RU')}+`, label: "созданных материалов" },
            { to: 2, fmt: (v: number) => `~${v} мин`, label: "среднее время генерации" },
            { to: 48, fmt: (v: number) => `${v} ч/мес`, label: "экономия времени" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "22px 32px", textAlign: "center", borderRight: i < 3 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: "#1a120c" }}>
                <CountUp to={s.to} fmt={s.fmt} />
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ПРОГРЕСС УЧИТЕЛЕЙ (id=about) ── */}
      <section id="about" style={{ background: "white", padding: "80px 32px", position: "relative" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Результаты учителей</p>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 14px", color: "#1a120c" }}>
              В среднем учителя экономят <span style={{ background: "linear-gradient(95deg, #f97316, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>48 часов в месяц</span>
            </h2>
            <p style={{ color: "#888", fontSize: 16, maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
              И тратят это время не на рутину, а на учеников. Вот что показывают реальные цифры за последние 6 месяцев.
            </p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32, marginBottom: 32 }}>
            <Reveal>
              <div style={{ background: "#fafaf6", borderRadius: 24, padding: "32px 32px 28px", border: "1px solid #ebebeb", height: "100%", boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#888", fontWeight: 600, marginBottom: 4 }}>Сэкономлено часов в месяц</div>
                    <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", color: "#1a120c" }}>
                      <CountUp to={48} fmt={v => `${v} ч`} />
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "3px 8px", borderRadius: 6, background: "#dcfce7", color: "#16a34a", fontSize: 12, fontWeight: 700 }}>
                      ↑ +312% за полгода
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, fontSize: 12, color: "#aaa" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#f97316" }} /> часы</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 160, marginBottom: 12 }}>
                  {[
                    { m: "Янв", v: 12 }, { m: "Фев", v: 18 }, { m: "Мар", v: 24 },
                    { m: "Апр", v: 32 }, { m: "Май", v: 41 }, { m: "Июн", v: 48 },
                  ].map((b, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 130, position: "relative" }}>
                        <div className="progress-bar" style={{ height: `${(b.v / 48) * 100}%`, background: i === 5 ? "linear-gradient(180deg, #f97316, #ea580c)" : "linear-gradient(180deg, #fed7aa, #fdba74)", borderRadius: "8px 8px 4px 4px", position: "relative", animationDelay: `${i * 90}ms` }}>
                          {i === 5 && (
                            <div style={{ position: "absolute", top: -28, left: "50%", transform: "translateX(-50%)", background: "#1a120c", color: "white", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                              48ч
                              <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: "#1a120c" }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>{b.m}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { ic: "📚", lab: "Материалов в неделю", val: 23, fmt: (v: number) => `${v}`, sub: "Раньше: 4–6" },
                { ic: "⚡", lab: "Среднее время подготовки", val: 8, fmt: (v: number) => `${v} мин`, sub: "Раньше: 2–3 часа" },
                { ic: "💚", lab: "Удовлетворённость", val: 94, fmt: (v: number) => `${v}%`, sub: "По опросу 1 200 учителей" },
              ].map((m, i) => (
                <Reveal key={i} delay={120 + i * 100}>
                  <div className="bento-cell" style={{ background: "#fafaf6", borderRadius: 16, padding: "18px 22px", border: "1px solid #ebebeb", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ fontSize: 26, lineHeight: 1, filter: "drop-shadow(0 2px 6px rgba(249,115,22,.2))" }}>{m.ic}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: "#1a120c", lineHeight: 1.1 }}>
                        <CountUp to={m.val} fmt={m.fmt} />
                      </div>
                      <div style={{ fontSize: 13, color: "#666", fontWeight: 600, marginTop: 2 }}>{m.lab}</div>
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{m.sub}</div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1a120c", marginBottom: 18, letterSpacing: "-0.02em" }}>Реальные истории учителей</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                { name: "Марина С.", role: "Учитель биологии", before: "4 часа на пробный урок", after: "30 минут", delta: "8× быстрее", color: "#f97316" },
                { name: "Игорь П.", role: "Репетитор по математике", before: "10 учеников максимум", after: "27 учеников", delta: "Доход × 2,5", color: "#0891b2" },
                { name: "Елена В.", role: "Учитель английского", before: "Конверсия 28%", after: "63%", delta: "+125% к выручке", color: "#7c3aed" },
              ].map((c, i) => (
                <div key={i} className="bento-cell" style={{ background: "white", border: "1px solid #ebebeb", borderRadius: 18, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: c.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
                      {c.name.split(" ").map(s => s[0]).join("")}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a120c" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{c.role}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#aaa", marginBottom: 6, textDecoration: "line-through" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ddd" }} />
                    {c.before}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1a120c", fontWeight: 700, marginBottom: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
                    {c.after}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, background: `${c.color}15`, color: c.color, fontSize: 11, fontWeight: 700 }}>
                    ↑ {c.delta}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <div style={{ background: DARK, borderRadius: 14, padding: "14px 0", overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 2, display: "flex", alignItems: "center", gap: 6, background: DARK, paddingRight: 12, fontSize: 11, fontWeight: 700, color: "#f97316", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulseDot 2s ease-out infinite" }} />
                В прямом эфире
              </div>
              <div style={{ position: "absolute", left: 130, top: 0, bottom: 0, width: 30, background: `linear-gradient(to right, ${DARK}, transparent)`, zIndex: 1, pointerEvents: "none" }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 60, background: `linear-gradient(to left, ${DARK}, transparent)`, zIndex: 1, pointerEvents: "none" }} />
              <div className="ticker-track" style={{ display: "flex", gap: 32, paddingLeft: 160, whiteSpace: "nowrap", width: "max-content" }}>
                {[
                  "🎯 Анна К. создала тест по биологии",
                  "📚 Дмитрий Р. — рабочий лист по физике",
                  "🎨 Ольга М. сгенерировала презентацию",
                  "✅ Сергей В. проверил 18 работ за 15 минут",
                  "📝 Марина С. — план урока по литературе",
                  "🧪 Игорь П. сделал вариант ОГЭ",
                  "🌟 Елена В. — материалы для 5 классов",
                  "💬 Анна К. использовала ИИ-ассистента",
                  "🎯 Анна К. создала тест по биологии",
                  "📚 Дмитрий Р. — рабочий лист по физике",
                  "🎨 Ольга М. сгенерировала презентацию",
                  "✅ Сергей В. проверил 18 работ за 15 минут",
                  "📝 Марина С. — план урока по литературе",
                  "🧪 Игорь П. сделал вариант ОГЭ",
                  "🌟 Елена В. — материалы для 5 классов",
                  "💬 Анна К. использовала ИИ-ассистента",
                ].map((t, i) => (
                  <span key={i} style={{ fontSize: 13, color: "rgba(255,255,255,.85)", fontWeight: 500 }}>{t}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ── */}
      <section style={{ padding: "72px 32px", background: "#f8f8f6" }}>
        <Reveal style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div className="preview-shell" style={{ borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #e8e8e8" }}>
            <div style={{ background: "#f0f0ee", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e4e4e4" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
              </div>
              <div style={{ flex: 1, background: "white", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#aaa", textAlign: "center", maxWidth: 280, margin: "0 auto" }}>prepodavai.ru/dashboard</div>
            </div>
            <div style={{ background: "white", display: "flex", minHeight: 360 }}>
              <div style={{ width: 168, background: "#fafaf8", borderRight: "1px solid #f0f0f0", padding: "16px 12px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 22, paddingLeft: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "#f97316" }} />
                  <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: "-0.02em" }}>Преподавай</span>
                </div>
                {[{ i: "🏠", l: "Главная", a: true },{ i: "✨", l: "Генератор" },{ i: "📁", l: "Материалы" },{ i: "👥", l: "Ученики" },{ i: "📈", l: "Аналитика" },{ i: "⚙️", l: "Настройки" }].map((x, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, fontSize: 11.5, color: x.a ? "#ea580c" : "#aaa", background: x.a ? "#fff3e8" : "transparent", fontWeight: x.a ? 700 : 400, marginBottom: 2 }}>
                    <span>{x.i}</span><span>{x.l}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: "18px 22px", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 2px", letterSpacing: "-0.02em" }}>Создать материал</h2>
                    <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>Генерация с помощью ИИ</p>
                  </div>
                  <div style={{ background: "#f97316", color: "white", padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>+ Создать</div>
                </div>
                <div style={{ background: "#fafaf8", borderRadius: 12, border: "1px solid #eee", padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#bbb", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Тема урока</div>
                  <div style={{ padding: "8px 12px", border: "1.5px solid #ea580c", borderRadius: 9, fontSize: 12, color: "#333", background: "white", marginBottom: 10 }}>
                    Фотосинтез — 6 класс
                    <span style={{ display: "inline-block", width: 1.5, height: 12, background: "#ea580c", marginLeft: 2, verticalAlign: "middle", animation: "caretBlink 1.1s infinite" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Рабочий лист","Тест","План урока","Презентация"].map((l, i) => (
                      <span key={i} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 10, fontWeight: 600, background: i === 0 ? "#f97316" : "#f0f0f0", color: i === 0 ? "white" : "#888" }}>{l}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["17","Материалов"],["564","Генераций"],["1 250","Токенов"],["48ч","Сэкономлено"]].map(([v,lb],j) => (
                    <div key={j} style={{ flex: 1, background: "#fafaf8", border: "1px solid #f0f0f0", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-0.02em" }}>{v}</div>
                      <div style={{ fontSize: 9.5, color: "#bbb", marginTop: 1 }}>{lb}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── КАК ЭТО РАБОТАЕТ ── */}
      <section style={{ background: "white", padding: "72px 32px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Как это работает</p>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
              Три шага до готового материала
            </h2>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", top: 28, left: "18%", right: "18%", height: 1, background: "linear-gradient(90deg, #f97316, #f59e0b)", opacity: 0.3, zIndex: 0 }} />
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 150} style={{ position: "relative", zIndex: 1 }}>
                <div className="step-wrap" style={{ padding: "0 20px", textAlign: "center" }}>
                  <div className="step-icon" style={{ width: 56, height: 56, borderRadius: 16, background: i === 0 ? "#f97316" : "white", border: i === 0 ? "none" : "2px solid #e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: i === 0 ? "0 6px 20px rgba(249,115,22,0.25)" : "none" }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? "white" : "#ccc" }}>{s.n}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>{s.title}</h3>
                  <p style={{ fontSize: 13.5, color: "#888", lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── МАСТЕРСКАЯ УЧИТЕЛЯ — bento с workflow репетитора ── */}
      <section style={{ background: "#f8f8f6", padding: "80px 32px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Мастерская</p>
            <h2 style={{ fontSize: "clamp(28px, 4.5vw, 46px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 14, color: "#1a120c" }}>
              Всё для работы с учеником
            </h2>
            <p style={{ color: "#777", fontSize: 16, maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
              От записи ученика в класс до проверки домашки — каждый этап работы репетитора внутри одного аккаунта.
            </p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "180px", gap: 14 }}>
            <Reveal style={{ gridColumn: "span 2", gridRow: "span 2" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 24, background: "linear-gradient(160deg, #1a120c 0%, #2d1f15 100%)", padding: "32px 32px 24px", color: "white", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", boxShadow: "0 12px 40px rgba(26,20,12,.25)" }}>
                <div style={{ position: "absolute", top: -100, right: -80, width: 320, height: 320, background: "radial-gradient(circle, rgba(249,115,22,.25), transparent 65%)", pointerEvents: "none" }} />
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 8px", borderRadius: 99, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.22)", color: "#fdba74", fontSize: 12, fontWeight: 600, alignSelf: "flex-start", marginBottom: 18, position: "relative" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,.6)" }} />
                  Главное для репетитора
                </div>
                <h3 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10, lineHeight: 1.1, position: "relative" }}>Ученики и классы</h3>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.6, marginBottom: 20, maxWidth: 360, position: "relative" }}>
                  Добавляйте учеников, разбивайте на группы, следите за прогрессом и успеваемостью каждого.
                </p>
                <div style={{ marginTop: "auto", background: "rgba(255,255,255,.06)", borderRadius: 14, padding: "12px 14px", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.07)", position: "relative" }}>
                  {[
                    { name: "Анна Иванова", grade: "9 класс", progress: 86, color: "#22c55e", initials: "АИ" },
                    { name: "Михаил Петров", grade: "7 класс", progress: 64, color: "#f59e0b", initials: "МП" },
                    { name: "Олег Сидоров", grade: "11 класс", progress: 92, color: "#22c55e", initials: "ОС" },
                  ].map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg, ${s.color}, ${s.color}aa)`, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{s.initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "white" }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{s.grade}</div>
                      </div>
                      <div style={{ flex: "0 0 70px" }}>
                        <div style={{ height: 4, background: "rgba(255,255,255,.1)", borderRadius: 99, overflow: "hidden", marginBottom: 3 }}>
                          <div style={{ width: `${s.progress}%`, height: "100%", background: s.color, borderRadius: 99 }} />
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", textAlign: "right", fontWeight: 600 }}>{s.progress}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={80} style={{ gridColumn: "span 1", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "white", border: "1px solid #ebebeb", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg, #fff7ed, #fed7aa)", border: "1px solid #fdba74", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>✨</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a120c", marginBottom: 3, letterSpacing: "-0.01em" }}>Генерация материалов</div>
                  <div style={{ fontSize: 12, color: "#999", lineHeight: 1.45 }}>Уроки, рабочие листы, ДЗ, тесты</div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={160} style={{ gridColumn: "span 1", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "white", border: "1px solid #ebebeb", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: "#eef2ff", border: "1px solid #c7d2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>📩</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", background: "#eef2ff", padding: "3px 8px", borderRadius: 6 }}>+3</div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a120c", marginBottom: 3, letterSpacing: "-0.01em" }}>Выдача ДЗ</div>
                  <div style={{ fontSize: 12, color: "#999", lineHeight: 1.45 }}>Отправить одному или всему классу</div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120} style={{ gridColumn: "span 2", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "white", border: "1px solid #ebebeb", padding: "20px 24px", display: "flex", gap: 18, alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#dcfce7", border: "1px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🤖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a120c", marginBottom: 3, letterSpacing: "-0.01em" }}>Проверка работ через ИИ</div>
                  <div style={{ fontSize: 13, color: "#888", lineHeight: 1.5 }}>Авто-оценка + комментарии под каждого ученика</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    { v: "✓", c: "#16a34a", bg: "#f0fdf4" },
                    { v: "✓", c: "#16a34a", bg: "#f0fdf4" },
                    { v: "✗", c: "#dc2626", bg: "#fef2f2" },
                    { v: "✓", c: "#16a34a", bg: "#f0fdf4" },
                  ].map((m, i) => (
                    <div key={i} style={{ width: 26, height: 26, borderRadius: 7, background: m.bg, border: `1px solid ${m.c}33`, color: m.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
                      {m.v}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={200} style={{ gridColumn: "span 2", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "linear-gradient(160deg, #fff8ed, #fef3c7)", border: "1px solid #fed7aa", padding: "20px 24px", display: "flex", gap: 18, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a120c", marginBottom: 3, letterSpacing: "-0.01em" }}>Адаптация под уровень</div>
                  <div style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.5 }}>Один запрос — 3 версии сложности. Никаких переделок руками.</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {[
                    { l: "Н", lab: "Начальный", active: false },
                    { l: "С", lab: "Средний", active: true },
                    { l: "П", lab: "Продвинутый", active: false },
                  ].map((c, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: c.active ? "#f97316" : "white", color: c.active ? "white" : "#ea580c", border: c.active ? "none" : "1px solid #fed7aa", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, boxShadow: c.active ? "0 4px 14px rgba(249,115,22,.3)" : "none" }}>{c.l}</div>
                      <div style={{ fontSize: 9, color: c.active ? "#9a3412" : "#bbb", fontWeight: 600 }}>{c.lab}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={240} style={{ gridColumn: "span 1", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "linear-gradient(160deg, #0891b2, #0e7490)", padding: "20px", color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 8px 24px rgba(8,145,178,.22)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -20, width: 120, height: 120, background: "radial-gradient(circle, rgba(255,255,255,.15), transparent 70%)" }} />
                <div style={{ display: "flex", gap: 3, position: "relative" }}>
                  {[14, 15, 16, 17].map((d, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 5, background: i === 1 ? "white" : "rgba(255,255,255,.12)", color: i === 1 ? "#0e7490" : "white" }}>
                      <div style={{ fontSize: 8, opacity: i === 1 ? 0.6 : 0.5, fontWeight: 600 }}>{["ПН","ВТ","СР","ЧТ"][i]}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 1 }}>{d}</div>
                    </div>
                  ))}
                </div>
                <div style={{ position: "relative" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 3, letterSpacing: "-0.01em" }}>Календарь уроков</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.45 }}>Расписание и дедлайны</div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={280} style={{ gridColumn: "span 1", gridRow: "span 1" }}>
              <div className="bento-cell" style={{ height: "100%", borderRadius: 20, background: "white", border: "1px solid #ebebeb", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "6px 10px", fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                  💬 «Как объяснить дроби?»
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a120c", marginBottom: 3, letterSpacing: "-0.01em" }}>ИИ-ассистент</div>
                  <div style={{ fontSize: 12, color: "#999", lineHeight: 1.45 }}>Подсказки 24/7</div>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={300} style={{ textAlign: "center", marginTop: 36 }}>
            <button className="btn-cta" onClick={openRegister} style={{ padding: "14px 32px", background: "#f97316", color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 22px rgba(249,115,22,0.28)" }}>
              Попробовать всё бесплатно
            </button>
          </Reveal>
        </div>
      </section>

      {/* ── КАРУСЕЛЬ: ЧТО СОЗДАЛИ ── */}
      <section style={{ background: "#3d2f24", padding: "72px 0" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 40, padding: "0 32px" }}>
          <h2 style={{ color: "white", fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Что уже создали учителя
          </h2>
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 14, margin: 0 }}>
            Более 200 000 готовых материалов за последние месяцы
          </p>
        </Reveal>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to right, #3d2f24, transparent)", zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to left, #3d2f24, transparent)", zIndex: 2, pointerEvents: "none" }} />
          <div ref={carouselRef} style={{ display: "flex", gap: 20, overflowX: "hidden", padding: "12px 80px 16px", userSelect: "none" }}>
            {allItems.map((item, i) => (
              <div key={i} className="carousel-card" style={{ flexShrink: 0, width: 300, height: 400, borderRadius: 20, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column" }}>
                <div style={{ background: "rgba(26,20,16,0.78)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(8px)", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.13)", padding: "4px 10px", borderRadius: 7, letterSpacing: "0.01em" }}>{item.type}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{item.grade}</span>
                </div>
                <div style={{ background: item.bg, flex: 1, overflow: "hidden" }}>
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ОТЗЫВЫ — двухколоночная вертикальная карусель (id=reviews) ── */}
      <section id="reviews" style={{ background: "#f8f8f6", padding: "80px 32px", position: "relative" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 56, alignItems: "center" }}>
          <Reveal style={{ position: "sticky", top: 100 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Отзывы</p>
            <h2 style={{ fontSize: "clamp(28px, 4.5vw, 48px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 18, color: "#1a120c" }}>
              5 000+ учителей<br />
              <span style={{ background: "linear-gradient(95deg, #f97316, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>уже с нами</span>
            </h2>
            <p style={{ fontSize: 16, color: "#666", lineHeight: 1.7, marginBottom: 28, maxWidth: 380 }}>
              Это не накрученная статистика. Каждый отзыв — реальная история о том, как платформа изменила работу.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
              <div style={{ background: "white", border: "1px solid #ebebeb", borderRadius: 14, padding: "14px 18px", flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#1a120c", letterSpacing: "-0.02em" }}>4,9<span style={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>/5</span></div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>средняя оценка</div>
                <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
                  {"★★★★★".split("").map((s, i) => <span key={i} style={{ color: "#f59e0b", fontSize: 13 }}>{s}</span>)}
                </div>
              </div>
              <div style={{ background: "white", border: "1px solid #ebebeb", borderRadius: 14, padding: "14px 18px", flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#1a120c", letterSpacing: "-0.02em" }}>94<span style={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>%</span></div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>остаются после триала</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 6, padding: "2px 6px", borderRadius: 5, background: "#dcfce7", color: "#16a34a", fontSize: 10, fontWeight: 700 }}>
                  ↑ NPS 78
                </div>
              </div>
            </div>
            <a href="#reviews" onClick={e => e.preventDefault()} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#ea580c", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              Смотреть все отзывы →
            </a>
          </Reveal>

          <div style={{ position: "relative", height: 560, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, overflow: "hidden" }} className="vmarquee-mask">
            <div style={{ position: "relative", overflow: "hidden" }}>
              <div className="vmarquee-col" style={{ animationName: "vmarquee-up", display: "flex", flexDirection: "column", gap: 14 }}>
                {[...testimonials.slice(0, 4), ...testimonials.slice(0, 4)].map((t, i) => (
                  <div key={i} className="testi-card" style={{ padding: "20px 22px", borderRadius: 16, border: "1px solid #ebebeb", background: "white", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                    <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
                      {"★★★★★".split("").map((s, j) => <span key={j} style={{ color: "#f59e0b", fontSize: 12 }}>{s}</span>)}
                    </div>
                    <p style={{ fontSize: 14, color: "#444", lineHeight: 1.65, margin: "0 0 16px" }}>{t.text}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{t.initials}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1a120c" }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#aaa" }}>{t.role}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: "relative", overflow: "hidden" }}>
              <div className="vmarquee-col" style={{ animationName: "vmarquee-down", display: "flex", flexDirection: "column", gap: 14 }}>
                {[...testimonials.slice(4), ...testimonials.slice(4)].map((t, i) => (
                  <div key={i} className="testi-card" style={{ padding: "20px 22px", borderRadius: 16, border: "1px solid #ebebeb", background: "white", boxShadow: "0 2px 8px rgba(0,0,0,.03)" }}>
                    <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
                      {"★★★★★".split("").map((s, j) => <span key={j} style={{ color: "#f59e0b", fontSize: 12 }}>{s}</span>)}
                    </div>
                    <p style={{ fontSize: 14, color: "#444", lineHeight: 1.65, margin: "0 0 16px" }}>{t.text}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{t.initials}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1a120c" }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#aaa" }}>{t.role}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: DARK, padding: "80px 32px" }}>
        <Reveal style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "white", fontSize: "clamp(28px, 4vw, 50px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 16 }}>
            Начните готовить уроки
            <br />
            <span style={{ background: "linear-gradient(95deg, #f97316, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>в 10 раз быстрее</span>
          </h2>
          <p style={{ color: "#555", fontSize: 15, marginBottom: 36, lineHeight: 1.65 }}>
            Абсолютно бесплатно. Отменить можно в любой момент.
          </p>
          <button className="btn-cta" onClick={openRegister} style={{ padding: "15px 36px", background: "#f97316", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 28px rgba(249,115,22,0.35)" }}>
            Попробовать бесплатно
          </button>
        </Reveal>
      </section>

      {/* ── FOOTER (id=contacts) ── */}
      <footer id="contacts" style={{ background: DARK_DEEP, padding: "64px 32px 32px", color: "rgba(255,255,255,.7)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40, paddingBottom: 40, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden" }}>
                  <img src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "white" }}>Преподавай</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.65, margin: "0 0 16px", maxWidth: 320 }}>
                ИИ-платформа для учителей и репетиторов. Создавайте материалы, проверяйте работы, ведите учеников — всё в одном месте.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { l: "Telegram", h: "https://t.me/prepodavai_help_bot" },
                  { l: "VK", h: "#" },
                  { l: "YouTube", h: "#" },
                ].map(s => (
                  <a key={s.l} href={s.h} target="_blank" rel="noopener noreferrer" style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,.6)", textDecoration: "none", fontWeight: 600 }}>
                    {s.l[0]}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "white", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Платформа</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { l: "О нас", h: "#about" },
                  { l: "Отзывы", h: "#reviews" },
                  { l: "Тарифы", h: "#pricing" },
                  { l: "Блог", h: "/blog" },
                ].map(i => (
                  <li key={i.l}>
                    <a href={i.h} style={{ color: "rgba(255,255,255,.55)", textDecoration: "none", fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.color = "white"} onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.55)"}>
                      {i.l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "white", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Документы</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {([["Оферта","/legal/offer"],["Условия","/legal/terms"],["Конфиденциальность","/legal/privacy"],["Обработка ПД","/legal/consent/processing"],["Рассылка","/legal/consent/mailing"]] as [string,string][]).map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} style={{ color: "rgba(255,255,255,.55)", textDecoration: "none", fontSize: 13 }}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "white", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Контакты</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <li>
                  <a href="mailto:hello@prepodavai.ru" style={{ color: "rgba(255,255,255,.55)", textDecoration: "none", fontSize: 13 }}>
                    📧 hello@prepodavai.ru
                  </a>
                </li>
                <li>
                  <a href="https://t.me/prepodavai_help_bot" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,.55)", textDecoration: "none", fontSize: 13 }}>
                    💬 Поддержка в Telegram
                  </a>
                </li>
                <li style={{ color: "rgba(255,255,255,.4)", fontSize: 12, marginTop: 4 }}>
                  Пн–Пт, 10:00–19:00 МСК
                </li>
              </ul>
            </div>
          </div>
          <div style={{ paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 12, color: "rgba(255,255,255,.35)" }}>
            <span>© 2025 Преподавай. Все права защищены.</span>
            <span>Сделано с заботой об учителях</span>
          </div>
        </div>
      </footer>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} initialMode={authMode} />
      )}
    </div>
  );
}
