"use client";

import { usePdaMsg } from "@/context/pdaMsg";
import { lang } from "@/lang/base";
import { Button } from "./ui/button";

const PdaPageMsgLayout = (prop: {
  langCode: string;
  children: React.ReactNode;
}) => {
  const { pdaMessage, setPdaMessage } = usePdaMsg();
  const { langCode, children } = prop;
  return (
    <>
      {pdaMessage?.show && (
        <>
          <div className="w-full p-4 flex flex-col justify-center items-center gap-4 ">
            {pdaMessage.content?.icon}
            <h2>{pdaMessage.content?.title}</h2>
            <div className="overflow-hidden px-2 w-full ">
              {pdaMessage.content?.message}
            </div>
          </div>
          <div className="w-full p-4 flex justify-center items-center gap-4 mt-auto">
            <Button
              className="w-full"
              onClick={() => {
                if (pdaMessage.content?.callback?.() ?? true) {
                  setPdaMessage({ show: false });
                }
              }}
            >
              {pdaMessage.content?.button
                ? lang(pdaMessage.content?.button, langCode)
                : lang("button.confirm", langCode)}
            </Button>
          </div>
        </>
      )}
      {!pdaMessage?.show && children}
    </>
  );
};

export { PdaPageMsgLayout };
