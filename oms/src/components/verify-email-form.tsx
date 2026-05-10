"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "verifying" | "success" | "expired" | "invalid" | "active";

export const VerifyEmailForm = () => {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // strict-mode double-fire guard
    ranRef.current = true;
    const token = params.get("token");
    if (!token) {
      setStatus("invalid");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await http_request(
          "POST",
          "/api/cms/auth/verify-email",
          { token }
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.status === 200) {
          setStatus("success");
          // Cookie has been set by the middleware; redirect to home flow.
          setTimeout(() => router.push("/zh-hk/inbound/list"), 1200);
          return;
        }
        if (data.sys_code === "1000017") {
          setStatus("active");
          return;
        }
        if (data.sys_code === "1000014") {
          setStatus("expired");
          return;
        }
        setStatus("invalid");
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <Card className="mx-auto w-[60%] max-w-lg">
      <CardContent>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          {status === "verifying" && (
            <>
              <div className="text-2xl font-semibold">
                {t("auth.verify.title")}
              </div>
              <div className="text-gray-600 text-sm">
                {t("auth.verify.verifying")}
              </div>
            </>
          )}
          {status === "success" && (
            <>
              <div className="text-2xl font-semibold text-green-600">✓</div>
              <div className="text-lg">{t("auth.verify.success")}</div>
            </>
          )}
          {status === "active" && (
            <>
              <div className="text-2xl font-semibold">✓</div>
              <div className="text-gray-700">
                {/* re-uses existing message via JSON; spec AC-1.2 calls for a
                    "已 active 帳號再點" gentle message */}
                {t("auth.verify.success")}
              </div>
              <Link
                href="/zh-hk/login"
                className="underline text-sm mt-2"
              >
                {t("auth.verify.go_login")}
              </Link>
            </>
          )}
          {status === "expired" && (
            <>
              <div className="text-2xl font-semibold text-amber-600">⚠</div>
              <div className="text-gray-700">{t("auth.verify.expired")}</div>
              <Link
                href="/zh-hk/login"
                className="underline text-sm mt-2"
              >
                {t("auth.verify.go_login")}
              </Link>
            </>
          )}
          {status === "invalid" && (
            <>
              <div className="text-2xl font-semibold text-red-600">✗</div>
              <div className="text-gray-700">{t("auth.verify.invalid")}</div>
              <Link
                href="/zh-hk/login"
                className="underline text-sm mt-2"
              >
                {t("auth.verify.go_login")}
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
