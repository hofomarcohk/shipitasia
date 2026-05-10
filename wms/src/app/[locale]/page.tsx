import { FooterHome } from "@/components/footer";
import { LanguageBar } from "@/components/lang-bar";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { isUserLogin } from "../helpers/auth";

export default async function Page() {
  const t = await getTranslations();
  const isLogin = await isUserLogin();

  return (
    <div className="w-full">
      <div className="relative bg-black text-white">
        <div className="">
          <Carousel className="w-full ">
            <CarouselContent>
              {Array.from({ length: 1 }).map((_, index) => (
                <CarouselItem key={index}>
                  <div className="w-full justify-center items-center flex">
                    <img
                      src={"/img/index/banner-" + index + ".png"}
                      className="object-cover h-screen  w-full opacity-50"
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        <div className="fixed top-4 right-4 flex space-x-4 p-4">
          <LanguageBar />
          {isLogin ? (
            <Link href={`/logout`}>
              <Button className="w-[80px]">{t("utils.logout")}</Button>
            </Link>
          ) : (
            <Link href={`/login`}>
              <Button>{t("utils.login")}</Button>
            </Link>
          )}
        </div>

        <div className="absolute hidden md:flex flex-col space-y-4 p-4 bottom-1/4 ml-[10vw] ">
          <div>
            <h1 className="opacity-60 ml-[-20px]">
              <img
                src="/img/logo/logo-white.png"
                className="h-[80px] mx-auto"
              />
            </h1>
          </div>
          <div>
            <h2>{t("index.slogan")}</h2>
          </div>
          <div>
            {isLogin ? (
              <Link href={`/home`}>
                <Button className="text-white bg-transparent border border-white w-[150px] hover:bg-white/50">
                  {t("index.startUse")}
                </Button>
              </Link>
            ) : (
              <Link href="/">
                <Button className="text-white bg-transparent border border-white w-[150px] hover:bg-white/50">
                  {t("index.knowMore")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
      <FooterHome />
    </div>
  );
}
