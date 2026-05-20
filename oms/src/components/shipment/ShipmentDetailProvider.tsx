"use client";

import {
  ShipmentDetailSheet,
  type ShipmentDetail,
} from "./ShipmentDetailSheet";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface ShipmentDetailContextValue {
  open: (detail: ShipmentDetail) => void;
  close: () => void;
}

const ShipmentDetailContext = createContext<ShipmentDetailContextValue | null>(
  null
);

export function ShipmentDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((d: ShipmentDetail) => {
    setDetail(d);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <ShipmentDetailContext.Provider value={{ open, close }}>
      {children}
      <ShipmentDetailSheet
        shipment={detail}
        open={isOpen}
        onOpenChange={setIsOpen}
      />
    </ShipmentDetailContext.Provider>
  );
}

export function useOpenShipmentDetail() {
  const ctx = useContext(ShipmentDetailContext);
  if (!ctx) {
    throw new Error(
      "useOpenShipmentDetail must be used inside <ShipmentDetailProvider>"
    );
  }
  return ctx.open;
}
