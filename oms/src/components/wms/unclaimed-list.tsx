"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Row {
  _id: string;
  carrier_inbound_code: string;
  tracking_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number };
  photo_paths: string[];
  staff_note: string;
  status: "pending_assignment" | "assigned" | "disposed";
  arrived_at: string;
  arrived_by_staff_id: string;
}

interface MatchCandidate {
  _id: string;
  client_id: string;
  tracking_no: string;
}

export const UnclaimedList = () => {
  const t = useTranslations();
  const [status, setStatus] = useState<
    "pending_assignment" | "assigned" | "disposed"
  >("pending_assignment");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");

  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [assignClientId, setAssignClientId] = useState("");
  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);

  const [disposeTarget, setDisposeTarget] = useState<Row | null>(null);
  const [disposeReason, setDisposeReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await http_request("GET", "/api/wms/unclaimed-inbounds", {
      status,
    });
    const d = await r.json();
    if (d.status === 200) setItems(d.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [status]);

  useEffect(() => {
    if (!assignTarget) {
      setMatchCandidates([]);
      setAssignClientId("");
      return;
    }
    (async () => {
      const r = await http_request(
        "GET",
        `/api/wms/unclaimed/${assignTarget._id}/match-existing`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) setMatchCandidates(d.data.candidates ?? []);
    })();
  }, [assignTarget]);

  const doAssign = async (clientId?: string) => {
    if (!assignTarget) return;
    const id = clientId ?? assignClientId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const r = await http_request(
        "POST",
        `/api/wms/unclaimed/${assignTarget._id}/assign`,
        { client_id: id }
      );
      const d = await r.json();
      if (r.ok && d.status === 200) {
        setFlash(t("unclaimed_ui.msg_assigned"));
        setAssignTarget(null);
        load();
      } else {
        setFlash(d.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const doCancelAssign = async (id: string) => {
    setBusy(true);
    try {
      const r = await http_request(
        "POST",
        `/api/wms/unclaimed/${id}/cancel-assignment`,
        {}
      );
      if (r.ok) {
        setFlash(t("unclaimed_ui.msg_cancelled"));
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const doDispose = async () => {
    if (!disposeTarget || !disposeReason.trim()) return;
    setBusy(true);
    try {
      const r = await http_request(
        "POST",
        `/api/wms/unclaimed/${disposeTarget._id}/dispose`,
        { disposed_reason: disposeReason.trim() }
      );
      const d = await r.json();
      if (r.ok && d.status === 200) {
        setFlash(t("unclaimed_ui.msg_disposed"));
        setDisposeTarget(null);
        setDisposeReason("");
        load();
      } else {
        setFlash(d.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4 px-3 grid gap-3">
      <h1 className="text-2xl font-semibold">
        {t("wms_scan.page_title_unclaimed")}
      </h1>
      {flash && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {flash}
        </div>
      )}
      <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
        <TabsList>
          <TabsTrigger value="pending_assignment">
            {t("wms_scan.unclaimed_status_pending_assignment")}
          </TabsTrigger>
          <TabsTrigger value="assigned">
            {t("wms_scan.unclaimed_status_assigned")}
          </TabsTrigger>
          <TabsTrigger value="disposed">
            {t("wms_scan.unclaimed_status_disposed")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="py-3">
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("wms_scan.unclaimed_empty")}
            </p>
          ) : (
            <div className="grid gap-2">
              {items.map((r) => (
                <div key={r._id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{r._id}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 border">
                      {t(`wms_scan.unclaimed_status_${r.status}` as any)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-700 mt-1">
                    {r.carrier_inbound_code} · tracking{" "}
                    <span className="font-mono">{r.tracking_no}</span> ·{" "}
                    {r.weight}kg · {r.dimension.length}×{r.dimension.width}×
                    {r.dimension.height}cm
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    員工備註：{r.staff_note}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {t("wms_scan.unclaimed_arrived_at")}{" "}
                    {new Date(r.arrived_at).toLocaleString()}
                  </div>
                  {r.status === "pending_assignment" && (
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" onClick={() => setAssignTarget(r)}>
                        {t("unclaimed_ui.admin_assign_btn")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => doCancelAssign(r._id)}
                        disabled={busy}
                      >
                        {t("unclaimed_ui.admin_cancel_assign_btn")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => setDisposeTarget(r)}
                      >
                        {t("unclaimed_ui.admin_dispose_btn")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign dialog */}
      <Dialog
        open={assignTarget !== null}
        onOpenChange={(o) => !o && setAssignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("unclaimed_ui.assign_dialog_title")}
            </DialogTitle>
          </DialogHeader>
          {matchCandidates.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
              <div className="font-semibold">
                ⚠️ {t("unclaimed_ui.match_existing_title")}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {t("unclaimed_ui.match_existing_subtitle")}
              </div>
              <div className="mt-2 grid gap-1">
                {matchCandidates.map((m) => (
                  <div
                    key={m._id}
                    className="flex items-center justify-between gap-2 rounded border bg-white p-2 text-xs"
                  >
                    <span className="font-mono">
                      {m._id} → client {m.client_id.substring(0, 12)}…
                    </span>
                    <Button
                      size="sm"
                      onClick={() => doAssign(m.client_id)}
                      disabled={busy}
                    >
                      指派此客戶
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{t("unclaimed_ui.assign_client_id_label")}</Label>
            <Input
              value={assignClientId}
              onChange={(e) => setAssignClientId(e.target.value)}
              placeholder="client_..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              {t("profile.cancel")}
            </Button>
            <Button
              onClick={() => doAssign()}
              disabled={busy || !assignClientId.trim()}
            >
              {t("unclaimed_ui.assign_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispose confirm */}
      <AlertDialog
        open={disposeTarget !== null}
        onOpenChange={(o) => !o && setDisposeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("unclaimed_ui.dispose_dialog_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("unclaimed_ui.dispose_dialog_warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label>{t("unclaimed_ui.dispose_reason_label")}</Label>
          <Textarea
            rows={3}
            value={disposeReason}
            onChange={(e) => setDisposeReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("profile.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={doDispose}
              disabled={busy || !disposeReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("unclaimed_ui.dispose_submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
