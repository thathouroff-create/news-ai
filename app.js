/**
 * NEWS AI v4.0 — Adaptive Cross-Platform Engine (PC + Tablet + Phone)
 * Security: 5-char escHtml + safeUrl protocol whitelist + zero inline onclick/onerror (CSP script-src 'self')
 * Architecture: Unified latest.json v4.0 snapshot (pre-translated EN, 7d CBR rates, weather, Instant Reader)
 */

/* ═══ IMMEDIATE THEME & FONT BOOTSTRAP (Zero FOUC, CSP-Safe) ═══ */
var THEME_COLORS = { dark: '#09090b', light: '#f4f4f5', indigo: '#080b18' };
(function bootstrapTheme() {
  try {
    var savedTheme = localStorage.getItem('news_theme') || 'dark';
    if (!THEME_COLORS[savedTheme]) savedTheme = 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    var metaTc = document.getElementById('meta-theme-color');
    if (metaTc) metaTc.setAttribute('content', THEME_COLORS[savedTheme]);

    var savedFs = parseFloat(localStorage.getItem('news_fs') || '1');
    if (!isNaN(savedFs) && savedFs >= 0.85 && savedFs <= 1.35) {
      document.documentElement.style.setProperty('--font-scale', String(savedFs));
    }
  } catch (e) {}
})();

