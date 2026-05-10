import { Alert } from "@/components/ui/alert";
import { utils } from "@/cst/utils";
import { lang } from "@/lang/base";
import { cn } from "@/lib/utils";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconExclamationCircleFilled,
  IconInfoCircleFilled,
  IconX,
} from "@tabler/icons-react";
import { forwardRef, useImperativeHandle, useState } from "react";

type AlertMessage = {
  id: string;
  type: "error" | "success" | "warning" | "info";
  message: string;
  time?: number;
};

const AlertManager = forwardRef(
  (
    prop: {
      pushAlert: (alert: AlertMessage) => void;
    },
    ref
  ) => {
    const [alertList, setAlertList] = useState<AlertMessage[]>([]);
    const text = {
      close: lang("button.close"),
    };
    const defaultExpireTime = utils.ALERT_EXPIRE_TIME;
    const addAlert = (alert: AlertMessage) => {
      const alertMessage = {
        ...alert,
        id: Math.random().toString(36).substring(7),
      };
      if (alert.time == undefined) {
        alertMessage.time = defaultExpireTime[alert.type];
      }

      setAlertList((prev) => [...prev, alertMessage]);
      if (alertMessage.time) {
        setTimeout(() => {
          removeAlert(alertMessage);
        }, alertMessage.time);
      }
    };

    const removeAlert = (alert: AlertMessage) => {
      setAlertList((prev) => prev.filter((a) => a.id !== alert.id));
    };

    const clearAlerts = () => {
      setAlertList([]);
    };

    useImperativeHandle(ref, () => ({
      pushAlert: addAlert,
      clearAlerts: clearAlerts,
    }));

    return (
      <div className="fixed top-0 right-10 z-[100] p-4 max-w-full w-[350px] max-h-[calc(100vh-70px)] scrollbar flex flex-col items-center">
        {alertList.map((alert) => {
          let bgColor = "bg-white";
          let borderColor = "border-[red]";
          let textColor = "text-[red]";
          let logo = <IconInfoCircleFilled className="w-4 h-4" stroke={1} />;
          switch (alert.type.toLowerCase()) {
            case "error":
              borderColor = "border-red-500/10";
              textColor = "text-red-500";
              bgColor = "bg-red-50";
              logo = (
                <IconExclamationCircleFilled
                  className="w-4 h-4 text-red-400"
                  stroke={1}
                />
              );
              break;
            case "success":
              borderColor = "border-green-500/10";
              textColor = "text-green-500";
              bgColor = "bg-green-50";
              logo = (
                <IconCircleCheckFilled
                  className="w-4 h-4 text-green-400"
                  stroke={1}
                />
              );
              break;
            case "warning":
              borderColor = "border-yellow-500/10";
              textColor = "text-yellow-500";
              bgColor = "bg-yellow-50";
              logo = (
                <IconAlertTriangleFilled
                  className="w-4 h-4 text-yellow-400"
                  stroke={1}
                />
              );
              break;
            default:
              borderColor = "border-blue-500/10";
              textColor = "text-blue-500";
              bgColor = "bg-blue-50";
              logo = (
                <IconInfoCircleFilled
                  className="w-4 h-4 text-blue-400"
                  stroke={1}
                />
              );
              break;
          }
          borderColor = "border-0";
          return (
            <div
              key={alert.id}
              className={`w-full mb-2 alert alert-enter `}
              style={{ animationDuration: "0.3s" }}
            >
              <Alert
                className={cn(
                  "relative rounded-sm ",
                  borderColor,
                  textColor,
                  bgColor
                )}
              >
                <div
                  title={text.close}
                  className="cursor-pointer absolute top-0 right-0 p-2"
                  style={{ pointerEvents: "auto" }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeAlert(alert);
                  }}
                >
                  <IconX
                    className="h-4 w-4 opacity-50 hover:opacity-100"
                    stroke={1}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="w-2 h-2 pt-1">{logo}</div>
                  <div
                    className={cn(
                      "pl-1 mr-2 max-h-[150px] overflow-y-hidden scrollbar w-full",
                      alert.type
                    )}
                  >
                    {alert.message}
                  </div>
                </div>
              </Alert>
            </div>
          );
        })}
      </div>
    );
  }
);

AlertManager.displayName = "AlertManager";
export { AlertManager };
