"use client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { Alert } from "@/types/Utils";
import { IconCircleKey, IconUserCircle } from "@tabler/icons-react";
import { env } from "process";
import { useEffect, useRef, useState } from "react";
import { Input } from "../ui/input";
interface LoginPopupProps<TData, TValue> {
  langCode: string;
  openLoginModal: boolean;
  setOpenLoginModal: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  pushAlert: (alert: Alert) => void;
  clearAlerts: () => void;
  init: () => void;
}

export function LoginPopup<TData, TValue>({
  langCode,
  openLoginModal,
  setIsLoading,
  setOpenLoginModal,
  pushAlert,
  clearAlerts,
  init,
}: LoginPopupProps<TData, TValue>) {
  const message = lang("error.INTERNAL_SERVER_ERROR", langCode); // DEFAULT_ERROR_MESSAGE

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const isActivate = useRef(true);
  const [isActivated, setIsActivated] = useState(true);
  const tokenInterval =
    (parseInt(`${env.NEXT_PUBLIC_CMS_USER_IDLE_MINUTE}`) || 15) * 1000 * 60; // 5 minutes

  let t: any = setTimeout(() => {
    isActivate.current = false;
    setIsActivated(false);
  }, tokenInterval);

  const lockScreen = () => {
    if (isActivated) {
      setOpenLoginModal(true);
      localStorage.setItem("isUnauthorized", "true");
    }
  };

  useEffect(() => {
    window.addEventListener("storage", (event) => {
      if (event.key === "isUnauthorized" && event.newValue == "true") {
        lockScreen();
      }
    });

    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        setIsActivated(true);
      } else {
        setIsActivated(false);
      }
    });

    window.addEventListener("mousemove", () => {
      isActivate.current = true;
      clearTimeout(t);
      t = setTimeout(() => {
        lockScreen();
      }, tokenInterval);
    });
    window.addEventListener("keydown", () => {
      isActivate.current = true;
      clearTimeout(t);
      t = setTimeout(() => {
        lockScreen();
      }, tokenInterval);
    });
  }, []);

  const handleLogin = async () => {
    try {
      const response = await http_request(
        "POST",
        "/api/cms/login",
        { username, password },
        { langCode }
      );
      if (response.status == 200) {
        const json = await response.json();
        if (json.status == 200) {
          setUsername("");

          localStorage.removeItem("isUnauthorized");
          setOpenLoginModal(false);
          clearAlerts();
        } else {
          pushAlert({ type: "error", message: json.message ?? message });
        }
      } else {
        pushAlert({ type: "error", message: message });
      }
      setPassword("");
    } catch (error) {
      pushAlert({ type: "error", message: message });
    }
  };

  return (
    <>
      <AlertDialog open={openLoginModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Login</AlertDialogTitle>
            <AlertDialogDescription></AlertDialogDescription>
            <form>
              <div className="flex items-center gap-2">
                <IconUserCircle stroke={1} size={24} className="" />
                <Input
                  placeholder="username"
                  className="mb-2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <IconCircleKey stroke={1} size={24} className="" />
                <Input
                  type="password"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleLogin();
                    }
                  }}
                />
              </div>
            </form>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={handleLogin}>Login</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
