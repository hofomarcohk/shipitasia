"use client";

import PageLayout from "@/components/page-layout";
import { ProfileForm } from "@/components/profile-form";

export default function Page() {
  const props = {
    title: "profile.title",
    description: "profile.subtitle",
    path: [
      { name: "menu.account", href: "#" },
      { name: "menu.profile", href: "#" },
    ],
  };

  return (
    <PageLayout {...props}>
      <ProfileForm />
    </PageLayout>
  );
}
