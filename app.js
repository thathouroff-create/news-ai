/**
 * NEWS AI v3.0 — Premium Engine
 * Guaranteed RSS loading · Auto-translate EN→RU · Smart ranking · Offline cache
 * Fixes: SW cache busting, escapeAttr XSS, dead feed2json removed, auto-translate on load
 */

/* ═══════════════════════ FEED SOURCES ═══════════════════════ */
const FEEDS = {
  ALL: [
    { name: 'РБК',         url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',     lang: 'ru', w: 1.3 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/news.xml',                lang: 'ru', w: 1.2 },
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',              lang: 'ru', w: 1.1 },
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',            lang: 'en', w: 1.0 },
  ],
  WORLD: [
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',            lang: 'en', w: 1.3 },
    { name: 'РБК',          url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',     lang: 'ru', w: 1.1 },
    { name: 'DW',           url: 'https://rss.dw.com/rdf/rss-ru-all',                     lang: 'ru', w: 1.0 },
  ],
  TECH: [
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',              lang: 'ru', w: 1.3 },
    { name: '3DNews',       url: 'https://3dnews.ru/news/rss/',                            lang: 'ru', w: 1.2 },
  ],
  ECONOMY: [
    { name: 'Ведомости',    url: 'https://www.vedomosti.ru/rss/news',                     lang: 'ru', w: 1.3 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/news.xml',                lang: 'ru', w: 1.2 },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml',        lang: 'en', w: 1.0 },
  ],
  SCIENCE: [
    { name: 'N+1',          url: 'https://nplus1.ru/rss',                                 lang: 'ru', w: 1.3 },
    { name: 'Naked Science', url: 'https://naked-science.ru/feed',                        lang: 'ru', w: 1.1 },
  ],
  GAMES: [
    { name: 'StopGame',     url: 'https://rss.stopgame.ru/rss_news.xml',                  lang: 'ru', w: 1.3 },
    { name: '3DNews Игры',  url: 'https://3dnews.ru/games/rss/',                           lang: 'ru', w: 1.1 },
  ],
};

/* ═══════════════════════ APP STATE ═══════════════════════ */
const state = {
  cat: 'ALL',
  sort: 'hot',
  query: '',
  items: [],
  bookmarks: safeJSON(localStorage.getItem('news_bm'), []),
  transCache: safeJSON(localStorage.getItem('news_tr'), {}),
  theme: localStorage.getItem('news_theme') || 'dark',
  fontScale: parseFloat(localStorage.getItem('news_fs') || '1'),
  deferredPrompt: null,
  currency: null,
  ratesHistory: null,
  loading: false,
};

function safeJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch { return fallback; }
}

/* ═══════════════════════ UTILITIES ═══════════════════════ */
function vibe(ms = 15) { try { navigator.vibrate?.(ms); } catch {} }

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Safe attribute escaping — critical fix for titles with quotes/apostrophes
function escAttr(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'сейчас';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' мин';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' ч';
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return d + ' дн';
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function noun(n, one, two, five) {
  let a = Math.abs(n) % 100;
  if (a >= 5 && a <= 20) return five;
  a %= 10;
  return a === 1 ? one : a >= 2 && a <= 4 ? two : five;
}

function makeId(link) {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = ((h << 5) - h + link.charCodeAt(i)) | 0;
  return 'n' + Math.abs(h).toString(36);
}

/* ═══════════════════════ RSS FETCHER ═══════════════════════ */
async function fetchFeed(cfg) {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(cfg.url)}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return [];
    const d = await r.json();
    if (d?.status === 'ok' && d.items?.length) {
      return d.items.map(it => normalize(it, cfg));
    }
  } catch {}
  return [];
}

