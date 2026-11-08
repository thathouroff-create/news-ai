/**
 * NEWS AI v4.0 — Unified Serverless Data Pipeline (fetch-feeds.js)
 * Features:
 *  - Accurate RFC-2822 & ISO-8601 date parser (fixes 100% broken RU dates)
 *  - Multi-URL publisher fallbacks (fixes RBC & N+1 404s) + last-known-good retention
 *  - Per-category weight (w) preservation + URL canonicalization (strips utm_*)
 *  - Full HTML entity decoder + extended fullText extraction for Instant Reader Mode
 *  - Cross-source Story Clustering (Jaccard token similarity) + Source Diversity Cap
 *  - Server-side EN->RU batch pre-translation with persistent cache across runs
 *  - Bundled 7-day CBR currency history (Nominal-normalized) + Open-Meteo default weather
 */

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: {
    item: [
      ['description', 'description'],
      ['content:encoded', 'contentEncoded'],
      ['full-text', 'fullTextTag'],
      ['yandex:full-text', 'yandexFullText'],
      ['enclosure', 'enclosure']
    ]
  }
});

const FEEDS = {
  ALL: [
    { id: 'rbc',        name: 'РБК',          urls: ['https://rssexport.rbc.ru/rbcnews/news/30/full.rss', 'https://rssexport.rbc.ru/rbc/topnews.rss'], lang: 'ru', w: 1.45 },
    { id: 'kommersant', name: 'Коммерсантъ',   urls: ['https://www.kommersant.ru/RSS/main.xml', 'https://www.kommersant.ru/RSS/news.xml'],            lang: 'ru', w: 1.35 },
    { id: 'vedomosti',  name: 'Ведомости',     urls: ['https://www.vedomosti.ru/rss/issue', 'https://www.vedomosti.ru/rss/news'],                     lang: 'ru', w: 1.30 },
    { id: 'habr',       name: 'Habr',          urls: ['https://habr.com/ru/rss/best/daily/?fl=ru', 'https://habr.com/ru/rss/articles/?fl=ru'],        lang: 'ru', w: 1.15 },
    { id: 'bbc_world',  name: 'BBC World',     urls: ['https://feeds.bbci.co.uk/news/world/rss.xml'],                                                 lang: 'en', w: 1.20, vpnHint: true }
  ],
  WORLD: [
    { id: 'bbc_world',  name: 'BBC World',     urls: ['https://feeds.bbci.co.uk/news/world/rss.xml'],                                                 lang: 'en', w: 1.35, vpnHint: true },
    { id: 'rbc',        name: 'РБК',           urls: ['https://rssexport.rbc.ru/rbcnews/news/30/full.rss', 'https://rssexport.rbc.ru/rbc/topnews.rss'], lang: 'ru', w: 1.25 },
    { id: 'kommersant', name: 'Коммерсантъ',   urls: ['https://www.kommersant.ru/RSS/main.xml', 'https://www.kommersant.ru/RSS/news.xml'],            lang: 'ru', w: 1.20 },
    { id: 'dw',         name: 'DW',            urls: ['https://rss.dw.com/rdf/rss-ru-all'],                                                           lang: 'ru', w: 1.05, vpnHint: true }
  ],
  TECH: [
    { id: 'habr',       name: 'Habr',          urls: ['https://habr.com/ru/rss/best/daily/?fl=ru', 'https://habr.com/ru/rss/articles/?fl=ru'],        lang: 'ru', w: 1.30 },
    { id: '3dnews',     name: '3DNews',        urls: ['https://3dnews.ru/news/rss/'],                                                                 lang: 'ru', w: 1.25 },
    { id: 'theverge',   name: 'The Verge',     urls: ['https://www.theverge.com/rss/index.xml'],                                                      lang: 'en', w: 1.35, vpnHint: false },
    { id: 'arstechnica',name: 'Ars Technica',  urls: ['https://feeds.arstechnica.com/arstechnica/index'],                                             lang: 'en', w: 1.25, vpnHint: false },
    { id: 'techcrunch', name: 'TechCrunch',    urls: ['https://techcrunch.com/feed/'],                                                                lang: 'en', w: 1.20, vpnHint: false }
  ],
  ECONOMY: [
    { id: 'vedomosti',  name: 'Ведомости',     urls: ['https://www.vedomosti.ru/rss/issue', 'https://www.vedomosti.ru/rss/news'],                     lang: 'ru', w: 1.40 },
    { id: 'rbc',        name: 'РБК',           urls: ['https://rssexport.rbc.ru/rbcnews/news/30/full.rss'],                                           lang: 'ru', w: 1.35 },
    { id: 'kommersant', name: 'Коммерсантъ',   urls: ['https://www.kommersant.ru/RSS/main.xml', 'https://www.kommersant.ru/RSS/news.xml'],            lang: 'ru', w: 1.25 },
    { id: 'bbc_biz',    name: 'BBC Business',  urls: ['https://feeds.bbci.co.uk/news/business/rss.xml'],                                              lang: 'en', w: 1.10, vpnHint: true }
  ],
  SCIENCE: [
    { id: 'nplus1',     name: 'N+1',           urls: ['https://nplus1.ru/rss', 'https://nplus1.ru/rss/feed/main'],                                    lang: 'ru', w: 1.40 },
    { id: 'naked_sci',  name: 'Naked Science', urls: ['https://naked-science.ru/feed'],                                                               lang: 'ru', w: 1.20 },
    { id: 'physorg',    name: 'Phys.org',      urls: ['https://phys.org/rss-feed/'],                                                                  lang: 'en', w: 1.35, vpnHint: false },
    { id: 'nature',     name: 'Nature',        urls: ['https://www.nature.com/nature.rss'],                                                           lang: 'en', w: 1.30, vpnHint: false },
    { id: 'sciencedaily', name: 'ScienceDaily',urls: ['https://www.sciencedaily.com/rss/top/science.xml'],                                           lang: 'en', w: 1.25, vpnHint: false }
  ],
  GAMES: [
    { id: 'stopgame',   name: 'StopGame',      urls: ['https://rss.stopgame.ru/rss_news.xml'],                                                        lang: 'ru', w: 1.35 },
    { id: '3dnews_g',   name: '3DNews Игры',   urls: ['https://3dnews.ru/games/rss/'],                                                                lang: 'ru', w: 1.20 },
    { id: 'pcgamer',    name: 'PC Gamer',      urls: ['https://www.pcgamer.com/rss/'],                                                                lang: 'en', w: 1.35, vpnHint: false },
    { id: 'eurogamer',  name: 'Eurogamer',     urls: ['https://www.eurogamer.net/feed/news'],                                                         lang: 'en', w: 1.25, vpnHint: false },
    { id: 'rps',        name: 'Rock Paper Shotgun', urls: ['https://www.rockpapershotgun.com/feed'],                                                  lang: 'en', w: 1.20, vpnHint: false }
  ]
};

