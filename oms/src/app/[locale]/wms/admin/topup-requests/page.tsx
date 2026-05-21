// P17 — topup approval (handoff #topup).
//
// Wraps the existing AdminTopupQueue inside the new WmsShell — the
// approve/reject logic + topup proof flow already work and don't need
// a re-skin for v1.

"use client";

import { Pill } from "@/components/wms-redesign/pill";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { AdminTopupQueue } from "@/components/admin-topup-queue";

export default function Page() {
  return (
    <WmsShell crumbs={[{ label: "管理" }, { label: "儲值審核" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">
            儲值審核
          </h1>
          <Pill kind="muted">approve / reject 客戶儲值申請</Pill>
        </div>
        <div className="rounded-xl border border-wms-border bg-wms-surface p-4">
          <AdminTopupQueue />
        </div>
      </div>
    </WmsShell>
  );
}
