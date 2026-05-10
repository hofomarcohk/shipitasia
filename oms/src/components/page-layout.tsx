"use client";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { lang } from "@/lang/base";
import { http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert } from "@/types/Utils";
import { cloneDeep } from "lodash";
import { useLocale, useTranslations } from "next-intl";
import React, { useEffect, useRef } from "react";
import { AlertManager } from "./alert-manager";
import { Footer } from "./footer";
import { CustomForm } from "./forms/custom-form";
import { LanguageBar } from "./lang-bar";
import { LoginPopup } from "./login/login-popup";
import { CustomModal } from "./modal/custom-modal";
import { DataTable } from "./table/data-table";
import { ToolbarItem } from "./toolbar/toolbar-item";
import { UserNav } from "./user-nav";

export default function PageLayout(props: {
  title?: string;
  description?: string;
  langCode?: string;
  init?: () => void;
  path: { name: string; href: string }[];
  modals?: any;
  toolbar?: {
    icon?: any;
    text: string;
    modal?: string;
    api?: string;
  }[];
  table?: {
    api: string;
    params?: any;
    columns: any;
  };
  form?: any;
  children?: React.ReactNode;
  params?: any;
  default?: {
    [key: string]: any;
  };
  formData?: any;
  setFormData?: any;
  alerts?: any;
}) {
  const t = useTranslations();
  const langCode = useLocale();
  const [isLoading, setIsLoading] = React.useState(false);

  // login panel
  const [openLoginModal, setOpenLoginModal] = React.useState(false);

  // table
  const [toRefreshTable, setToRefreshTable] = React.useState(0);
  const [mainTableData, setMainTableData] = React.useState<any[]>([]);
  const [rowSelection, setMainRowSelection] = React.useState<{
    [key: number]: boolean;
  }>({});

  const addToRefreshTable = () => {
    setToRefreshTable(toRefreshTable + 1);
  };

  const getTableData = () => {
    return {
      data: [...mainTableData].map((r, i) => {
        return {
          isSelected: rowSelection[i] ?? false,
          ...r,
        };
      }),
    };
  };

  // modals
  const modals = props.modals;
  const [activeModalId, setActiveModalId] = React.useState(
    modals?.[0]?.id ?? ""
  );
  const modal = modals?.find((modal: any) => modal.id === activeModalId);
  const [openModal, setOpenModal] = React.useState(false);
  const [modalData, setModalData] = React.useState<{ [key: string]: any }>({});
  const setModalDataByKeys = (value: any) => {
    setModalData((prev) => {
      const data = cloneDeep(prev);
      let current = data;
      for (const key in value) {
        const keys = key.split(".");
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          // if the current key does not exist, create an empty object
          if (!current[k]) {
            current[k] = {};
          }
          current = current[k]; // move the current pointer to the next level
        }
        current[keys[keys.length - 1]] = cloneDeep(value[key]);
      }
      return data;
    });
  };
  const getModalDataByKey = (key: string | null = null) => {
    if (key) {
      const keys = key.split(".");
      let current = modalData ?? {};
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!current[k]) {
          return null;
        }
        current = current[k];
      }
      return current;
    }
    return modalData;
  };

  // form
  const form = props.form;
  const [formData, setFormData] = React.useState<{ [key: string]: any }>({});
  const setFormDataByKeys = (value: any) => {
    setFormData((prev) => {
      const data = cloneDeep(prev);
      let current = data;
      for (const key in value) {
        const keys = key.split(".");
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          // if the current key does not exist, create an empty object
          if (!current[k]) {
            current[k] = {};
          }
          current = current[k]; // move the current pointer to the next level
        }
        current[keys[keys.length - 1]] = cloneDeep(value[key]);
      }
      return data;
    });
  };
  const getFormDataByKey = (key: string | null = null) => {
    if (key) {
      const keys = key.split(".");
      let current = formData ?? {};
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!current[k]) {
          return null;
        }
        current = current[k];
      }
      return current;
    }
    return formData;
  };

  const message = lang("error.INTERNAL_SERVER_ERROR", langCode); // DEFAULT_ERROR_MSG

  const alertManagerRef = useRef<any>(null);
  const pushAlert = (alert: Alert) => {
    if (alertManagerRef.current) {
      alertManagerRef.current.pushAlert(alert);
    }
  };
  const clearAlerts = () => {
    if (alertManagerRef.current) {
      alertManagerRef.current.clearAlerts();
    }
  };

  // init
  const init = () => {
    if (props?.setFormData?.current) {
      props.setFormData.current = setFormDataByKeys;
    }
    if (props?.alerts?.current) {
      props.alerts.current = pushAlert;
    }
    props?.init?.();
    if (props.default) {
      // set default modal data
      setModalData(props.default);
    }
    if (props.form && props.form.api) {
      const fetchParam = async () => {
        const api = props.form.api.split(":");
        const method = api[0];
        const url = api[1];
        const params = props.params;
        const data = cloneDeep(params);
        http_request(method, url, data, {
          langCode,
        }).then(async (data) => {
          try {
            const json = await data.json();
            setFormData(json.data);
            if (json.status != 200) {
              pushAlert({ type: "error", message: json.message ?? message });
            }
          } catch (e) {
            pushAlert({ type: "error", message });
          }
        });
      };
      fetchParam();
    }
    addToRefreshTable();
  };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    // set default modal data if modal is open
    const defaultModalData = modal?.default ?? {};
    setModalData(cloneDeep({ ...defaultModalData, ...modalData }));
  }, [openModal]);

  useEffect(() => {
    if (props.formData) {
      props.formData.current = cloneDeep(formData);
    }
  }, [formData]);

  return (
    <div>
      <LoginPopup
        openLoginModal={openLoginModal}
        setOpenLoginModal={setOpenLoginModal}
        setIsLoading={setIsLoading}
        langCode={langCode}
        pushAlert={pushAlert}
        clearAlerts={clearAlerts}
        init={init}
      />
      <div className={cn((openLoginModal || isLoading) && "opacity-0")}>
        <SidebarProvider>
          {!openLoginModal && <AppSidebar />}
          <SidebarInset>
            <header
              className={cn(
                "flex h-[65px]  shrink-0 items-center justify-between border-b px-4 overflow-hidden ",
                "transition-opacity duration-300"
              )}
            >
              <div className="flex items-center">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs path={props.path} />
              </div>
              <div className="flex items-center">
                <LanguageBar />
                <UserNav />
              </div>
            </header>

            <div
              className={cn(
                "flex flex-col gap-4 h-[calc(100vh-90px)] scrollbar",
                "transition-opacity duration-300"
                //   openLoginModal && "opacity-0",
                // isLoading && "opacity-0"
              )}
            >
              <div>
                <div className="flex-1 flex-col space-y-2 pb-0 p-8 md:flex min-h-[calc(100vh-160px)]">
                  {props.title && (
                    <>
                      <div className="flex items-center justify-between space-y-2">
                        <div>
                          <h2 className="text-2xl font-bold tracking-tight">
                            {t(props.title)}
                          </h2>
                          <p className="text-muted-foreground">
                            {props.description && t(props.description)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {props.toolbar &&
                            props.toolbar.map((item: any) => (
                              <ToolbarItem
                                key={item.text}
                                langCode={langCode}
                                item={item}
                                setActiveModalId={setActiveModalId}
                                setOpenModal={setOpenModal}
                                setModalData={setModalData}
                                getModalDataByKey={getModalDataByKey}
                                refreshTable={addToRefreshTable}
                                getTableData={getTableData}
                                pushAlert={pushAlert}
                              />
                            ))}
                        </div>
                      </div>
                      <hr />
                    </>
                  )}

                  {props.modals && (
                    <CustomModal
                      modal={modal}
                      langCode={langCode}
                      openModal={openModal}
                      setOpenModal={setOpenModal}
                      getModalDataByKey={getModalDataByKey}
                      setModalDataByKeys={setModalDataByKeys}
                      refreshTable={addToRefreshTable}
                      pushAlert={pushAlert}
                    />
                  )}

                  {props.table && (
                    <DataTable
                      langCode={langCode}
                      tableSettings={props.table}
                      setModalData={setModalData}
                      setOpenModal={setOpenModal}
                      setActiveModalId={setActiveModalId}
                      toRefreshTable={toRefreshTable}
                      setMainTableData={setMainTableData}
                      setMainRowSelection={setMainRowSelection}
                      pushAlert={pushAlert}
                    />
                  )}

                  {props.form && (
                    <CustomForm
                      form={form}
                      langCode={langCode}
                      getModalDataByKey={getFormDataByKey}
                      setModalDataByKeys={setFormDataByKeys}
                      pushAlert={pushAlert}
                    />
                  )}

                  <div>{props.children}</div>
                </div>
              </div>
              <Footer />
            </div>
          </SidebarInset>
          <AlertManager ref={alertManagerRef} pushAlert={pushAlert} />
        </SidebarProvider>
      </div>
    </div>
  );
}
