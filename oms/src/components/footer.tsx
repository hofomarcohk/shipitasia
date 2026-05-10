import { useTranslations } from "next-intl";

const FooterHome = () => {
  const year = new Date().getFullYear();
  const t = useTranslations();
  return (
    <footer className="pt-10 p-4 bg-gray-800 text-center">
      <div>
        <img src="/img/logo/logo-white.png" className="h-10 mx-auto" />
      </div>
      <div className="flex items-center justify-end h-16 ">
        <span className="flex gap-2 text-muted-foreground text-[12px] mr-1">
          <div>
            {t("utils.copyright")} {t("utils.appName")} {year}
          </div>
          <div>|</div>
          <div>{t("utils.allRightReserved")}</div>
        </span>
      </div>
    </footer>
  );
};

const Footer = () => {
  const year = new Date().getFullYear();
  const t = useTranslations();
  return (
    <footer className="flex items-center justify-end h-16 border-t py-5">
      <span className="flex gap-2 text-muted-foreground text-[12px] mr-2">
        <div>
          {t("utils.copyright")} {t("utils.appName")} {year}
        </div>
        <div>|</div>
        <div>{t("utils.allRightReserved")}</div>
      </span>
    </footer>
  );
};

export { Footer, FooterHome };
