"use server";

import { ServerDataProvider } from "@/app/providers/ServerDataContext";
import { routing } from "@/i18n/routing"; // 你的 routing config
import { getCountry } from "@/services/country/get_country_list";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ReactNode } from "react";
type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const country = await getCountry([
    { $match: { deletedAt: { $exists: false } } },
    { $sort: { priority: -1, "text.en": 1 } },
    { $project: { value: "$countryKey", label: "$text" } },
    { $project: { _id: 0 } },
  ]);

  return (
    <>
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@100..900&family=Noto+Sans+SC:wght@100..900&display=swap');`}
      </style>
      <NextIntlClientProvider locale={locale}>
        <ServerDataProvider serverData={{ country }}>
          <div className={`lang-${locale}`}>{children}</div>
        </ServerDataProvider>
      </NextIntlClientProvider>
    </>
  );
}
export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
