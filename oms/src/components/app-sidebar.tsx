"use client";

import { SearchForm } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { get_request, http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconFileInvoice,
  IconLogout,
  IconMapPin,
  IconPackages,
  IconPackage,
  IconPlus,
  IconReceipt,
  IconSettings,
  IconTruck,
  IconUser,
  IconWallet,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ComponentProps,
  useEffect,
  useState,
} from "react";
import IconHandler from "./ui/icon-handler";

// Detect which app section the current URL belongs to so we can show
// the matching sidebar. Order matters: PDA must be checked before WMS
// (since /wms/pda/ starts with /wms/).
function detectContext(pathname: string | null): "oms" | "wms" | "pda" {
  if (!pathname) return "oms";
  if (/^\/[^/]+\/wms\/pda(\/|$)/.test(pathname)) return "pda";
  if (/^\/[^/]+\/wms(\/|$)/.test(pathname)) return "wms";
  return "oms";
}

function getLocale(pathname: string | null): string {
  if (!pathname) return "zh-hk";
  const m = pathname.match(/^\/([^/]+)/);
  return m?.[1] ?? "zh-hk";
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const context = detectContext(pathname);

  if (context === "oms") {
    return <OmsSidebar {...props} />;
  }
  return <CmsSidebar {...props} context={context} />;
}

/* ============================================================
 * OMS — hardcoded redesigned IA per design handoff
 * ==========================================================*/
function OmsSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const locale = getLocale(pathname);
  const t = useTranslations();

  // Start collapsed on first render so SSR + initial CSR match. localStorage
  // restore happens in a post-mount effect to avoid hydration mismatch.
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSettingsOpen(
      localStorage.getItem("oms-sidebar-settings-open") === "1"
    );
    setSettingsHydrated(true);
  }, []);
  useEffect(() => {
    if (!settingsHydrated || typeof window === "undefined") return;
    localStorage.setItem(
      "oms-sidebar-settings-open",
      settingsOpen ? "1" : "0"
    );
  }, [settingsOpen, settingsHydrated]);

  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const r = await http_request("GET", "/api/cms/wallet/balance", {});
        const j = await r.json();
        if (j.status === 200) setBalance(j.data.balance);
      } catch {
        // silently ignore
      }
    };
    fetchBalance();
    const onFocus = () => fetchBalance();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const shipmentsPath = `/${locale}/shipments`;
  const openNewShipmentPath = `/${locale}/shipments?new=1`;
  const isShipmentsActive = pathname?.startsWith(shipmentsPath) ?? false;

  const settingsItems = [
    {
      key: "addresses",
      label: "常用地址",
      icon: IconMapPin,
      href: `/${locale}/addresses`,
    },
    {
      key: "savedItems",
      label: "已儲存品項",
      icon: IconPackage,
      href: `/${locale}/saved-items`,
    },
    {
      key: "carrierAccounts",
      label: "Carrier 帳號",
      icon: IconTruck,
      href: `/${locale}/carrier-accounts`,
    },
    {
      key: "invoices",
      label: "發票",
      icon: IconReceipt,
      href: `/${locale}/bill`,
    },
  ];

  const settingsActive = settingsItems.some(
    (it) => pathname?.startsWith(it.href) ?? false
  );

  const balanceLow = balance !== null && balance < 100;

  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader className="pb-2">
        <Link href={`/${locale}`} className="flex items-center px-2 pt-2">
          <img
            className="w-[140px]"
            src="/img/logo/main.png"
            alt="ShipItAsia"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 scrollbar gap-2">
        {/* Primary CTA */}
        <div className="px-1 pt-1">
          <Link href={openNewShipmentPath}>
            <Button
              className="w-full justify-center font-medium"
              size="sm"
            >
              <IconPlus size={14} className="mr-1.5" />
              新增預報
            </Button>
          </Link>
        </div>

        {/* Main nav */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href={shipmentsPath}>
                  <SidebarMenuButton
                    isActive={isShipmentsActive}
                    className={cn(
                      "font-medium",
                      isShipmentsActive &&
                        "bg-background border border-border shadow-sm"
                    )}
                  >
                    <IconPackages size={16} />
                    <span>貨件總覽</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings collapsible */}
        <SidebarGroup className="py-0">
          <Collapsible
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            className="w-full"
          >
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">
              <span className="flex items-center gap-2">
                <IconSettings size={15} />
                設定
                {!settingsOpen && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                    {settingsItems.length}
                  </span>
                )}
              </span>
              <IconChevronDown
                size={14}
                className={cn(
                  "transition-transform",
                  settingsOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenu className="mt-1">
                {settingsItems.map((it) => {
                  const Icon = it.icon;
                  const active = pathname?.startsWith(it.href) ?? false;
                  return (
                    <SidebarMenuItem key={it.key}>
                      <Link href={it.href}>
                        <SidebarMenuButton
                          isActive={active}
                          className="pl-7 text-[13px]"
                        >
                          <Icon size={14} />
                          <span>{it.label}</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border gap-2 p-2">
        {/* Wallet card */}
        <Link
          href={`/${locale}/wallet`}
          className={cn(
            "block rounded-md border bg-background px-3 py-2 transition-colors hover:bg-muted/40",
            balanceLow ? "border-destructive/50" : "border-border"
          )}
        >
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <IconWallet size={12} />
              錢包餘額
            </span>
            <span className="text-[hsl(var(--brand-strong))] font-medium hover:underline">
              + 增值
            </span>
          </div>
          <div
            className={cn(
              "mt-1 font-mono text-[14px] font-semibold tabular-nums",
              balanceLow ? "text-destructive" : "text-foreground"
            )}
          >
            {balance === null
              ? "—"
              : `HK$ ${balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
          {balanceLow && (
            <div className="mt-1 text-[10.5px] text-destructive">
              餘額不足，預報前請先增值
            </div>
          )}
        </Link>

        {/* Account */}
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href={`/${locale}/profile`}>
              <SidebarMenuButton className="text-[13px]">
                <IconUser size={14} />
                <span>帳號</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Link href={`/${locale}/logout`}>
              <SidebarMenuButton className="text-[13px] text-muted-foreground">
                <IconLogout size={14} />
                <span>登出</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ============================================================
 * WMS / PDA — preserve existing CMS-driven nav (unchanged)
 * ==========================================================*/
function CmsSidebar({
  context,
  ...props
}: ComponentProps<typeof Sidebar> & { context: "wms" | "pda" }) {
  const [menuData, setMenuData] = useState<{ navMain: any[] }>({
    navMain: [],
  });
  const [badges, setBadges] = useState<Record<string, number>>({});
  const t = useTranslations();

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await get_request(`/api/cms/menu?context=${context}`);
        const json = await response.json();
        setMenuData({ navMain: json.data || [] });
      } catch (error) {
        console.error("Failed to fetch menu:", error);
      }
    };
    const fetchBadges = async () => {
      try {
        const r = await get_request(
          `/api/cms/menu/badges?context=${context}`
        );
        const j = await r.json();
        setBadges(j.data ?? {});
      } catch {
        setBadges({});
      }
    };
    fetchMenu();
    fetchBadges();
    const onFocus = () => fetchBadges();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [context]);

  return (
    <Sidebar {...props} collapsible="icon">
      <SidebarHeader>
        <Link href="/">
          <img className="w-[150px] pt-2" src="/img/logo/main.png" />
        </Link>
        <SearchForm />
      </SidebarHeader>
      <SidebarContent className="pb-[30px] scrollbar">
        {menuData.navMain.map(
          (item: {
            title: string;
            items: {
              title: string;
              icon: string;
              url: string;
              isActive: boolean;
            }[];
          }) => (
            <SidebarGroup key={item.title}>
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                {t(item.title)}
              </SidebarGroupLabel>
              <SidebarGroupContent className="z-10">
                <SidebarMenu>
                  {item.items.map(
                    (sub: {
                      title: string;
                      name?: string;
                      icon: string;
                      url: string;
                      isActive: boolean;
                    }) => {
                      const count = sub.name ? badges[sub.name] ?? 0 : 0;
                      // P17 — menu names that should render their count
                      // chip in red (urgent attention). Driven by name
                      // rather than a DB flag so the migration stays
                      // simple; expand the set as new urgent surfaces land.
                      const URGENT_NAMES = new Set([
                        "ops_unclaimed",
                        "ops_abandoned",
                      ]);
                      const isUrgent =
                        !!sub.name && URGENT_NAMES.has(sub.name) && count > 0;
                      return (
                        <SidebarMenuItem key={sub.title} title={t(sub.title)}>
                          <Link href={sub.url}>
                            <SidebarMenuButton isActive={sub.isActive}>
                              <IconHandler
                                icon={sub.icon}
                                size={12}
                              ></IconHandler>
                              <span className="flex-1 truncate">
                                {t(sub.title)}
                              </span>
                              {count > 0 && (
                                <span
                                  className={
                                    "ml-auto inline-flex items-center justify-center text-[10px] leading-none min-w-[18px] h-[18px] px-1 rounded-full font-medium " +
                                    (isUrgent
                                      ? "bg-wms-danger-bg text-wms-danger-fg"
                                      : "bg-wms-surface-alt text-wms-muted border border-wms-border")
                                  }
                                >
                                  {count > 99 ? "99+" : count}
                                </span>
                              )}
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      );
                    }
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        )}
      </SidebarContent>
    </Sidebar>
  );
}
