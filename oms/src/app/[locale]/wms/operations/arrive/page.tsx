// P17 — arrive monitor (handoff #arrive).
//
// Read-only desktop view. Real data wiring waits on an inbound-scan
// list endpoint (currently scattered in scan-service.listInboundScans
// — adapt later).

"use client";

import { Scan } from "lucide-react";

import { Pill } from "@/components/wms-redesign/pill";
import { Stepper } from "@/components/wms-redesign/stepper";
import { WmsShell } from "@/components/wms-redesign/wms-shell";

export default function Page() {
  return (
    <WmsShell crumbs={[{ label: "起始流程" }, { label: "到倉掃描" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-wms-border bg-wms-surface-alt px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-wms-faint">
            起始流程
          </span>
          <Stepper
            steps={[
              { label: "OMS 預報核對", state: "done" },
              { label: "PDA 到倉掃碼", state: "current" },
              { label: "上架管理", state: "todo" },
              { label: "進入出貨流程", state: "todo" },
            ]}
          />
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">到倉掃描</h1>
          <Pill kind="brand">PDA 為主 · 此頁監控</Pill>
        </div>

        <div className="flex items-start gap-3 rounded-[10px] bg-wms-info-bg px-4 py-3 text-[13px] text-wms-info-fg">
          <Scan size={18} className="mt-px flex-none" />
          <div>
            <strong>此頁為 desktop 監控視圖</strong>{" "}
            ·
            倉庫工人喺貨車旁邊用 PDA 掃 barcode，系統自動分流（集運有預報 / YT / 無頭件）。Live 動態列表 v2 補入；現階段請參考{" "}
            <a
              href="/zh-hk/wms/operations/outbound-list"
              className="underline"
            >
              所有出庫單
            </a>{" "}
            或{" "}
            <a
              href="/zh-hk/wms/operations/unclaimed-inbounds"
              className="underline"
            >
              無頭件池
            </a>
            。
          </div>
        </div>
      </div>
    </WmsShell>
  );
}
