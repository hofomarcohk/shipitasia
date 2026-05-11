import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function WmsLanding({ params }: Props) {
  const { locale } = await params;
  // Default landing for WMS desktop: pick queue. Staff can use the sidebar
  // to navigate elsewhere from there.
  redirect(`/${locale}/wms/operations/pick`);
}
