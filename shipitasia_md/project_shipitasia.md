---
name: ShipItAsia WMS + OMS paired microservices
description: Two cloned repos under modification — WMS (warehouse, internal) and OMS (shipping, customer portal); paired Next.js services with shared Mongo/Redis
type: project
originSessionId: 7ec7fc08-1090-45fe-8b7d-dcff7f33245c
---
Marco is modifying ShipItAsia's existing system (NOT writing from scratch). Two repos cloned locally for adaptation:

| | WMS (internal/warehouse) | OMS (shipping/customer portal) |
|---|---|---|
| Repo | github.com/Viewider/shipitasia_wms | github.com/Viewider/shipitasia_shipping |
| Local path | /Volumes/External/其他AI開發/shipitasia_wms | /Volumes/External/其他AI開發/shipitasia_oms |
| Service name | vw-warehouse-service | vw-shipping-service |
| Dev port | 3001 | 3002 |
| Login API | /api/wms/login | /api/cms/login |
| Login table | `vw_wms.admins` | `vw_sms.clients` |
| Test admin | admin / admin123456 | admin / admin123456 |
| Cross-call env | SHIPPING_SERVICE_URL=http://localhost:3002 | WMS_URL=http://localhost:3001 |

**Stack**: Next.js 16.1.3 + Turbopack, MongoDB + Redis (both via brew services on this Mac, no auth — `.env` was modified locally to drop credentials so brew defaults work).

**Key architectural finding**: OMS = customer portal (login table is `clients`), WMS = internal staff. Customer order intake happens via OMS UI (or `/api/v1.0/*` REST on WMS for system-to-system). The "client" role in WMS Admin schema exists but has no dedicated UI in WMS.

**Marco doesn't have push access** to Viewider org — local commits only, push happens only at explicit final approval per modification-project workflow.

**Evaluation context (2026-05-07 onwards):** ShipItAsia is **candidate A** in a comparison Marco is running between this and another (yet-to-be-evaluated) WMS / OMS tool. Decision criteria: (1) integration breadth — how easy to wire up other carrier / payment / SaaS APIs; (2) modification cost — how hard to adapt into a usable product. The competing tool will be investigated in a separate future session, then compared side-by-side. See `project_shipitasia_eval.md` for the structured score sheet.

**Deliverable from initial walkthrough**: `/Volumes/External/其他AI開發/shipitasia_session_summary.docx` — full happy-path flow + 13 known bugs + 13 missing-functionality categories.

**Why:** The pair is the production architecture; understanding both is needed before deciding what to modify, rip, or keep.

**How to apply:**
- When Marco asks about either side, remember the role split: customer-facing → OMS, warehouse ops → WMS.
- Cross-service flows (OMS → WMS API, WMS callbacks) are real and signed via WMS_API_KEY/SECRET in env — don't assume isolation.
- Both DBs are on the same Mongo instance (different DB names) — be careful which you're querying.
- Mongo + Redis are brew services on this Mac, auto-start at login.
