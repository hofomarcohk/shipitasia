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
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Row {
  _id: string;
  client_id: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  customer_note: string | null;
  transfer_date: string;
  transfer_account_last4: string | null;
  has_proof: boolean;
}

export const AdminTopupQueue = () => {
  const t = useTranslations();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");
  const [approveTarget, setApproveTarget] = useState<Row | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await http_request(
      "GET",
      "/api/cms/admin/topup-requests",
      { status, page_size: 100 }
    );
    const data = await res.json();
    if (data.status === 200) setItems(data.data.items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [status]);

  const doApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      const res = await http_request(
        "POST",
        `/api/cms/admin/topup-requests/${approveTarget._id}/approve`,
        {}
      );
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setFlash(t("admin_wallet.approved_msg"));
        setApproveTarget(null);
        load();
      } else {
        setFlash(data.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setBusy(true);
    try {
      const res = await http_request(
        "POST",
        `/api/cms/admin/topup-requests/${rejectTarget._id}/reject`,
        { reject_reason: rejectReason.trim() }
      );
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setFlash(t("admin_wallet.rejected_msg"));
        setRejectTarget(null);
        setRejectReason("");
        load();
      } else {
        setFlash(data.message || "Failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 grid gap-4">
      <div>
        <h1 className="text-3xl font-semibold">
          {t("admin_wallet.queue_title")}
        </h1>
        <p className="text-gray-600 text-sm mt-1">
          {t("admin_wallet.queue_subtitle")}
        </p>
      </div>

      {flash && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {flash}
        </div>
      )}

      <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">
            {t("admin_wallet.pending_tab")}
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t("admin_wallet.approved_tab")}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            {t("admin_wallet.rejected_tab")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("admin_wallet.empty_pending")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">
                    {t("admin_wallet.submitted_at")}
                  </th>
                  <th className="py-2 pr-3">{t("admin_wallet.client")}</th>
                  <th className="py-2 pr-3 text-right">
                    {t("admin_wallet.amount")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin_wallet.transfer_date")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin_wallet.transfer_account")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin_wallet.customer_note")}
                  </th>
                  <th className="py-2 pr-3">{t("admin_wallet.proof")}</th>
                  <th className="py-2 text-right">
                    {t("carriers.actions") /* reuse string */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r._id} className="border-b">
                    <td className="py-3 pr-3 text-xs text-gray-500">
                      {new Date(r.submitted_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-3 text-xs font-mono">
                      {r.client_id.substring(0, 8)}…
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold">
                      HK$ {r.amount.toLocaleString()}
                    </td>
                    <td className="py-3 pr-3">
                      {new Date(r.transfer_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-3">
                      {r.transfer_account_last4
                        ? `****${r.transfer_account_last4}`
                        : "—"}
                    </td>
                    <td className="py-3 pr-3 max-w-[200px] truncate">
                      {r.customer_note ?? "—"}
                    </td>
                    <td className="py-3 pr-3">
                      {r.has_proof ? (
                        <a
                          href={`/api/files/topup-proofs/${r._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-blue-600"
                        >
                          {t("wallet.requests.view_proof")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {r.status === "pending" ? (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            onClick={() => setApproveTarget(r)}
                          >
                            {t("admin_wallet.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            onClick={() => setRejectTarget(r)}
                          >
                            {t("admin_wallet.reject")}
                          </Button>
                        </div>
                      ) : r.status === "approved" ? (
                        <span className="text-xs text-green-600">
                          {new Date(r.approved_at!).toLocaleDateString()}
                        </span>
                      ) : (
                        <span
                          className="text-xs text-red-600"
                          title={r.reject_reason ?? undefined}
                        >
                          {r.reject_reason ?? "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Approve confirm */}
      <AlertDialog
        open={approveTarget !== null}
        onOpenChange={(o) => !o && setApproveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin_wallet.approve_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin_wallet.approve_confirm_body").replace(
                "{amount}",
                approveTarget?.amount?.toLocaleString() ?? ""
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t("profile.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={doApprove} disabled={busy}>
              {busy
                ? t("admin_wallet.approving")
                : t("admin_wallet.approve_confirm_btn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin_wallet.reject_dialog_title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">
              {t("admin_wallet.reject_reason_label")}
            </Label>
            <Textarea
              id="reason"
              rows={3}
              placeholder={t("admin_wallet.reject_reason_placeholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={busy}
            >
              {t("profile.cancel")}
            </Button>
            <Button
              onClick={doReject}
              disabled={busy || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy
                ? t("admin_wallet.approving")
                : t("admin_wallet.reject_confirm_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
