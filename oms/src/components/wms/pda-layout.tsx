"use client";

// Mobile-first chrome for PDA pages. Replaces the desktop PageLayout
// (sidebar + breadcrumbs + footer) with a top app bar + bottom tab bar,
// the way native scanning apps work. The PDA workers don't need the
// rest of the OMS / WMS — they live in this 4-tab world.

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { http_request } from "@/lib/httpRequest";
import {
  IconLayoutGrid,
  IconLogout,
  IconPackageImport,
  IconScan,
  IconTruckDelivery,
  IconUser,
} from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

interface TabDef {
  href: string; // path WITHOUT leading locale; layout prefixes it
  match: RegExp; // tests against pathname for active state
  icon: typeof IconScan;
  labelKey: string;
}

const TABS: TabDef[] = [
  {
    href: "/wms/pda/scan/inbound-arrive",
    match: /\/wms\/pda\/scan\/inbound-arrive(\/|$)/,
    icon: IconScan,
    labelKey: "pda_layout.tab_arrive",
  },
  {
    href: "/wms/pda/scan/inbound-receive",
    match: /\/wms\/pda\/scan\/inbound-receive(\/|$)/,
    icon: IconPackageImport,
    labelKey: "pda_layout.tab_receive",
  },
  {
    href: "/wms/pda/scan/shelf",
    match: /\/wms\/pda\/scan\/shelf(\/|$)/,
    icon: IconLayoutGrid,
    labelKey: "pda_layout.tab_pick",
  },
  {
    href: "/wms/pda/scan/depart",
    match: /\/wms\/pda\/scan\/depart(\/|$)/,
    icon: IconTruckDelivery,
    labelKey: "pda_layout.tab_depart",
  },
];

export function PdaLayout({
  titleKey,
  children,
}: {
  titleKey: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  const [user, setUser] = useState<{ firstName?: string; email?: string }>({});

  useEffect(() => {
    (async () => {
      try {
        const r = await http_request("GET", "/api/cms/account", {});
        const d = await r.json();
        if (d.status === 200) setUser(d.data ?? {});
      } catch {
        // ignore — header just won't show name
      }
    })();
  }, []);

  const initial = (user.firstName?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Top app bar (sticky) ─────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b">
        <div className="flex items-center justify-between px-3 h-12">
          <h1 className="text-base font-semibold truncate flex-1">
            {t(titleKey as any)}
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-gray-500">
                {user.email ?? "—"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/${locale}/profile`}>
                  <IconUser size={14} className="mr-2" />
                  {t("menu.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${locale}/logout`}>
                  <IconLogout size={14} className="mr-2" />
                  {t("utils.logout")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Content (scrolls; bottom-padded so the tab bar
            never covers final controls) ─────────────────── */}
      <main className="flex-1 px-3 pt-3 pb-24 overflow-y-auto">{children}</main>

      {/* ── Bottom tab bar (sticky) ──────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white">
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.match.test(pathname);
            return (
              <li key={tab.href}>
                <Link
                  href={`/${locale}${tab.href}`}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs ${
                    active
                      ? "text-blue-600 font-semibold"
                      : "text-gray-500"
                  }`}
                >
                  <Icon
                    size={22}
                    stroke={active ? 2 : 1.5}
                  />
                  <span>{t(tab.labelKey as any)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