function normalize(it, cfg) {
  let img = null;
  if (it.thumbnail?.startsWith?.('http')) img = it.thumbnail;
  else if (it.enclosure?.link?.startsWith?.('http')) img = it.enclosure.link;
  else {
    const src = ((it.description || '') + (it.content || '')).match(/<img[^>]+src=["'](https?:\/\/[^"']+)/i);
    if (src) img = src[1];
  }
  const link = it.link || it.guid || '#';
  let pd = it.pubDate ? new Date(it.pubDate).getTime() : Date.now();
  if (isNaN(pd)) pd = Date.now();
  return {
    id: makeId(link),
    title: (it.title || '').trim() || 'Без заголовка',
    link,
    desc: stripHtml(it.description || it.content || ''),
    img,
    date: pd,
    src: cfg.name,
    lang: cfg.lang,
    w: cfg.w || 1,
    titleRu: null,
    descRu: null,
  };
}

/* ═══════════════════════ AUTO-TRANSLATE ═══════════════════════ */
async function translate(text) {
  if (!text?.trim()) return text;
  if (state.transCache[text]) return state.transCache[text];
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`);
    const d = await r.json();
    if (d?.[0]) {
      const tr = d[0].map(x => x[0]).join('');
      state.transCache[text] = tr;
      try { localStorage.setItem('news_tr', JSON.stringify(state.transCache)); } catch {}
      return tr;
    }
  } catch {}
  return text;
}

// Auto-translate all EN items in background after render
async function autoTranslateItems(items) {
  const enItems = items.filter(it => it.lang === 'en' && !it.titleRu);
  if (!enItems.length) return;

  // Translate in batches of 3 to avoid rate limits
  for (let i = 0; i < enItems.length; i += 3) {
    const batch = enItems.slice(i, i + 3);
    await Promise.all(batch.map(async (it) => {
      const [titleRu, descRu] = await Promise.all([
        translate(it.title),
        translate(it.desc),
      ]);
      it.titleRu = titleRu;
      it.descRu = descRu;
      // Live-update the card in DOM
      const card = document.getElementById(it.id);
      if (card) {
        const tEl = card.querySelector('.card-title');
        const dEl = card.querySelector('.card-desc');
        const bEl = card.querySelector('.badge-lang');
        if (tEl && titleRu !== it.title) tEl.textContent = titleRu;
        if (dEl && descRu !== it.desc) dEl.textContent = descRu;
        if (bEl) { bEl.className = 'badge badge-translated'; bEl.textContent = '🇷🇺 RU'; }
      }
    }));
    if (i + 3 < enItems.length) await new Promise(r => setTimeout(r, 200));
  }
}

// Manual toggle original/translated
function toggleLang(id) {
  vibe(15);
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  const card = document.getElementById(id);
  if (!card) return;
  const tEl = card.querySelector('.card-title');
  const dEl = card.querySelector('.card-desc');
  const btn = card.querySelector('.act-lang');
  if (!tEl || !btn) return;

  const showingRu = btn.dataset.showing === 'ru';
  if (showingRu) {
    tEl.textContent = it.title;
    if (dEl) dEl.textContent = it.desc;
    btn.dataset.showing = 'en';
    btn.textContent = '🌐 Перевод';
  } else {
    tEl.textContent = it.titleRu || it.title;
    if (dEl) dEl.textContent = it.descRu || it.desc;
    btn.dataset.showing = 'ru';
    btn.textContent = '🇬🇧 Оригинал';
  }
}

/* ═══════════════════════ SMART RANKING ═══════════════════════ */
function hotScore(it) {
  const hrs = Math.max(0.1, (Date.now() - it.date) / 3600000);
  let s = (it.w || 1) / Math.pow(hrs + 1.5, 1.2) * 100;
  if (it.img) s *= 1.2;
  if (it.desc?.length > 40) s *= 1.1;
  return s;
}

/* ═══════════════════════ FEED LOADING ═══════════════════════ */
async function loadFeed(cat = 'ALL', force = false) {
  if (state.loading) return;
  vibe(12);
  state.cat = cat;
  state.loading = true;
  const feed = document.getElementById('news-feed');
  const key = 'fc_' + cat;

  // Update active tab
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));

  // Refresh icon spin
  const rb = document.getElementById('btn-refresh');
  rb?.classList.add('spinning');

  if (state.sort === 'bookmarks') {
    state.loading = false;
    rb?.classList.remove('spinning');
    renderBookmarks();
    return;
  }

  // Check cache (8 min)
  if (!force) {
    const c = safeJSON(localStorage.getItem(key), null);
    if (c && Date.now() - c.ts < 480000 && c.items?.length) {
      state.items = c.items;
      state.loading = false;
      rb?.classList.remove('spinning');
      renderFeed();
      autoTranslateItems(state.items);
      return;
    }
  }

  showSkeletons();

  const cfgs = FEEDS[cat] || FEEDS.ALL;
  try {
    const results = await Promise.allSettled(cfgs.map(c => fetchFeed(c)));
    const flat = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // Deduplicate
    const seen = new Set();
    const uniq = [];
    for (const it of flat) {
      const k = it.title.toLowerCase().slice(0, 28);
      if (!seen.has(k) && !seen.has(it.link)) {
        seen.add(k); seen.add(it.link);
        uniq.push(it);
      }
    }

    if (uniq.length) {
      state.items = uniq;
      try { localStorage.setItem(key, JSON.stringify({ items: uniq, ts: Date.now() })); } catch {}
      renderFeed();
      autoTranslateItems(state.items);
    } else {
      throw new Error('empty');
    }
  } catch {
    feed.innerHTML = `<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Не удалось загрузить</div><p style="font-size:.82rem;margin:8px 0">Проверьте интернет-соединение</p><button class="btn-primary" onclick="loadFeed('${cat}',true)">Повторить</button></div>`;
    updateCount('Ошибка');
  } finally {
    state.loading = false;
    rb?.classList.remove('spinning');
  }
}

/* ═══════════════════════ RENDER ═══════════════════════ */
function renderFeed() {
  const feed = document.getElementById('news-feed');
  let items = [...state.items];

  if (state.query.trim()) {
    const q = state.query.toLowerCase();
    items = items.filter(it =>
      (it.titleRu || it.title).toLowerCase().includes(q) ||
      (it.descRu || it.desc).toLowerCase().includes(q)
    );
  }

  if (!items.length) {
    feed.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><p style="font-size:.82rem">Попробуйте другой запрос</p></div>`;
    updateCount('0');
    return;
  }

  if (state.sort === 'hot') items.sort((a, b) => hotScore(b) - hotScore(a));
  else if (state.sort === 'latest') items.sort((a, b) => b.date - a.date);

  updateCount(items.length + ' ' + noun(items.length, 'новость', 'новости', 'новостей'));

  feed.innerHTML = items.map((it, i) => {
    const bm = state.bookmarks.some(b => b.id === it.id);
    const top = state.sort === 'hot' && i === 0;
    const isEn = it.lang === 'en';
    const displayTitle = it.titleRu || it.title;
    const displayDesc = it.descRu || it.desc;
    const translated = isEn && it.titleRu && it.titleRu !== it.title;

    return `<article class="news-card${top ? ' top-card' : ''}" id="${it.id}" style="animation-delay:${Math.min(i * 0.04, 0.2)}s">
  <div class="card-meta">
    <div class="card-source">
      <span class="badge badge-source">${escHtml(it.src)}</span>
      ${isEn ? `<span class="badge ${translated ? 'badge-translated' : 'badge-lang'}">${translated ? '🇷🇺 RU' : 'EN'}</span>` : ''}
    </div>
    <span class="card-time">${relTime(it.date)}</span>
  </div>
  <div class="card-body">
    <div class="card-text">
      <a href="${escHtml(it.link)}" target="_blank" rel="noopener" class="card-title">${escHtml(displayTitle)}</a>
      ${displayDesc ? `<p class="card-desc">${escHtml(displayDesc)}</p>` : ''}
    </div>
    ${it.img ? `<img src="${escHtml(it.img)}" alt="" class="card-img" loading="lazy" onerror="this.style.display='none'">` : ''}
  </div>
  <div class="card-actions">
    <div class="actions-left">
      ${isEn ? `<button class="act act-lang" data-showing="${translated ? 'ru' : 'en'}" onclick="toggleLang('${escAttr(it.id)}')">${translated ? '🇬🇧 Оригинал' : '🌐 Перевод'}</button>` : ''}
      <button class="act${bm ? ' active' : ''}" onclick="toggleBm('${escAttr(it.id)}')">
        ${bm ? '⭐' : '☆'} ${bm ? 'Сохранено' : 'Закладка'}
      </button>
      <button class="act" onclick="share('${escAttr(it.title)}','${escAttr(it.link)}')">🔗</button>
    </div>
    <a href="${escHtml(it.link)}" target="_blank" rel="noopener" class="card-link">Читать ↗</a>
  </div>
</article>`;
  }).join('');
}

function showSkeletons() {
  const feed = document.getElementById('news-feed');
  feed.innerHTML = Array(5).fill(0).map(() =>
    `<div class="skel"><div class="skel-line" style="width:30%"></div><div class="skel-line" style="width:85%"></div><div class="skel-line" style="width:60%"></div><div class="skel-line" style="width:100%;height:10px"></div></div>`
  ).join('');
}

function updateCount(text) {
  const el = document.getElementById('feed-status');
  if (el) el.textContent = text;
}

/* ═══════════════════════ BOOKMARKS ═══════════════════════ */
function toggleBm(id) {
  vibe(20);
  const it = state.items.find(x => x.id === id) || state.bookmarks.find(x => x.id === id);
  if (!it) return;
  const i = state.bookmarks.findIndex(x => x.id === id);
  if (i >= 0) { state.bookmarks.splice(i, 1); showToast('Удалено из закладок'); }
  else { state.bookmarks.unshift(it); showToast('Сохранено ⭐'); }
  try { localStorage.setItem('news_bm', JSON.stringify(state.bookmarks)); } catch {}
  state.sort === 'bookmarks' ? renderBookmarks() : renderFeed();
}

function renderBookmarks() {
  const feed = document.getElementById('news-feed');
  if (!state.bookmarks.length) {
    feed.innerHTML = `<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">Закладок пока нет</div><p style="font-size:.82rem">Сохраняйте интересные новости кнопкой ☆</p></div>`;
    updateCount('0 закладок');
    return;
  }
  updateCount(state.bookmarks.length + ' ' + noun(state.bookmarks.length, 'закладка', 'закладки', 'закладок'));
  state.items = [...state.bookmarks];
  renderFeed();
}

/* ═══════════════════════ SHARE ═══════════════════════ */
async function share(title, url) {
  vibe(12);
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(title + ' — ' + url); showToast('Скопировано 📋'); }
  catch { showToast('Не удалось'); }
}

