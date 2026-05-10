"use client";
import { lang } from "@/lang/base";
import { PdaMessage } from "@/types/Pda";
import { IconCircleCheckFilled, IconCircleXFilled } from "@tabler/icons-react";
import { createContext, useContext, useState } from "react";

type PdaMsgContextType = {
  pdaMessage: PdaMessage;
  setPdaMessage: (pdaMsg: PdaMessage) => void;
  pdaMsg: (
    type: "error" | "success",
    title?: string,
    options?: {
      message?: string;
      callback?: () => boolean | void;
      button?: string;
      icon?: React.ReactNode;
    }
  ) => void;
};

const PdaMsgContext = createContext<PdaMsgContextType>({
  pdaMessage: { show: false },
  setPdaMessage: () => {},
  pdaMsg: () => {},
});

export const PdaMsgProvider = ({ children }: { children: React.ReactNode }) => {
  const [pdaMessage, setPdaMessage] = useState<PdaMessage>({ show: false });
  const pdaMsg = (
    type: "error" | "success",
    title?: string,
    options: {
      message?: string;
      callback?: () => boolean | void;
      button?: string;
      icon?: React.ReactNode;
    } = {}
  ) => {
    const { callback, message, button, icon } = options;
    const messageTemplate = {
      error: {
        icon: <IconCircleXFilled size={120} stroke={1} color="#f5222d" />,
      },
      success: {
        icon: <IconCircleCheckFilled size={120} stroke={1} color="#00a854" />,
      },
    };
    setPdaMessage({
      show: true,
      content: {
        icon: icon ?? messageTemplate[type as "error" | "success"].icon,
        title: title ?? lang("utils.system_error"),
        message,
        button,
        callback,
      },
    });
  };

  return (
    <PdaMsgContext.Provider value={{ pdaMessage, setPdaMessage, pdaMsg }}>
      {children}
    </PdaMsgContext.Provider>
  );
};

export const usePdaMsg = () => useContext(PdaMsgContext);
