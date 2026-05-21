// P17 — Pick page rebuilt to handoff #pick spec.
//
// Old component (OperationsPickBatchList) is kept available for tests
// + the legacy admin route — this page is the new staff surface.

import { PickPageClient } from "@/components/wms-redesign/pages/pick-page";

export default function Page() {
  return <PickPageClient />;
}
