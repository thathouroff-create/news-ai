/**
 * GLOBAL NEWS AI — Application Engine (v2.2)
 * High-Speed Mobile-First RSS Aggregator, Zero Bloat, Offline Cache
 */

// --- КОНФИГУРАЦИЯ ИСТОЧНИКОВ НОВОСТЕЙ ---
const FEED_CONFIGS = {
  ALL: [
    { name: 'РБК Главное', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', weight: 1.3 },
    { name: 'Коммерсантъ', url: 'https://www.kommersant.ru/RSS/news.xml', lang: 'ru', weight: 1.2 },
    { name: 'Habr', url: 'https://habr.com/ru/rss/best/daily/?fl=ru', lang: 'ru', weight: 1.1 },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', weight: 1.0 }
  ],
  WORLD: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', weight: 1.3 },
    { name: 'РБК Мир', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', weight: 1.2 },
    { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-ru-all', lang: 'ru', weight: 1.0 }
  ],
  TECH: [
    { name: 'Habr', url: 'https://habr.com/ru/rss/best/daily/?fl=ru', lang: 'ru', weight: 1.3 },
    { name: '3DNews', url: 'https://3dnews.ru/news/rss/', lang: 'ru', weight: 1.2 }
  ],
  ECONOMY: [
    { name: 'Ведомости', url: 'https://www.vedomosti.ru/rss/news', lang: 'ru', weight: 1.3 },
    { name: 'Коммерсантъ', url: 'https://www.kommersant.ru/RSS/news.xml', lang: 'ru', weight: 1.2 },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en', weight: 1.0 }
  ],
  SCIENCE: [
    { name: 'Naked Science', url: 'https://naked-science.ru/feed', lang: 'ru', weight: 1.3 },
    { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', lang: 'en', weight: 1.1 }
  ],
  GAMES: [
    { name: 'StopGame', url: 'https://rss.stopgame.ru/rss_news.xml', lang: 'ru', weight: 1.3 },
    { name: 'Habr Geektimes', url: 'https://habr.com/ru/rss/hubs/all/', lang: 'ru', weight: 1.1 }
  ]
};

// --- СОСТОЯНИЕ ПРИЛОЖЕНИЯ ---
const state = {
  currentCategory: 'ALL',
  currentSort: 'hot', // 'hot', 'latest', 'bookmarks'
  searchQuery: '',
  newsItems: [],
  bookmarks: JSON.parse(localStorage.getItem('news_bookmarks') || '[]'),
  translations: JSON.parse(localStorage.getItem('news_translations') || '{}'),
  theme: localStorage.getItem('news_theme') || 'dark',
  fontScale: parseFloat(localStorage.getItem('news_font_scale') || '1'),
  deferredPrompt: null,
  currencyData: null,
  historyRates: null
};

// Тактильный виброотклик
function vibe(duration = 20) {
  try {
    if (navigator.vibrate) navigator.vibrate(duration);
  } catch (e) {}
}

// Показ всплывающего тоста
function showToast(message) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

// --- УНИВЕРСАЛЬНЫЙ RSS ПАРСЕР С РЕЗЕРВИРОВАНИЕМ ---
async function fetchFeed(cfg) {
  // 1. Попытка через rss2json
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(cfg.url)}`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data && data.status === 'ok' && data.items && data.items.length > 0) {
      return data.items.map((item) => normalizeRss2Json(item, cfg));
    }
  } catch (e) {}

  // 2. Попытка через feed2json
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://feed2json.org/convert?url=${encodeURIComponent(cfg.url)}`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data && data.items && data.items.length > 0) {
      return data.items.map((item) => normalizeFeed2Json(item, cfg));
    }
  } catch (e) {}

  return [];
}

// Нормализация элементов из rss2json
function normalizeRss2Json(item, cfg) {
  let imageUrl = null;
  if (item.thumbnail && typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http')) {
    imageUrl = item.thumbnail;
  } else if (item.enclosure && item.enclosure.link && item.enclosure.link.startsWith('http')) {
    imageUrl = item.enclosure.link;
  } else {
    const html = (item.description || '') + ' ' + (item.content || '');
    const m = html.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (m && m[1]) imageUrl = m[1];
  }

  const cleanDesc = cleanHtmlText(item.description || item.content || '');
  const link = item.link || item.guid || '#';
  const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
  const id = 'id_' + btoa(encodeURIComponent(link)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);

  return {
    id,
    title: (item.title || 'Без названия').trim(),
    link,
    description: cleanDesc,
    imageUrl,
    pubDate: isNaN(pubDate) ? Date.now() : pubDate,
    source: cfg.name,
    lang: cfg.lang,
    weight: cfg.weight || 1.0
  };
}

