import { Address } from "@/types/Address";

// redis
export function pad(str: number, length: number = 2, fill: string = "0") {
  return str.toString().padStart(length, fill);
}

export function getYear(date: Date) {
  return date.getFullYear().toString().slice(-2);
}

export function getSeconds() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((now.getTime() - today.getTime()) / 1000);
}

export function formFullAddress(address: Address, countryList: any[]) {
  const country = countryList?.find((a) => a.countryKey == address.country);
  return [
    address.address + address.zip,
    address.district,
    address.city,
    address.state,
    address.region,
    country?.text?.en ?? "",
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(", ");
}

export function objExtract<T>(obj: T, keys: (keyof T)[]): Partial<T> {
  let data: Partial<T> = {};
  for (let key in obj) {
    if (keys.includes(key)) {
      data[key] = obj[key];
    }
  }
  return data;
}
