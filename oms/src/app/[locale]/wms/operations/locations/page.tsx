"use client";

import PageLayout from "@/components/page-layout";
import { LocationsAdmin } from "@/components/wms/locations-admin";

export default function Page() {
  return (
    <PageLayout
      title="wms_locations.page_title"
      description="wms_locations.page_subtitle"
      path={[{ name: "wms_locations.page_title", href: "#" }]}
    >
      <LocationsAdmin />
    </PageLayout>
  );
}