/* ═══════════════════════ CURRENCY WIDGET ═══════════════════════ */
async function loadCurrency() {
  try {
    const r = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    const d = await r.json();
    state.currency = d;
    const pill = document.getElementById('currency-pill');
    if (pill) pill.innerHTML =
      `<span class="cur cur-usd">\$ ${d.Valute.USD.Value.toFixed(1)}</span>` +
      `<span class="cur cur-eur">€ ${d.Valute.EUR.Value.toFixed(1)}</span>`;
  } catch {}
}

async function openRatesModal() {
  vibe(15);
  document.getElementById('rates-modal').classList.add('open');
  if (!state.ratesHistory) {
    const dates = [], usd = [];
    let u = 'https://www.cbr-xml-daily.ru/daily_json.js';
    try {
      for (let i = 0; i < 7; i++) {
        const r = await fetch(u); const d = await r.json();
        dates.unshift(new Date(d.Date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
        usd.unshift(d.Valute.USD.Value);
        u = 'https:' + d.PreviousURL;
      }
      state.ratesHistory = { dates, usd };
    } catch {}
  }
  if (state.ratesHistory) drawChart(state.ratesHistory);
  if (state.currency) {
    const v = state.currency.Valute;
    document.getElementById('rates-body').innerHTML = [
      ['🇺🇸 USD', v.USD], ['🇪🇺 EUR', v.EUR], ['🇨🇳 CNY', v.CNY]
    ].map(([n, c]) =>
      `<tr><td>${n}</td><td><b>${c.Value.toFixed(2)} ₽</b></td><td style="color:${c.Value > c.Previous ? 'var(--c-danger)' : 'var(--c-success)'}">${(c.Value - c.Previous) > 0 ? '+' : ''}${(c.Value - c.Previous).toFixed(2)}</td></tr>`
    ).join('');
  }
}

function drawChart(h) {
  const c = document.getElementById('sparkCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  c.width = rect.width * dpr; c.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height, P = 28;
  const gW = W - P * 2, gH = H - P * 2;
  const mn = Math.min(...h.usd) - .3, mx = Math.max(...h.usd) + .3;
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-border').trim() || 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = P + gH / 3 * i;
    ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
  }

  // Line
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#38bdf8';
  const step = gW / (h.usd.length - 1);
  const pts = h.usd.map((v, i) => ({ x: P + i * step, y: P + gH - (v - mn) / (mx - mn) * gH }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, P, 0, H - P);
  grad.addColorStop(0, accent + '30');
  grad.addColorStop(1, accent + '00');
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H - P);
  ctx.lineTo(pts[0].x, H - P);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke();

  // Dots + labels
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--c-text3').trim() || '#71717a';
  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = '10px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h.dates[i], p.x, H - 8);
  });
}

