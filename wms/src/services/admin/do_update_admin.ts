import { collections } from "@/cst/collections";
import { Admin } from "@/types/Admin";
import bcrypt from "bcrypt";
import { mongoEdit } from "../utils/mongodb";
import { redisDel } from "../utils/redis";

const collection = collections.ADMIN;

export async function editClient(admin: Partial<Admin>) {
  // hash the password
  if (admin.password) {
    const password = admin.password;
    const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
    const salt = await bcrypt.genSalt(saltRounds); // create salt
    const hash = await bcrypt.hash(password, salt);
    admin.password = hash;
  }
  admin.updatedAt = new Date();
  if (admin.username) {
    redisDel("admin.user", admin.username);
  }
  return await mongoEdit(
    collection,
    { username: admin.username },
    { $set: admin }
  );
}