const NAMED_ENTITIES = {
  nbsp: ' ', quot: '"', amp: '&', lt: '<', gt: '>', apos: "'",
  laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…',
  bull: '•', copy: '©', reg: '®', trade: '™', rub: '₽', euro: '€'
};

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z0-9]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
    });
}

function cleanText(html, maxLen) {
  if (!html) return '';
  const stripped = String(html)
    .replace(/<(style|script|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(stripped)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
  if (!maxLen || decoded.length <= maxLen) return decoded;
  const cut = decoded.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.75 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function canonicalizeUrl(raw) {
  if (!raw) return '#';
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '#';
    const stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'yclid', 'fbclid', 'from'];
    stripParams.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return '#';
  }
}

function makeId(link) {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = ((h << 5) - h + link.charCodeAt(i)) | 0;
  return 'n' + Math.abs(h).toString(36);
}

// Universal RFC-2822 & ISO-8601 date parser (NEVER corrupts "Sat, 07 Nov..." with .replace(' ', 'T')!)
function safeParseDate(pubDate, isoDate) {
  const now = Date.now();
  if (isoDate) {
    const isoTs = Date.parse(isoDate);
    if (!Number.isNaN(isoTs)) return Math.min(isoTs, now);
  }
  if (!pubDate) return now - 1800000;
  const s = String(pubDate).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s) ? s.replace(/\s+/, 'T') : s;
  const ts = Date.parse(normalized);
  if (Number.isNaN(ts)) return now - 1800000;
  return Math.min(ts, now);
}

