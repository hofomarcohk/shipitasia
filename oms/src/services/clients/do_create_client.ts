import { collections } from "@/cst/collections";
import { Client } from "@/types/Client";
import bcrypt from "bcrypt";
import { mongoAdd } from "../utils/mongodb";

const collection = collections.CLIENT;

/**
 * @deprecated Legacy admin-creates-client path. Per phase1_oms_account.md §4
 * the canonical entry is now self-registration via /api/cms/auth/register
 * (P1 register flow). This function is retained so the existing admin endpoint
 * keeps compiling; new callers should not be added.
 */
export async function createClient(client: Client) {
  if (client.password == null) {
    throw new Error(
      "LEGACY_CREATE_CLIENT_REQUIRES_PASSWORD: this admin-creates path cannot " +
        "create Google-OAuth-only clients. Use /api/cms/auth/register instead."
    );
  }
  const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
  const salt = await bcrypt.genSalt(saltRounds);
  client.password = await bcrypt.hash(client.password, salt);
  client.createdAt = new Date();
  client.updatedAt = new Date();
  client.status = "active";
  client.role = "client";
  return await mongoAdd(collection, client);
}
