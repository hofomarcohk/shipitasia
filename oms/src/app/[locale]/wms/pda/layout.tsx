import { ReactNode } from "react";

// PDA subtree layout. Same pattern as the WMS layout — pass-through so
// the AppSidebar can detect "/.../wms/pda/" via pathname.
export default function PdaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