async function fetchSourceWithFallback(sourceDef) {
  for (const url of sourceDef.urls) {
    try {
      const feed = await parser.parseURL(url);
      if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;
      const items = [];
      for (const it of feed.items) {
        const rawTitle = decodeEntities(it.title || '').replace(/\s+/g, ' ').trim();
        if (!rawTitle) continue;
        const link = canonicalizeUrl(it.link || it.guid);
        if (link === '#') continue;

        let img = null;
        if (it.enclosure && it.enclosure.url && /^https?:\/\//i.test(it.enclosure.url)) {
          img = it.enclosure.url;
        } else {
          const rawHtml = (it.contentEncoded || '') + (it.description || '') + (it.content || '');
          const m = rawHtml.match(/<img[^>]+src=["'](https?:\/\/[^"'>\s]+)/i);
          if (m) img = m[1];
        }

        const rawBody = it.yandexFullText || it.fullTextTag || it.contentEncoded || it.description || it.content || '';
        const desc = cleanText(it.description || rawBody, 210);
        const fullText = cleanText(rawBody, 1100);

        items.push({
          id: makeId(link),
          title: rawTitle,
          link,
          desc,
          fullText: fullText.length > desc.length ? fullText : desc,
          img,
          date: safeParseDate(it.pubDate, it.isoDate),
          src: sourceDef.name,
          lang: sourceDef.lang,
          vpnHint: Boolean(sourceDef.vpnHint),
          titleRu: null,
          descRu: null,
          fullTextRu: null
        });
      }
      if (items.length > 0) {
        console.log(`[OK] ${sourceDef.name} (${url}): ${items.length} items`);
        return items.slice(0, 22);
      }
    } catch (err) {
      console.warn(`[WARN] ${sourceDef.name} failed on ${url}: ${err.message}`);
    }
  }
  return [];
}

async function translateTextServer(text) {
  if (!text || !text.trim()) return null;
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=' + encodeURIComponent(text.slice(0, 500));
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && Array.isArray(d[0])) {
      const translated = d[0].map(part => part[0]).join('');
      if (/[а-яё]/i.test(translated)) return translated;
    }
  } catch {}
  return null;
}

function tokenizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4)
    .map(w => w.slice(0, 6)); // stem prefix
}

function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function clusterAndDiversify(items) {
  const clusters = [];
  for (const it of items) {
    const tokens = tokenizeTitle(it.titleRu || it.title);
    let matched = null;
    for (const c of clusters) {
      if (c.src !== it.src && Math.abs(c.date - it.date) < 18 * 3600 * 1000) {
        const sim = jaccardSimilarity(c._tokens, tokens);
        if (sim >= 0.34) { matched = c; break; }
      }
    }
    if (matched) {
      matched.clusterCount = (matched.clusterCount || 1) + 1;
      if (!matched.alsoSources.includes(it.src)) matched.alsoSources.push(it.src);
      if (!matched.img && it.img) matched.img = it.img;
      if ((it.fullText || '').length > (matched.fullText || '').length) matched.fullText = it.fullText;
    } else {
      clusters.push({
        ...it,
        clusterCount: 1,
        alsoSources: [],
        _tokens: tokens
      });
    }
  }

  clusters.forEach(c => delete c._tokens);
  clusters.sort((a, b) => b.date - a.date);

  // Enforce diversity: max 2 consecutive articles from same publisher
  const diversified = [];
  const pool = clusters.slice();
  while (pool.length > 0) {
    const n = diversified.length;
    const prev1 = n >= 1 ? diversified[n - 1].src : null;
    const prev2 = n >= 2 ? diversified[n - 2].src : null;
    let idx = 0;
    if (prev1 && prev1 === prev2) {
      const altIdx = pool.findIndex(x => x.src !== prev1);
      if (altIdx >= 0) idx = altIdx;
    }
    diversified.push(pool.splice(idx, 1)[0]);
  }
  return diversified;
}

