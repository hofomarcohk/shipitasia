---
name: ShipItAsia evaluation score sheet — extensibility + modification cost
description: Comparison-ready snapshot of ShipItAsia (candidate A); future session evaluating the competing tool should score it on the same 12 axes for side-by-side decision
type: project
originSessionId: 7ec7fc08-1090-45fe-8b7d-dcff7f33245c
---
Marco is comparing ShipItAsia (this session's findings) vs another tool (TBD future session). Decision goal: pick the WMS/OMS with **broader integration surface** AND **lower modification cost** to adapt into a usable product.

**Reference**: `/Volumes/External/其他AI開發/shipitasia_session_summary.docx`

## Stack snapshot

- Frontend: Next.js 16.1.3 + Turbopack + React 18 + Tailwind + shadcn/ui + Tabler icons
- Backend: Next.js API routes + MongoDB 8 + Redis (ioredis) + node-cron
- Auth: custom JWT (no NextAuth despite `@auth/core` in deps)
- Validation: zod schemas
- i18n: **two parallel systems** running side-by-side (next-intl works; custom `lang()` ships broken in default locale detection)

## Comparison axes (use these for the competing tool too)

When future session investigates the competing tool, run a comparable happy-path walkthrough and score on these same 12 axes. Pick the higher score.

| # | Axis | What to look for | ShipItAsia score |
|---|---|---|---|
| 1 | Stack & familiarity | mainstream framework? typed? | TS Next.js — mainstream, easy hire/hand-off |
| 2 | Cross-service / inter-module integration | event bus? hook system? generic sync? per-resource hand-rolled? | **Hand-rolled HTTP per resource**; one generic `/api/wms/utils/sync` exists but unauth'd; no event bus |
| 3 | Carrier integration framework | vendor-agnostic abstraction or hardcoded switch? | **Hardcoded switch**; only YunExpress half-implemented; UPS/DHL/SF/FedEx absent |
| 4 | Outbound webhook dispatcher | declarative subscriber model implemented? | **Schema field exists (`client.notifyApis`) but no dispatcher code** |
| 5 | i18n cohesion | one coherent system? | **Two competing systems**; custom `lang()` shipped broken |
| 6 | Code quality on happy-path walkthrough | count visible bugs after one pass | **~13 bugs** (4 connected sync chain + 6 logic / 3 data) |
| 7 | Form ↔ schema alignment | does form default match validation? | **Misaligned** — forms send null where strict schema rejects null; required fields stub-defaulted to "admin" |
| 8 | Master-data CRUD coverage | warehouse / category / restriction / logistic-party / country / customer | **4/6 covered** (warehouse, category, restriction wired; logistic-party has no CRUD; client managed via OMS only) |
| 9 | PDA / mobile-floor flow completeness | arrive / receive / pick / palletize / departure | **5/5 present**; 3 of these have logic bugs |
| 10 | Operational visibility (UI) | audit log UI? dashboard? KPI? | **None** — incoming/outgoing API logs are stored, no UI; `/home` is empty shell |
| 11 | Functional gap to "complete WMS" | how many of the 13 categories are missing or partial | **~13 categories missing or partial** (carrier API, SKU master, inventory, RMA, bill engine, notifications, reports, perms, multi-warehouse, label printing, PDA hardware, customer self-service, multi-currency) |
| 12 | Test coverage | unit / integration / e2e present? | **Minimal** — `__tests__/` folder with login + clients only |

## Strengths to preserve if ShipItAsia is chosen

- Clean Next.js app router structure, conventional file layout
- Shared zod schemas (mostly) between WMS / OMS
- Working master-data sync pattern for warehouse + category (template for replicating to other resources)
- PDA flow surface area exists (rare — most templates skip the warehouse-floor screens)
- Working OMS → WMS push model for inbound / outbound (only status sync is buggy)

## Weaknesses driving modification cost

- Stub handlers shipped to production (e.g. WMS POST `/api/wms/inbound` returns list, ignores body)
- Dead routes left in repo (e.g. `/admin`, `/outbound/pack/list`)
- Hardcoded placeholders in form defaults (`clientId: "admin"`)
- Switch missing `break` (silent CANCEL bug)
- Cross-service errors swallowed (logged but not surfaced)
- Sync endpoint open without auth (production risk)
- Service file names mismatch content (`do_create_pallet.ts` contains cancel logic)
- Two i18n systems means every string change has a "which system?" question

## Decision rubric (apply when competing tool is scored)

For each axis, pick the better score. Weight axes 2, 3, 4, 6, 11 (integration framework + carrier + webhook + bug density + gap) at 2x — these directly drive both extensibility and modification cost. Other axes 1x.

If competing tool wins ≥7 of 12 weighted axes → it's the better base.
If competing tool ties or loses but has materially better #2 + #3 → still consider it (those two axes are why Marco is shopping in the first place).

**How to apply**: When future session walks the competing tool's happy path, ask the same 12 questions, fill the same table, present the side-by-side. Don't let "this one feels nicer" override the score — make the rubric explicit.
