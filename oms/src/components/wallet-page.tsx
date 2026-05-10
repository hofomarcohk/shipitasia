"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { http_request } from "@/lib/httpRequest";
import {
  IconAlertTriangle,
  IconWallet,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TopupRequestModal } from "./topup-request-modal";

interface Tx {
  _id: string;
  type: string;
  amount: number;
  balance_after: number;
  customer_note: string | null;
  reference_type: string | null;
  reference_id: string | null;
  createdAt: string;
}

const TYPE_COLOR: Record<string, string> = {
  topup: "bg-green-50 text-green-700 border-green-200",
  topup_rejected: "bg-gray-50 text-gray-700 border-gray-200",
  charge_inbound: "bg-red-50 text-red-700 border-red-200",
  refund_unclaimed: "bg-blue-50 text-blue-700 border-blue-200",
  refund_label_failed: "bg-blue-50 text-blue-700 border-blue-200",
  adjustment: "bg-gray-50 text-gray-700 border-gray-200",
};

export const WalletPage = () => {
  const t = useTranslations();
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [bRes, tRes] = await Promise.all([
      http_request("GET", "/api/cms/wallet/balance", {}),
      http_request("GET", "/api/cms/wallet/transactions", { limit: 50 }),
    ]);
    const bData = await bRes.json();
    const tData = await tRes.json();
    if (bData.status === 200) setBalance(bData.data.balance);
    if (tData.status === 200) setTxs(tData.data.items);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const isNeg = (balance ?? 0) < 0;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <IconWallet size={28} />
            {t("wallet.title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">{t("wallet.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/zh-hk/wallet/topup-requests">
            <Button variant="outline">{t("wallet.my_topups_link")}</Button>
          </Link>
          <Button onClick={() => setModalOpen(true)}>
            {t("wallet.topup_btn")}
          </Button>
        </div>
      </div>

      {/* Balance card */}
      <Card>
        <CardContent className="py-8">
          <div className="text-xs uppercase text-gray-500 mb-1">
            {t("wallet.balance_label")}
          </div>
          <div
            className={`text-5xl font-bold ${
              isNeg ? "text-red-600" : "text-gray-900"
            }`}
          >
            HK$ {balance == null ? "—" : balance.toLocaleString()}
          </div>
          {isNeg && (
            <div className="mt-3 flex items-center gap-2 text-amber-700 text-sm">
              <IconAlertTriangle size={16} />
              {t("wallet.negative_warning")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">{t("wallet.tx.title")}</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : txs.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("wallet.tx.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">{t("wallet.tx.time")}</th>
                  <th className="py-2 pr-3">{t("wallet.tx.type")}</th>
                  <th className="py-2 pr-3 text-right">
                    {t("wallet.tx.amount")}
                  </th>
                  <th className="py-2 pr-3 text-right">
                    {t("wallet.tx.balance_after")}
                  </th>
                  <th className="py-2">{t("wallet.tx.note")}</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={tx._id} className="border-b">
                    <td className="py-3 pr-3 text-xs text-gray-500">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-xs ${
                          TYPE_COLOR[tx.type] ?? "bg-gray-50 border-gray-200"
                        }`}
                      >
                        {t(`wallet.tx_type.${tx.type}` as any)}
                      </span>
                    </td>
                    <td
                      className={`py-3 pr-3 text-right font-medium ${
                        tx.amount > 0
                          ? "text-green-600"
                          : tx.amount < 0
                          ? "text-red-600"
                          : "text-gray-500"
                      }`}
                    >
                      {tx.amount === 0
                        ? "—"
                        : (tx.amount > 0 ? "+" : "") + tx.amount.toLocaleString()}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      {tx.balance_after.toLocaleString()}
                    </td>
                    <td className="py-3 text-gray-600">
                      {tx.customer_note ?? "—"}
                      {tx.reference_id && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({tx.reference_id})
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

      <TopupRequestModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={() => {
          setModalOpen(false);
          load();
        }}
      />
    </div>
  );
};
