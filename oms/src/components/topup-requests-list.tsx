"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface TR {
  _id: string;
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

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export const TopupRequestsList = () => {
  const t = useTranslations();
  const [items, setItems] = useState<TR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await http_request(
        "GET",
        "/api/cms/wallet/topup-requests",
        {}
      );
      const data = await res.json();
      if (data.status === 200) setItems(data.data);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            {t("wallet.requests.title")}
          </h1>
        </div>
        <Link href="/zh-hk/wallet">
          <Button variant="outline">{t("wallet.topup.back")}</Button>
        </Link>
      </div>

      <Card>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("wallet.requests.empty")}
            </p>
          ) : (
            <div className="grid gap-2">
              {items.map((r) => (
                <div
                  key={r._id}
                  className="rounded-md border p-3 flex items-start gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">
                        HK$ {r.amount.toLocaleString()}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-xs ${STATUS_CLS[r.status]}`}
                      >
                        {t(`wallet.requests.status_${r.status}` as any)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {t("wallet.requests.submitted_at")}:{" "}
                      {new Date(r.submitted_at).toLocaleString()}
                      {" · "}
                      {t("wallet.requests.transfer_date")}:{" "}
                      {new Date(r.transfer_date).toLocaleDateString()}
                      {r.transfer_account_last4 &&
                        ` · ****${r.transfer_account_last4}`}
                    </div>
                    {r.customer_note && (
                      <div className="text-sm text-gray-500 mt-1">
                        {r.customer_note}
                      </div>
                    )}
                    {r.status === "approved" && r.approved_at && (
                      <div className="text-xs text-gray-400 mt-1">
                        {t("wallet.requests.approved_at")}:{" "}
                        {new Date(r.approved_at).toLocaleString()}
                      </div>
                    )}
                    {r.status === "rejected" && r.rejected_at && (
                      <div className="text-xs text-red-500 mt-1">
                        {t("wallet.requests.rejected_at")}:{" "}
                        {new Date(r.rejected_at).toLocaleString()}
                        {r.reject_reason && ` — ${r.reject_reason}`}
                      </div>
                    )}
                  </div>
                  {r.has_proof && (
                    <a
                      href={`/api/files/topup-proofs/${r._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline text-blue-600 mt-2"
                    >
                      {t("wallet.requests.view_proof")}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
