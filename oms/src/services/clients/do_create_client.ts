import { collections } from "@/cst/collections";
import { Client } from "@/types/Client";
import bcrypt from "bcrypt";
import { mongoAdd } from "../utils/mongodb";

const collection = collections.CLIENT;

export async function createClient(client: Client) {
  // hash the password
  const password = client.password;
  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const salt = await bcrypt.genSalt(saltRounds); // create salt
  const hash = await bcrypt.hash(password, salt);
  client.password = hash;
  client.createdAt = new Date();
  client.updatedAt = new Date();
  client.status = "active";
  client.role = "client";
  return await mongoAdd(collection, client);
}
