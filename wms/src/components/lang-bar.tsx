"use client";
import { utils } from "@/cst/utils";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";

const LanguageBar = () => {
  const langStyle = utils.LANG_BAR_STYLE;
  const langLinkStyle = {
    textShadow: "0px 0px 30px white",
  };
  const router = useRouter();
  const langCode = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const langSwitcher = { en: "EN", "zh-hk": "繁", "zh-cn": "简" };
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 text-gray-500 text-[14px] mr-4">
      <div className="flex items-center gap-2  drop-shadow-xs ">
        {Object.entries(langSwitcher).map(([code, label]) => (
          <button
            key={code}
            className={cn(
              langCode == code ? langStyle.yes : langStyle.no,
              isPending && "transition-opacity [&:disabled]:opacity-30"
            )}
            style={langLinkStyle}
            onClick={() => {
              startTransition(() => {
                router.replace(
                  // @ts-expect-error -- TypeScript will validate that only known `params`
                  // are used in combination with a given `pathname`. Since the two will
                  // always match for the current route, we can skip runtime checks.
                  { pathname, params },
                  { locale: code }
                );
              });
            }}
            title={label}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export { LanguageBar };
