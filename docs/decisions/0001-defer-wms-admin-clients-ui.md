# 0001 — Defer WMS admin clients UI to P2 / P7

- **Date**: 2026-05-10
- **Phase**: P1 (in-progress)
- **Status**: Accepted

## Context

Phase 1 spec §1.6 calls for a WMS admin "客戶清單" page at
`/zh-hk/clients/list` so internal staff can list / toggle / generate
password-reset links for OMS clients.

The clients collection lives in OMS's `vw_sms` database, and v1 architecture
forbids direct cross-database reads — WMS must talk to OMS via the
`WebhookDispatcher` service (review.md §1.4 / §1.7). That dispatcher is
defined as a P7 deliverable, with `webhookAuthHelper` for the receiving
side built incrementally in P2 / P4 (review.md §7.1).

P1 doesn't yet have either piece, so we can't honour the cross-service
discipline if we ship the WMS UI now. The two ways to "ship anyway" both
have problems:

- Have WMS open a second `MongoClient` against `vw_sms` directly. Breaks
  the dual-DB separation principle that protects future migration /
  multi-tenant setup.
- Make the WMS browser fetch OMS port 3002 directly. Requires CORS, leaks
  internal endpoints, breaks the same-origin assumption that keeps the
  cookie-based JWT consistent.

## Decision

Phase 1 ships only the OMS-side admin endpoints
(`/api/cms/admin/clients/*`) and **no WMS UI**. The endpoints are
auth-gated to `client.role === 'admin'` so internal staff can drive them
manually via curl / a temporary OMS-side admin page if needed during P1
demo.

The WMS UI (`/zh-hk/clients/list`) is deferred until WebhookDispatcher +
webhookAuthHelper land in P2 (Bug 7 fix wires the receiver) and P7
(dispatcher). That re-introduction will:

- Add WMS API routes that proxy via WebhookDispatcher to OMS.
- Keep the WMS browser strictly inside port 3001.
- Reuse the same OMS endpoints already in place from this phase.

## Consequences

- Wave 1 demo (P1 + P2 + P3) will not include a WMS-side clients page.
  Internal staff who need to manage clients before P7 use the OMS-side
  admin endpoints directly. Acceptable: ≤50 clients during the v1 trial,
  manual driving is fine.
- The OMS endpoints we ship here are the long-term API surface; WMS will
  layer on top, not replace.
- P5 PDA scan flows write into `audit_logs` only; admin-driven client
  status toggles will already have audit coverage by the time WMS UI is
  reintroduced.

## Alternatives considered

- **Direct cross-DB read from WMS** — rejected. Breaks dispatcher
  principle. Would have to be unwound in P7 anyway.
- **CORS-allowed cross-port fetch** — rejected. Couples browser-side to
  multi-origin, complicates JWT cookie semantics, no upgrade path.
- **Skip OMS endpoints entirely until P7** — rejected. Then P1 can't
  satisfy AC-1.8 even with manual driving, blocking demo.
