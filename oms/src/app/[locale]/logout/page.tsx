"use client";
import { http_request } from "@/lib/httpRequest";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Logout page: fire the cookie-clearing API, wipe client-side session
// flags, then redirect to /login. Skips the legacy "logout success"
// interstitial because Marco's flow benefits from a single click.
export default function Page() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const logout = async () => {
      try {
        localStorage.removeItem("isUnauthorized");
      } catch {
        // SSR-safe; ignore if storage isn't available
      }
      try {
        await http_request("GET", "/api/cms/logout");
      } catch {
        // even if the cookie clear fails, push to login anyway
      }
      router.replace(`/${locale}/login`);
    };
    logout();
  }, [locale, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <p className="text-sm text-gray-500">Logging out…</p>
    </div>
  );
}
