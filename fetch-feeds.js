const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
  },
  customFields: {
    item: [
      ['description', 'description'],
      ['content:encoded', 'content'],
      ['enclosure', 'enclosure']
    ]
  }
});

const FEEDS = {
  ALL: [
    { name: 'РБК',         url: 'https://rssexport.rbc.ru/rbc/topnews.rss',            lang: 'ru', w: 1.4 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/main.xml',             lang: 'ru', w: 1.3 },
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',           lang: 'ru', w: 1.2 },
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         lang: 'en', w: 1.1 }
  ],
  WORLD: [
    { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         lang: 'en', w: 1.3 },
    { name: 'РБК',          url: 'https://rssexport.rbc.ru/rbc/topnews.rss',           lang: 'ru', w: 1.2 },
    { name: 'DW',           url: 'https://rss.dw.com/rdf/rss-ru-all',                  lang: 'ru', w: 1.0 }
  ],
  TECH: [
    { name: 'Habr',         url: 'https://habr.com/ru/rss/best/daily/?fl=ru',           lang: 'ru', w: 1.3 },
    { name: '3DNews',       url: 'https://3dnews.ru/news/rss/',                         lang: 'ru', w: 1.1 }
  ],
  ECONOMY: [
    { name: 'Ведомости',    url: 'https://www.vedomosti.ru/rss/issue',                 lang: 'ru', w: 1.4 },
    { name: 'Коммерсантъ',  url: 'https://www.kommersant.ru/RSS/main.xml',             lang: 'ru', w: 1.2 },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml',     lang: 'en', w: 1.0 }
  ],
  SCIENCE: [
    { name: 'N+1',          url: 'https://nplus1.ru/rss/feed/main',                    lang: 'ru', w: 1.4 },
    { name: 'Naked Science', url: 'https://naked-science.ru/feed',                     lang: 'ru', w: 1.1 }
  ],
  GAMES: [
    { name: 'StopGame',     url: 'https://rss.stopgame.ru/rss_news.xml',               lang: 'ru', w: 1.3 },
    { name: '3DNews Игры',  url: 'https://3dnews.ru/games/rss/',                        lang: 'ru', w: 1.1 }
  ]
};

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 200);
}

function makeId(link) {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = ((h << 5) - h + link.charCodeAt(i)) | 0;
  return 'n' + Math.abs(h).toString(36);
}

function parseDate(dStr) {
  if (!dStr) return Date.now();
  const d = new Date(dStr.replace(' ', 'T'));
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

async function fetchAndNormalize(cfg) {
  try {
    const feed = await parser.parseURL(cfg.url);
    const results = [];
    for (const it of feed.items) {
      let img = null;
      if (it.enclosure && it.enclosure.url) img = it.enclosure.url;
      else if (it.content || it.description) {
        const m = (it.content || it.description).match(/<img[^>]+src=["'](https?:\/\/[^"']+)/i);
        if (m) img = m[1];
      }
      
      const link = it.link || it.guid || '#';
      if (it.title) {
        results.push({
          id: makeId(link),
          title: it.title.trim(),
          link: link,
          desc: stripHtml(it.description || it.content || ''),
          img: img,
          date: parseDate(it.pubDate || it.isoDate),
          src: cfg.name,
          lang: cfg.lang,
          w: cfg.w || 1,
          titleRu: null,
          descRu: null
        });
      }
    }
    return results.slice(0, 20); // max 20 per feed source
  } catch (err) {
    console.error(`Failed to fetch ${cfg.name}: ${err.message}`);
    return [];
  }
}

async function main() {
  const output = {};
  
  // Collect all unique feed configs to avoid fetching the same feed twice
  const uniqueFeedsMap = new Map();
  for (const cat of Object.keys(FEEDS)) {
    for (const cfg of FEEDS[cat]) {
      uniqueFeedsMap.set(cfg.url, cfg);
    }
  }
  
  // Fetch them all concurrently
  console.log(`Fetching ${uniqueFeedsMap.size} unique feeds...`);
  const fetchedData = new Map();
  await Promise.all(
    Array.from(uniqueFeedsMap.values()).map(async cfg => {
      const items = await fetchAndNormalize(cfg);
      console.log(`- ${cfg.name}: ${items.length} items`);
      fetchedData.set(cfg.url, items);
    })
  );
  
  // Distribute into categories and deduplicate
  for (const cat of Object.keys(FEEDS)) {
    let catItems = [];
    for (const cfg of FEEDS[cat]) {
      catItems = catItems.concat(fetchedData.get(cfg.url) || []);
    }
    
    // Deduplicate
    const seen = new Set();
    const uniq = [];
    for (const it of catItems) {
      const k = it.title.toLowerCase().slice(0, 28);
      if (!seen.has(k) && !seen.has(it.link)) {
        seen.add(k); seen.add(it.link);
        uniq.push(it);
      }
    }
    
    // Sort by date descending
    uniq.sort((a, b) => b.date - a.date);
    output[cat] = uniq;
  }
  
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  
  const outFile = path.join(dataDir, 'latest.json');
  fs.writeFileSync(outFile, JSON.stringify({
    ts: Date.now(),
    data: output
  }));
  
  console.log(`Successfully wrote ${outFile}`);
}

main();
