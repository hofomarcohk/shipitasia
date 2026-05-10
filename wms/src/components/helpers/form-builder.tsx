"use client";
import { useServerData } from "@/app/providers/ServerDataContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { lang } from "@/lang/base";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconChevronLeftPipe,
  IconChevronRightPipe,
  IconChevronUp,
  IconDeviceMobile,
  IconDots,
  IconMapPin,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { cloneDeep } from "lodash";
import { useLocale, useTranslations } from "next-intl";
import { m_br, m_select, m_text, m_textarea } from "../modal/custom-modal-item";
import { Button } from "../ui/button";
import { InputComponentBuilder } from "./input-component";
import { ModalLabel } from "./modal-label";
import { TableBuilder } from "./table-builder";
import { checkConditions, CountryOptions } from "./utils";

interface Props<TData, TValue> {
  modal: any;
  langCode: string;
  getModalDataByKey: (key?: string) => any;
  setModalDataByKeys: (modalData: any) => void;
  pushAlert: (alert: { type: string; message: string; time?: number }) => void;
}

export function FormBuilder<TData, TValue>({
  modal,
  langCode,
  getModalDataByKey,
  setModalDataByKeys,
  pushAlert,
}: Props<TData, TValue>) {
  const t = useTranslations();
  langCode = useLocale().replace("-", "_");
  const countryList = CountryOptions(useServerData());

  const tableBuilder = TableBuilder({
    modal,
    getModalDataByKey,
    setModalDataByKeys,
  });

  const inputComponentBuilder = InputComponentBuilder({
    modal,
    getModalDataByKey,
    setModalDataByKeys,
    tableBuilder,
  });

  const cardTemplates: {
    [key: string]: any;
  } = {
    address: [
      m_text(t("utils.contactPerson"), "contactPerson", { is_required: true }),
      m_br(),
      m_select(t("utils.country"), "country", countryList, {
        is_required: true,
      }),
      m_text(t("utils.mobile"), "mobile", { is_required: true }),
      m_text(t("utils.city"), "city", { is_required: true }),
      m_text(t("utils.region"), "region", { is_required: true }),
      m_text(t("utils.district"), "district", { is_required: true }),
      m_text(t("utils.state"), "state", { is_required: true }),
      m_text(t("utils.zip"), "zip"),
      m_textarea(t("utils.address"), "address", {
        is_required: true,
        className: "col-span-2 mb-4",
      }),
    ],
    simpleAddress: [
      {
        type: "plain",
        key: "contactPerson",
        className: "opacity-80",
        l_icon: (
          <div className="mr-1 opacity-50" title={t("utils.contactPerson")}>
            <IconUserCircle stroke={1} />
          </div>
        ),
      },
      {
        type: "plain",
        key: "mobile",
        className: "opacity-80",
        l_icon: (
          <div className="mr-1 opacity-50" title={t("utils.mobile")}>
            <IconDeviceMobile stroke={1} />
          </div>
        ),
      },
      {
        type: "plain",
        key: "fullAddress",
        className: "col-span-2 mb-4 opacity-80",
        l_icon: (
          <div className="mr-1 opacity-50" title={t("utils.address")}>
            <IconMapPin stroke={1} />
          </div>
        ),
      },
    ],
  };

  return (
    <div className="w-full">
      <div
        className={cn("grid grid-cols-2 gap-x-4 mt-4 px-1", "lang-" + langCode)}
      >
        {modal?.fields.map((field: any) => {
          if (field.show) {
            if (!checkConditions(getModalDataByKey, field.show)) {
              return null;
            }
          }
          if (field.hide) {
            if (checkConditions(getModalDataByKey, field.hide)) {
              return null;
            }
          }

          const isReadOnly =
            field.is_readonly ??
            (field.readonly
              ? checkConditions(getModalDataByKey, field.readonly)
              : false);

          const fieldClass = field.className ?? "col-span-1 mb-4";
          const isRequired = field.is_required ?? false;
          const max = field?.max ?? 10;
          const min = field?.min ?? 0;

          let cardList =
            getModalDataByKey(field.key) ??
            new Array(min).fill(cloneDeep(field.default)); // form min array

          const fields =
            field.fields ??
            (field.template && cardTemplates[field.template]) ??
            [];

          switch (field.type) {
            case "card":
              return (
                <div key={field.key} className={cn(fieldClass)}>
                  <div className="flex items-center justify-between mb-2">
                    <ModalLabel
                      text={field.text}
                      isRequired={isRequired}
                      description={field.description}
                    />
                  </div>

                  <div
                    className={cn(
                      "border p-4 rounded-lg mb-4 relative",
                      field.cardClassName
                    )}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-1 ">
                      {fields.map((subfield: any) => {
                        const key = field.key + "." + subfield.key;
                        return inputComponentBuilder(
                          {
                            ...subfield,
                            key,
                          },
                          {
                            ...modal.options,
                            is_readonly: isReadOnly,
                          }
                        );
                      })}
                    </div>
                  </div>
                </div>
              );

            case "cards":
              return (
                <div key={field.key} className={cn(fieldClass)}>
                  <div className="flex items-center justify-between mb-2">
                    <ModalLabel
                      text={field.text}
                      isRequired={isRequired}
                      description={field.description}
                    />

                    {cardList.length > 1 && (
                      <div
                        className="text-sm text-[#0077c0] cursor-pointer"
                        onClick={(e) => {
                          field.is_expanded = !field.is_expanded;
                          setModalDataByKeys({ [field.key]: cardList });
                        }}
                      >
                        {!field.is_expanded && t("table.showAll")}
                        {field.is_expanded && t("table.collapse")}
                      </div>
                    )}
                  </div>

                  <div className={cn("mt-2")}>
                    {cardList &&
                      Object.values(cardList).map(
                        (card: any, index: number) => {
                          return (
                            <div
                              key={index}
                              className={cn(
                                "border p-4 rounded-lg mb-4 relative",
                                field.cardClassName,
                                index > 0 && !field.is_expanded && "hidden"
                              )}
                            >
                              {!isReadOnly && (
                                <div
                                  className={cn(
                                    "absolute top-2 right-2 p-1 flex items-center justify-center gap-2"
                                  )}
                                >
                                  {cardList.length > 1 &&
                                    cardList.is_sequential && (
                                      <div className={cn("flex gap-2")}>
                                        <div
                                          className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                          title={t("button.moveUp")}
                                          onClick={() => {
                                            const updatedList = [...cardList];
                                            const temp = updatedList[index - 1];
                                            updatedList[index - 1] =
                                              updatedList[index];
                                            updatedList[index] = temp;
                                            setModalDataByKeys({
                                              [field.key]: updatedList,
                                            });
                                          }}
                                        >
                                          <IconChevronUp className="h-4 w-4" />
                                        </div>
                                        <div
                                          className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                          title={t("button.moveDown")}
                                          onClick={() => {
                                            const updatedList = [...cardList];
                                            const temp = updatedList[index + 1];
                                            updatedList[index + 1] =
                                              updatedList[index];
                                            updatedList[index] = temp;
                                            setModalDataByKeys({
                                              [field.key]: updatedList,
                                            });
                                          }}
                                        >
                                          <IconChevronDown className="h-4 w-4" />
                                        </div>
                                        <div
                                          className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                          title={t("button.moveTop")}
                                          onClick={() => {
                                            const updatedList = [...cardList];
                                            const temp = updatedList[0];
                                            updatedList[0] = updatedList[index];
                                            updatedList[index] = temp;
                                            setModalDataByKeys({
                                              [field.key]: updatedList,
                                            });
                                          }}
                                        >
                                          <IconChevronLeftPipe className="h-4 w-4 rotate-90" />
                                        </div>
                                        <div
                                          className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                          title={t("button.moveBottom")}
                                          onClick={() => {
                                            const updatedList = [...cardList];
                                            const temp =
                                              updatedList[
                                                updatedList.length - 1
                                              ];
                                            updatedList[
                                              updatedList.length - 1
                                            ] = updatedList[index];
                                            updatedList[index] = temp;
                                            setModalDataByKeys({
                                              [field.key]: updatedList,
                                            });
                                          }}
                                        >
                                          <IconChevronRightPipe className="h-4 w-4 rotate-90" />
                                        </div>
                                      </div>
                                    )}
                                  <div
                                    className="hidden"
                                    title={t("button.more")}
                                  >
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <div className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 ">
                                          <IconDots className="h-4 w-4" />
                                        </div>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="w-56">
                                        <DropdownMenuGroup>
                                          <DropdownMenuItem>
                                            {t("button.moveTop")}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem>
                                            {t("button.moveBottom")}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem>
                                            {t("button.moveUp")}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem>
                                            {t("button.moveDown")}
                                          </DropdownMenuItem>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  {!field.is_freeze_count && (
                                    <div
                                      className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                      title={t("button.delete")}
                                      onClick={() => {
                                        const updatedList = [...cardList];
                                        if (updatedList.length <= min) {
                                          pushAlert({
                                            type: "warning",
                                            message: lang(
                                              "error.MIN_LENGTH_EXCEEDED",
                                              langCode,
                                              { key: field.text, min }
                                            ),
                                          });
                                          return;
                                        }
                                        updatedList.splice(index, 1);
                                        setModalDataByKeys({
                                          [field.key]: updatedList,
                                        });
                                      }}
                                    >
                                      <IconX className="h-4 w-4" />
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-1 ">
                                {fields.map((subfield: any) => {
                                  const key =
                                    field.key +
                                    "." +
                                    index +
                                    "." +
                                    subfield.key;
                                  return inputComponentBuilder(
                                    {
                                      ...subfield,
                                      key,
                                    },
                                    {
                                      ...modal.options,
                                      is_readonly: isReadOnly,
                                    }
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                      )}

                    {cardList.length > 1 && (
                      <div
                        title={
                          field.is_expanded
                            ? t("table.collapse")
                            : t("table.showAll")
                        }
                        className="flex items-center justify-center mt-4 cursor-pointer text-[#0077c0] text-sm"
                        onClick={(e) => {
                          field.is_expanded = !field.is_expanded;
                          setModalDataByKeys({ [field.key]: cardList });
                        }}
                      >
                        {field.is_expanded && t("table.collapse")}
                        {!field.is_expanded &&
                          "+" +
                            (cardList.length - 1) +
                            " " +
                            t("table.items") +
                            "..."}
                      </div>
                    )}
                  </div>

                  {!isReadOnly &&
                    !field.is_freeze_count &&
                    Object.values(cardList).length < max && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 w-[150px]"
                        onClick={() => {
                          const updatedList = [
                            ...Object.values(cardList),
                            field.default ?? {},
                          ];
                          if (updatedList.length > max) {
                            pushAlert({
                              type: "warning",
                              message: t("error.MAX_LENGTH_EXCEEDED", {
                                key: field.text,
                                max: max,
                              }),
                            });
                            return;
                          }
                          field.is_expanded = true;
                          setModalDataByKeys({ [field.key]: updatedList });
                        }}
                      >
                        {t("button.add")}
                      </Button>
                    )}
                </div>
              );
            default:
              return inputComponentBuilder(field, {
                ...modal.options,
                is_readonly: isReadOnly,
              });
          }
        })}
      </div>
    </div>
  );
}