/* ═══ FALLBACK CLIENT FEED SOURCES ═══ */
var FEEDS = {
  ALL: [
    { name: 'РБК',          url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', w: 1.45 },
    { name: 'Коммерсантъ',   url: 'https://www.kommersant.ru/RSS/main.xml',            lang: 'ru', w: 1.35 },
    { name: 'Ведомости',     url: 'https://www.vedomosti.ru/rss/issue',                lang: 'ru', w: 1.30 },
    { name: 'Habr',          url: 'https://habr.com/ru/rss/best/daily/?fl=ru',         lang: 'ru', w: 1.15 },
    { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml',       lang: 'en', w: 1.20 }
  ],
  WORLD: [
    { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml',       lang: 'en', w: 1.35 },
    { name: 'РБК',           url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', w: 1.25 },
    { name: 'Коммерсантъ',   url: 'https://www.kommersant.ru/RSS/main.xml',            lang: 'ru', w: 1.20 },
    { name: 'DW',            url: 'https://rss.dw.com/rdf/rss-ru-all',                 lang: 'ru', w: 1.05 }
  ],
  TECH: [
    { name: 'Habr',          url: 'https://habr.com/ru/rss/best/daily/?fl=ru',         lang: 'ru', w: 1.30 },
    { name: '3DNews',        url: 'https://3dnews.ru/news/rss/',                       lang: 'ru', w: 1.25 }
  ],
  ECONOMY: [
    { name: 'Ведомости',     url: 'https://www.vedomosti.ru/rss/issue',                lang: 'ru', w: 1.40 },
    { name: 'РБК',           url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', w: 1.35 },
    { name: 'Коммерсантъ',   url: 'https://www.kommersant.ru/RSS/main.xml',            lang: 'ru', w: 1.25 },
    { name: 'BBC Business',  url: 'https://feeds.bbci.co.uk/news/business/rss.xml',    lang: 'en', w: 1.10 }
  ],
  SCIENCE: [
    { name: 'N+1',           url: 'https://nplus1.ru/rss',                             lang: 'ru', w: 1.40 },
    { name: 'Naked Science', url: 'https://naked-science.ru/feed',                     lang: 'ru', w: 1.20 }
  ],
  GAMES: [
    { name: 'StopGame',      url: 'https://rss.stopgame.ru/rss_news.xml',              lang: 'ru', w: 1.35 },
    { name: '3DNews Игры',   url: 'https://3dnews.ru/games/rss/',                      lang: 'ru', w: 1.20 }
  ]
};

/* ═══ SAFE STORAGE & STATE ═══ */
function safeJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch (e) { return fallback; }
}

function safeStorageSet(key, valStr) {
  try {
    localStorage.setItem(key, valStr);
  } catch (e) {
    // QuotaExceededError recovery: evict transient feed caches first
    try {
      var cats = ['ALL', 'WORLD', 'TECH', 'ECONOMY', 'SCIENCE', 'GAMES'];
      for (var i = 0; i < cats.length; i++) localStorage.removeItem('fc_' + cats[i]);
      localStorage.setItem(key, valStr);
    } catch (e2) {}
  }
}

var parsedFs = parseFloat(localStorage.getItem('news_fs') || '1');
var state = {
  cat: 'ALL',
  sort: 'hot',
  query: '',
  items: [],
  bookmarks: safeJSON(localStorage.getItem('news_bm'), []),
  transCache: safeJSON(localStorage.getItem('news_tr'), {}),
  theme: localStorage.getItem('news_theme') || 'dark',
  fontScale: (!isNaN(parsedFs) && parsedFs >= 0.85 && parsedFs <= 1.35) ? parsedFs : 1,
  deferredPrompt: null,
  currency: null,
  ratesHistory: null,
  ratesLoading: false,
  selectedCur: 'usd',
  weather: null,
  readerItemId: null,
  loading: false
};

/* ═══ SECURITY & STRING UTILITIES ═══ */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(raw) {
  if (!raw) return '#';
  try {
    var u = new URL(String(raw).trim(), window.location.origin);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    return '#';
  } catch (e) {
    return '#';
  }
}

function safeIdAttr(rawId) {
  var cleaned = String(rawId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned ? 'card-' + cleaned : 'card-item';
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  var map = { nbsp: ' ', quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };
  return String(str)
    .replace(/&#(\d+);/g, function(_, d) { var c = parseInt(d, 10); return c > 0 ? String.fromCharCode(c) : ''; })
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { var c = parseInt(h, 16); return c > 0 ? String.fromCharCode(c) : ''; })
    .replace(/&([a-z0-9]+);/gi, function(m, k) { var l = k.toLowerCase(); return map[l] !== undefined ? map[l] : m; });
}

function stripHtml(html, maxLen) {
  if (!html) return '';
  var text = decodeHtmlEntities(
    String(html)
      .replace(/<(style|script|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
  return text.slice(0, maxLen || 210);
}

// Accurate RFC-2822 & ISO-8601 date parser (only replaces space with T on YYYY-MM-DD HH:mm strings)
function safeParseDate(str) {
  var now = Date.now();
  if (!str) return now - 1800000;
  var s = String(str).trim();
  var normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s) ? s.replace(/\s+/, 'T') : s;
  var ts = Date.parse(normalized);
  return isNaN(ts) ? (now - 1800000) : Math.min(ts, now);
}

function relTime(ts) {
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  var m = Math.floor(s / 60);
  if (m < 60) return m + ' мин';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' ч';
  var d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return d + ' дн';
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function noun(n, one, two, five) {
  var a = Math.abs(n) % 100;
  if (a >= 5 && a <= 20) return five;
  a %= 10;
  return a === 1 ? one : (a >= 2 && a <= 4) ? two : five;
}

function makeId(link) {
  var h = 0;
  for (var i = 0; i < link.length; i++) h = ((h << 5) - h + link.charCodeAt(i)) | 0;
  return 'n' + Math.abs(h).toString(36);
}

function vibe(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {}
}

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('show'); }, 2200);
}

/* ═══ CLIENT TRANSLATION FALLBACK (With 300-entry LRU Cap) ═══ */
function saveTransCache(key, val) {
  state.transCache[key] = val;
  var keys = Object.keys(state.transCache);
  if (keys.length > 300) {
    for (var i = 0; i < keys.length - 250; i++) delete state.transCache[keys[i]];
  }
  safeStorageSet('news_tr', JSON.stringify(state.transCache));
}

function translate(text) {
  if (!text || !text.trim()) return Promise.resolve(text);
  if (state.transCache[text]) return Promise.resolve(state.transCache[text]);
  return fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=' + encodeURIComponent(text))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d[0]) {
        var tr = d[0].map(function(x) { return x[0]; }).join('');
        saveTransCache(text, tr);
        return tr;
      }
      return text;
    })
    .catch(function() { return text; });
}

function autoTranslateItems(items) {
  var enItems = items.filter(function(it) { return it.lang === 'en' && !it.titleRu; });
  if (!enItems.length) return;

  function processBatch(startIdx) {
    if (startIdx >= enItems.length) return;
    var batch = enItems.slice(startIdx, startIdx + 3);
    Promise.all(batch.map(function(it) {
      return Promise.all([translate(it.title), translate(it.desc)])
        .then(function(results) {
          it.titleRu = results[0];
          it.descRu = results[1];
          it.fullTextRu = it.fullTextRu || results[1];
          var card = document.getElementById(safeIdAttr(it.id));
          if (card) {
            var tEl = card.querySelector('.card-title');
            var dEl = card.querySelector('.card-desc');
            var bEl = card.querySelector('.badge-lang');
            if (tEl && results[0] !== it.title) tEl.textContent = results[0];
            if (dEl && results[1] !== it.desc) dEl.textContent = results[1];
            if (bEl) { bEl.className = 'badge badge-translated'; bEl.textContent = 'RU Перевод'; }
          }
        });
    })).then(function() {
      setTimeout(function() { processBatch(startIdx + 3); }, 180);
    });
  }
  processBatch(0);
}

/* ═══ SMART RANKING (Hot Score + Cluster Boost) ═══ */
function hotScore(it) {
  var hrs = Math.max(0.15, (Date.now() - it.date) / 3600000);
  var s = (it.w || 1) / Math.pow(hrs + 1.5, 1.15) * 100;
  if (it.img) s *= 1.15;
  if (it.desc && it.desc.length > 50) s *= 1.08;
  if (it.clusterCount && it.clusterCount > 1) s *= (1 + 0.22 * (it.clusterCount - 1));
  return s;
}

/* ═══ FEED LOADING ═══ */
function loadFeed(cat, force) {
  cat = cat || state.cat || 'ALL';
  vibe(10);
  state.cat = cat;

  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-cat') === cat);
  }

  if (state.loading) return;
  state.loading = true;

  var rb = document.getElementById('btn-refresh');
  if (rb) rb.classList.add('spinning');

  var key = 'fc_' + cat;
  if (!force) {
    var cached = safeJSON(localStorage.getItem(key), null);
    if (cached && Date.now() - cached.ts < 480000 && cached.items && cached.items.length > 0) {
      state.items = cached.items;
      state.loading = false;
      if (rb) rb.classList.remove('spinning');
      renderFeed();
      autoTranslateItems(state.items);
      return;
    }
  }

  showSkeletons();

  fetch('./data/latest.json?t=' + Math.floor(Date.now() / 300000))
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(d) {
      // Hydrate bundled rates & weather from v4.0 snapshot immediately (0ms modal open!)
      if (d.rates) applySnapshotRates(d.rates);
      if (d.weather && !state.weather) applyWeatherObject(d.weather);

      if (d && d.data && d.data[cat] && d.data[cat].length > 0) {
        for (var k in d.data) {
          if (Object.prototype.hasOwnProperty.call(d.data, k) && Array.isArray(d.data[k])) {
            safeStorageSet('fc_' + k, JSON.stringify({ items: d.data[k], ts: Date.now() }));
          }
        }
        state.items = d.data[cat];
        renderFeed();
        autoTranslateItems(state.items);
        state.loading = false;
        if (rb) rb.classList.remove('spinning');
        return;
      }
      throw new Error('Empty snapshot category');
    })
    .catch(function() {
      var stale = safeJSON(localStorage.getItem(key), null);
      if (stale && stale.items && stale.items.length > 0) {
        state.items = stale.items;
        renderFeed();
        showToast('Офлайн-режим: показан сохранённый кэш');
      } else {
        var feed = document.getElementById('news-feed');
        if (feed) {
          feed.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Не удалось загрузить ленту</div><p style="font-size:.82rem;margin:8px 0">Проверьте подключение к сети</p><button type="button" class="btn-primary" data-action="retry">Повторить</button></div>';
        }
        updateCount('Офлайн');
      }
      state.loading = false;
      if (rb) rb.classList.remove('spinning');
    });
}

