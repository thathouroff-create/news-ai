/**
 * NEWS AI v3.1 — Bulletproof Engine
 * FIXES: no optional chaining, no inline onclick with user data, Safari date parse,
 *        allorigins fallback, consistent localStorage keys, event delegation
 * Compatibility: iOS Safari 12+, Chrome 60+, Firefox 55+, Samsung Internet 8+
 */

/* ═══ FEED SOURCES ═══ */
var FEEDS = {
  ALL: [
    { name: 'РБК',         url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',  lang: 'ru', w: 1.3 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/news.xml',             lang: 'ru', w: 1.2 },
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',           lang: 'ru', w: 1.1 },
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         lang: 'en', w: 1.0 }
  ],
  WORLD: [
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         lang: 'en', w: 1.3 },
    { name: 'РБК',          url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',  lang: 'ru', w: 1.1 },
    { name: 'DW',           url: 'https://rss.dw.com/rdf/rss-ru-all',                  lang: 'ru', w: 1.0 }
  ],
  TECH: [
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',           lang: 'ru', w: 1.3 },
    { name: '3DNews',       url: 'https://3dnews.ru/news/rss/',                         lang: 'ru', w: 1.2 }
  ],
  ECONOMY: [
    { name: 'Ведомости',    url: 'https://www.vedomosti.ru/rss/news',                  lang: 'ru', w: 1.3 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/news.xml',             lang: 'ru', w: 1.2 },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml',     lang: 'en', w: 1.0 }
  ],
  SCIENCE: [
    { name: 'N+1',          url: 'https://nplus1.ru/rss',                              lang: 'ru', w: 1.3 },
    { name: 'Naked Science', url: 'https://naked-science.ru/feed',                     lang: 'ru', w: 1.1 }
  ],
  GAMES: [
    { name: 'StopGame',     url: 'https://rss.stopgame.ru/rss_news.xml',               lang: 'ru', w: 1.3 },
    { name: '3DNews Игры',  url: 'https://3dnews.ru/games/rss/',                        lang: 'ru', w: 1.1 }
  ]
};

/* ═══ STATE ═══ */
var state = {
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
  loading: false
};

function safeJSON(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch (e) { return fallback; }
}

/* ═══ UTILITIES (no optional chaining) ═══ */
function vibe(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 15); } catch (e) {}
}

function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('show'); }, 2200);
}

function escHtml(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

// FIX BUG 6: Safari date parsing — replace space with T
function safeParseDate(str) {
  if (!str) return Date.now();
  var fixed = String(str).replace(' ', 'T');
  var ts = new Date(fixed).getTime();
  return isNaN(ts) ? Date.now() : ts;
}

function relTime(ts) {
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'сейчас';
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

// Safe property access (replaces optional chaining)
function prop(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/* ═══ RSS FETCHER (FIX BUG 5: allorigins fallback) ═══ */
function fetchWithTimeout(url, ms) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('timeout')); }, ms || 6000);
    fetch(url).then(function(r) {
      clearTimeout(timer);
      resolve(r);
    }).catch(function(e) {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function fetchFeed(cfg) {
  var rss2jsonUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(cfg.url);

  // Attempt 1: rss2json
  return fetchWithTimeout(rss2jsonUrl, 6000)
    .then(function(r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    })
    .then(function(d) {
      if (d && d.status === 'ok' && d.items && d.items.length > 0) {
        return d.items.map(function(it) { return normalizeRss2Json(it, cfg); });
      }
      throw new Error('empty');
    })
    .catch(function() {
      // Attempt 2: allorigins.win XML bridge
      var aoUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(cfg.url);
      return fetchWithTimeout(aoUrl, 6000)
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.contents) {
            return parseXmlFeed(d.contents, cfg);
          }
          return [];
        })
        .catch(function() { return []; });
    });
}

