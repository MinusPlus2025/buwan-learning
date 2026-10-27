/* 不晚 · 动效编排 v7
   与 app.js 互不侵入：只读 DOM、只加类、只在 document 上做委托。
   所有效果在 prefers-reduced-motion 下自动退化为即时。 */
(() => {
  const html = document.documentElement;
  const body = document.body;
  if (!body || !body.classList.contains('v4')) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  html.classList.add('mv-ready');
  if (!reduce) html.classList.add('mv-boot');

  const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));

  /* ---------- 1. 首屏编舞：一条时间线，只播一次 ---------- */
  function choreograph() {
    if (reduce) return;
    const intro = document.querySelector('.hero-intro');
    const art = document.querySelector('.hero-art');
    const at = (node, ms, cls = 'mv-in') => {
      if (!node) return;
      node.style.setProperty('--mv-d', `${ms}ms`);
      node.classList.add(cls);
    };

    if (intro) {
      const kicker = intro.querySelector('.hero-kicker');
      const title = intro.querySelector('h1');
      const subtitle = intro.querySelector('.hero-subtitle');
      const form = intro.querySelector('.interest-form');
      const actions = intro.querySelector('.hero-actions');

      at(kicker, 40);
      if (title) {
        const lines = title.querySelectorAll(':scope > span');
        if (lines.length) {
          [...lines].forEach((line, i) => at(line, 120 + i * 88, 'mv-line'));
        } else {
          at(title, 120);
        }
      }
      at(subtitle, 330);
      at(form, 420);
      at(actions, 500);
    }
    at(art, 190, 'mv-in-art');
  }

  /* ---------- 2. 滚动进度与顶栏状态 ---------- */
  const bar = document.createElement('div');
  bar.className = 'mv-progress';
  bar.setAttribute('aria-hidden', 'true');
  body.append(bar);

  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = raf(() => {
      scrollRaf = 0;
      const y = window.scrollY || 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 24 ? Math.min(y / max, 1) : 0})`;
      body.classList.toggle('is-scrolled', y > 8);
      html.classList.toggle('mv-scrolled-page', y > 40);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 3. 成组进入 ---------- */
  const STAGGER = ['.seed-list', '#demo-list', '#learning-history-list', '.quick-prompts', '.guide-grid', '.starter-options'];
  let io = null;
  if ('IntersectionObserver' in window && !reduce) {
    io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('mv-shown');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });
  }

  function scanStagger() {
    STAGGER.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        if (node.classList.contains('mv-stagger')) return;
        if (!node.children.length) return;
        node.classList.add('mv-stagger');
        if (io) {
          io.observe(node);
          // 兜底：无论如何，2.4 秒后必须可见，避免内容被永久藏住
          setTimeout(() => node.classList.add('mv-shown'), 2400);
        } else {
          node.classList.add('mv-shown');
        }
      });
    });
  }

  /* ---------- 4. 数字滚动 ---------- */
  function tweenNumber(node, from, to) {
    if (reduce) { node.textContent = String(to); return; }
    const start = performance.now();
    const dur = 520;
    const diff = to - from;
    function step(now) {
      const t = Math.min((now - start) / dur, 1);
      // 和 mv-rise 同一套落定曲线
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(from + diff * eased));
      if (t < 1) raf(step);
      else node.textContent = String(to);
    }
    raf(step);
  }

  function watchCounters() {
    const node = document.getElementById('rail-count');
    if (!node || !('MutationObserver' in window)) return;
    let last = Number(node.textContent) || 0;
    let selfWrite = false;
    new MutationObserver(() => {
      if (selfWrite) { selfWrite = false; return; }
      const next = Number(node.textContent);
      if (!Number.isFinite(next) || next === last) return;
      selfWrite = true;
      tweenNumber(node, last, next);
      last = next;
      if (!reduce) {
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
      }
    }).observe(node, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 5. 琴键：按下去要有声音之外的回响 ---------- */
  const NOTES = ['♪', '♫', '♩', '·'];
  document.addEventListener('click', event => {
    const key = event.target.closest && event.target.closest('.piano-keys button');
    if (!key || reduce) return;
    key.classList.add('is-hit');
    setTimeout(() => key.classList.remove('is-hit'), 140);

    const box = key.getBoundingClientRect();
    const note = document.createElement('span');
    note.className = 'mv-note';
    note.textContent = NOTES[Math.floor(Math.random() * NOTES.length)];
    note.style.left = `${box.left + box.width / 2}px`;
    note.style.top = `${box.top - 4}px`;
    document.body.append(note);
    setTimeout(() => note.remove(), 1100);
  });

  /* ---------- 6. 舞台光斑跟随指针（只在有指针的设备上） ---------- */
  function setupStageParallax() {
    if (reduce) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const stage = document.querySelector('.companion-stage');
    const glow = document.querySelector('.stage-glow');
    if (!stage || !glow) return;
    let pending = null;
    stage.addEventListener('pointermove', event => {
      const box = stage.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / box.width;
      const dy = (event.clientY - (box.top + box.height / 2)) / box.height;
      if (pending) return;
      pending = raf(() => {
        pending = null;
        glow.style.setProperty('--gx', `${(dx * 22).toFixed(1)}px`);
        glow.style.setProperty('--gy', `${(dy * 16).toFixed(1)}px`);
      });
    });
    stage.addEventListener('pointerleave', () => {
      glow.style.setProperty('--gx', '0px');
      glow.style.setProperty('--gy', '0px');
    });
  }

  /* ---------- 7. 输入框有字时，发送键变亮 ---------- */
  function setupSendState() {
    const input = document.getElementById('chat-input');
    const send = document.getElementById('send-message');
    if (!input || !send) return;
    const sync = () => { send.dataset.filled = input.value.trim() ? 'true' : 'false'; };
    input.addEventListener('input', sync);
    sync();
  }

  /* ---------- 8. 计时开始/完成的可感知状态 ---------- */
  function setupSessionFeedback() {
    const ring = document.getElementById('starter-clock-ring');
    const session = document.querySelector('.starter-session');
    const start = document.getElementById('starter-start');
    const done = document.getElementById('starter-complete');
    const next = document.getElementById('starter-next');

    if (start && ring) start.addEventListener('click', () => ring.classList.add('is-running'));
    if (done && session) {
      done.addEventListener('click', () => {
        session.classList.add('is-done');
        setTimeout(() => session.classList.remove('is-done'), 900);
      });
    }
    if (next && ring) next.addEventListener('click', () => ring.classList.remove('is-running'));
  }

  /* ---------- 9. 跳到某个区块时，给一个方位感 ---------- */
  function setupArrivalCue() {
    if (reduce) return;
    document.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('.nav-link, .studio-tab, .hero-chat-link');
      if (!link) return;
      const id = (link.getAttribute('href') || '').replace('#', '');
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      target.classList.remove('mv-arrive');
      setTimeout(() => target.classList.add('mv-arrive'), 120);
      setTimeout(() => target.classList.remove('mv-arrive'), 1600);
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    choreograph();
    scanStagger();
    watchCounters();
    setupStageParallax();
    setupSendState();
    setupSessionFeedback();
    setupArrivalCue();

    // 折叠面板一展开，里面的内容必须立刻可见（IO 在隐藏容器里不会触发）
    document.addEventListener('toggle', event => {
      const node = event.target;
      if (!node || node.tagName !== 'DETAILS' || !node.open) return;
      node.querySelectorAll('.mv-stagger').forEach(item => item.classList.add('mv-shown'));
    }, true);

    if ('MutationObserver' in window) {
      const target = document.getElementById('guide-content');
      if (target) {
        new MutationObserver(() => scanStagger()).observe(target, { childList: true });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