// Нормализация элементов из feed2json
function normalizeFeed2Json(item, cfg) {
  let imageUrl = item.image || item.banner_image || null;
  if (!imageUrl && item.summary) {
    const m = item.summary.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (m && m[1]) imageUrl = m[1];
  }

  const cleanDesc = cleanHtmlText(item.summary || item.content_text || '');
  const link = item.url || '#';
  const pubDate = item.date_published ? new Date(item.date_published).getTime() : Date.now();
  const id = 'id_' + btoa(encodeURIComponent(link)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);

  return {
    id,
    title: (item.title || 'Без названия').trim(),
    link,
    description: cleanDesc,
    imageUrl,
    pubDate: isNaN(pubDate) ? Date.now() : pubDate,
    source: cfg.name,
    lang: cfg.lang,
    weight: cfg.weight || 1.0
  };
}

// Очистка HTML тегов
function cleanHtmlText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 220);
}

// --- УМНЫЙ РЕЙТИНГ НОВОСТЕЙ (SMART RANKING) ---
function calculateHotScore(item) {
  const hoursAgo = Math.max(0.1, (Date.now() - item.pubDate) / (1000 * 60 * 60));
  const timeDecay = 1 / Math.pow(hoursAgo + 1.2, 1.25);
  let score = (item.weight || 1.0) * timeDecay * 100;
  if (item.imageUrl) score *= 1.25;
  if (item.description && item.description.length > 50) score *= 1.15;
  return score;
}

// Форматирование относительного времени
function formatRelativeTime(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'только что';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн назад`;
  return new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// --- БЫСТРЫЙ И ЧИСТЫЙ АВТОПЕРЕВОД (TRANSLATION ENGINE) ---
async function translateText(text) {
  if (!text || text.trim().length === 0) return text;
  if (state.translations[text]) return state.translations[text];

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      const translated = data[0].map((item) => item[0]).join('');
      state.translations[text] = translated;
      try {
        localStorage.setItem('news_translations', JSON.stringify(state.translations));
      } catch (e) {}
      return translated;
    }
  } catch (err) {
    console.error('Translation error:', err);
  }
  return text;
}

// Перевод карточки по клику
async function handleTranslateCard(cardId, titleText, descText) {
  vibe(20);
  const card = document.getElementById(cardId);
  if (!card) return;

  const btn = card.querySelector('.btn-translate');
  const titleEl = card.querySelector('.news-title');
  const descEl = card.querySelector('.news-description');

  if (btn.classList.contains('active')) {
    titleEl.textContent = titleText;
    if (descEl) descEl.textContent = descText;
    btn.classList.remove('active');
    btn.innerHTML = '🌐 Перевести';
    return;
  }

  btn.innerHTML = '⏳ Переводим...';
  const [transTitle, transDesc] = await Promise.all([
    translateText(titleText),
    translateText(descText)
  ]);

  titleEl.textContent = transTitle;
  if (descEl && transDesc && transDesc !== descText) {
    descEl.textContent = transDesc;
  }
  btn.classList.add('active');
  btn.innerHTML = '🇷🇺 Оригинал';
  showToast('Переведено на русский');
}

// --- ЗАГРУЗКА И КЭШИРОВАНИЕ ЛЕНТЫ ---
async function loadFeed(category = 'ALL', forceRefresh = false) {
  vibe(15);
  state.currentCategory = category;
  const feedContainer = document.getElementById('news-feed');
  const cacheKey = `feed_cache_${category}`;

  // Обновляем активный чип в сетке 3+3
  document.querySelectorAll('.tab-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.category === category);
  });

  if (state.currentSort === 'bookmarks') {
    renderBookmarks();
    return;
  }

  // Проверка локального кэша (10 минут)
  if (!forceRefresh) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 10 * 60 * 1000 && parsed.items.length > 0) {
          state.newsItems = parsed.items;
          renderNewsList();
          return;
        }
      } catch (e) {}
    }
  }

  // Показываем скелетоны
  renderSkeletons();

  const configs = FEED_CONFIGS[category] || FEED_CONFIGS.ALL;
  try {
    const results = await Promise.all(configs.map((cfg) => fetchFeed(cfg)));
    const flatItems = results.flat();

    // Дедупликация
    const seen = new Set();
    const uniqueItems = [];
    for (const item of flatItems) {
      const key = item.title.toLowerCase().substring(0, 30);
      if (!seen.has(key) && !seen.has(item.link)) {
        seen.add(key);
        seen.add(item.link);
        uniqueItems.push(item);
      }
    }

    if (uniqueItems.length > 0) {
      state.newsItems = uniqueItems;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ items: uniqueItems, timestamp: Date.now() }));
      } catch (e) {}
      renderNewsList();
    } else {
      throw new Error('No items returned');
    }
  } catch (err) {
    feedContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-title">Не удалось загрузить новости</div>
        <p style="font-size:0.85rem; margin-bottom:12px;">Проверьте интернет-соединение или повторите попытку</p>
        <button class="btn-install-primary" onclick="loadFeed('${category}', true)">🔄 Повторить</button>
      </div>`;
    const statusText = document.getElementById('feed-status');
    if (statusText) statusText.textContent = 'Ошибка сети';
  }
}