function normalizeRss2Json(it, cfg) {
  var img = null;
  if (it.thumbnail && typeof it.thumbnail === 'string' && it.thumbnail.indexOf('http') === 0) {
    img = it.thumbnail;
  } else if (it.enclosure && it.enclosure.link && it.enclosure.link.indexOf('http') === 0) {
    img = it.enclosure.link;
  } else {
    var html = (it.description || '') + (it.content || '');
    var m = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+)/i);
    if (m) img = m[1];
  }
  var link = it.link || it.guid || '#';
  return {
    id: makeId(link),
    title: (it.title || '').trim() || 'Без заголовка',
    link: link,
    desc: stripHtml(it.description || it.content || ''),
    img: img,
    date: safeParseDate(it.pubDate),
    src: cfg.name,
    lang: cfg.lang,
    w: cfg.w || 1,
    titleRu: null,
    descRu: null
  };
}

// FIX BUG 5: XML fallback parser for allorigins
function parseXmlFeed(xmlStr, cfg) {
  try {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlStr, 'text/xml');
    var entries = doc.querySelectorAll('item, entry');
    var results = [];
    for (var i = 0; i < Math.min(entries.length, 12); i++) {
      var el = entries[i];
      var titleEl = el.querySelector('title');
      var linkEl = el.querySelector('link');
      var descEl = el.querySelector('description, summary, content');
      var dateEl = el.querySelector('pubDate, published, updated');
      var encEl = el.querySelector('enclosure[type^="image"]');

      var title = titleEl ? titleEl.textContent.trim() : '';
      var link = linkEl ? (linkEl.textContent.trim() || linkEl.getAttribute('href') || '#') : '#';
      var desc = descEl ? descEl.textContent.trim() : '';
      var img = encEl ? encEl.getAttribute('url') : null;

      if (!img && desc) {
        var m2 = desc.match(/<img[^>]+src=["'](https?:\/\/[^"']+)/i);
        if (m2) img = m2[1];
      }

      if (title) {
        results.push({
          id: makeId(link),
          title: title,
          link: link,
          desc: stripHtml(desc),
          img: img,
          date: safeParseDate(dateEl ? dateEl.textContent : ''),
          src: cfg.name,
          lang: cfg.lang,
          w: cfg.w || 1,
          titleRu: null,
          descRu: null
        });
      }
    }
    return results;
  } catch (e) { return []; }
}

/* ═══ AUTO-TRANSLATE ═══ */
function translate(text) {
  if (!text || !text.trim()) return Promise.resolve(text);
  if (state.transCache[text]) return Promise.resolve(state.transCache[text]);
  return fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=' + encodeURIComponent(text))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d[0]) {
        var tr = d[0].map(function(x) { return x[0]; }).join('');
        state.transCache[text] = tr;
        try { localStorage.setItem('news_tr', JSON.stringify(state.transCache)); } catch (e) {}
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
          var card = document.getElementById(it.id);
          if (card) {
            var tEl = card.querySelector('.card-title');
            var dEl = card.querySelector('.card-desc');
            var bEl = card.querySelector('.badge-lang');
            if (tEl && results[0] !== it.title) tEl.textContent = results[0];
            if (dEl && results[1] !== it.desc) dEl.textContent = results[1];
            if (bEl) { bEl.className = 'badge badge-translated'; bEl.textContent = '🇷🇺 RU'; }
          }
        });
    })).then(function() {
      setTimeout(function() { processBatch(startIdx + 3); }, 200);
    });
  }

  processBatch(0);
}

/* ═══ SMART RANKING ═══ */
function hotScore(it) {
  var hrs = Math.max(0.1, (Date.now() - it.date) / 3600000);
  var s = (it.w || 1) / Math.pow(hrs + 1.5, 1.2) * 100;
  if (it.img) s *= 1.2;
  if (it.desc && it.desc.length > 40) s *= 1.1;
  return s;
}

