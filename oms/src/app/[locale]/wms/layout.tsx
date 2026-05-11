import { ReactNode } from "react";

// WMS subtree layout. The parent `[locale]/layout.tsx` already wires
// NextIntlClientProvider + ServerDataProvider, so we just pass children
// through. The presence of this file lets us segment file-tree and ride
// the AppSidebar context detection (pathname starts with `/.../wms/`).
export default function WmsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