/* ═══ RENDER (Isolated Bookmarks vs Feed, Safe Attributes, Bento Grid) ═══ */
function renderFeed() {
  var feed = document.getElementById('news-feed');
  if (!feed) return;

  var isBookmarksMode = (state.sort === 'bookmarks');
  var sourceArray = isBookmarksMode ? state.bookmarks.slice() : state.items.slice();

  if (state.query.trim()) {
    var q = state.query.toLowerCase();
    sourceArray = sourceArray.filter(function(it) {
      return (it.titleRu || it.title || '').toLowerCase().indexOf(q) >= 0 ||
             (it.descRu || it.desc || '').toLowerCase().indexOf(q) >= 0 ||
             (it.src || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  if (!sourceArray.length) {
    if (isBookmarksMode && !state.query.trim()) {
      feed.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">Закладок пока нет</div><p style="font-size:.82rem">Сохраняйте важные статьи кнопкой «☆ В закладки»</p></div>';
      updateCount('0 закладок');
    } else {
      feed.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><p style="font-size:.82rem">Попробуйте изменить поисковый запрос</p></div>';
      updateCount('0');
    }
    return;
  }

  if (state.sort === 'hot') {
    sourceArray.sort(function(a, b) { return hotScore(b) - hotScore(a); });
    // Enforce source diversity after hot sort (max 2 consecutive from same source)
    var pool = sourceArray.slice();
    var div = [];
    while (pool.length > 0) {
      var n = div.length;
      var p1 = n >= 1 ? div[n - 1].src : null;
      var p2 = n >= 2 ? div[n - 2].src : null;
      var pick = 0;
      if (p1 && p1 === p2) {
        for (var m = 0; m < pool.length; m++) {
          if (pool[m].src !== p1) { pick = m; break; }
        }
      }
      div.push(pool.splice(pick, 1)[0]);
    }
    sourceArray = div;
  } else if (state.sort === 'latest') {
    sourceArray.sort(function(a, b) { return b.date - a.date; });
  }

  if (isBookmarksMode) {
    updateCount(sourceArray.length + ' ' + noun(sourceArray.length, 'закладка', 'закладки', 'закладок'));
  } else {
    updateCount(sourceArray.length + ' ' + noun(sourceArray.length, 'новость', 'новости', 'новостей'));
  }

  var html = '';
  for (var i = 0; i < sourceArray.length; i++) {
    var it = sourceArray[i];
    var bm = isBookmarked(it.id);
    var top = (state.sort === 'hot' && i === 0 && !state.query.trim());
    var isEn = it.lang === 'en';
    var displayTitle = it.titleRu || it.title;
    var displayDesc = it.descRu || it.desc;
    var translated = isEn && it.titleRu && it.titleRu !== it.title;
    var hrefUrl = escHtml(safeUrl(it.link));
    var imgUrl = it.img ? escHtml(safeUrl(it.img)) : '';
    var hasCluster = it.clusterCount && it.clusterCount > 1;
    var alsoText = (it.alsoSources && it.alsoSources.length) ? 'Сюжет: также в ' + escHtml(it.alsoSources.join(', ')) : '';

    html += '<article class="news-card' + (top ? ' top-card' : '') + '" id="' + safeIdAttr(it.id) + '">' +
      '<div>' +
        '<div class="card-meta">' +
          '<div class="card-source">' +
            '<span class="badge badge-source">' + escHtml(it.src) + '</span>' +
            (hasCluster ? '<span class="badge badge-cluster">🔥 Сюжет · ' + Number(it.clusterCount) + ' ист.</span>' : '') +
            (isEn ? '<span class="badge ' + (translated ? 'badge-translated' : 'badge-lang') + '">' + (translated ? 'RU Перевод' : 'EN') + '</span>' : '') +
          '</div>' +
          '<span class="card-time">' + escHtml(relTime(it.date)) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-text">' +
            '<a href="' + hrefUrl + '" target="_blank" rel="noopener noreferrer" class="card-title">' + escHtml(displayTitle) + '</a>' +
            (displayDesc ? '<p class="card-desc">' + escHtml(displayDesc) + '</p>' : '') +
            (alsoText ? '<div class="card-also">' + alsoText + '</div>' : '') +
          '</div>' +
          (imgUrl && imgUrl !== '#' ? '<img src="' + imgUrl + '" alt="" class="card-img" loading="lazy">' : '') +
        '</div>' +
      '</div>' +
      '<div class="card-actions">' +
        '<div class="actions-left">' +
          '<button type="button" class="act" data-action="reader" data-id="' + escHtml(it.id) + '" aria-label="Быстрая сводка статьи">📖 Сводка</button>' +
          (isEn ? '<button type="button" class="act act-lang" data-action="lang" data-id="' + escHtml(it.id) + '" data-showing="' + (translated ? 'ru' : 'en') + '">' + (translated ? 'EN Оригинал' : 'RU Перевод') + '</button>' : '') +
          '<button type="button" class="act' + (bm ? ' active' : '') + '" data-action="bookmark" data-id="' + escHtml(it.id) + '" aria-pressed="' + (bm ? 'true' : 'false') + '">' + (bm ? '⭐ Сохранено' : '☆ В закладки') + '</button>' +
          '<button type="button" class="act" data-action="share" data-id="' + escHtml(it.id) + '" aria-label="Поделиться ссылкой">🔗</button>' +
        '</div>' +
        '<a href="' + hrefUrl + '" target="_blank" rel="noopener noreferrer" class="card-link">Источник ↗</a>' +
      '</div>' +
    '</article>';
  }
  feed.innerHTML = html;
}

function showSkeletons() {
  var feed = document.getElementById('news-feed');
  if (!feed) return;
  var s = '';
  for (var i = 0; i < 6; i++) {
    s += '<div class="skel"><div class="skel-line" style="width:32%"></div><div class="skel-line" style="width:88%"></div><div class="skel-line" style="width:65%"></div><div class="skel-line" style="width:100%;height:10px"></div></div>';
  }
  feed.innerHTML = s;
}

function updateCount(text) {
  var el = document.getElementById('feed-status');
  if (el) el.textContent = text;
}

/* ═══ ITEM LOOKUP, BOOKMARKS, READER MODAL & SHARE ═══ */
function findItem(id) {
  for (var i = 0; i < state.items.length; i++) {
    if (state.items[i].id === id) return state.items[i];
  }
  for (var j = 0; j < state.bookmarks.length; j++) {
    if (state.bookmarks[j].id === id) return state.bookmarks[j];
  }
  return null;
}

function isBookmarked(id) {
  for (var i = 0; i < state.bookmarks.length; i++) {
    if (state.bookmarks[i].id === id) return true;
  }
  return false;
}

function toggleBm(id) {
  vibe(18);
  var it = findItem(id);
  if (!it) return;
  var idx = -1;
  for (var i = 0; i < state.bookmarks.length; i++) {
    if (state.bookmarks[i].id === id) { idx = i; break; }
  }
  if (idx >= 0) {
    state.bookmarks.splice(idx, 1);
    showToast('Удалено из закладок');
  } else {
    state.bookmarks.unshift(it);
    showToast('Сохранено в закладки ⭐');
  }
  safeStorageSet('news_bm', JSON.stringify(state.bookmarks));
  renderFeed();
  if (state.readerItemId === id) renderReaderModal(it);
}

function toggleLang(id, btn) {
  vibe(12);
  var it = findItem(id);
  if (!it) return;
  var card = document.getElementById(safeIdAttr(id));
  if (!card) return;
  var tEl = card.querySelector('.card-title');
  var dEl = card.querySelector('.card-desc');
  var showingRu = btn.getAttribute('data-showing') === 'ru';
  if (showingRu) {
    if (tEl) tEl.textContent = it.title;
    if (dEl) dEl.textContent = it.desc;
    btn.setAttribute('data-showing', 'en');
    btn.textContent = 'RU Перевод';
  } else {
    if (tEl) tEl.textContent = it.titleRu || it.title;
    if (dEl) dEl.textContent = it.descRu || it.desc;
    btn.setAttribute('data-showing', 'ru');
    btn.textContent = 'EN Оригинал';
  }
}

function openReaderModal(id) {
  var it = findItem(id);
  if (!it) return;
  vibe(12);
  state.readerItemId = id;
  renderReaderModal(it);
  openModal('reader-modal');
}

function renderReaderModal(it) {
  var metaEl = document.getElementById('reader-meta');
  var titleEl = document.getElementById('reader-title');
  var bodyEl = document.getElementById('reader-body');
  var vpnEl = document.getElementById('reader-vpn-note');
  var actEl = document.getElementById('reader-actions');
  if (!titleEl || !bodyEl) return;

  var bm = isBookmarked(it.id);
  var titleTxt = it.titleRu || it.title;
  var bodyTxt = it.fullTextRu || it.fullText || it.descRu || it.desc || 'Подробный текст доступен по ссылке в источнике.';
  if (it.lang === 'en' && it.titleRu && it.title !== it.titleRu) {
    bodyTxt += '\n\n— Оригинал заголовка: ' + it.title;
  }

  if (metaEl) {
    metaEl.innerHTML = '<span class="badge badge-source">' + escHtml(it.src) + '</span>' +
      '<span class="card-time">' + escHtml(relTime(it.date)) + '</span>';
  }
  titleEl.textContent = titleTxt;
  bodyEl.textContent = bodyTxt;
  if (vpnEl) vpnEl.style.display = it.vpnHint ? 'block' : 'none';

  if (actEl) {
    var hrefUrl = escHtml(safeUrl(it.link));
    actEl.innerHTML =
      '<div class="actions-left">' +
        '<button type="button" class="act' + (bm ? ' active' : '') + '" data-reader-action="bookmark" data-id="' + escHtml(it.id) + '">' + (bm ? '⭐ Сохранено' : '☆ В закладки') + '</button>' +
        '<button type="button" class="act" data-reader-action="share" data-id="' + escHtml(it.id) + '">🔗 Поделиться</button>' +
      '</div>' +
      '<a href="' + hrefUrl + '" target="_blank" rel="noopener noreferrer" class="btn-primary">Читать оригинал ↗</a>';
  }
}

function share(title, url) {
  vibe(12);
  var cleanUrl = safeUrl(url);
  if (navigator.share) {
    navigator.share({ title: title, url: cleanUrl }).catch(function() {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(title + ' — ' + cleanUrl)
      .then(function() { showToast('Ссылка скопирована 📋'); })
      .catch(function() { showToast('Не удалось скопировать'); });
  }
}

/* ═══ CURRENCY & HiDPI SPARKLINE CHART ═══ */
function applySnapshotRates(ratesObj) {
  if (!ratesObj) return;
  if (ratesObj.current && ratesObj.current.USD && ratesObj.current.EUR) {
    state.currency = ratesObj.current;
    updateCurrencyPill(ratesObj.current.USD.value, ratesObj.current.EUR.value);
  }
  if (ratesObj.history7d && Array.isArray(ratesObj.history7d.dates) && ratesObj.history7d.dates.length >= 2) {
    state.ratesHistory = ratesObj.history7d;
  }
}

function updateCurrencyPill(usdVal, eurVal) {
  var pill = document.getElementById('currency-pill');
  if (pill && usdVal && eurVal) {
    pill.innerHTML = '<span class="cur cur-usd">$ ' + Number(usdVal).toFixed(1) + '</span>' +
                     '<span class="cur cur-eur">€ ' + Number(eurVal).toFixed(1) + '</span>';
  }
}

function loadCurrency() {
  fetch('https://www.cbr-xml-daily.ru/daily_json.js')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.Valute && d.Valute.USD && d.Valute.EUR) {
        state.currency = {
          USD: { value: +(d.Valute.USD.Value / (d.Valute.USD.Nominal || 1)).toFixed(2), prev: +(d.Valute.USD.Previous / (d.Valute.USD.Nominal || 1)).toFixed(2) },
          EUR: { value: +(d.Valute.EUR.Value / (d.Valute.EUR.Nominal || 1)).toFixed(2), prev: +(d.Valute.EUR.Previous / (d.Valute.EUR.Nominal || 1)).toFixed(2) },
          CNY: d.Valute.CNY ? { value: +(d.Valute.CNY.Value / (d.Valute.CNY.Nominal || 1)).toFixed(2), prev: +(d.Valute.CNY.Previous / (d.Valute.CNY.Nominal || 1)).toFixed(2) } : null
        };
        updateCurrencyPill(state.currency.USD.value, state.currency.EUR.value);
      }
    }).catch(function() {});
}

function openRatesModal() {
  vibe(14);
  openModal('rates-modal');
  renderRatesModal();

  if (!state.ratesHistory && !state.ratesLoading) {
    state.ratesLoading = true;
    var dates = [], usd = [], eur = [], cny = [];
    var u = 'https://www.cbr-xml-daily.ru/daily_json.js';
    function fetchNext(i) {
      if (i >= 7) {
        state.ratesLoading = false;
        if (dates.length >= 2) state.ratesHistory = { dates: dates, usd: usd, eur: eur, cny: cny };
        renderRatesModal();
        return;
      }
      fetch(u).then(function(r) { return r.json(); }).then(function(d) {
        if (i === 0 && !state.currency && d.Valute) {
          state.currency = {
            USD: { value: +(d.Valute.USD.Value / (d.Valute.USD.Nominal || 1)).toFixed(2), prev: +(d.Valute.USD.Previous / (d.Valute.USD.Nominal || 1)).toFixed(2) },
            EUR: { value: +(d.Valute.EUR.Value / (d.Valute.EUR.Nominal || 1)).toFixed(2), prev: +(d.Valute.EUR.Previous / (d.Valute.EUR.Nominal || 1)).toFixed(2) },
            CNY: d.Valute.CNY ? { value: +(d.Valute.CNY.Value / (d.Valute.CNY.Nominal || 1)).toFixed(2), prev: +(d.Valute.CNY.Previous / (d.Valute.CNY.Nominal || 1)).toFixed(2) } : null
          };
        }
        dates.unshift(new Date(d.Date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
        usd.unshift(+(d.Valute.USD.Value / (d.Valute.USD.Nominal || 1)).toFixed(2));
        if (d.Valute.EUR) eur.unshift(+(d.Valute.EUR.Value / (d.Valute.EUR.Nominal || 1)).toFixed(2));
        if (d.Valute.CNY) cny.unshift(+(d.Valute.CNY.Value / (d.Valute.CNY.Nominal || 1)).toFixed(2));
        if (!d.PreviousURL) { fetchNext(7); return; }
        u = d.PreviousURL.indexOf('http') === 0 ? d.PreviousURL : 'https:' + d.PreviousURL;
        fetchNext(i + 1);
      }).catch(function() {
        state.ratesLoading = false;
        if (dates.length >= 2) state.ratesHistory = { dates: dates, usd: usd, eur: eur, cny: cny };
        renderRatesModal();
      });
    }
    fetchNext(0);
  }
}

function renderRatesModal() {
  var body = document.getElementById('rates-body');
  var c = state.currency;
  if (body && c) {
    var rows = [
      { sym: '$', label: 'USD · Доллар США', data: c.USD, key: 'usd' },
      { sym: '€', label: 'EUR · Евро',        data: c.EUR, key: 'eur' },
      { sym: '¥', label: 'CNY · Юань',        data: c.CNY, key: 'cny' }
    ];
    var h = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.data) continue;
      var diff = r.data.value - r.data.prev;
      var activeCls = (state.selectedCur === r.key) ? 'rate-row active' : 'rate-row';
      var diffCol = diff > 0 ? 'var(--c-danger)' : (diff < 0 ? 'var(--c-success)' : 'var(--c-text3)');
      h += '<tr class="' + activeCls + '" data-cur="' + r.key + '" tabindex="0" role="button" aria-label="Показать график ' + r.label + '">' +
        '<td><span class="cur-sym">' + r.sym + '</span>' + r.label + '</td>' +
        '<td><b>' + r.data.value.toFixed(2) + ' ₽</b></td>' +
        '<td style="color:' + diffCol + ';font-weight:700">' + (diff > 0 ? '+' : '') + diff.toFixed(2) + '</td>' +
      '</tr>';
    }
    body.innerHTML = h;
  }

  var title = document.getElementById('chart-title');
  if (title) title.textContent = 'Динамика ' + state.selectedCur.toUpperCase() + ' / 7 дней (₽)';

  requestAnimationFrame(function() {
    drawChart(state.ratesHistory, state.selectedCur);
  });
}

function selectCur(cur) {
  if (!cur) return;
  state.selectedCur = cur;
  vibe(10);
  renderRatesModal();
}

function colorWithAlpha(hexOrRgb, alpha) {
  var s = String(hexOrRgb || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    var r = parseInt(s.slice(1, 3), 16);
    var g = parseInt(s.slice(3, 5), 16);
    var b = parseInt(s.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  return 'rgba(56,189,248,' + alpha + ')';
}

function drawChart(h, cur) {
  var c = document.getElementById('sparkCanvas');
  if (!c) return;
  var vals = h ? h[cur || 'usd'] : null;
  var dpr = window.devicePixelRatio || 1;
  var W = c.clientWidth || 320;
  var H = c.clientHeight || 150;
  c.width = W * dpr;
  c.height = H * dpr;
  var ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  var cs = getComputedStyle(document.documentElement);
  var borderCol = cs.getPropertyValue('--c-border').trim() || 'rgba(128,128,128,.15)';
  var accent = cs.getPropertyValue('--c-accent').trim() || '#38bdf8';
  var textCol = cs.getPropertyValue('--c-text3').trim() || '#64748b';
  var textColHigh = cs.getPropertyValue('--c-text').trim() || '#09090b'; // Fixed --c-text for Light/Dark/Indigo!

  if (!h || !vals || vals.length < 2) {
    ctx.fillStyle = textCol;
    ctx.font = '600 12px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Загрузка истории котировок…', W / 2, H / 2);
    return;
  }

  var padX = 28, padTop = 26, padBot = 24;
  var gW = W - padX * 2, gH = H - padTop - padBot;
  var rawMin = Math.min.apply(null, vals);
  var rawMax = Math.max.apply(null, vals);
  var spread = Math.max(rawMax - rawMin, 0.2);
  var mn = rawMin - spread * 0.18;
  var mx = rawMax + spread * 0.18;

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  for (var g = 0; g <= 3; g++) {
    var gy = padTop + (gH / 3) * g;
    ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(W - padX, gy); ctx.stroke();
  }

  var step = gW / (vals.length - 1);
  var pts = [];
  for (var pi = 0; pi < vals.length; pi++) {
    pts.push({
      x: padX + pi * step,
      y: padTop + gH - ((vals[pi] - mn) / (mx - mn)) * gH
    });
  }

  var grad = ctx.createLinearGradient(0, padTop, 0, H - padBot);
  grad.addColorStop(0, colorWithAlpha(accent, 0.24));
  grad.addColorStop(1, colorWithAlpha(accent, 0.0));
  ctx.beginPath();
  for (var fi = 0; fi < pts.length; fi++) {
    if (fi === 0) ctx.moveTo(pts[fi].x, pts[fi].y);
    else ctx.lineTo(pts[fi].x, pts[fi].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, H - padBot);
  ctx.lineTo(pts[0].x, H - padBot);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  for (var si = 0; si < pts.length; si++) {
    if (si === 0) ctx.moveTo(pts[si].x, pts[si].y);
    else ctx.lineTo(pts[si].x, pts[si].y);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  var compactLabels = (W < 310);
  for (var di = 0; di < pts.length; di++) {
    ctx.beginPath();
    ctx.arc(pts[di].x, pts[di].y, 3.8, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();

    // Show price label on all points (or alternate + endpoints on ultra-narrow canvas)
    if (!compactLabels || di === 0 || di === pts.length - 1 || di % 2 === 0) {
      ctx.fillStyle = textColHigh;
      ctx.font = 'bold 10px -apple-system,sans-serif';
      ctx.textAlign = di === 0 ? 'left' : (di === pts.length - 1 ? 'right' : 'center');
      var labelX = di === 0 ? pts[di].x - 4 : (di === pts.length - 1 ? pts[di].x + 4 : pts[di].x);
      var labelY = pts[di].y - 9;
      if (labelY < 13) labelY = pts[di].y + 15;
      ctx.fillText(vals[di].toFixed(2), labelX, labelY);
    }

    ctx.fillStyle = textCol;
    ctx.font = '600 10px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h.dates[di] || '', pts[di].x, H - 7);
  }
}

/* ═══ WEATHER WIDGET & MODAL ═══ */
function weatherIconAndDesc(code) {
  var c = Number(code || 0);
  if (c === 0) return { ic: '☀️', text: 'Ясно' };
  if (c <= 3) return { ic: '⛅', text: 'Переменная облачность' };
  if (c <= 48) return { ic: '🌫', text: 'Туман / дымка' };
  if (c <= 67) return { ic: '🌧', text: 'Дождь' };
  if (c <= 77) return { ic: '❄️', text: 'Снег' };
  return { ic: '⛈', text: 'Гроза / осадки' };
}

function applyWeatherObject(wObj) {
  if (!wObj) return;
  state.weather = wObj;
  var info = weatherIconAndDesc(wObj.code);
  var pill = document.getElementById('weather-pill');
  var t = Number(wObj.temp || 0);
  if (pill) pill.textContent = info.ic + ' ' + (t > 0 ? '+' : '') + t + '°';
}

function loadWeather(useGeo) {
  function fetchByCoords(lat, lon, cityLabel) {
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m';
    fetch(u)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.current) {
          applyWeatherObject({
            city: cityLabel || 'Ваша локация',
            temp: Math.round(d.current.temperature_2m),
            feelsLike: Math.round(d.current.apparent_temperature),
            wind: Math.round(d.current.wind_speed_10m),
            code: d.current.weather_code
          });
          renderWeatherModal();
        }
      }).catch(function() {});
  }

  if (useGeo && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(p) {
        fetchByCoords(p.coords.latitude, p.coords.longitude, 'По геопозиции');
        showToast('Погода обновлена по геопозиции 📍');
      },
      function() {
        fetchByCoords(55.7558, 37.6173, 'Москва');
        showToast('Показана погода в Москве');
      },
      { timeout: 3500 }
    );
  } else {
    fetchByCoords(55.7558, 37.6173, 'Москва');
  }
}

function openWeatherModal() {
  vibe(12);
  renderWeatherModal();
  openModal('weather-modal');
}

function renderWeatherModal() {
  var box = document.getElementById('weather-modal-body');
  if (!box) return;
  var w = state.weather || { city: 'Москва', temp: 4, feelsLike: 1, wind: 11, code: 2 };
  var info = weatherIconAndDesc(w.code);
  var sign = w.temp > 0 ? '+' : '';
  var fSign = w.feelsLike > 0 ? '+' : '';
  box.innerHTML =
    '<div class="weather-stat"><div class="weather-stat-val">' + info.ic + ' ' + sign + w.temp + '°C</div><div class="weather-stat-lbl">' + escHtml(w.city) + ' · ' + info.text + '</div></div>' +
    '<div class="weather-stat"><div class="weather-stat-val">' + fSign + w.feelsLike + '°C</div><div class="weather-stat-lbl">Ощущается как</div></div>' +
    '<div class="weather-stat" style="grid-column:1 / -1"><div class="weather-stat-val">💨 ' + w.wind + ' км/ч</div><div class="weather-stat-lbl">Скорость ветра</div></div>';
}

/* ═══ THEME, FONT SCALE & MODALS ═══ */
function setTheme(t) {
  if (!THEME_COLORS[t]) t = 'dark';
  vibe(10);
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  safeStorageSet('news_theme', t);
  var metaTc = document.getElementById('meta-theme-color');
  if (metaTc) metaTc.setAttribute('content', THEME_COLORS[t]);

  var btns = document.querySelectorAll('.theme-chip');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-theme') === t);
  }
  var rm = document.getElementById('rates-modal');
  if (rm && rm.classList.contains('open')) drawChart(state.ratesHistory, state.selectedCur);
}

function adjustFontScale(delta) {
  vibe(10);
  var base = isNaN(state.fontScale) ? 1 : state.fontScale;
  var s = Math.round(Math.min(1.35, Math.max(0.85, base + delta)) * 100) / 100;
  state.fontScale = s;
  document.documentElement.style.setProperty('--font-scale', String(s));
  safeStorageSet('news_fs', String(s));
  var lbl = document.getElementById('font-scale-label');
  if (lbl) lbl.textContent = Math.round(s * 100) + '%';
}

function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function closeAllModals() {
  var openEls = document.querySelectorAll('.modal-overlay.open');
  for (var i = 0; i < openEls.length; i++) openEls[i].classList.remove('open');
}

/* ═══ SEGMENTED CONTROL & SHORTCUT HASH ROUTING ═══ */
function setSortMode(sortKey) {
  if (sortKey !== 'hot' && sortKey !== 'latest' && sortKey !== 'bookmarks') return;
  state.sort = sortKey;
  var ctrl = document.getElementById('seg-control');
  var ind = document.getElementById('seg-indicator');
  if (ctrl) {
    var segs = ctrl.querySelectorAll('.seg');
    var idx = sortKey === 'hot' ? 0 : (sortKey === 'latest' ? 1 : 2);
    for (var i = 0; i < segs.length; i++) {
      var active = (i === idx);
      segs[i].classList.toggle('active', active);
      segs[i].setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (ind) ind.style.transform = 'translateX(' + (idx * 100) + '%)';
  }
  renderFeed();
}

function applyHashRoute() {
  var h = (window.location.hash || '').replace('#', '').toLowerCase();
  if (h === 'hot' || h === 'latest' || h === 'bookmarks') {
    setSortMode(h);
  }
}

/* ═══ PULL-TO-REFRESH TOUCH GESTURE ═══ */
function initPullToRefresh() {
  var ptr = document.getElementById('ptr-indicator');
  var ptrText = document.getElementById('ptr-text');
  if (!ptr) return;
  var startY = 0;
  var pulling = false;

  window.addEventListener('touchstart', function(e) {
    if (window.scrollY <= 2 && e.touches && e.touches.length === 1) {
      startY = e.touches[0].clientY;
      pulling = true;
    } else {
      pulling = false;
    }
  }, { passive: true });

  window.addEventListener('touchmove', function(e) {
    if (!pulling || !e.touches || !e.touches[0]) return;
    var dy = e.touches[0].clientY - startY;
    if (dy > 55 && window.scrollY <= 2) {
      ptr.classList.add('visible');
      if (ptrText) ptrText.textContent = dy > 95 ? 'Отпустите для обновления…' : 'Потяните для обновления…';
    }
  }, { passive: true });

  window.addEventListener('touchend', function(e) {
    if (!pulling) return;
    pulling = false;
    var endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
    if (endY - startY > 90 && window.scrollY <= 5) {
      if (ptrText) ptrText.textContent = 'Обновление…';
      loadFeed(state.cat, true);
      setTimeout(function() { ptr.classList.remove('visible'); }, 700);
    } else {
      ptr.classList.remove('visible');
    }
  }, { passive: true });
}

/* ═══ PWA INSTALL HANDLING ═══ */
function isStandaloneMode() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  state.deferredPrompt = e;
  var b = document.getElementById('pwa-install-banner');
  // Show floating banner only on mobile screens (< 768px) when not dismissed
  if (b && window.innerWidth < 768 && !sessionStorage.getItem('pwa_d') && !isStandaloneMode()) {
    b.style.display = 'flex';
  }
});

function triggerPwaInstall() {
  vibe(20);
  if (isStandaloneMode()) {
    showToast('Приложение News AI уже установлено ✓');
    return;
  }
  if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then(function() {
      state.deferredPrompt = null;
      var b = document.getElementById('pwa-install-banner');
      if (b) b.style.display = 'none';
    });
  } else {
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    showToast(isIos ? 'Нажмите «Поделиться» → «На экран Домой»' : 'В меню браузера выберите «Установить приложение»');
  }
}