/* ═══ FEED LOADING ═══ */
function loadFeed(cat, force) {
  if (state.loading) return;
  cat = cat || 'ALL';
  vibe(12);
  state.cat = cat;
  state.loading = true;
  var feed = document.getElementById('news-feed');
  var key = 'fc_' + cat;

  // Update active tab
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-cat') === cat);
  }

  // Refresh spin
  var rb = document.getElementById('btn-refresh');
  if (rb) rb.classList.add('spinning');

  if (state.sort === 'bookmarks') {
    state.loading = false;
    if (rb) rb.classList.remove('spinning');
    renderBookmarks();
    return;
  }

  // Check cache (8 min)
  if (!force) {
    var c = safeJSON(localStorage.getItem(key), null);
    if (c && Date.now() - c.ts < 480000 && c.items && c.items.length > 0) {
      state.items = c.items;
      state.loading = false;
      if (rb) rb.classList.remove('spinning');
      renderFeed();
      autoTranslateItems(state.items);
      return;
    }
  }

  showSkeletons();

  // FIX BUG 5: Try to load pre-computed feeds from our own domain (bypasses all CORS and RKN blocks)
  fetch('./data/latest.json?t=' + Math.floor(Date.now() / 300000))
    .then(function(r) {
      if (!r.ok) throw new Error('No pre-computed data');
      return r.json();
    })
    .then(function(d) {
      if (d && d.data && d.data[cat] && d.data[cat].length > 0) {
        state.items = d.data[cat];
        try { localStorage.setItem(key, JSON.stringify({ items: state.items, ts: Date.now() })); } catch (e) {}
        renderFeed();
        autoTranslateItems(state.items);
        state.loading = false;
        if (rb) rb.classList.remove('spinning');
        return;
      }
      throw new Error('Empty pre-computed data');
    })
    .catch(function() {
      // Fallback to client-side parsing if pre-computed data is missing
      var cfgs = FEEDS[cat] || FEEDS.ALL;
      Promise.all(cfgs.map(function(c) {
        return fetchFeed(c).catch(function() { return []; });
      })).then(function(results) {
        var flat = [];
        for (var r = 0; r < results.length; r++) {
          flat = flat.concat(results[r]);
        }

        // Deduplicate
        var seen = {};
        var uniq = [];
        for (var j = 0; j < flat.length; j++) {
          var it = flat[j];
          var k = it.title.toLowerCase().slice(0, 28);
          if (!seen[k] && !seen[it.link]) {
            seen[k] = true;
            seen[it.link] = true;
            uniq.push(it);
          }
        }

        if (uniq.length > 0) {
          state.items = uniq;
          try { localStorage.setItem(key, JSON.stringify({ items: uniq, ts: Date.now() })); } catch (e) {}
          renderFeed();
          autoTranslateItems(state.items);
        } else {
          feed.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Не удалось загрузить</div><p style="font-size:.82rem;margin:8px 0">Проверьте интернет-соединение</p><button class="btn-primary" data-action="retry">Повторить</button></div>';
          updateCount('Ошибка');
        }
      }).catch(function() {
        feed.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Ошибка сети</div><button class="btn-primary" data-action="retry">Повторить</button></div>';
        updateCount('Ошибка');
      }).then(function() {
        state.loading = false;
        if (rb) rb.classList.remove('spinning');
      });
    });
}

