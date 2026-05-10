"use client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert } from "@/types/Utils";
import { useTranslations } from "next-intl";
import { FormBuilder } from "../helpers/form-builder";
import { checkConditions } from "../helpers/utils";

interface CustomModalProps<TData, TValue> {
  modal: any;
  langCode: string;
  openModal: boolean;
  setOpenModal: (open: boolean) => void;
  getModalDataByKey: (key?: string) => any;
  setModalDataByKeys: (modalData: any) => void;
  refreshTable: () => void;
  pushAlert: (alert: Alert) => void;
}

export function CustomModal<TData, TValue>({
  modal,
  langCode,
  openModal,
  setOpenModal,
  getModalDataByKey,
  setModalDataByKeys,
  refreshTable,
  pushAlert,
}: CustomModalProps<TData, TValue>) {
  const message = lang("error.INTERNAL_SERVER_ERROR", langCode); // DEFAULT_ERROR_MESSAGE
  const t = useTranslations();
  return (
    <Sheet open={openModal} onOpenChange={setOpenModal}>
      <SheetContent
        onInteractOutside={(e) => e.preventDefault()}
        className={cn("h-full w-full md:w-7/12 ", modal?.className ?? "")}
        style={{ maxWidth: "700px" }}
      >
        <SheetTitle className="hidden"></SheetTitle>
        <SheetHeader>
          <SheetTitle>{modal?.title}</SheetTitle>
          <SheetDescription>{modal?.description}</SheetDescription>
        </SheetHeader>
        {/* <AlertManager ref={alertManagerRef} pushAlert={pushAlert} /> */}
        <ScrollArea className="h-[calc(100%-90px)]  pr-4 mb-4">
          <FormBuilder
            modal={modal}
            langCode={langCode}
            getModalDataByKey={getModalDataByKey}
            setModalDataByKeys={setModalDataByKeys}
            pushAlert={pushAlert}
          />
        </ScrollArea>
        <SheetFooter className="flex justify-end gap-2">
          {modal?.buttons.map((button: any) => {
            if (button?.options?.show) {
              if (!checkConditions(getModalDataByKey, button.options.show)) {
                return null;
              }
            }

            return (
              <Button
                key={button.text}
                className={cn(
                  "min-w-[100px]",
                  button.className,
                  "lang-" + langCode
                )}
                onClick={async () => {
                  for (const action of button.actions) {
                    if (typeof action == "string") {
                      const [method, path] = action.split(":");
                      switch (method.toUpperCase()) {
                        case "POST":
                        case "GET":
                        case "PUT":
                        case "DELETE":
                          try {
                            const call = await http_request(
                              method,
                              path,
                              getModalDataByKey(),
                              {
                                langCode,
                              }
                            );
                            if (call.status !== 200) {
                              pushAlert({ type: "error", message });
                              return;
                            }
                            const json = await call.json();
                            if (json.status !== 200) {
                              pushAlert({
                                type: "error",
                                message: json.message ?? message,
                              });
                              return;
                            }
                            pushAlert({
                              type: "success",
                              message: json.message,
                            });
                          } catch (error) {
                            pushAlert({ type: "error", message });
                          }

                          break;
                        case "REFRESH_TABLE":
                          refreshTable();
                          break;
                        case "RELOAD":
                          window.location.reload();
                          break;
                        case "ACTION":
                          console.log(getModalDataByKey());
                        default:
                          break;
                      }
                    } else {
                      action(getModalDataByKey());
                    }
                  }
                  setOpenModal(false);
                }}
              >
                {button.text}
              </Button>
            );
          })}
          <Button
            variant="outline"
            className="min-w-[100px]"
            onClick={() => setOpenModal(false)}
          >
            {t("button.cancel")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
