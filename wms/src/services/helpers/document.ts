import { ID_Prefix } from "@/cst/collections";
import { redisHincr } from "../utils/redis";
import { getSeconds, getYear, pad } from "./utils";

// redis
export async function newRecordId(
  collection: string,
  format: string = "ymdt00000"
) {
  const prefix = ID_Prefix[collection] ?? "";
  const now = new Date();
  const leadingZero = format.match(/0/g) ?? [];
  const textFormat = format.replace(/0/g, "");
  const textFormatValue = format
    .replace(/0/g, "")
    .replace("y", getYear(now))
    .replace("m", pad(now.getMonth() + 1))
    .replace("d", pad(now.getDate()))
    .replace("t", pad(getSeconds()));

  const incrKey = (
    await redisHincr("prefix", collection + "_" + textFormatValue)
  )
    .toString()
    .padStart(leadingZero?.length ?? 0, "0");

  return (
    prefix +
    format
      .replace(leadingZero.join(""), incrKey)
      .replace(textFormat, textFormatValue)
  );
}
