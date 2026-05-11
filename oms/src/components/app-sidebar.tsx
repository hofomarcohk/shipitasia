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
    fetchMenu();
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
                    (item: {
                      title: string;
                      icon: string;
                      url: string;
                      isActive: boolean;
                    }) => (
                      <SidebarMenuItem key={item.title} title={t(item.title)}>
                        <Link href={item.url}>
                          <SidebarMenuButton isActive={item.isActive}>
                            <IconHandler
                              icon={item.icon}
                              size={12}
                            ></IconHandler>
                            {t(item.title)}
                          </SidebarMenuButton>
                        </Link>
                      </SidebarMenuItem>
                    )
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
