import { useLocale } from "next-intl";

export function checkConditions(
  getModalDataByKey: (key: string) => any,
  conditions: any
) {
  for (const condition of conditions) {
    const value = getModalDataByKey(condition[0]);
    if (condition.length == 2) {
      if (value !== condition[1]) {
        return false;
      }
    }
    if (condition.length == 3) {
      switch (condition[1]) {
        case "==":
          if (value != condition[2]) {
            return false;
          }
          break;
        case "!=":
          if (value == condition[2]) {
            return false;
          }
          break;
        case "<":
          if (value >= condition[2]) {
            return false;
          }
          break;
        case "<=":
          if (value > condition[2]) {
            return false;
          }
          break;
        case ">":
          if (value <= condition[2]) {
            return false;
          }
          break;
        case ">=":
          if (value < condition[2]) {
            return false;
          }
          break;
        case "in":
          if (!condition[2].includes(value)) {
            return false;
          }
          break;
        case "nin":
          if (condition[2].includes(value)) {
            return false;
          }
          break;
        case "x":
          if (condition[2]) {
            // exists
            if (!value || value.length == 0) {
              return false;
            }
          } else {
            // not exists
            if (value && value.length > 0) {
              return false;
            }
          }
          break;
      }
    }
  }
  return true;
}

export function setOptions(
  setOptions: any,
  json: any,
  key: string = "results"
) {
  if (json?.status === 200 && json.data) {
    setOptions(json.data[key] ?? []);
  }
  return true;
}

export function enter(e: any, callback: () => any) {
  if (e.key === "Enter") {
    callback();
  }
}

export function CountryOptions(serverData: any) {
  const langCode = useLocale().replace("-", "_");
  return (serverData?.country ?? []).map((a: any) => {
    return {
      value: a.value,
      label: a.label[langCode],
    };
  });
}
