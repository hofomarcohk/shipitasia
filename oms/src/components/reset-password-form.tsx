"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export const ResetPasswordForm = () => {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();

  const token = params.get("token");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <Card className="mx-auto w-[60%] max-w-lg">
        <CardContent>
          <div className="py-12 text-center flex flex-col gap-3 items-center">
            <div className="text-amber-600 text-2xl">⚠</div>
            <p>{t("auth.reset.no_token")}</p>
            <Link href="/zh-hk/forgot-password" className="underline text-sm">
              {t("auth.forgot.title")}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pwd !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await http_request(
        "POST",
        "/api/cms/auth/reset-password",
        { token, new_password: pwd }
      );
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setSuccess(true);
        setTimeout(() => router.push("/zh-hk/inbound/list"), 1200);
        return;
      }
      if (Array.isArray(data.data)) {
        setError(
          data.data
            .map((e: any) => e.message ?? JSON.stringify(e))
            .join("; ")
        );
      } else {
        setError(data.message || "Reset failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-[60%] max-w-lg">
      <CardContent>
        <div className="flex flex-col gap-4 py-8">
          <div className="text-3xl font-semibold">{t("auth.reset.title")}</div>
          <p className="text-gray-600 text-sm">
            {t("auth.reset.description")}
          </p>

          {success ? (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-700">
              {t("auth.reset.success")}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new_password">
                  {t("auth.reset.new_password")}
                </Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">
                  {t("auth.reset.confirm_password")}
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-red-500 text-sm" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("common.loading") : t("auth.reset.submit")}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
