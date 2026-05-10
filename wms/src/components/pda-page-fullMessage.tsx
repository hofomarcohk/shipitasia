"use client";

import { lang } from "@/lang/base";
import { Button } from "./ui/button";

export default function PdaPageFullPageMsgLayout(prop: {
  langCode: string;
  icon: React.ReactNode;
  title?: string;
  message: React.ReactNode;
  callback?: () => void;
  button: React.ReactNode;
}) {
  return (
    <>
      <div className="w-full p-4 flex flex-col justify-center items-center gap-4 mb-[120px]">
        {prop.icon}
        <h2>{prop.title}</h2>
        {prop.message}
      </div>
      <div className="w-full p-4 flex justify-center items-center gap-4">
        <Button
          className="w-full"
          onClick={() => {
            prop?.callback?.();
          }}
        >
          {prop.button ?? lang("button.confirm")}
        </Button>
      </div>
    </>
  );
}
