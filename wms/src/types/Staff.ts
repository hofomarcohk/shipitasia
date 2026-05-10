export type Staff = {
  code: string;
  password: string;
  firstName: string;
  lastName: string;
  warehouseCode: string[];
  staffRole: string;
}

export type StaffRole = {
  name: string;
  staffRights: string[];
}

export type StaffRight = {
  name: string;
  description: string;
}

export type Menu = {
  name: string;
  icon: string;
  url: string;
  right: string;
}