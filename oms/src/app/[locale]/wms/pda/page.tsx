import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function PdaLanding({ params }: Props) {
  const { locale } = await params;
  // PDA default: arrive scan (start of the inbound flow).
  redirect(`/${locale}/wms/pda/scan/inbound-arrive`);
}
