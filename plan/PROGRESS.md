# PROGRESS — Blueprint Execution Tracker

State for downstream agents. Legend: `[ ]` Todo · `[~]` In Progress · `[x]` Done. Update the line when
you claim/finish a spec. Order = recommended execution order. Specs are in [`specs/`](specs/).

## Current queue

The queue is **empty**. Specs `001`–`177` have all shipped; their full checkbox history and the
v1–v50 re-audit baselines live in [`archive/PROGRESS-history.md`](archive/PROGRESS-history.md).

To start a new wave:

1. Write an atomic spec in [`specs/`](specs/) using [`specs/template.md`](specs/template.md)
   (validate with `node scripts/agent/validate-specs.js`).
2. Add a checkbox line for it here under a new wave heading.
3. Follow the loop in [`../AGENTS.md`](../AGENTS.md) §2 and gate with `npm run agent:check`.

## History

- **2026-07-12 — Repository overhaul:** dead modules removed, integration suites moved to a shared
  readiness-polling harness, generated artifacts un-committed, documentation rewritten to match
  reality. See `docs/LOG.md` and the git history for details.
- **2026-05-28 → 2026-06-20 — Waves v1–v50:** all specs `001`–`177` designed, implemented, and
  verified by the autonomous loop. Full ledger: [`archive/PROGRESS-history.md`](archive/PROGRESS-history.md).