/* ═══ RENDER (FIX BUG 2: NO inline onclick with user data) ═══ */
function renderFeed() {
  var feed = document.getElementById('news-feed');
  var items = state.items.slice();

  if (state.query.trim()) {
    var q = state.query.toLowerCase();
    items = items.filter(function(it) {
      return (it.titleRu || it.title).toLowerCase().indexOf(q) >= 0 ||
             (it.descRu || it.desc).toLowerCase().indexOf(q) >= 0;
    });
  }

  if (!items.length) {
    feed.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><p style="font-size:.82rem">Попробуйте другой запрос</p></div>';
    updateCount('0');
    return;
  }

  if (state.sort === 'hot') items.sort(function(a, b) { return hotScore(b) - hotScore(a); });
  else if (state.sort === 'latest') items.sort(function(a, b) { return b.date - a.date; });

  updateCount(items.length + ' ' + noun(items.length, 'новость', 'новости', 'новостей'));

  // FIX BUG 2: All user-data interactions via data-id attributes + event delegation
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var bm = false;
    for (var b = 0; b < state.bookmarks.length; b++) {
      if (state.bookmarks[b].id === it.id) { bm = true; break; }
    }
    var top = (state.sort === 'hot' && i === 0);
    var isEn = it.lang === 'en';
    var displayTitle = it.titleRu || it.title;
    var displayDesc = it.descRu || it.desc;
    var translated = isEn && it.titleRu && it.titleRu !== it.title;
    var delay = Math.min(i * 0.04, 0.2);

    html += '<article class="news-card' + (top ? ' top-card' : '') + '" id="' + it.id + '" style="animation-delay:' + delay + 's">' +
      '<div class="card-meta">' +
        '<div class="card-source">' +
          '<span class="badge badge-source">' + escHtml(it.src) + '</span>' +
          (isEn ? '<span class="badge ' + (translated ? 'badge-translated' : 'badge-lang') + '">' + (translated ? '🇷🇺 RU' : 'EN') + '</span>' : '') +
        '</div>' +
        '<span class="card-time">' + relTime(it.date) + '</span>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-text">' +
          '<a href="' + escHtml(it.link) + '" target="_blank" rel="noopener" class="card-title">' + escHtml(displayTitle) + '</a>' +
          (displayDesc ? '<p class="card-desc">' + escHtml(displayDesc) + '</p>' : '') +
        '</div>' +
        (it.img ? '<img src="' + escHtml(it.img) + '" alt="" class="card-img" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '</div>' +
      '<div class="card-actions">' +
        '<div class="actions-left">' +
          (isEn ? '<button class="act act-lang" data-action="lang" data-id="' + it.id + '" data-showing="' + (translated ? 'ru' : 'en') + '">' + (translated ? '🇬🇧 Оригинал' : '🌐 Перевод') + '</button>' : '') +
          '<button class="act' + (bm ? ' active' : '') + '" data-action="bookmark" data-id="' + it.id + '">' + (bm ? '⭐ Сохранено' : '☆ Закладка') + '</button>' +
          '<button class="act" data-action="share" data-id="' + it.id + '">🔗</button>' +
        '</div>' +
        '<a href="' + escHtml(it.link) + '" target="_blank" rel="noopener" class="card-link">Читать ↗</a>' +
      '</div>' +
    '</article>';
  }
  feed.innerHTML = html;
}

function showSkeletons() {
  var feed = document.getElementById('news-feed');
  var s = '';
  for (var i = 0; i < 5; i++) {
    s += '<div class="skel"><div class="skel-line" style="width:30%"></div><div class="skel-line" style="width:85%"></div><div class="skel-line" style="width:60%"></div><div class="skel-line" style="width:100%;height:10px"></div></div>';
  }
  feed.innerHTML = s;
}

function updateCount(text) {
  var el = document.getElementById('feed-status');
  if (el) el.textContent = text;
}

/* ═══ EVENT DELEGATION (FIX BUG 2) ═══ */
function initEventDelegation() {
  var feed = document.getElementById('news-feed');
  if (!feed) return;

  feed.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;

    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');

    if (action === 'bookmark') {
      e.preventDefault();
      toggleBm(id);
    } else if (action === 'share') {
      e.preventDefault();
      var it = findItem(id);
      if (it) share(it.title, it.link);
    } else if (action === 'lang') {
      e.preventDefault();
      toggleLang(id, btn);
    } else if (action === 'retry') {
      e.preventDefault();
      loadFeed(state.cat, true);
    }
  });
}

function findItem(id) {
  for (var i = 0; i < state.items.length; i++) {
    if (state.items[i].id === id) return state.items[i];
  }
  for (var j = 0; j < state.bookmarks.length; j++) {
    if (state.bookmarks[j].id === id) return state.bookmarks[j];
  }
  return null;
}

