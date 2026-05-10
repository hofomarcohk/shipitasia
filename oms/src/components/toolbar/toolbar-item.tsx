import { ApiError } from "@/app/api/api-error";
import { Button } from "@/components/ui/button";
import { lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert } from "@/types/Utils";

export function ToolbarItem<TData, TValue>({
  item,
  langCode,
  setActiveModalId,
  setModalData,
  getModalDataByKey,
  setOpenModal,
  refreshTable,
  getTableData,
  pushAlert,
}: {
  item: {
    icon: any;
    text: string;
    modal?: string;
    prepare?: (table: any) => any;
    actions?: string[];
    className?: string;
  };
  langCode: string;
  setActiveModalId: (value: string) => void;
  setModalData: any;
  getModalDataByKey: (key?: string) => any;
  setOpenModal: (value: boolean) => void;
  refreshTable: () => void;
  getTableData: () => any;
  pushAlert: (alert: Alert) => void;
}) {
  const message = lang("error.INTERNAL_SERVER_ERROR", langCode); // DEFAULT_ERROR_MESSAGE

  return (
    <div
      key={item.text}
      className="flex gap-2 items-center justify-center"
      onClick={async () => {
        let data = {};
        const table = getTableData();
        try {
          if (item.prepare) {
            data = item.prepare(table);
          }
        } catch (e) {
          if (e instanceof ApiError) {
            let message = e.message;
            pushAlert({ type: "error", message });
          } else {
            console.log(e);
            pushAlert({ type: "error", message });
          }
          return;
        }
        console.log("data", data);

        if (item.modal) {
          setActiveModalId(item.modal);
          setModalData(data);
          setOpenModal(true);
        }
        if (item.actions) {
          for (const action of item.actions) {
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
                    getModalDataByKey()
                  );
                  if (call.status !== 200) {
                    pushAlert({ type: "error", message });
                    return;
                  }
                  const json = await call.json();
                  pushAlert({
                    type: "success",
                    message: json.message ?? message,
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
              default:
                break;
            }
          }
        }
      }}
    >
      <Button
        className={cn(
          item.className,
          "flex gap-1 items-center min-w-[150px]",
          "lang-" + langCode
        )}
      >
        {item.icon && <item.icon className="text-white cursor-pointer" />}
        <span>{item.text}</span>
      </Button>
    </div>
  );
}