async function fetchCbrRatesHistory() {
  const dates = [], usd = [], eur = [], cny = [];
  let current = null;
  let url = 'https://www.cbr-xml-daily.ru/daily_json.js';
  for (let i = 0; i < 7; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) break;
      const d = await res.json();
      if (i === 0 && d.Valute) {
        current = {
          USD: { value: +(d.Valute.USD.Value / (d.Valute.USD.Nominal || 1)).toFixed(2), prev: +(d.Valute.USD.Previous / (d.Valute.USD.Nominal || 1)).toFixed(2) },
          EUR: { value: +(d.Valute.EUR.Value / (d.Valute.EUR.Nominal || 1)).toFixed(2), prev: +(d.Valute.EUR.Previous / (d.Valute.EUR.Nominal || 1)).toFixed(2) },
          CNY: { value: +(d.Valute.CNY.Value / (d.Valute.CNY.Nominal || 1)).toFixed(2), prev: +(d.Valute.CNY.Previous / (d.Valute.CNY.Nominal || 1)).toFixed(2) }
        };
      }
      const dt = new Date(d.Date);
      const label = `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
      dates.unshift(label);
      usd.unshift(+(d.Valute.USD.Value / (d.Valute.USD.Nominal || 1)).toFixed(2));
      eur.unshift(+(d.Valute.EUR.Value / (d.Valute.EUR.Nominal || 1)).toFixed(2));
      cny.unshift(+(d.Valute.CNY.Value / (d.Valute.CNY.Nominal || 1)).toFixed(2));
      if (!d.PreviousURL) break;
      url = d.PreviousURL.startsWith('http') ? d.PreviousURL : 'https:' + d.PreviousURL;
    } catch {
      break;
    }
  }
  return current ? { updatedAt: new Date().toISOString(), current, history7d: { dates, usd, eur, cny } } : null;
}

async function fetchDefaultWeather() {
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=55.7558&longitude=37.6173&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m';
    const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.current) {
      return {
        city: 'Москва',
        temp: Math.round(d.current.temperature_2m),
        feelsLike: Math.round(d.current.apparent_temperature),
        wind: Math.round(d.current.wind_speed_10m),
        code: d.current.weather_code
      };
    }
  } catch {}
  return null;
}

async function main() {
  const dataDir = path.join(__dirname, 'data');
  const outFile = path.join(dataDir, 'latest.json');

  // Load previous snapshot for translation caching & last-known-good feed resilience
  let prevSnapshot = null;
  const prevTransMap = new Map();
  const prevSourceItems = new Map();
  if (fs.existsSync(outFile)) {
    try {
      prevSnapshot = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      if (prevSnapshot && prevSnapshot.data) {
        for (const cat of Object.keys(prevSnapshot.data)) {
          for (const it of prevSnapshot.data[cat] || []) {
            if (it.titleRu) prevTransMap.set(it.id, { titleRu: it.titleRu, descRu: it.descRu, fullTextRu: it.fullTextRu });
            if (!prevSourceItems.has(it.src)) prevSourceItems.set(it.src, []);
            prevSourceItems.get(it.src).push(it);
          }
        }
      }
    } catch {}
  }

  // Collect unique sources by id
  const uniqueSources = new Map();
  for (const cat of Object.keys(FEEDS)) {
    for (const cfg of FEEDS[cat]) {
      if (!uniqueSources.has(cfg.id)) uniqueSources.set(cfg.id, cfg);
    }
  }

  console.log(`Fetching ${uniqueSources.size} unique news publishers...`);
  const rawBySourceId = new Map();
  const failedSources = [];

  await Promise.all(
    Array.from(uniqueSources.values()).map(async srcDef => {
      let items = await fetchSourceWithFallback(srcDef);
      if (items.length === 0 && prevSourceItems.has(srcDef.name)) {
        console.warn(`[FALLBACK] Retaining cached items for ${srcDef.name}`);
        items = prevSourceItems.get(srcDef.name).slice(0, 15);
        failedSources.push(srcDef.name);
      } else if (items.length === 0) {
        failedSources.push(srcDef.name);
      }
      // Server-side EN->RU pre-translation
      for (const it of items) {
        if (it.lang === 'en') {
          const cached = prevTransMap.get(it.id);
          if (cached && cached.titleRu && /[а-яё]/i.test(cached.titleRu)) {
            it.titleRu = cached.titleRu;
            it.descRu = cached.descRu;
            it.fullTextRu = cached.fullTextRu || cached.descRu;
          } else {
            const [tRu, dRu, fRu] = await Promise.all([
              translateTextServer(it.title),
              translateTextServer(it.desc),
              it.fullText ? translateTextServer(it.fullText) : Promise.resolve(null)
            ]);
            it.titleRu = tRu;
            it.descRu = dRu;
            it.fullTextRu = fRu || dRu;
          }
        }
      }
      rawBySourceId.set(srcDef.id, items);
    })
  );

  // Build categories preserving each category's specific source weight (cfg.w)
  const output = {};
  for (const cat of Object.keys(FEEDS)) {
    let catItems = [];
    for (const cfg of FEEDS[cat]) {
      const srcItems = (rawBySourceId.get(cfg.id) || []).map(it => ({ ...it, w: cfg.w }));
      catItems = catItems.concat(srcItems);
    }
    const seen = new Set();
    const deduped = [];
    for (const it of catItems) {
      const k = (it.titleRu || it.title).toLowerCase().slice(0, 36);
      if (!seen.has(k) && !seen.has(it.link)) {
        seen.add(k);
        seen.add(it.link);
        deduped.push(it);
      }
    }
    output[cat] = clusterAndDiversify(deduped);
  }

  const [rates, weather] = await Promise.all([
    fetchCbrRatesHistory(),
    fetchDefaultWeather()
  ]);

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const payload = {
    version: '4.0',
    ts: Date.now(),
    health: {
      okSources: uniqueSources.size - failedSources.length,
      failedSources
    },
    rates: rates || (prevSnapshot && prevSnapshot.rates) || null,
    weather: weather || (prevSnapshot && prevSnapshot.weather) || null,
    data: output
  };

  fs.writeFileSync(outFile, JSON.stringify(payload));
  console.log(`Successfully wrote v4.0 snapshot to ${outFile}`);
}

main();
