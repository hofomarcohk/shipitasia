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
import { ComponentProps, useEffect, useState } from "react";
import IconHandler from "./ui/icon-handler";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const [menuData, setMenuData] = useState<{ navMain: any[] }>({
    navMain: [],
  });

  const t = useTranslations();
  const init = async () => {
    try {
      const response = await get_request("/api/wms/menu");
      const json = await response.json();
      setMenuData({ navMain: json.data || [] });
    } catch (error) {
      console.error("Failed to fetch menu:", error);
    }
  };

  useEffect(() => {
    init();
  }, []);

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
