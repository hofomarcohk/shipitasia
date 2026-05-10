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
    // set error message
    this.message = errorList[errorCode].message;
    console.log("langCodelangCode", langCode);
    if (langCode) {
      if (langCode == "en" || langCode == "zh_hk" || langCode == "zh_cn") {
        this.message = errorList[errorCode][langCode];
      }
    }

    // replace message with data
    for (const key in data) {
      this.message = this.message.replace(`{${key}}`, data[key]);
    }

    // set error code
    this.name = errorCode;
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