/* ═══ LANGUAGE TOGGLE ═══ */
function toggleLang(id, btn) {
  vibe(15);
  var it = findItem(id);
  if (!it) return;
  var card = document.getElementById(id);
  if (!card) return;
  var tEl = card.querySelector('.card-title');
  var dEl = card.querySelector('.card-desc');

  var showingRu = btn.getAttribute('data-showing') === 'ru';
  if (showingRu) {
    if (tEl) tEl.textContent = it.title;
    if (dEl) dEl.textContent = it.desc;
    btn.setAttribute('data-showing', 'en');
    btn.textContent = '🌐 Перевод';
  } else {
    if (tEl) tEl.textContent = it.titleRu || it.title;
    if (dEl) dEl.textContent = it.descRu || it.desc;
    btn.setAttribute('data-showing', 'ru');
    btn.textContent = '🇬🇧 Оригинал';
  }
}

/* ═══ BOOKMARKS ═══ */
function toggleBm(id) {
  vibe(20);
  var it = findItem(id);
  if (!it) return;
  var idx = -1;
  for (var i = 0; i < state.bookmarks.length; i++) {
    if (state.bookmarks[i].id === id) { idx = i; break; }
  }
  if (idx >= 0) { state.bookmarks.splice(idx, 1); showToast('Удалено из закладок'); }
  else { state.bookmarks.unshift(it); showToast('Сохранено ⭐'); }
  try { localStorage.setItem('news_bm', JSON.stringify(state.bookmarks)); } catch (e) {}
  if (state.sort === 'bookmarks') renderBookmarks();
  else renderFeed();
}

function renderBookmarks() {
  var feed = document.getElementById('news-feed');
  if (!state.bookmarks.length) {
    feed.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">Закладок пока нет</div><p style="font-size:.82rem">Сохраняйте интересные новости кнопкой ☆</p></div>';
    updateCount('0 закладок');
    return;
  }
  updateCount(state.bookmarks.length + ' ' + noun(state.bookmarks.length, 'закладка', 'закладки', 'закладок'));
  state.items = state.bookmarks.slice();
  renderFeed();
}

/* ═══ SHARE ═══ */
function share(title, url) {
  vibe(12);
  if (navigator.share) {
    navigator.share({ title: title, url: url }).catch(function() {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(title + ' — ' + url)
      .then(function() { showToast('Скопировано 📋'); })
      .catch(function() { showToast('Не удалось'); });
  }
}

/* ═══ CURRENCY ═══ */
function loadCurrency() {
  fetch('https://www.cbr-xml-daily.ru/daily_json.js')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      state.currency = d;
      var pill = document.getElementById('currency-pill');
      if (pill && d.Valute && d.Valute.USD && d.Valute.EUR) {
        pill.innerHTML = '<span class="cur cur-usd">$ ' + d.Valute.USD.Value.toFixed(1) + '</span>' +
                         '<span class="cur cur-eur">€ ' + d.Valute.EUR.Value.toFixed(1) + '</span>';
      }
    }).catch(function() {});
}

state.selectedCur = 'usd';

