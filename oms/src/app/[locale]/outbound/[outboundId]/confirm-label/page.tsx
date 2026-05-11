"use client";

import PageLayout from "@/components/page-layout";
import { OutboundConfirmLabel } from "@/components/outbound-confirm-label";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ outboundId: string }>();
  return (
    <PageLayout
      title="outbound_v1.confirm_label.title"
      description=""
      path={[
        { name: "outbound_v1.page_title", href: "/zh-hk/outbound/list" },
        {
          name: "outbound_v1.confirm_label.title",
          href: "#",
        },
      ]}
    >
      <OutboundConfirmLabel outboundId={params.outboundId} />
    </PageLayout>
  );
}
