"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Row {
  _id: string;
  carrier_inbound_code: string;
  tracking_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number };
  photo_paths: string[];
  staff_note: string;
  arrived_at: string;
}

const REJECT_REASONS = [
  "not_mine",
  "wrong_address",
  "already_received_elsewhere",
  "other",
] as const;

export const InboundPendingConfirm = () => {
  const t = useTranslations();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] =
    useState<(typeof REJECT_REASONS)[number]>("not_mine");
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await http_request(
      "GET",
      "/api/cms/inbound/pending-confirm",
      {}
    );
    const d = await r.json();
    if (d.status === 200) setItems(d.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const doReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason === "other" && !rejectNote.trim()) return;
    setBusy(true);
    try {
      const r = await http_request(
        "POST",
        `/api/cms/inbound/reject/${rejectTarget._id}`,
        {
          reject_reason: rejectReason,
          reject_note: rejectNote.trim() || undefined,
        }
      );
      const d = await r.json();
      if (r.ok && d.status === 200) {
        setFlash(t("unclaimed_ui.msg_rejected"));
        setRejectTarget(null);
        setRejectNote("");
        setRejectReason("not_mine");
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-3 grid gap-3">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("unclaimed_ui.pending_confirm_page_title")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("unclaimed_ui.pending_confirm_subtitle")}
        </p>
      </div>
      {flash && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {flash}
        </div>
      )}
      {loading ? (
        <p className="text-gray-500 py-12 text-center">
          {t("common.loading")}
        </p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {t("unclaimed_ui.pending_confirm_empty")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((r) => (
            <Card key={r._id}>
              <CardContent className="py-3">
                <div className="font-mono font-semibold">{r._id}</div>
                <div className="text-sm text-gray-700 mt-1">
                  {t("unclaimed_ui.confirm_carrier")}:{" "}
                  {r.carrier_inbound_code} · {t("unclaimed_ui.confirm_tracking")}:{" "}
                  <span className="font-mono">{r.tracking_no}</span> ·{" "}
                  {r.weight}kg · {r.dimension.length}×{r.dimension.width}×
                  {r.dimension.height}cm
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {t("unclaimed_ui.confirm_staff_note")}：{r.staff_note}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {t("unclaimed_ui.confirm_arrived")}{" "}
                  {new Date(r.arrived_at).toLocaleString()}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/zh-hk/inbound/confirm/${r._id}`}>
                    <Button size="sm">
                      {t("unclaimed_ui.confirm_accept_btn")}
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => setRejectTarget(r)}
                  >
                    {t("unclaimed_ui.confirm_reject_btn")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("unclaimed_ui.reject_dialog_title")}</DialogTitle>
          </DialogHeader>
          <Label>{t("unclaimed_ui.reject_reason_label")}</Label>
          <div className="grid gap-2">
            {REJECT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reject_reason"
                  value={r}
                  checked={rejectReason === r}
                  onChange={() => setRejectReason(r)}
                />
                {t(`unclaimed_ui.reject_reason_${r}` as any)}
              </label>
            ))}
          </div>
          <Label className="mt-2">{t("unclaimed_ui.reject_note_label")}</Label>
          <Textarea
            rows={2}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectTarget(null)}
            >
              {t("profile.cancel")}
            </Button>
            <Button
              onClick={doReject}
              disabled={
                busy || (rejectReason === "other" && !rejectNote.trim())
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {t("unclaimed_ui.reject_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
