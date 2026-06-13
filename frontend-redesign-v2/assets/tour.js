/* ──────────────────────────────────────────────────────────────────────
 * Onboarding Tour engine — reusable across all redesign pages
 *
 * Usage:
 *   <script src="assets/tour.js"></script>
 *   <script>
 *     window.TOUR_STEPS = [
 *       { target: null, isModal: true, title: '...', body: '...', illustration: '👋' },
 *       { target: '[data-tour="my-elem"]', placement: 'right', title: '...', body: '...' },
 *       ...
 *     ];
 *     window.TOUR_LS_KEY = 'prepodavai_tools_tour_v1';  // optional, unique per page
 *     window.TOUR_AUTOSTART = true;                     // optional, default true
 *     // Buttons with these IDs will trigger startTour:
 *     //   #tour-restart-header  /  #tour-restart-card
 *   </script>
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Inject styles ──
  const css = `
    .tour-overlay { position: fixed; inset: 0; z-index: 9998; pointer-events: none; }
    .tour-overlay.is-active { pointer-events: auto; }
    /* по умолчанию никакая внутренняя часть оверлея НЕ перехватывает клики;
       только в активном состоянии затемнение и тултип становятся кликабельными */
    .tour-overlay-bg { position: absolute; inset: 0; background: rgba(15,12,8,0); transition: background .35s ease; pointer-events: none; }
    .tour-overlay.is-active .tour-overlay-bg { background: rgba(15,12,8,.55); pointer-events: auto; }
    .tour-spotlight {
      position: fixed; pointer-events: none; z-index: 9999;
      border-radius: 14px;
      box-shadow: 0 0 0 0 rgba(0,0,0,0), 0 0 0 9999px rgba(15,12,8,0);
      transition: top .4s cubic-bezier(.22,1,.36,1), left .4s cubic-bezier(.22,1,.36,1),
                  width .4s cubic-bezier(.22,1,.36,1), height .4s cubic-bezier(.22,1,.36,1),
                  box-shadow .35s ease;
    }
    .tour-overlay.is-active .tour-spotlight {
      box-shadow: 0 0 0 4px rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6);
      animation: tourPulse 2.2s ease-out infinite;
    }
    @keyframes tourPulse {
      0% { box-shadow: 0 0 0 4px rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6); }
      50% { box-shadow: 0 0 0 10px rgba(249,115,22,.15), 0 0 0 9999px rgba(15,12,8,.6); }
      100% { box-shadow: 0 0 0 4px rgba(249,115,22,.55), 0 0 0 9999px rgba(15,12,8,.6); }
    }
    .tour-tooltip {
      position: fixed; z-index: 10000;
      background: white; border-radius: 18px;
      box-shadow: 0 24px 64px rgba(0,0,0,.22), 0 4px 12px rgba(0,0,0,.08);
      padding: 22px 24px 18px;
      width: 380px; max-width: calc(100vw - 32px);
      font-family: 'Inter', system-ui, sans-serif;
      transition: opacity .3s ease, top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1);
      opacity: 0;
      pointer-events: none;          /* пока не виден — не глушит клики под собой */
    }
    .tour-tooltip.is-visible { opacity: 1; pointer-events: auto; }
    .tour-tooltip.is-modal { width: 460px; padding: 36px 32px 28px; text-align: center; }
    .tour-step-label {
      font-size: 11px; font-weight: 700; color: #f97316;
      letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;
    }
    .tour-tooltip h3 {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 18px; font-weight: 800; letter-spacing: -0.02em;
      margin: 0 0 8px; color: #1a120c; line-height: 1.25;
    }
    .tour-tooltip.is-modal h3 { font-size: 24px; }
    .tour-tooltip p {
      font-size: 14px; color: #666; line-height: 1.6; margin: 0 0 16px;
    }
    .tour-tooltip.is-modal p { font-size: 15.5px; }
    .tour-illustration {
      font-size: 52px; text-align: center; margin-bottom: 8px; line-height: 1;
      filter: drop-shadow(0 4px 12px rgba(249,115,22,.3));
    }
    .tour-progress {
      height: 4px; background: #f3f0ec; border-radius: 99px; overflow: hidden; margin-bottom: 14px;
    }
    .tour-progress-bar {
      height: 100%; background: linear-gradient(90deg, #f97316, #f59e0b);
      border-radius: 99px; transition: width .4s cubic-bezier(.22,1,.36,1);
    }
    .tour-actions {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
    }
    .tour-tooltip.is-modal .tour-actions { justify-content: center; }
    .tour-btn {
      border: none; cursor: pointer; font-family: inherit;
      border-radius: 10px; padding: 10px 22px; font-weight: 700; font-size: 14px;
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
    }
    .tour-btn-primary {
      background: #f97316; color: white;
      box-shadow: 0 4px 14px rgba(249,115,22,.32);
    }
    .tour-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(249,115,22,.4); }
    .tour-tooltip.is-modal .tour-btn-primary { padding: 13px 32px; font-size: 15px; }
    .tour-btn-ghost {
      background: transparent; color: #888; font-weight: 500; padding: 8px 14px; font-size: 13px;
    }
    .tour-btn-ghost:hover { color: #1a120c; }
    .tour-close {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none; cursor: pointer;
      color: #ccc; font-size: 22px; line-height: 1; padding: 4px;
    }
    .tour-close:hover { color: #888; }
    .tour-tooltip.is-modal .tour-close { display: none; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── State ──
  const state = { active: false, idx: 0, els: null, renderTimer: null };

  function clearRenderTimer() {
    if (state.renderTimer) { clearTimeout(state.renderTimer); state.renderTimer = null; }
  }

  function ensureDom(stepsLength) {
    if (state.els) return state.els;
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
      <div class="tour-overlay-bg"></div>
      <div class="tour-spotlight"></div>
      <div class="tour-tooltip">
        <button class="tour-close" aria-label="Закрыть">×</button>
        <div class="tour-step-label">Шаг 1 из 1</div>
        <div class="tour-illustration" style="display:none;"></div>
        <h3>Заголовок</h3>
        <p>Текст</p>
        <div class="tour-progress"><div class="tour-progress-bar"></div></div>
        <div class="tour-actions">
          <button class="tour-btn tour-btn-ghost" data-act="skip">Пропустить тур</button>
          <button class="tour-btn tour-btn-primary" data-act="next">Дальше →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const els = {
      overlay,
      bg: overlay.querySelector('.tour-overlay-bg'),
      spot: overlay.querySelector('.tour-spotlight'),
      tip: overlay.querySelector('.tour-tooltip'),
      label: overlay.querySelector('.tour-step-label'),
      illu: overlay.querySelector('.tour-illustration'),
      title: overlay.querySelector('h3'),
      body: overlay.querySelector('p'),
      progBar: overlay.querySelector('.tour-progress-bar'),
      progress: overlay.querySelector('.tour-progress'),
      btnNext: overlay.querySelector('[data-act="next"]'),
      btnSkip: overlay.querySelector('[data-act="skip"]'),
      btnClose: overlay.querySelector('.tour-close'),
    };
    els.btnNext.addEventListener('click', next);
    els.btnSkip.addEventListener('click', () => end(false));
    els.btnClose.addEventListener('click', () => end(false));
    els.bg.addEventListener('click', () => end(false));
    state.els = els;
    return els;
  }

  function positionTooltip(rect, placement, tipW, tipH) {
    const vw = window.innerWidth, vh = window.innerHeight, gap = 16;
    if (!rect) {
      return { top: Math.max(24, (vh - tipH) / 2), left: Math.max(24, (vw - tipW) / 2) };
    }
    let top = 0, left = 0;
    switch (placement) {
      case 'top':
        top = rect.top - tipH - gap;
        left = rect.left + rect.width / 2 - tipW / 2; break;
      case 'bottom':
        top = rect.top + rect.height + gap;
        left = rect.left + rect.width / 2 - tipW / 2; break;
      case 'left':
        top = rect.top + rect.height / 2 - tipH / 2;
        left = rect.left - tipW - gap; break;
      case 'right':
      default:
        top = rect.top + rect.height / 2 - tipH / 2;
        left = rect.left + rect.width + gap;
    }
    top = Math.max(16, Math.min(top, vh - tipH - 16));
    left = Math.max(16, Math.min(left, vw - tipW - 16));
    return { top, left };
  }

  function render() {
    const steps = window.TOUR_STEPS || [];
    const els = ensureDom(steps.length);
    const step = steps[state.idx];
    if (!step) return;
    const total = steps.length;
    const isFirst = state.idx === 0;
    const isLast = state.idx === total - 1;

    els.tip.classList.toggle('is-modal', !!step.isModal);
    els.title.textContent = step.title;
    els.body.textContent = step.body;

    if (step.illustration) {
      els.illu.textContent = step.illustration;
      els.illu.style.display = 'block';
    } else {
      els.illu.style.display = 'none';
    }

    if (step.isModal) {
      els.label.style.display = 'none';
      els.progress.style.display = 'none';
    } else {
      els.label.style.display = '';
      els.progress.style.display = '';
      const nonModalTotal = steps.filter(s => !s.isModal).length;
      const nonModalIdx = steps.slice(0, state.idx + 1).filter(s => !s.isModal).length;
      els.label.textContent = `Шаг ${nonModalIdx} из ${nonModalTotal}`;
      els.progBar.style.width = ((nonModalIdx / nonModalTotal) * 100) + '%';
    }

    els.btnNext.textContent = step.primaryLabel || (isLast ? 'Готово' : 'Дальше →');
    els.btnSkip.textContent = isFirst ? 'Пропустить — я разберусь' : '← Назад';
    els.btnSkip.onclick = isFirst ? () => end(false) : prev;

    // Spotlight + autoscroll only if target is fully off-screen
    let rect = null;
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        const r0 = el.getBoundingClientRect();
        const isAbove = r0.bottom < 20;
        const isBelow = r0.top > window.innerHeight - 20;
        if (isAbove || isBelow) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          clearRenderTimer();
          state.renderTimer = setTimeout(() => { state.renderTimer = null; render(); }, 420);
          return;
        }
        const pad = step.padding != null ? step.padding : 8;
        rect = { top: r0.top - pad, left: r0.left - pad, width: r0.width + pad * 2, height: r0.height + pad * 2 };
      }
    }
    if (rect) {
      els.spot.style.display = 'block';
      els.spot.style.top = rect.top + 'px';
      els.spot.style.left = rect.left + 'px';
      els.spot.style.width = rect.width + 'px';
      els.spot.style.height = rect.height + 'px';
    } else {
      els.spot.style.display = 'none';
    }

    // Tooltip position
    const tipW = step.isModal ? 460 : 380;
    const realRect = step.target ? document.querySelector(step.target)?.getBoundingClientRect() : null;
    const initialPos = positionTooltip(realRect, step.placement || 'right', tipW, 220);
    els.tip.style.top = initialPos.top + 'px';
    els.tip.style.left = initialPos.left + 'px';

    requestAnimationFrame(() => {
      els.tip.classList.add('is-visible');
      const realH = els.tip.offsetHeight;
      const fixedPos = positionTooltip(realRect, step.placement || 'right', tipW, realH);
      els.tip.style.top = fixedPos.top + 'px';
      els.tip.style.left = fixedPos.left + 'px';
    });
  }

  function syncSpotlight() {
    if (!state.active) return;
    const steps = window.TOUR_STEPS || [];
    const step = steps[state.idx];
    const els = state.els;
    if (!step || !step.target || !els) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = step.padding != null ? step.padding : 8;
    els.spot.style.top = (r.top - pad) + 'px';
    els.spot.style.left = (r.left - pad) + 'px';
    els.spot.style.width = (r.width + pad * 2) + 'px';
    els.spot.style.height = (r.height + pad * 2) + 'px';
    const tipW = els.tip.offsetWidth;
    const tipH = els.tip.offsetHeight;
    const pos = positionTooltip(r, step.placement || 'right', tipW, tipH);
    els.tip.style.top = pos.top + 'px';
    els.tip.style.left = pos.left + 'px';
  }

  function next() {
    const steps = window.TOUR_STEPS || [];
    if (state.idx >= steps.length - 1) { end(true); return; }
    clearRenderTimer();
    state.idx++;
    render();
  }
  function prev() {
    if (state.idx > 0) { clearRenderTimer(); state.idx--; render(); }
  }

  function start() {
    const steps = window.TOUR_STEPS || [];
    if (!steps.length) return;
    ensureDom(steps.length);
    state.active = true;
    state.idx = 0;
    state.els.overlay.classList.add('is-active');
    render();
  }

  function end(completed) {
    if (!state.els) return;
    clearRenderTimer();
    state.els.overlay.classList.remove('is-active');
    state.els.tip.classList.remove('is-visible');
    state.active = false;
    const key = window.TOUR_LS_KEY || 'prepodavai_tour_default';
    try { localStorage.setItem(key, '1'); } catch (_) {}
  }

  // ── Wire-up after DOM ready ──
  function init() {
    document.getElementById('tour-restart-header')?.addEventListener('click', start);
    document.getElementById('tour-restart-card')?.addEventListener('click', start);

    window.addEventListener('keydown', (e) => {
      if (!state.active) return;
      if (e.key === 'Escape') end(false);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    });

    let scrollRaf = 0;
    window.addEventListener('scroll', () => {
      if (!state.active) return;
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => { syncSpotlight(); scrollRaf = 0; });
    }, { passive: true });
    window.addEventListener('resize', () => { if (state.active) render(); });

    // Autostart on first visit
    const key = window.TOUR_LS_KEY || 'prepodavai_tour_default';
    const autostart = window.TOUR_AUTOSTART !== false;
    let visited = false;
    try { visited = !!localStorage.getItem(key); } catch (_) {}
    if (autostart && !visited) {
      setTimeout(start, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.PrepodavaiTour = { start, end, next, prev };
})();