// --- РЕНДЕРИНГ СПИСКА НОВОСТЕЙ ---
function renderNewsList() {
  const feedContainer = document.getElementById('news-feed');
  const statusText = document.getElementById('feed-status');

  let items = [...state.newsItems];

  // Поиск
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(
      (item) => item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    );
  }

  if (items.length === 0) {
    feedContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Ничего не найдено</div>
        <p style="font-size:0.85rem;">Попробуйте изменить поисковый запрос</p>
      </div>`;
    if (statusText) statusText.textContent = '0 новостей';
    return;
  }

  // Сортировка
  if (state.currentSort === 'hot') {
    items.sort((a, b) => calculateHotScore(b) - calculateHotScore(a));
  } else if (state.currentSort === 'latest') {
    items.sort((a, b) => b.pubDate - a.pubDate);
  }

  if (statusText) {
    statusText.textContent = `${items.length} ${getNoun(items.length, 'новость', 'новости', 'новостей')}`;
  }

  feedContainer.innerHTML = items
    .map((item, index) => {
      const isBookmarked = state.bookmarks.some((b) => b.id === item.id);
      const isTop = state.currentSort === 'hot' && index === 0;
      const cleanTitleEsc = escapeHtml(item.title);
      const cleanDescEsc = escapeHtml(item.description);

      return `
      <article class="news-card ${isTop ? 'top-priority' : ''}" id="${item.id}">
        <div class="card-header">
          <div class="source-badge-wrap">
            <span class="source-badge">${escapeHtml(item.source)}</span>
            ${item.lang === 'en' ? '<span class="lang-badge">EN</span>' : ''}
          </div>
          <span class="card-time">${formatRelativeTime(item.pubDate)}</span>
        </div>

        <div class="card-body">
          <div class="card-content-area">
            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="news-title">
              ${cleanTitleEsc}
            </a>
            ${cleanDescEsc ? `<p class="news-description">${cleanDescEsc}</p>` : ''}
          </div>
          ${item.imageUrl ? `
            <img src="${escapeHtml(item.imageUrl)}" alt="" class="news-thumbnail" loading="lazy" onerror="this.style.display='none'">
          ` : ''}
        </div>

        <div class="card-footer">
          <div class="footer-actions-left">
            ${item.lang === 'en' ? `
              <button class="action-btn-sm btn-translate" onclick="handleTranslateCard('${item.id}', '${escapeAttr(item.title)}', '${escapeAttr(item.description)}')">
                🌐 Перевести
              </button>
            ` : ''}
            <button class="action-btn-sm btn-bookmark ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark('${item.id}')">
              ${isBookmarked ? '⭐ Сохранено' : '☆ В закладки'}
            </button>
            <button class="action-btn-sm" onclick="shareArticle('${escapeAttr(item.title)}', '${escapeAttr(item.link)}')">
              🔗 Поделиться
            </button>
          </div>
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="news-link-btn">
            Оригинал ↗
          </a>
        </div>
      </article>`;
    })
    .join('');
}

// Скелетон-загрузчик
function renderSkeletons() {
  const feedContainer = document.getElementById('news-feed');
  feedContainer.innerHTML = Array(4)
    .fill(0)
    .map(
      () => `
    <div class="skeleton-card">
      <div class="skeleton-line" style="width: 30%; height: 16px;"></div>
      <div class="skeleton-line" style="width: 90%; height: 22px; margin-top: 8px;"></div>
      <div class="skeleton-line" style="width: 70%; height: 22px;"></div>
      <div class="skeleton-line" style="width: 100%; height: 14px; margin-top: 8px;"></div>
    </div>`
    )
    .join('');
}

// --- ЗАКЛАДКИ (ИЗБРАННОЕ) ---
function toggleBookmark(itemId) {
  vibe(20);
  const item = state.newsItems.find((i) => i.id === itemId) || state.bookmarks.find((b) => b.id === itemId);
  if (!item) return;

  const index = state.bookmarks.findIndex((b) => b.id === itemId);
  if (index >= 0) {
    state.bookmarks.splice(index, 1);
    showToast('Удалено из закладок');
  } else {
    state.bookmarks.unshift(item);
    showToast('Сохранено в закладки ⭐');
  }

  try {
    localStorage.setItem('news_bookmarks', JSON.stringify(state.bookmarks));
  } catch (e) {}

  if (state.currentSort === 'bookmarks') {
    renderBookmarks();
  } else {
    renderNewsList();
  }
}

function renderBookmarks() {
  const feedContainer = document.getElementById('news-feed');
  const statusText = document.getElementById('feed-status');

  if (state.bookmarks.length === 0) {
    feedContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <div class="empty-state-title">Закладок пока нет</div>
        <p style="font-size:0.85rem;">Нажмите «☆ В закладки» на любой новости, чтобы сохранить её для чтения офлайн.</p>
      </div>`;
    if (statusText) statusText.textContent = '0 закладок';
    return;
  }

  if (statusText) {
    statusText.textContent = `${state.bookmarks.length} ${getNoun(state.bookmarks.length, 'закладка', 'закладки', 'закладок')}`;
  }

  state.newsItems = [...state.bookmarks];
  renderNewsList();
}

