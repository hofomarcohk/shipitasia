// P17 — settings shell (handoff #settings).
//
// Placeholder rows for the categories the handoff lists; backend
// persistence (warehouse cutoff, scale config, printer template, etc.)
// is deferred until those settings are actually adjustable in product.

"use client";

import {
  Bell,
  Clock,
  Plug,
  Printer,
  Scale,
  Scan,
  Settings as SettingsIcon,
  User,
  Warehouse,
} from "lucide-react";
import * as React from "react";

import { Pill } from "@/components/wms-redesign/pill";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "account", icon: User, label: "帳號 · 個人" },
  { id: "warehouse", icon: Warehouse, label: "倉庫" },
  { id: "pda", icon: Scan, label: "PDA · 設備" },
  { id: "scale", icon: Scale, label: "磅秤 · 連接" },
  { id: "printer", icon: Printer, label: "印表機 · 模板" },
  { id: "notify", icon: Bell, label: "通知 · 提示" },
  { id: "cutoff", icon: Clock, label: "截單時間預設" },
  { id: "system", icon: SettingsIcon, label: "系統 · 進階" },
] as const;

export default function Page() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["id"]>("account");
  return (
    <WmsShell crumbs={[{ label: "管理" }, { label: "設定" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">設定</h1>
          <Pill kind="muted">v1 部分項目 read-only</Pill>
        </div>

        <div className="grid grid-cols-[240px_1fr] gap-3.5">
          <div className="rounded-xl border border-wms-border bg-wms-surface p-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]",
                    tab === t.id
                      ? "bg-wms-ink text-white"
                      : "text-wms-ink-2 hover:bg-wms-row-hover"
                  )}
                >
                  <Icon size={15} />
                  <span className="flex-1">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-wms-border bg-wms-surface p-5">
            {tab === "account" ? (
              <>
                <h2 className="mb-4 text-base font-semibold">帳號 · 個人</h2>
                <div className="text-sm text-wms-muted">
                  尚未接入用戶 profile 資料。下方為 placeholder 預覽。
                </div>
                <div className="mt-4 divide-y divide-wms-border">
                  {[
                    ["顯示名稱", "—"],
                    ["電郵", "—"],
                    ["語言", "繁體中文 (粵語)"],
                    ["時區", "Asia/Hong_Kong (UTC+8)"],
                    ["預設倉", "—"],
                    ["角色", "—"],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center gap-4 py-3 first:pt-0"
                    >
                      <span className="w-32 text-[12.5px] text-wms-muted">
                        {k}
                      </span>
                      <span className="flex-1 text-[13px]">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-wms-surface-alt py-12 text-center">
                <Plug size={24} className="text-wms-faint" />
                <div className="text-sm font-medium text-wms-muted">
                  尚未實作呢個分類
                </div>
                <div className="max-w-sm text-xs text-wms-faint">
                  Settings v2 會接入 warehouse cutoff、磅秤 COM
                  port、印表機模板等持久化設定
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </WmsShell>
  );
}
