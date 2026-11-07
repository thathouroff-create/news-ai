# News AI — Project Instructions & Agent Guidelines (`AGENTS.md`)

## 1. Architecture & Network Invariants (STRICT)
- **Zero Client-Side CORS Proxy Dependence:** Russian mobile carriers (Megafon, MTS, Beeline, Tele2) block or throttle `api.rss2json.com`, `api.allorigins.win`, `corsproxy.io`, `bbc.co.uk`, and `dw.com`. Primary data delivery MUST always come from same-origin `./data/latest.json` built by GitHub Actions (`fetch-feeds.js`) and hosted on `gh-pages`.
- **Dual-Branch CI/CD Safety (`main` vs `gh-pages`):**
  - `deploy.yml` deploys static frontend assets from `main` to `gh-pages` and MUST preserve `clean-exclude: data/` so news snapshots are never wiped on code deploys.
  - Only production frontend assets (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, `icons/`) belong on `gh-pages`. Never leak `node_modules/`, `package.json`, `fetch-feeds.js`, or scratch files (`live_app.js`) to `gh-pages`.
- **True Cross-Platform Adaptive Design (PC + Tablet + Phone):**
  - Must look and behave natively on both **Mobile (`320px–430px`)** and **Desktop/Widescreen (`768px–1920px+` — multi-column / balanced wide layout, hover states, keyboard shortcuts)**, verified live in **Google Chrome** and **BlueStacks 5 Android** by `cross_device_e2e_tester`.
- **DOM & URL Security:**
  - Escape all 5 HTML/attribute characters (`&`, `<`, `>`, `"`, `'`). Never use `div.innerHTML` for attribute escaping.
  - Validate every external `<a href>` and `<img src>` through `safeUrl()` (`https:` / `http:` protocol whitelist).
  - Include `rel="noopener noreferrer"` on external links and maintain strict `Content-Security-Policy` compatibility (zero inline `onclick` handlers).

## 2. Relevant Workspace Skills (6 Skills)
Read the relevant skill before modifying or testing any subsystem:
- [`news-ai-architecture`](file:///D:/Antigravity/.agents/skills/news-ai-architecture/SKILL.md) — System topology, `latest.json` v4 contract, health checks.
- [`rss-data-pipeline`](file:///D:/Antigravity/.agents/skills/rss-data-pipeline/SKILL.md) — RFC-2822/ISO date parsing, multi-URL feed fallbacks, clustering, server-side EN->RU translation.
- [`pwa-offline-resilience`](file:///D:/Antigravity/.agents/skills/pwa-offline-resilience/SKILL.md) — Service Worker cache normalization, offline image handling, `localStorage` LRU quota protection, shortcut hash routing, Pull-to-Refresh.
- [`ultra-web-designer`](file:///D:/Antigravity/.agents/skills/ultra-web-designer/SKILL.md) — Tri-theme WCAG contrast, 320px–1920px adaptive layout, HiDPI Canvas charts.
- [`web-security-adversarial-audit`](file:///D:/Antigravity/.agents/skills/web-security-adversarial-audit/SKILL.md) — SAST/DAST checks and GitHub Actions supply-chain hardening.
- [`cross-device-e2e-tester`](file:///D:/Antigravity/.agents/skills/cross-device-e2e-tester/SKILL.md) — Live multi-viewport Chrome CDP (`320px/375px/768px/1440px`) + BlueStacks 5 Android (`adb reverse` + touch gestures + `screencap`) testing.

## 3. Web Squad Subagents (7 Roles)
See [`WEB_TEAMWORK.md`](file:///D:/Antigravity/.agents/WEB_TEAMWORK.md) for the 7-agent parallel lifecycle (`news_project_planner`, `editorial_ai_curator`, `rss_pipeline_engineer`, `pwa_frontend_engineer`, `adversarial_sec_auditor`, `pwa_qa_inspector`, `cross_device_e2e_tester`).
