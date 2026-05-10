import { collections } from "@/cst/collections";
import { Admin } from "@/types/Admin";
import bcrypt from "bcrypt";
import { mongoAdd } from "../utils/mongodb";

const collection = collections.ADMIN;

export async function createAdmin(admin: Admin) {
  // hash the password
  const password = admin.password;
  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const salt = await bcrypt.genSalt(saltRounds); // create salt
  const hash = await bcrypt.hash(password, salt);
  admin.password = hash;
  admin.createdAt = new Date();
  admin.updatedAt = new Date();
  return await mongoAdd(collection, admin);
}