// --- ШЕРИНГ ---
async function shareArticle(title, url) {
  vibe(15);
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `${title}\n`, url });
      return;
    } catch (err) {}
  }
  try {
    await navigator.clipboard.writeText(`${title} - ${url}`);
    showToast('Ссылка скопирована 📋');
  } catch (e) {
    showToast('Не удалось скопировать');
  }
}

// --- ВИДЖЕТ ВАЛЮТ И ГРАФИК ---
async function fetchCurrencyAndDraw() {
  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    const data = await res.json();
    state.currencyData = data;

    const usd = data.Valute?.USD?.Value?.toFixed(1) || '--';
    const eur = data.Valute?.EUR?.Value?.toFixed(1) || '--';
    const cny = data.Valute?.CNY?.Value?.toFixed(1) || '--';

    const pill = document.getElementById('currency-pill');
    if (pill) {
      pill.innerHTML = `<span class="rate-green">$ ${usd}</span> <span class="rate-red">€ ${eur}</span> <span class="rate-blue">¥ ${cny}</span>`;
    }
  } catch (e) {}
}

async function openRatesModal() {
  vibe(20);
  const modal = document.getElementById('rates-modal');
  modal.classList.add('open');

  if (!state.historyRates) {
    const dates = [], usdValues = [], eurValues = [];
    let nextUrl = 'https://www.cbr-xml-daily.ru/daily_json.js';
    try {
      for (let i = 0; i < 7; i++) {
        const r = await fetch(nextUrl);
        const d = await r.json();
        dates.unshift(new Date(d.Date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }));
        usdValues.unshift(d.Valute.USD.Value);
        eurValues.unshift(d.Valute.EUR.Value);
        nextUrl = 'https:' + d.PreviousURL;
      }
      state.historyRates = { dates, usdValues, eurValues };
    } catch (err) {}
  }

  if (state.historyRates) {
    drawCanvasChart(state.historyRates);
  }
}

