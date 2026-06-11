// W6 — 貨架管理 wrapped in the redesigned WmsShell so the dark
// signage sidebar + Direction A tokens apply consistently. The
// LocationsAdmin CRUD component itself is unchanged.

"use client";

import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { LocationsAdmin } from "@/components/wms/locations-admin";

export default function Page() {
  return (
    <WmsShell crumbs={[{ label: "管理" }, { label: "貨架管理" }]}>
      <div className="px-[22px] py-3.5">
        <h1 className="font-wms-disp text-[24px] font-extrabold tracking-[0.01em]">
          貨架管理
        </h1>
        <div className="mb-4 mt-0.5 text-[12.5px] text-wms-muted">
          分區使用率與逐架明細
        </div>
        <LocationsAdmin />
      </div>
    </WmsShell>
  );
}
