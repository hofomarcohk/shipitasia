"use client";
import { lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert } from "@/types/Utils";
import { FormBuilder } from "../helpers/form-builder";
import { checkConditions } from "../helpers/utils";
import { Button } from "../ui/button";
import { SidebarNav } from "./components/sidebar-nav";

interface CustomModalProps<TData, TValue> {
  form: any;
  langCode: string;
  getModalDataByKey: (key?: string) => any;
  setModalDataByKeys: (modalData: any) => void;
  pushAlert: (alert: Alert) => void;
}

export function CustomForm<TData, TValue>({
  form,
  langCode,
  getModalDataByKey,
  setModalDataByKeys,
  pushAlert,
}: CustomModalProps<TData, TValue>) {
  const message = lang("error.INTERNAL_SERVER_ERROR", langCode); // DEFAULT_ERROR_MESSAGE

  return (
    <div
      className={cn(
        "flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0 scrollbar "
      )}
    >
      {form?.options?.tab == "horizontal" && (
        <aside className="-mx-4 lg:w-1/5">
          <SidebarNav
            items={form.fields
              .filter((item: any) => item.type === "title")
              .map((item: any, i: number) => {
                const titleKey = "title_" + i;
                item.key = titleKey;
                form.fields[i].id = titleKey;
                return {
                  title: item.text,
                  href: "#form_edit_" + item.key,
                  icon: item.icon,
                };
              })}
          />
        </aside>
      )}

      <div className={cn("flex-1 lg:max-w-2xl")}>
        <FormBuilder
          modal={form}
          langCode={langCode}
          getModalDataByKey={getModalDataByKey}
          setModalDataByKeys={setModalDataByKeys}
          pushAlert={pushAlert}
        />

        {form?.buttons && form?.buttons.length > 0 && <hr className="my-4" />}
        {form?.buttons &&
          form?.buttons.map((button: any) => {
            if (button?.options?.show) {
              if (!checkConditions(getModalDataByKey, button.options.show)) {
                return null;
              }
            }

            return (
              <Button
                key={button.text}
                className={cn("min-w-[150px]", button.className)}
                onClick={async () => {
                  let is_failed = false;
                  for (const action of button.actions) {
                    if (is_failed) {
                      return;
                    }
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
                            { langCode }
                          );

                          if (call.status !== 200) {
                            pushAlert({ type: "error", message });
                            is_failed = true;
                            return;
                          }
                          const json = await call.json();
                          if (json.status !== 200) {
                            pushAlert({ type: "error", message: json.message });
                            is_failed = true;
                            return;
                          }
                          pushAlert({ type: "success", message: json.message });
                        } catch (error) {
                          is_failed = true;
                          pushAlert({ type: "error", message });
                        }

                        break;
                      case "RELOAD":
                        window.location.reload();
                        break;
                      default:
                        break;
                    }
                  }
                }}
              >
                {button.text}
              </Button>
            );
          })}
      </div>
    </div>
  );
}
