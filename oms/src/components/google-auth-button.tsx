"use client";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

// Placeholder per Marco's pivot: Google OAuth backend wiring is deferred to
// prod cutover. This button is shown so the design covers the eventual flow,
// but pressing it surfaces a friendly "coming soon" toast — no real OAuth
// network call happens.
export function GoogleAuthButton() {
  const t = useTranslations();

  const handleClick = () => {
    // Use the native browser alert for v1 — keeps this component dependency
    // -free until shadcn's <Toaster> is mounted globally.
    alert(t("auth.google_unavailable"));
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full flex items-center justify-center gap-2"
      onClick={handleClick}
    >
      <GoogleGlyph />
      <span>{t("auth.google_btn")}</span>
    </Button>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26a5.4 5.4 0 0 1-8.04-2.84H.96v2.32A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58a4.86 4.86 0 0 1 3.44 1.34l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.32A5.4 5.4 0 0 1 9 3.58z"
      />
    </svg>
  );
}
