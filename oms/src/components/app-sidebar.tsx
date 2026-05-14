"use client";

import { SearchForm } from "@/components/search-form";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { get_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentProps, useEffect, useState } from "react";
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

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const [menuData, setMenuData] = useState<{ navMain: any[] }>({
    navMain: [],
  });
  const [badges, setBadges] = useState<Record<string, number>>({});
  const pathname = usePathname();
  const context = detectContext(pathname);

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
    // Re-poll badges on focus so counts catch up after a PDA round.
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
                                <span className="ml-auto inline-flex items-center justify-center text-[10px] leading-none min-w-[18px] h-[18px] px-1 rounded-full bg-black text-white font-medium">
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