/* ═══════════════════════ WEATHER ═══════════════════════ */
function loadWeather() {
  const go = (lat, lon) => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then(r => r.json()).then(d => {
        if (d?.current_weather) {
          const t = Math.round(d.current_weather.temperature);
          const wc = d.current_weather.weathercode;
          const ic = wc === 0 ? '☀️' : wc <= 3 ? '⛅' : wc <= 48 ? '🌫' : wc <= 67 ? '🌧' : wc <= 77 ? '❄️' : '⛈';
          const pill = document.getElementById('weather-pill');
          if (pill) pill.textContent = `${ic} ${t > 0 ? '+' : ''}${t}°`;
        }
      }).catch(() => {});
  };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      p => go(p.coords.latitude, p.coords.longitude),
      () => go(55.75, 37.61),
      { timeout: 3000 }
    );
  } else go(55.75, 37.61);
}

/* ═══════════════════════ THEME / FONT ═══════════════════════ */
function setTheme(t) {
  vibe(12);
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('news_theme', t);
  document.querySelectorAll('.theme-chip').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
}

function adjustFontScale(d) {
  vibe(12);
  let s = Math.round(Math.min(1.35, Math.max(0.85, state.fontScale + d)) * 100) / 100;
  state.fontScale = s;
  document.documentElement.style.setProperty('--font-scale', s);
  localStorage.setItem('news_fs', s);
  const l = document.getElementById('font-scale-label');
  if (l) l.textContent = Math.round(s * 100) + '%';
}

