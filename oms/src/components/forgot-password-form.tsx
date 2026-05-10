"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export const ForgotPasswordForm = () => {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await http_request(
        "POST",
        "/api/cms/auth/forgot-password",
        { email }
      );
      // Endpoint is intentionally enumeration-safe — always show the same
      // success affordance regardless of whether the email maps to an account.
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-[60%] max-w-lg">
      <CardContent>
        <div className="flex flex-col gap-4 py-8">
          <div className="text-3xl font-semibold">{t("auth.forgot.title")}</div>
          <p className="text-gray-600 text-sm">
            {t("auth.forgot.description")}
          </p>

          {submitted ? (
            <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-700">
              {t("auth.forgot.success")}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.forgot.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? t("common.loading") : t("auth.forgot.submit")}
              </Button>
            </form>
          )}

          <div className="text-center text-sm">
            <Link href="/zh-hk/login" className="underline">
              {t("auth.forgot.back_to_login")}
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