function drawCanvasChart(history) {
  const canvas = document.getElementById('sparklineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padding = 24, graphW = w - padding * 2, graphH = h - padding * 2;
  const usd = history.usdValues;
  const minVal = Math.min(...usd) - 0.5, maxVal = Math.max(...usd) + 0.5;

  ctx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding + (graphH / 3) * i;
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
  }

  ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.5; ctx.beginPath();
  const stepX = graphW / (usd.length - 1);
  const points = usd.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + graphH - ((v - minVal) / (maxVal - minVal)) * graphH
  }));

  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  ctx.fillStyle = '#10b981';
  points.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888888'; ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(history.dates[i], p.x, h - 6);
    ctx.fillStyle = '#10b981';
  });

  const tableBody = document.getElementById('rates-table-body');
  if (tableBody && state.currencyData) {
    const v = state.currencyData.Valute;
    tableBody.innerHTML = `
      <tr><td>🇺🇸 USD</td><td><b>${v.USD.Value.toFixed(2)} ₽</b></td><td>${(v.USD.Value - v.USD.Previous).toFixed(2)} ₽</td></tr>
      <tr><td>🇪🇺 EUR</td><td><b>${v.EUR.Value.toFixed(2)} ₽</b></td><td>${(v.EUR.Value - v.EUR.Previous).toFixed(2)} ₽</td></tr>
      <tr><td>🇨🇳 CNY</td><td><b>${v.CNY.Value.toFixed(2)} ₽</b></td><td>${(v.CNY.Value - v.CNY.Previous).toFixed(2)} ₽</td></tr>
    `;
  }
}

// --- ВИДЖЕТ ПОГОДЫ ---
async function fetchWeather() {
  try {
    let lat = 55.75, lon = 37.61;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => loadWeatherData(pos.coords.latitude, pos.coords.longitude),
        () => loadWeatherData(lat, lon),
        { timeout: 3000 }
      );
    } else {
      loadWeatherData(lat, lon);
    }
  } catch (e) {}
}

async function loadWeatherData(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await res.json();
    if (data && data.current_weather) {
      const temp = Math.round(data.current_weather.temperature);
      const code = data.current_weather.weathercode;
      const icon = getWeatherIcon(code);
      const pill = document.getElementById('weather-pill');
      if (pill) {
        pill.innerHTML = `<span>${icon} ${temp > 0 ? '+' + temp : temp}°C</span>`;
      }
    }
  } catch (e) {}
}

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

// --- НАСТРОЙКИ ТЕМ И ШРИФТОВ ---
function setTheme(themeName) {
  vibe(15);
  state.theme = themeName;
  document.body.className = `theme-${themeName}`;
  localStorage.setItem('news_theme', themeName);
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });
}

function adjustFontScale(delta) {
  vibe(15);
  let newScale = Math.min(1.35, Math.max(0.85, state.fontScale + delta));
  newScale = Math.round(newScale * 100) / 100;
  state.fontScale = newScale;
  document.documentElement.style.setProperty('--font-scale', newScale);
  localStorage.setItem('news_font_scale', newScale);
  const label = document.getElementById('font-scale-label');
  if (label) label.textContent = `${Math.round(newScale * 100)}%`;
}

// --- PWA ИНСТАЛЛЯЦИЯ ---
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  const banner = document.getElementById('pwa-install-banner');
  if (banner && !sessionStorage.getItem('pwa_prompt_dismissed')) {
    banner.style.display = 'flex';
  }
});

async function triggerPwaInstall() {
  vibe(30);
  if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
    const { outcome } = await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    document.getElementById('pwa-install-banner').style.display = 'none';
  } else {
    alert('Чтобы установить приложение:\n1. Нажмите "Поделиться" в Safari/Chrome\n2. Выберите "На экран «Домой»" 📲');
  }
}

function dismissPwaBanner() {
  document.getElementById('pwa-install-banner').style.display = 'none';
  sessionStorage.setItem('pwa_prompt_dismissed', 'true');
}

// --- SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function getNoun(number, one, two, five) {
  let n = Math.abs(number);
  n %= 100;
  if (n >= 5 && n <= 20) return five;
  n %= 10;
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return two;
  return five;
}

// --- ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);
  adjustFontScale(0);

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (searchClear) searchClear.style.display = state.searchQuery ? 'block' : 'none';
      renderNewsList();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      searchClear.style.display = 'none';
      renderNewsList();
    });
  }

  // Переключение сортировки
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      vibe(15);
      document.querySelectorAll('.sort-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSort = btn.dataset.sort;
      if (state.currentSort === 'bookmarks') {
        renderBookmarks();
      } else {
        renderNewsList();
      }
    });
  });

  fetchCurrencyAndDraw();
  fetchWeather();
  loadFeed('ALL');
});
