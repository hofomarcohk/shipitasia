import { ApiErrorList } from "@/cst/error-list";

class ApiError extends Error {
  constructor(
    errorCode: string,
    data?: {
      [key: string]: string;
    }
  ) {
    const errorList = ApiErrorList as ApiErrorList;
    const langCode = (data && data["langCode"]) ?? "en";
    if (!errorList[errorCode]) {
      throw new Error(`Error code ${errorCode} not found in error list`);
    }
    super(errorCode);
    Error.captureStackTrace(this, this.constructor);

    let message = errorList[errorCode].message;
    // set error message
    if (langCode) {
      if (langCode == "en" || langCode == "zh_hk" || langCode == "zh_cn") {
        message = errorList[errorCode][langCode];
      }
    }

    // replace message with data
    for (const key in data) {
      message = message.replace(`{${key}}`, data[key]);
    }

    // set error code
    this.name = errorCode;
    this.message = message;
    // set error status
  }
}

export { ApiError };

interface ApiErrorList {
  [key: string]: {
    status: number;
    sys_code: string;
    message: string;
    zh_hk: string;
    zh_cn: string;
    en: string;
  };
}

export { ApiErrorList };
