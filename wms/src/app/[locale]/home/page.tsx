import PageLayout from "@/components/layout/page-layout";

export default async function Page() {
  const prop = {
    path: [{ name: "menu.home", href: "#" }],
  };
  return <PageLayout {...prop} />;
}
