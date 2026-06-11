// P17 — handoff #courier (carrier accounts cross-client + system).

"use client";

import { AlertTriangle, Plug } from "lucide-react";
import * as React from "react";

import { Pill } from "@/components/wms-redesign/pill";
import { WmsShell } from "@/components/wms-redesign/wms-shell";
import { get_request } from "@/lib/httpRequest";

interface AcctRow {
  account_id: string;
  owner_type: "client" | "system";
  client_id: string | null;
  client_name: string | null;
  carrier_code: string;
  nickname: string;
  auth_type: "api_key" | "oauth";
  is_default: boolean;
  status: "active" | "expired" | "revoked";
  last_used_at: string | null;
}

const CARRIER_LOGO: Record<string, { bg: string; code: string }> = {
  fuuffy: { bg: "#5887C4", code: "SIA" },
  yunexpress: { bg: "#0F172A", code: "YUN" },
  sf: { bg: "#0F172A", code: "SF" },
  yamato: { bg: "#D97706", code: "YM" },
  dhl: { bg: "#FFCC00", code: "DHL" },
};

function logoFor(carrier_code: string) {
  return (
    CARRIER_LOGO[carrier_code.toLowerCase()] ?? {
      bg: "#6B7280",
      code: carrier_code.slice(0, 3).toUpperCase(),
    }
  );
}

export function CourierPageClient() {
  const [accts, setAccts] = React.useState<AcctRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await get_request("/api/wms/admin/carrier-accounts");
        const json = await res.json();
        if (cancelled) return;
        if (json?.status === 200) setAccts(json.data?.accounts ?? []);
        else setError(json?.message ?? "Load failed");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WmsShell crumbs={[{ label: "管理" }, { label: "Courier 帳號" }]}>
      <div className="px-[22px] py-3.5">
        <div className="mb-3.5 flex items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">
            Courier 帳號
          </h1>
          <Pill kind="muted">{accts.length} 個帳號</Pill>
        </div>

        <div className="mb-3.5 flex items-start gap-3 rounded-[10px] bg-wms-info-bg px-4 py-3 text-[13px] text-wms-info-fg">
          <AlertTriangle size={18} className="mt-px flex-none" />
          <div>
            <strong>YT 流程</strong> 共用 system-owned fuuffy 帳號統一取單 ·
            與集運不同，並非各客戶自有的 courier 帳號 ·
            呢度維護一個 SIA 內部帳號就足夠所有 YT 件用。
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-wms-danger-fg/30 bg-wms-danger-bg px-3 py-2 text-sm text-wms-danger-fg">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {accts.length === 0 && (
            <div className="rounded-xl border border-wms-border bg-wms-surface p-8 text-center text-sm text-wms-faint">
              載入中…
            </div>
          )}
          {accts.map((a) => {
            const logo = logoFor(a.carrier_code);
            const highlight = a.owner_type === "system";
            return (
              <div
                key={a.account_id}
                className="flex items-center gap-3.5 rounded-xl border bg-wms-surface p-3.5"
                style={{
                  borderColor: highlight ? "#5887C4" : "#E5E7EB",
                  borderWidth: highlight ? 1.5 : 1,
                }}
              >
                <div
                  className="flex h-12 w-12 flex-none items-center justify-center rounded-[10px] font-wms-mono text-sm font-bold text-white"
                  style={{ background: logo.bg }}
                >
                  {logo.code}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">
                      {a.nickname}
                    </span>
                    {highlight && <Pill kind="brand">YT 共用</Pill>}
                    {a.status === "active" && <Pill kind="ok">運作中</Pill>}
                    {a.status === "expired" && <Pill kind="warn">已過期</Pill>}
                    {a.status === "revoked" && <Pill kind="danger">已撤銷</Pill>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-[12.5px] text-wms-muted">
                    <span>
                      使用:{" "}
                      <span className="font-wms-mono font-medium text-wms-ink-2">
                        {highlight ? "(YT 全部)" : a.client_name ?? "—"}
                      </span>
                    </span>
                    <span>
                      Carrier:{" "}
                      <span className="font-wms-mono font-medium text-wms-ink-2">
                        {a.carrier_code}
                      </span>
                    </span>
                    <span>
                      Auth:{" "}
                      <span className="font-wms-mono font-medium text-wms-ink-2">
                        {a.auth_type}
                      </span>
                    </span>
                    {a.last_used_at && (
                      <span>
                        Last used:{" "}
                        <span className="font-wms-mono font-medium text-wms-ink-2">
                          {new Date(a.last_used_at).toLocaleDateString("zh-HK")}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-wms-border bg-wms-surface px-2.5 py-1.5 text-xs hover:bg-wms-row-hover">
                  <Plug size={13} /> 編輯 (v2)
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </WmsShell>
  );
}
