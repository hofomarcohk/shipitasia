import { Double } from "mongodb";

export type BillStatus = "active" | "paid" | "cancelled" | "void" | "refunded";

export type ClientBill = {
  clientId: string;
  title: string;
  category: string[];
  status: BillStatus;
  items: {
    title: string;
    description: string;
    quantity: number;
    amount: Double;
  }[];
  currency: string;
  amount: Double;
  discount: {
    title: string;
    amount: Double;
  }[];
  billAmount: Double;
  paymentMethod: string;
  paymentReference: string;
  paidAt: Date;
  cancelledAt: Date;
  voidAt: Date;
  refundedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}