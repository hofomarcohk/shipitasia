export type AdminStatus = "active" | "inactive" | "locked" | "deleted";
export type AdminRole = "admin" | "client" | "test";

export type Admin = {
  username: string;
  password: string;
  status: AdminStatus;
  role: AdminRole;
  firstName: string;
  lastName: string;
  langCode: string;
  warehouse: string;
  createdAt: Date;
  updatedAt: Date;
};