function openRatesModal() {
  vibe(15);
  document.getElementById('rates-modal').classList.add('open');
  if (!state.ratesHistory) {
    var dates = [], usd = [], eur = [], cny = [];
    var u = 'https://www.cbr-xml-daily.ru/daily_json.js';
    function fetchNext(i) {
      if (i >= 7) { 
        state.ratesHistory = { dates: dates, usd: usd, eur: eur, cny: cny }; 
        renderRatesModal(); 
        return; 
      }
      fetch(u).then(function(r) { return r.json(); }).then(function(d) {
        dates.unshift(new Date(d.Date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
        usd.unshift(d.Valute.USD.Value);
        if(d.Valute.EUR) eur.unshift(d.Valute.EUR.Value); else eur.unshift(0);
        if(d.Valute.CNY) cny.unshift(d.Valute.CNY.Value); else cny.unshift(0);
        u = 'https:' + d.PreviousURL;
        fetchNext(i + 1);
      }).catch(function() {});
    }
    fetchNext(0);
  } else {
    renderRatesModal();
  }
}

function renderRatesModal() {
  var v = state.currency && state.currency.Valute ? state.currency.Valute : null;
  if (!v) return;

  var body = document.getElementById('rates-body');
  if (body) {
    var pairs = [['🇺🇸 USD', v.USD, 'usd'], ['🇪🇺 EUR', v.EUR, 'eur'], ['🇨🇳 CNY', v.CNY, 'cny']];
    var h = '';
    for (var i = 0; i < pairs.length; i++) {
      var name = pairs[i][0], c = pairs[i][1], key = pairs[i][2];
      if (!c) continue;
      var diff = c.Value - c.Previous;
      var act = (state.selectedCur === key) ? ' style="background:var(--c-surface2);cursor:pointer"' : ' style="cursor:pointer"';
      h += '<tr' + act + ' onclick="selectCur(\'' + key + '\')"><td>' + name + '</td><td><b>' + c.Value.toFixed(2) + ' ₽</b></td><td style="color:' + (diff > 0 ? 'var(--c-danger)' : 'var(--c-success)') + '">' + (diff > 0 ? '+' : '') + diff.toFixed(2) + '</td></tr>';
    }
    body.innerHTML = h;
  }
  
  var title = document.getElementById('chart-title');
  if (title) title.textContent = 'Динамика ' + state.selectedCur.toUpperCase() + ' / 7 дней';

  drawChart(state.ratesHistory, state.selectedCur);
}

window.selectCur = function(cur) {
  state.selectedCur = cur;
  vibe(10);
  renderRatesModal();
};

function drawChart(h, cur) {
  var c = document.getElementById('sparkCanvas');
  var vals = h ? h[cur || 'usd'] : null;
  if (!c || !h || !vals || vals.length < 2) return;
  
  var ctx = c.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = c.getBoundingClientRect();
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height, P = 32; // More padding for text
  var gW = W - P * 2, gH = H - P * 2;
  var mn = Math.min.apply(null, vals) - 0.5;
  var mx = Math.max.apply(null, vals) + 0.5;
  ctx.clearRect(0, 0, W, H);

  var cs = getComputedStyle(document.documentElement);
  var borderCol = cs.getPropertyValue('--c-border').trim() || 'rgba(255,255,255,.06)';
  var accent = cs.getPropertyValue('--c-accent').trim() || '#38bdf8';
  var textCol = cs.getPropertyValue('--c-text3').trim() || '#71717a';
  var textColHigh = cs.getPropertyValue('--c-text1').trim() || '#fff';

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 1;
  for (var g = 0; g <= 3; g++) {
    var y = P + gH / 3 * g;
    ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
  }

  var step = gW / (vals.length - 1);
  var pts = [];
  for (var pi = 0; pi < vals.length; pi++) {
    pts.push({ x: P + pi * step, y: P + gH - (vals[pi] - mn) / (mx - mn) * gH });
  }

  var grad = ctx.createLinearGradient(0, P, 0, H - P);
  grad.addColorStop(0, accent + '30');
  grad.addColorStop(1, accent + '00');
  ctx.beginPath();
  for (var fi = 0; fi < pts.length; fi++) {
    if (fi === 0) ctx.moveTo(pts[fi].x, pts[fi].y);
    else ctx.lineTo(pts[fi].x, pts[fi].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, H - P);
  ctx.lineTo(pts[0].x, H - P);
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

  for (var di = 0; di < pts.length; di++) {
    ctx.beginPath();
    ctx.arc(pts[di].x, pts[di].y, 4, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    
    // Draw Value (Price)
    ctx.fillStyle = textColHigh;
    ctx.font = 'bold 10px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    var textY = pts[di].y - 10;
    if (pts[di].y < P + 10) textY = pts[di].y + 16; // flip down if too high
    ctx.fillText(vals[di].toFixed(2), pts[di].x, textY);
    
    // Draw Date (X-Axis)
    ctx.fillStyle = textCol;
    ctx.font = '10px -apple-system,sans-serif';
    ctx.fillText(h.dates[di], pts[di].x, H - 8);
  }
}

/* ═══ WEATHER ═══ */
function loadWeather() {
  function go(lat, lon) {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current_weather=true')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.current_weather) {
          var t = Math.round(d.current_weather.temperature);
          var wc = d.current_weather.weathercode;
          var ic = wc === 0 ? '☀️' : wc <= 3 ? '⛅' : wc <= 48 ? '🌫' : wc <= 67 ? '🌧' : wc <= 77 ? '❄️' : '⛈';
          var pill = document.getElementById('weather-pill');
          if (pill) pill.textContent = ic + ' ' + (t > 0 ? '+' : '') + t + '°';
        }
      }).catch(function() {});
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(p) { go(p.coords.latitude, p.coords.longitude); },
      function() { go(55.75, 37.61); },
      { timeout: 3000 }
    );
  } else { go(55.75, 37.61); }
}