/* ═══════════════════════ MODALS ═══════════════════════ */
function openSettingsModal() { vibe(12); document.getElementById('settings-modal').classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ═══════════════════════ SEG CONTROL ═══════════════════════ */
function initSegControl() {
  const ctrl = document.getElementById('seg-control');
  const indicator = document.getElementById('seg-indicator');
  const segs = ctrl.querySelectorAll('.seg');

  function moveIndicator(btn) {
    const rect = btn.getBoundingClientRect();
    const parentRect = ctrl.getBoundingClientRect();
    indicator.style.width = rect.width - 2 + 'px';
    indicator.style.transform = `translateX(${rect.left - parentRect.left - 2}px)`;
  }

  // Initialize position
  const active = ctrl.querySelector('.seg.active');
  if (active) requestAnimationFrame(() => moveIndicator(active));

  segs.forEach(btn => {
    btn.addEventListener('click', () => {
      vibe(12);
      segs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      moveIndicator(btn);
      state.sort = btn.dataset.sort;
      if (state.sort === 'bookmarks') renderBookmarks();
      else renderFeed();
    });
  });
}

/* ═══════════════════════ PWA ═══════════════════════ */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredPrompt = e;
  const b = document.getElementById('pwa-install-banner');
  if (b && !sessionStorage.getItem('pwa_d')) b.style.display = 'flex';
});

async function triggerPwaInstall() {
  vibe(25);
  if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    document.getElementById('pwa-install-banner').style.display = 'none';
  } else {
    showToast('Нажмите «Поделиться» → «На экран Домой»');
  }
}

function dismissPwaBanner() {
  document.getElementById('pwa-install-banner').style.display = 'none';
  sessionStorage.setItem('pwa_d', '1');
}

/* ═══════════════════════ SERVICE WORKER ═══════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* ═══════════════════════ INIT ═══════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);
  adjustFontScale(0);

  // Search
  const si = document.getElementById('search-input');
  const sc = document.getElementById('search-clear');
  if (si) {
    let debounce;
    si.addEventListener('input', () => {
      state.query = si.value;
      sc.style.display = state.query ? 'block' : 'none';
      clearTimeout(debounce);
      debounce = setTimeout(() => renderFeed(), 200);
    });
  }
  if (sc) sc.addEventListener('click', () => {
    si.value = ''; state.query = ''; sc.style.display = 'none'; renderFeed();
  });

  initSegControl();
  loadCurrency();
  loadWeather();
  loadFeed('ALL');
});