function dismissPwaBanner() {
  var b = document.getElementById('pwa-install-banner');
  if (b) b.style.display = 'none';
  try { sessionStorage.setItem('pwa_d', '1'); } catch (e) {}
}

/* ═══ SERVICE WORKER REGISTRATION ═══ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  });
}

/* ═══ UNIFIED EVENT BINDING (Zero Inline Handlers) ═══ */
document.addEventListener('DOMContentLoaded', function() {
  setTheme(state.theme);
  adjustFontScale(0);

  if (isStandaloneMode()) {
    var btnSetInst = document.getElementById('btn-settings-install');
    if (btnSetInst) btnSetInst.textContent = '✓ Установлено';
  }

  // Capture-phase error listener hides broken card thumbnails cleanly (CSP-safe)
  document.addEventListener('error', function(e) {
    if (e.target && e.target.tagName === 'IMG' && e.target.classList.contains('card-img')) {
      e.target.style.display = 'none';
    }
  }, true);

  // Header controls
  var btnBrand = document.getElementById('btn-brand');
  if (btnBrand) btnBrand.addEventListener('click', function() { setSortMode('hot'); loadFeed('ALL', true); });

  var btnCurrency = document.getElementById('currency-pill');
  if (btnCurrency) btnCurrency.addEventListener('click', openRatesModal);

  var btnWeather = document.getElementById('weather-pill');
  if (btnWeather) btnWeather.addEventListener('click', openWeatherModal);

  var btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', function() { loadFeed(state.cat, true); });

  var btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', function() { vibe(12); openModal('settings-modal'); });

  // Category tabs
  var tabsGrid = document.getElementById('tabs-grid');
  if (tabsGrid) {
    tabsGrid.addEventListener('click', function(e) {
      var tab = e.target.closest('.tab[data-cat]');
      if (!tab) return;
      var cat = tab.getAttribute('data-cat');
      // If user was in Bookmarks and clicks a category tab, return to 'hot' feed so the category actually displays!
      if (state.sort === 'bookmarks') setSortMode('hot');
      loadFeed(cat, false);
    });
  }

  // Segmented sort control
  var segCtrl = document.getElementById('seg-control');
  if (segCtrl) {
    segCtrl.addEventListener('click', function(e) {
      var seg = e.target.closest('.seg[data-sort]');
      if (!seg) return;
      vibe(10);
      setSortMode(seg.getAttribute('data-sort'));
    });
  }

  // Search bar
  var si = document.getElementById('search-input');
  var sc = document.getElementById('search-clear');
  var debounce;
  if (si) {
    si.addEventListener('input', function() {
      state.query = si.value;
      if (sc) sc.style.display = state.query ? 'grid' : 'none';
      clearTimeout(debounce);
      debounce = setTimeout(renderFeed, 160);
    });
  }
  if (sc) {
    sc.addEventListener('click', function() {
      if (si) si.value = '';
      state.query = '';
      sc.style.display = 'none';
      renderFeed();
    });
  }

  // News feed card actions delegation
  var feed = document.getElementById('news-feed');
  if (feed) {
    feed.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'bookmark') toggleBm(id);
      else if (action === 'reader') openReaderModal(id);
      else if (action === 'share') {
        var it = findItem(id);
        if (it) share(it.titleRu || it.title, it.link);
      } else if (action === 'lang') toggleLang(id, btn);
      else if (action === 'retry') loadFeed(state.cat, true);
    });
  }

  // Reader modal actions delegation
  var readerAct = document.getElementById('reader-actions');
  if (readerAct) {
    readerAct.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-reader-action]');
      if (!btn) return;
      var act = btn.getAttribute('data-reader-action');
      var id = btn.getAttribute('data-id');
      if (act === 'bookmark') toggleBm(id);
      else if (act === 'share') {
        var it = findItem(id);
        if (it) share(it.titleRu || it.title, it.link);
      }
    });
  }

  // Currency table row delegation (click + Enter/Space keyboard)
  var ratesBody = document.getElementById('rates-body');
  if (ratesBody) {
    ratesBody.addEventListener('click', function(e) {
      var tr = e.target.closest('tr[data-cur]');
      if (tr) selectCur(tr.getAttribute('data-cur'));
    });
    ratesBody.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var tr = e.target.closest('tr[data-cur]');
        if (tr) { e.preventDefault(); selectCur(tr.getAttribute('data-cur')); }
      }
    });
  }

  // Settings controls
  var themeChips = document.getElementById('theme-chips');
  if (themeChips) {
    themeChips.addEventListener('click', function(e) {
      var chip = e.target.closest('.theme-chip[data-theme]');
      if (chip) setTheme(chip.getAttribute('data-theme'));
    });
  }
  var btnFontDec = document.getElementById('btn-font-dec');
  if (btnFontDec) btnFontDec.addEventListener('click', function() { adjustFontScale(-0.1); });
  var btnFontInc = document.getElementById('btn-font-inc');
  if (btnFontInc) btnFontInc.addEventListener('click', function() { adjustFontScale(0.1); });
  var btnSetInst = document.getElementById('btn-settings-install');
  if (btnSetInst) btnSetInst.addEventListener('click', triggerPwaInstall);

  // Weather geolocation button
  var btnWeatherGeo = document.getElementById('btn-weather-geo');
  if (btnWeatherGeo) btnWeatherGeo.addEventListener('click', function() { loadWeather(true); });

  // PWA Banner buttons
  var btnPwaInst = document.getElementById('btn-pwa-banner-install');
  if (btnPwaInst) btnPwaInst.addEventListener('click', triggerPwaInstall);
  var btnPwaClose = document.getElementById('btn-pwa-banner-close');
  if (btnPwaClose) btnPwaClose.addEventListener('click', dismissPwaBanner);

  // Modal overlay & X close delegation
  document.addEventListener('click', function(e) {
    var closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeModal(closeBtn.getAttribute('data-close-modal'));
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
      closeModal(e.target.id);
    }
  });

  // Global keyboard shortcuts (Escape, /, R)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeAllModals();
      return;
    }
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === '/' && si) {
      e.preventDefault();
      si.focus();
    } else if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      loadFeed(state.cat, true);
    }
  });

  // Redraw chart cleanly on window resize / orientation change
  window.addEventListener('resize', function() {
    var rm = document.getElementById('rates-modal');
    if (rm && rm.classList.contains('open')) drawChart(state.ratesHistory, state.selectedCur);
  });

  window.addEventListener('hashchange', applyHashRoute);

  initPullToRefresh();
  loadCurrency();
  loadWeather(false);
  loadFeed('ALL', false);
  applyHashRoute();
});
