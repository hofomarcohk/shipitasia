"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);

export const TopupRequestModal = ({ open, onOpenChange, onSuccess }: Props) => {
  const t = useTranslations();
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [last4, setLast4] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setAmount("");
    setLast4("");
    setNote("");
    setFile(null);
    setError("");
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    setError("");
    const amt = parseInt(amount, 10);
    if (!Number.isFinite(amt) || amt < 100) {
      setError(t("wallet.topup.amount_hint"));
      return;
    }
    if (!file) {
      setError(t("wallet.topup.proof"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("wallet.topup.proof_hint"));
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      setError(t("wallet.topup.proof_hint"));
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("amount", String(amt));
      fd.append("transfer_date", transferDate);
      if (last4) fd.append("transfer_account_last4", last4);
      if (note) fd.append("customer_note", note);
      fd.append("proof_file", file);
      const res = await fetch("/api/cms/wallet/topup-requests", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setSubmitted(true);
        return;
      }
      setError(data.message || "Failed");
    } catch (err) {
      console.error(err);
      setError("Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("wallet.topup.title")}</DialogTitle>
        </DialogHeader>
        {submitted ? (
          <div className="grid gap-3 py-2">
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <div className="font-semibold text-green-700">
                {t("wallet.topup.submit_success_title")}
              </div>
              <div className="text-sm text-green-700 mt-1">
                {t("wallet.topup.submit_success_body")}
              </div>
            </div>
            <Button onClick={onSuccess}>{t("wallet.topup.back")}</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="amount">{t("wallet.topup.amount")}</Label>
              <Input
                id="amount"
                type="number"
                min={100}
                step={1}
                placeholder="5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                {t("wallet.topup.amount_hint")}
              </p>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="td">{t("wallet.topup.transfer_date")}</Label>
              <Input
                id="td"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="last4">
                {t("wallet.topup.transfer_account_last4")}
              </Label>
              <Input
                id="last4"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="1234"
                value={last4}
                onChange={(e) =>
                  setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="note">{t("wallet.topup.customer_note")}</Label>
              <Textarea
                id="note"
                rows={2}
                maxLength={200}
                placeholder={t("wallet.topup.customer_note_placeholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="proof">{t("wallet.topup.proof")}</Label>
              <Input
                id="proof"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">
                {t("wallet.topup.proof_hint")}
              </p>
            </div>
            {error && (
              <p className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("wallet.topup.back")}
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? t("wallet.topup.submitting")
                  : t("wallet.topup.submit")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
