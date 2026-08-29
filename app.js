/**
 * GLOBAL NEWS AI — Application Engine
 * Pure Vanilla JS, Zero heavy dependencies, Fast PWA, Offline Cache
 */

// --- КОНФИГУРАЦИЯ И ИСТОЧНИКИ НОВОСТЕЙ ---
const FEED_CONFIGS = {
  ALL: [
    { name: 'РБК Главное', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', weight: 1.2 },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', weight: 1.1 },
    { name: 'Habr', url: 'https://habr.com/ru/rss/best/daily/?fl=ru', lang: 'ru', weight: 1.0 },
    { name: 'Коммерсантъ', url: 'https://www.kommersant.ru/RSS/news.xml', lang: 'ru', weight: 1.0 }
  ],
  WORLD: [
    { name: 'РБК Мир', url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss', lang: 'ru', weight: 1.1 },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', weight: 1.2 },
    { name: 'Euronews', url: 'https://ru.euronews.com/rss?level=theme&name=news', lang: 'ru', weight: 1.0 },
    { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-ru-all', lang: 'ru', weight: 1.0 }
  ],
  TECH: [
    { name: 'Habr Лучшее', url: 'https://habr.com/ru/rss/best/daily/?fl=ru', lang: 'ru', weight: 1.2 },
    { name: '3DNews', url: 'https://3dnews.ru/news/rss/', lang: 'ru', weight: 1.1 },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', lang: 'en', weight: 1.0 },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', lang: 'en', weight: 0.9 }
  ],
  ECONOMY: [
    { name: 'РБК Экономика', url: 'https://rssexport.rbc.ru/rbcnews/news/20/full.rss', lang: 'ru', weight: 1.2 },
    { name: 'Коммерсантъ', url: 'https://www.kommersant.ru/RSS/news.xml', lang: 'ru', weight: 1.1 },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en', weight: 1.0 }
  ],
  SCIENCE: [
    { name: 'Naked Science', url: 'https://naked-science.ru/feed', lang: 'ru', weight: 1.2 },
    { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', lang: 'en', weight: 1.1 }
  ],
  GAMES: [
    { name: 'DTF', url: 'https://dtf.ru/rss/all', lang: 'ru', weight: 1.1 },
    { name: 'StopGame', url: 'https://rss.stopgame.ru/rss_news.xml', lang: 'ru', weight: 1.0 }
  ]
};

// CORS-прокси серверы для резервирования (обхода ограничений браузера)
const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

// --- СОСТОЯНИЕ ПРИЛОЖЕНИЯ ---
const state = {
  currentCategory: 'ALL',
  currentSort: 'hot', // 'hot' (тренды), 'latest' (свежее), 'bookmarks' (избранное)
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

// Тактильный виброотклик для смартфонов
function vibe(duration = 25) {
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
  setTimeout(() => toast.remove(), 2500);
}

// --- СЕТЕВОЙ МОДУЛЬ: ПАРСИНГ RSS ЧЕРЕЗ XML/CORS ---
async function fetchFeedWithFallback(feedConfig) {
  for (const getProxyUrl of PROXIES) {
    try {
      const proxyUrl = getProxyUrl(feedConfig.url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;
      const text = await response.text();

      // Парсим XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      const items = parseXmlFeed(xmlDoc, feedConfig);

      if (items && items.length > 0) {
        return items;
      }
    } catch (err) {
      // Пробуем следующий прокси при ошибке
      continue;
    }
  }
  return [];
}

// Извлечение полей RSS / Atom
function parseXmlFeed(xmlDoc, feedConfig) {
  const items = [];
  const entries = Array.from(xmlDoc.querySelectorAll('item, entry')).slice(0, 15);

  for (const el of entries) {
    try {
      const title = el.querySelector('title')?.textContent?.trim() || 'Без заголовка';
      let link = el.querySelector('link')?.textContent?.trim();
      if (!link) {
        link = el.querySelector('link')?.getAttribute('href') || '#';
      }

      // Извлечение описания
      let description = el.querySelector('description, summary, content')?.textContent?.trim() || '';
      
      // Поиск изображений (enclosure, media:content, media:thumbnail или внутри HTML)
      let imageUrl = null;
      const enclosure = el.querySelector('enclosure[type^="image"]');
      if (enclosure) imageUrl = enclosure.getAttribute('url');

      if (!imageUrl) {
        const mediaContent = el.querySelector('media\\:content, content');
        if (mediaContent) imageUrl = mediaContent.getAttribute('url');
      }
      if (!imageUrl) {
        const mediaThumb = el.querySelector('media\\:thumbnail, thumbnail');
        if (mediaThumb) imageUrl = mediaThumb.getAttribute('url');
      }

      // Поиск <img> в описании
      if (!imageUrl && description.includes('<img')) {
        const match = description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) imageUrl = match[1];
      }

      // Очистка HTML тегов из описания
      const cleanDesc = description
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 240);

      // Дата публикации
      const pubDateStr = el.querySelector('pubDate, published, updated, dc\\:date')?.textContent?.trim();
      const pubDate = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();

      // Уникальный ID новости
      const id = 'id_' + btoa(encodeURIComponent(link)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);

      items.push({
        id,
        title,
        link,
        description: cleanDesc,
        imageUrl,
        pubDate: isNaN(pubDate) ? Date.now() : pubDate,
        source: feedConfig.name,
        lang: feedConfig.lang,
        weight: feedConfig.weight || 1.0
      });
    } catch (e) {
      continue;
    }
  }

  return items;
}

// --- УМНЫЙ РЕЙТИНГ НОВОСТЕЙ (SMART RANKING) ---
function calculateHotScore(item) {
  const hoursAgo = Math.max(0.1, (Date.now() - item.pubDate) / (1000 * 60 * 60));
  // Экспоненциальное затухание по времени: свежие новости имеют наибольший вес
  const timeDecay = 1 / Math.pow(hoursAgo + 1.2, 1.25);
  
  let contentWeight = item.weight || 1.0;
  if (item.imageUrl) contentWeight *= 1.2; // Бонус за красивую обложку
  if (item.description && item.description.length > 50) contentWeight *= 1.15; // Бонус за полноту

  return contentWeight * timeDecay * 100;
}

// Форматирование относительного времени («5 мин назад»)
function formatRelativeTime(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'только что';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
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
  const transBox = card.querySelector('.translated-box');

  if (btn.classList.contains('active')) {
    // Возврат оригинала
    titleEl.textContent = titleText;
    descEl.textContent = descText;
    transBox.style.display = 'none';
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
  if (transDesc && transDesc !== descText) {
    descEl.textContent = transDesc;
  }
  btn.classList.add('active');
  btn.innerHTML = '🇷🇺 Оригинал';
  showToast('Переведено на русский');
}

// --- ЗАГРУЗКА И КЭШИРОВАНИЕ ЛЕНТЫ ---
async function loadFeed(category = 'ALL', forceRefresh = false) {
  state.currentCategory = category;
  const feedContainer = document.getElementById('news-feed');
  const cacheKey = `feed_cache_${category}`;

  // Обновляем активный чип таба
  document.querySelectorAll('.tab-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.category === category);
  });

  if (state.currentSort === 'bookmarks') {
    renderBookmarks();
    return;
  }

  // Проверка кэша (10 минут)
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

  // Показываем скелетон-загрузчик
  renderSkeletons();

  const configs = FEED_CONFIGS[category] || FEED_CONFIGS.ALL;
  try {
    const results = await Promise.all(configs.map((cfg) => fetchFeedWithFallback(cfg)));
    const flatItems = results.flat();

    // Дедупликация по ссылке и заголовку
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

    state.newsItems = uniqueItems;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ items: uniqueItems, timestamp: Date.now() }));
    } catch (e) {}

    renderNewsList();
  } catch (err) {
    feedContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-title">Не удалось обновить ленту</div>
        <p style="font-size:0.85rem; margin-bottom:12px;">Проверьте интернет-соединение</p>
        <button class="btn-install-primary" onclick="loadFeed('${category}', true)">Повторить попытку</button>
      </div>`;
  }
}

// --- РЕНДЕРИНГ СПИСКА НОВОСТЕЙ ---
function renderNewsList() {
  const feedContainer = document.getElementById('news-feed');
  const statusText = document.getElementById('feed-status');

  let items = [...state.newsItems];

  // Фильтр по поисковому запросу
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
        <p style="font-size:0.85rem;">Попробуйте изменить поисковый запрос или обновить ленту</p>
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
            <div class="translated-box"></div>
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

// Рендеринг скелетона загрузки
function renderSkeletons() {
  const feedContainer = document.getElementById('news-feed');
  feedContainer.innerHTML = Array(4)
    .fill(0)
    .map(
      () => `
    <div class="skeleton-card">
      <div class="skeleton-line" style="width: 30%; height: 16px;"></div>
      <div class="skeleton-line" style="width: 90%; height: 22px; margin-top: 10px;"></div>
      <div class="skeleton-line" style="width: 70%; height: 22px;"></div>
      <div class="skeleton-line" style="width: 100%; height: 14px; margin-top: 10px;"></div>
      <div class="skeleton-line" style="width: 80%; height: 14px;"></div>
    </div>`
    )
    .join('');
}

// --- ЗАКЛАДКИ (ИЗБРАННОЕ ОФЛАЙН) ---
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
        <p style="font-size:0.85rem;">Нажмите «☆ В закладки» на любой новости, чтобы прочитать её позже даже без интернета.</p>
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

// --- ШЕРИНГ (WEB SHARE API) ---
async function shareArticle(title, url) {
  vibe(15);
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: `${title}\n`,
        url: url
      });
      return;
    } catch (err) {}
  }
  // Fallback: копирование в буфер
  try {
    await navigator.clipboard.writeText(`${title} - ${url}`);
    showToast('Ссылка скопирована в буфер 📋');
  } catch (e) {
    showToast('Не удалось скопировать ссылку');
  }
}

// --- ВИДЖЕТ ВАЛЮТ И СПАРКЛАЙН ГРАФИК ---
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
  } catch (e) {
    console.error('Rates fetch error:', e);
  }
}

async function openRatesModal() {
  vibe(20);
  const modal = document.getElementById('rates-modal');
  modal.classList.add('open');

  if (!state.historyRates) {
    // Получаем историю за 7 дней
    const dates = [];
    const usdValues = [];
    const eurValues = [];
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
    } catch (err) {
      console.error(err);
    }
  }

  if (state.historyRates) {
    drawCanvasChart(state.historyRates);
  }
}

// Отрисовка ультралегкого Canvas Sparkline графика без Chart.js
function drawCanvasChart(history) {
  const canvas = document.getElementById('sparklineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padding = 30;
  const graphW = w - padding * 2;
  const graphH = h - padding * 2;

  const usd = history.usdValues;
  const minVal = Math.min(...usd) - 0.5;
  const maxVal = Math.max(...usd) + 0.5;

  // Отрисовка сетки
  ctx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding + (graphH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(w - padding, y);
    ctx.stroke();
  }

  // Отрисовка плавной линии USD
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2.5;
  ctx.beginPath();

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

  // Отрисовка точек и дат
  ctx.fillStyle = '#10b981';
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Подписи дат внизу
    ctx.fillStyle = '#888888';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(history.dates[i], p.x, h - 8);
    ctx.fillStyle = '#10b981';
  });

  // Заполняем таблицу значений
  const tableBody = document.getElementById('rates-table-body');
  if (tableBody && state.currencyData) {
    const v = state.currencyData.Valute;
    tableBody.innerHTML = `
      <tr><td>🇺🇸 Доллар США (USD)</td><td><b>${v.USD.Value.toFixed(2)} ₽</b></td><td>${(v.USD.Value - v.USD.Previous).toFixed(2)} ₽</td></tr>
      <tr><td>🇪🇺 Евро (EUR)</td><td><b>${v.EUR.Value.toFixed(2)} ₽</b></td><td>${(v.EUR.Value - v.EUR.Previous).toFixed(2)} ₽</td></tr>
      <tr><td>🇨🇳 Китайский Юань (CNY)</td><td><b>${v.CNY.Value.toFixed(2)} ₽</b></td><td>${(v.CNY.Value - v.CNY.Previous).toFixed(2)} ₽</td></tr>
    `;
  }
}

// --- ВИДЖЕТ ПОГОДЫ (OPEN-METEO БЕЗ КЛЮЧЕЙ) ---
async function fetchWeather() {
  try {
    let lat = 55.75, lon = 37.61; // По умолчанию Москва

    // Попытка взять геолокацию
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          loadWeatherData(pos.coords.latitude, pos.coords.longitude);
        },
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
  if (code <= 99) return '⛈️';
  return '🌡️';
}

// --- УПРАВЛЕНИЕ ТЕМАМИ И ШРИФТАМИ ---
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

// --- PWA УСТАНОВКА НА ТЕЛЕФОН ---
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
    // Инструкция для iOS / Safari
    alert('Чтобы установить приложение:\n1. Нажмите кнопку "Поделиться" (квадрат со стрелкой)\n2. Выберите "На экран «Домой»" 📲');
  }
}

function dismissPwaBanner() {
  document.getElementById('pwa-install-banner').style.display = 'none';
  sessionStorage.setItem('pwa_prompt_dismissed', 'true');
}

// --- РЕГИСТРАЦИЯ SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.log('SW failed:', err));
  });
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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

// --- ИНИЦИАЛИЗАЦИЯ ПРИ ЗАПУСКЕ ---
document.addEventListener('DOMContentLoaded', () => {
  // Применяем тему и шрифт
  setTheme(state.theme);
  adjustFontScale(0);

  // Слушатели поиска
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

  // Слушатели сортировки
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

  // Загрузка первичных данных
  fetchCurrencyAndDraw();
  fetchWeather();
  loadFeed('ALL');
});
