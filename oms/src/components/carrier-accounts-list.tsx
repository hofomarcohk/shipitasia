"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { IconTruck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Account {
  _id: string;
  carrier_code: string;
  nickname: string;
  auth_type: "api_key" | "oauth";
  is_default: boolean;
  status: "active" | "revoked" | "expired";
  last_used_at: string | null;
  oauth_meta: {
    access_token_expires_at: string | null;
    refresh_token_expires_at: string | null;
  } | null;
  createdAt: string;
}

interface Carrier {
  carrier_code: string;
  name_zh: string;
  name_en: string;
}

export const CarrierAccountsList = ({ initialFlash }: { initialFlash?: string }) => {
  const t = useTranslations();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [carriers, setCarriers] = useState<Record<string, Carrier>>({});
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(initialFlash ?? "");
  const [renameTarget, setRenameTarget] = useState<Account | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [accRes, carRes] = await Promise.all([
        http_request("GET", "/api/cms/carrier-accounts", {}),
        http_request("GET", "/api/cms/carriers", {}),
      ]);
      const accData = await accRes.json();
      const carData = await carRes.json();
      if (accData.status === 200) setAccounts(accData.data);
      if (carData.status === 200) {
        const map: Record<string, Carrier> = {};
        for (const c of carData.data) map[c.carrier_code] = c;
        setCarriers(map);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setDefault = async (id: string) => {
    const res = await http_request(
      "PATCH",
      `/api/cms/carrier-accounts/${id}`,
      { is_default: true }
    );
    if (res.ok) {
      setFlash(t("carriers.messages.default_set"));
      load();
    }
  };

  const toggleStatus = async (a: Account) => {
    const url =
      a.status === "active"
        ? `/api/cms/carrier-accounts/${a._id}/disable`
        : `/api/cms/carrier-accounts/${a._id}/enable`;
    const res = await http_request("POST", url, {});
    if (res.ok) {
      setFlash(
        t(a.status === "active" ? "carriers.messages.disabled" : "carriers.messages.enabled")
      );
      load();
    }
  };

  const doRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const res = await http_request(
      "PATCH",
      `/api/cms/carrier-accounts/${renameTarget._id}`,
      { nickname: renameValue.trim() }
    );
    if (res.ok) {
      setFlash(t("carriers.messages.rename_success"));
      setRenameTarget(null);
      load();
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    const res = await http_request(
      "DELETE",
      `/api/cms/carrier-accounts/${deleteTarget._id}`,
      {}
    );
    if (res.ok) {
      setFlash(t("carriers.messages.deleted"));
      setDeleteTarget(null);
      load();
    }
  };

  if (loading) {
    return <div className="text-center py-12">{t("common.loading")}</div>;
  }

  return (
    <div className="grid gap-4">
      {flash && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {flash}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <IconTruck size={28} />
            {t("carriers.page_title")}
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            {t("carriers.page_subtitle")}
          </p>
        </div>
        <Link href="/zh-hk/carrier-accounts/new">
          <Button>{t("carriers.add_btn")}</Button>
        </Link>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <IconTruck size={48} className="text-gray-300 mb-3" />
            <p className="text-gray-600 mb-4">{t("carriers.empty")}</p>
            <Link href="/zh-hk/carrier-accounts/new">
              <Button>{t("carriers.empty_cta")}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => {
            const carrier = carriers[a.carrier_code];
            return (
              <Card key={a._id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">
                          {a.nickname}
                        </span>
                        {a.is_default && (
                          <Badge variant="default">
                            {t("carriers.default_badge")}
                          </Badge>
                        )}
                        <StatusBadge status={a.status} t={t} />
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {carrier?.name_zh ?? a.carrier_code}
                        {" · "}
                        {a.auth_type === "api_key"
                          ? t("carriers.auth_type_api_key")
                          : t("carriers.auth_type_oauth")}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {t("carriers.created_at")}:{" "}
                        {new Date(a.createdAt).toLocaleString()}
                        {" · "}
                        {a.last_used_at
                          ? `${t("carriers.last_used")}: ${new Date(
                              a.last_used_at
                            ).toLocaleString()}`
                          : t("carriers.never_used")}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenameTarget(a);
                          setRenameValue(a.nickname);
                        }}
                      >
                        {t("carriers.edit")}
                      </Button>
                      {!a.is_default && a.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefault(a._id)}
                        >
                          {t("carriers.set_default")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(a)}
                      >
                        {a.status === "active"
                          ? t("carriers.disable")
                          : t("carriers.enable")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(a)}
                        className="text-red-600 hover:text-red-700"
                      >
                        {t("carriers.delete")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("carriers.rename_title")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="nickname">{t("carriers.new.nickname")}</Label>
            <Input
              id="nickname"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t("profile.cancel")}
            </Button>
            <Button onClick={doRename}>{t("carriers.rename_save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("carriers.delete_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("carriers.delete_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("profile.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("carriers.delete_confirm_button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: t("carriers.status_active"),
      cls: "bg-green-100 text-green-700 border-green-300",
    },
    revoked: {
      label: t("carriers.status_revoked"),
      cls: "bg-gray-100 text-gray-700 border-gray-300",
    },
    expired: {
      label: t("carriers.status_expired"),
      cls: "bg-amber-100 text-amber-700 border-amber-300",
    },
  };
  const v = map[status];
  if (!v) return null;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-xs ${v.cls}`}
    >
      {v.label}
    </span>
  );
}
