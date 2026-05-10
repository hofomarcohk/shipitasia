import { cookies } from "next/headers";

const isUserLogin = async () => {
  const cookie = (await cookies()).getAll() || {};
  return cookie.find((c) => c.name === "token" && c.value?.length > 0);
};
export { isUserLogin };
