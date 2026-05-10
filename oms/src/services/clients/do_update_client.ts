import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { Client, ClientSchema } from "@/types/Client";
import bcrypt from "bcrypt";
import { mongoEdit } from "../utils/mongodb";
import { redisDel } from "../utils/redis";

const collection = collections.CLIENT;

export async function editClient(update: Partial<Client>) {
  const db = await connectToDatabase();
  const filter = {
    username: update.username,
  };

  // hash the password
  if (update.password) {
    const password = update.password;
    const saltRounds = parseInt(process.env.PASSWORD_SALT || "10");
    const salt = await bcrypt.genSalt(saltRounds); // create salt
    const hash = await bcrypt.hash(password, salt);
    update.password = hash;
  }

  const client = await db.collection(collection).findOne(filter);
  if (!client) {
    throw new ApiError("RECORD_NOT_FOUND");
  }
  const { _id, ...clientWithoutId } = client;

  delete update.createdAt;
  delete update.status;
  update.updatedAt = new Date();

  update = {
    ...clientWithoutId,
    ...update,
  };

  ClientSchema.parse(update);
  await redisDel("client:user", client.username);

  // await validateInboundUpdate(update);

  return await mongoEdit(collection, filter, { $set: update });
}
