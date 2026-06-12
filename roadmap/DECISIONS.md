# Decisions Log (append-only, ADR-lite)

> One entry per autonomous judgment call: context → decision → reversible? → where it lives.

---

- **2026-06-11** — Repo name: charter uses "Starfall: Living Galaxy"; slug set to `starfall-living-galaxy` in package.json (already present pre-install). Reversible. (department)
- **2026-06-11** — QA surface: charter specifies Cloudflare Tunnel (cloudflared) for sharing `node src/server.js` via public HTTPS URL — no cloud deploy provider needed. Reversible. (department)
- **2026-06-11** — Database: charter specifies built-in JSON file store as default; Redis optional for multi-host scale. No external DB service required at this stage. Reversible. (department)
- **2026-06-11** — E2E framework: charter explicitly names Playwright for browser Canvas client E2E (fly, dock, trade, mission accept flows). Reversible. (department)
- **2026-06-11** — GitHub repo: `michaelcrosato/agy-sandbox` per install directive. Reversible. (department)
- **2026-06-11** — Default branch set to `develop`; main protected with PR + 1 approval; develop protected with PR + green CI (verify check). Reversible. (department)

