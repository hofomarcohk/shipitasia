// P17 — pack page rebuilt to handoff #pack (mode-first).
//
// Existing logic (state + scan + place + open-box + seal-box) remains in
// services/outbound/pack-v1 + the corresponding API routes; this page
// is a fresh client renderer atop them.

import { PackPageClient } from "@/components/wms-redesign/pages/pack-page";

export default function Page() {
  return <PackPageClient />;
}