/* ═══ THEME / FONT ═══ */
function setTheme(t) {
  vibe(12);
  state.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('news_theme', t);
  var btns = document.querySelectorAll('.theme-chip');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-theme') === t);
  }
}

function adjustFontScale(d) {
  vibe(12);
  var s = Math.round(Math.min(1.35, Math.max(0.85, state.fontScale + d)) * 100) / 100;
  state.fontScale = s;
  document.documentElement.style.setProperty('--font-scale', s);
  localStorage.setItem('news_fs', String(s));
  var l = document.getElementById('font-scale-label');
  if (l) l.textContent = Math.round(s * 100) + '%';
}

/* ═══ MODALS ═══ */
function openSettingsModal() { vibe(12); document.getElementById('settings-modal').classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ═══ SEG CONTROL ═══ */
function initSegControl() {
  var ctrl = document.getElementById('seg-control');
  var indicator = document.getElementById('seg-indicator');
  if (!ctrl || !indicator) return;
  var segs = ctrl.querySelectorAll('.seg');

  function moveIndicator(btn) {
    var rect = btn.getBoundingClientRect();
    var parentRect = ctrl.getBoundingClientRect();
    indicator.style.width = (rect.width - 2) + 'px';
    indicator.style.transform = 'translateX(' + (rect.left - parentRect.left - 2) + 'px)';
  }

  var active = ctrl.querySelector('.seg.active');
  if (active) requestAnimationFrame(function() { moveIndicator(active); });

  for (var i = 0; i < segs.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        vibe(12);
        for (var j = 0; j < segs.length; j++) segs[j].classList.remove('active');
        btn.classList.add('active');
        moveIndicator(btn);
        state.sort = btn.getAttribute('data-sort');
        if (state.sort === 'bookmarks') renderBookmarks();
        else renderFeed();
      });
    })(segs[i]);
  }
}

/* ═══ PWA ═══ */
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  state.deferredPrompt = e;
  var b = document.getElementById('pwa-install-banner');
  if (b && !sessionStorage.getItem('pwa_d')) b.style.display = 'flex';
});

function triggerPwaInstall() {
  vibe(25);
  if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then(function() {
      state.deferredPrompt = null;
      document.getElementById('pwa-install-banner').style.display = 'none';
    });
  } else {
    showToast('Нажмите «Поделиться» → «На экран Домой»');
  }
}

function dismissPwaBanner() {
  document.getElementById('pwa-install-banner').style.display = 'none';
  sessionStorage.setItem('pwa_d', '1');
}

/* ═══ SERVICE WORKER ═══ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  });
}

/* ═══ INIT ═══ */
document.addEventListener('DOMContentLoaded', function() {
  setTheme(state.theme);
  adjustFontScale(0);

  var si = document.getElementById('search-input');
  var sc = document.getElementById('search-clear');
  var debounce;
  if (si) {
    si.addEventListener('input', function() {
      state.query = si.value;
      if (sc) sc.style.display = state.query ? 'block' : 'none';
      clearTimeout(debounce);
      debounce = setTimeout(function() { renderFeed(); }, 200);
    });
  }
  if (sc) {
    sc.addEventListener('click', function() {
      si.value = '';
      state.query = '';
      sc.style.display = 'none';
      renderFeed();
    });
  }

  initSegControl();
  initEventDelegation();
  loadCurrency();
  loadWeather();
  loadFeed('ALL');
});
