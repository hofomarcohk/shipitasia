"use client";

import PdaPageHeaderLayout from "@/components/pda-page-header";
import PdaPageLayout from "@/components/pda-page-layout";
import IconHandler from "@/components/ui/icon-handler";
import { Skeleton } from "@/components/ui/skeleton";
import { usePdaMsg } from "@/context/pdaMsg";
import { get_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();

  const [langCode, setLangCode] = useState("en");
  const t = useTranslations();

  useEffect(() => {
    const fetchParam = async () => {
      const response = await param.params;
      setLangCode(response.locale);
    };
    fetchParam();
  }, []);

  const prop = {};
  const [time, setTime] = useState(new Date());
  const [formattedDate, setFormattedDate] = useState(
    new Date().toLocaleDateString(),
  );

  const [menu, setMenu] = useState<
    {
      title: string;
      href: string;
      icon: string;
      items: { title: string; url: string; icon: string }[];
    }[]
  >([]);

  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "inbound";

  useEffect(() => {
    fetchPdaMenu();

    const interval = setInterval(() => {
      setTime(new Date());
      setFormattedDate(new Date().toLocaleDateString());
    }, 60000);

    return () => clearInterval(interval);
  }, []);
  const formattedTime = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const fetchPdaMenu = async () => {
    const res = await get_request("/api/wms/menu-pda");
    const json = await res.json();
    setMenu(json.data);
  };

  return (
    <PdaPageLayout {...prop}>
      <PdaPageHeaderLayout></PdaPageHeaderLayout>

      <div className="fixed left-0  bottom-0 w-full flex flex-col justify-between mt-5">
        <div className="mb-5">
          <div className="grid grid-cols-3  gap-4  flex-col contents-end items-start mt-auto">
            {menu
              .find((m) => (m.title || "").includes(section ?? ""))
              ?.items.map((n) => {
                return (
                  <div
                    key={n.title}
                    className="flex flex-col items-center justify-center"
                  >
                    <Link
                      className="flex flex-col items-center justify-center"
                      href={"/" + langCode + "/" + n.url}
                    >
                      <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-full mb-2">
                        <IconHandler icon={n.icon} size={36} stroke={1} />
                      </div>
                      <div className="text-center">{t(n.title)}</div>
                    </Link>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="p-[5px] grid gap-[4px] border-top border-gray-200 grid-cols-4">
          {menu &&
            menu.length == 0 &&
            new Array(4).fill(null).map((_item: any, index: number) => (
              <div
                className="p-[12px] flex flex-col items-center justify-center"
                key={"pda-menu-" + index}
              >
                <Skeleton className="h-8 w-8 mb-1 rounded-full" />
                <Skeleton className="h-4 w-[50px]" />
              </div>
            ))}
          {menu &&
            menu.length > 0 &&
            menu.map((item: any, index: number) => (
              <Link
                key={"pda-menu-" + index}
                href={"/" + langCode + item.url}
                className={cn(
                  "p-[5px] flex flex-col items-center justify-center text-[12px]",
                  item.title.includes(section) &&
                    "bg-gray-100 dark:bg-gray-900",
                )}
              >
                <IconHandler icon={item.icon} size={20} />
                {t(item.title)}
              </Link>
            ))}
        </div>
      </div>
    </PdaPageLayout>
  );
}
