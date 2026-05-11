"use client";

import PageLayout from "@/components/page-layout";
import { InboundNewForm } from "@/components/inbound-new-form";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <PageLayout
      title="inbound_v1.actions.edit"
      description=""
      path={[
        { name: "inbound_v1.page_title", href: "/zh-hk/inbound/list" },
        { name: "inbound_v1.actions.edit", href: "#" },
      ]}
    >
      <InboundNewForm inboundId={params.id} />
    </PageLayout>
  );
}
