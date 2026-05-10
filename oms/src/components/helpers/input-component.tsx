"use client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  IconChevronDown,
  IconChevronLeftPipe,
  IconChevronRightPipe,
  IconChevronUp,
  IconDots,
  IconX,
} from "@tabler/icons-react";
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Checkbox } from "../ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { MultiSelect } from "../ui/multi-select";
import { ModalLabel } from "./modal-label";
import { checkConditions } from "./utils";

interface InputComponentProps<TData, TValue> {
  modal: any;
  getModalDataByKey: (key?: string) => any;
  setModalDataByKeys: (modalData: any) => void;
  tableBuilder: any;
}

export function InputComponentBuilder<TData, TValue>({
  modal,
  getModalDataByKey,
  setModalDataByKeys,
  tableBuilder,
}: InputComponentProps<TData, TValue>) {
  const t = useTranslations();
  const defaultPlaceholder: {
    [key: string]: string;
  } = {
    email: "example@email.com",
    sample: t("table.no_data"),
    remarks: t("utils.remarks"),
  };
  const alertManagerRef = useRef<any>(null);
  const creditCardRef = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const [isMasked, setIsMasked] = useState(true);

  const pushAlert = (alert: {
    type: string;
    message: string;
    time?: number;
  }) => {
    if (alertManagerRef.current) {
      alertManagerRef.current.pushAlert(alert);
    }
  };

  const inputComponentBuilder = (field: any, options: any) => {
    const fieldText = field?.text?.replace(/({.*?})/g, (match: any) => {
      const key = match.replace(/[{}]/g, "");
      return getModalDataByKey(key) || "";
    });
    const fieldDescription = field?.description?.replace(
      /({.*?})/g,
      (match: any) => {
        const key = match.replace(/[{}]/g, "");
        return getModalDataByKey(key) || "";
      }
    );
    const fieldClass = field.className ?? "col-span-1 mb-4";
    const fieldKey =
      modal.id +
      "_" +
      (field.key && field.key.length > 0
        ? field.key
        : Math.random().toString(36).substring(7));
    const isReadOnly =
      field.is_readonly ??
      options?.is_readonly ??
      options?.readonly_fields?.includes(field.key) ??
      (options?.readonly
        ? checkConditions(getModalDataByKey, options?.readonly)
        : false);

    const isRequired = field.is_required ?? false;
    const placeholder =
      field.placeholder ?? defaultPlaceholder[field.type] ?? "";

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

    const modalValue = getModalDataByKey(field.key) ?? field.default;
    const max = field?.max ?? 10;
    const min = field?.min ?? 0;
    let cardList =
      getModalDataByKey(field.key) ??
      // form min array
      new Array(min).fill({}).map(() => ({
        ...field.default,
      }));

    if (field.type == "select_card") {
      if (cardList && !cardList?.find((card: any) => card.isDefault)) {
        // set default card to first card
        if (cardList.length > 0) {
          cardList[0].isDefault = true;
          setTimeout(() => {
            setModalDataByKeys({ [field.key]: cardList });
          });
        }
      }
    }

    const fields = field.fields ?? [];

    const imageHandler = (e: any) => {
      {
        e.preventDefault();
        e.stopPropagation();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => {
          uploadImage(e);
        };
        input.click();
      }
    };

    const uploadImage = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setModalDataByKeys({ [field.key]: reader.result });
      };
    };

    let optionClasses = "";

    const onClickHandler = () => {
      if (field.onClick) {
        field.onClick(getModalDataByKey, setModalDataByKeys, pushAlert);
      }
    };

    const onSubmitHandler = (e: any) => {
      if (field.onSubmit && e.key === "Enter") {
        field.onSubmit(getModalDataByKey);
      }
    };
    // const [fieldAttr, setFieldAttr] = useState<{ [key: string]: any }>({});

    switch (field.type) {
      case "title":
        return (
          <div key={fieldKey} id={field.id ?? fieldKey} className="col-span-2 ">
            <h2>{fieldText}</h2>
            <hr className="my-4" />
          </div>
        );

      case "alert":
        return (
          <div
            key={fieldKey}
            id={field.id ?? fieldKey}
            className="col-span-2 mb-3"
          >
            <Alert
              variant={field.variant ?? "destructive"}
              className={cn(field.className)}
            >
              {field.icon}
              <AlertTitle>{fieldText}</AlertTitle>
              {fieldDescription && (
                <AlertDescription>{fieldDescription}</AlertDescription>
              )}
            </Alert>
          </div>
        );

      case "date":
        const date = getModalDataByKey(field.key);
        return (
          <div key={fieldKey} className={cn(fieldClass, "relative")}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            {fieldDescription && <> {fieldDescription}</>}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal hover:bg-gray-100 dark:hover:bg-gray-800",
                    !date && "text-muted-foreground",
                    isReadOnly && "bg-gray-100 dark:bg-gray-800"
                  )}
                  disabled={isReadOnly}
                >
                  <CalendarIcon color="#ccc" />
                  {date && new Date(date).toLocaleDateString("en-GB")}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 "
                style={{ pointerEvents: "auto" }}
              >
                <div>
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={
                      !isReadOnly
                        ? (date) => {
                            setModalDataByKeys({ [field.key]: date });
                          }
                        : undefined
                    }
                    initialFocus
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );

      case "textarea":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            {fieldDescription && <> {fieldDescription}</>}
            <textarea
              className="input w-full resize-y border border-gray-300 rounded-md p-2 placeholder:text-[12px]"
              placeholder={fieldText}
              readOnly={isReadOnly}
              required={isRequired}
              disabled={isReadOnly}
              onChange={(e) => {
                setModalDataByKeys({ [field.key]: e.target.value });
              }}
              value={modalValue ?? ""}
            />
          </div>
        );

      case "select":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <div className="flex items-center justify-start px-1">
              {field.l_side && (
                <div className={field.l_className ?? "mr-1"}>
                  {field.l_side}
                </div>
              )}
              <Select
                disabled={isReadOnly}
                value={modalValue ?? ""}
                onValueChange={(value: any) => {
                  setModalDataByKeys({ [field.key]: value });
                  if (field.onChange) {
                    field.onChange(
                      getModalDataByKey,
                      setModalDataByKeys,
                      value,
                      pushAlert
                    );
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="-----" />
                </SelectTrigger>
                <SelectContent>
                  {field.data.map((option: any) => {
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "multiselect":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <MultiSelect
              options={field.data}
              defaultValue={modalValue ?? []}
              onValueChange={(value: any) => {
                setModalDataByKeys({ [field.key]: value });
              }}
              placeholder="-----"
              variant="inverted"
              animation={2}
              maxCount={3}
              disabled={isReadOnly}
            />
          </div>
        );

      case "radio":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <RadioGroup defaultValue="comfortable">
              {field.options.map((option: { value: string; label: string }) => {
                return (
                  <div
                    key={fieldKey + "_" + option.value}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <Label htmlFor={option.value}>{option.label}</Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
        );

      case "br":
        return <div key={fieldKey} className="col-span-2"></div>;

      case "hr":
        return <hr key={fieldKey} className="my-2 col-span-2" />;

      case "table":
        return (
          <div key={fieldKey} className={cn(fieldClass, "col-span-2")}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            {tableBuilder(field.columns, field)}
          </div>
        );

      case "checkbox":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <Checkbox
              checked={modalValue ?? false}
              onClick={() => {
                setModalDataByKeys({ [field.key]: !(modalValue ?? false) });
              }}
            />
          </div>
        );

      case "switch":
        return (
          <div
            key={fieldKey}
            className={fieldClass}
            onClick={() => {
              setModalDataByKeys({ [field.key]: !(modalValue ?? false) });
            }}
          >
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <div className="text-base">
                  <ModalLabel
                    text={fieldText}
                    isRequired={isRequired}
                    description={fieldDescription}
                  />
                </div>
              </div>
              <div>
                <Switch checked={modalValue ?? false} />
              </div>
            </div>
          </div>
        );

      case "avatar":
        optionClasses += "rounded-full";
      case "image":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <div
              className={cn(
                "flex items-center justify-center  overflow-hidden",
                "m-auto cursor-pointer hover:opacity-75 w-[150px] h-[150px]"
              )}
            >
              <img
                title={t("button.upload")}
                src={modalValue ?? "/img/no_image.jpeg"}
                alt={fieldText}
                className={cn("w-full h-full object-cover ", optionClasses)}
                onClick={imageHandler}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "/img/no_image.jpeg";
                }}
              />
            </div>
          </div>
        );

      case "plain":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
              options={options}
            />
            <div
              className={cn(
                "flex items-center",
                field.textClassName ?? "justify-start"
              )}
            >
              {field.l_icon && field.l_icon}
              <div>{modalValue ?? ""}</div>
              <div onClick={onClickHandler}>{field.r_icon && field.r_icon}</div>
            </div>
          </div>
        );

      case "split":
        return (
          <div className={cn("flex px-1", fieldClass)} key={field.key}>
            {field.splits &&
              field.splits.map((split: any, index: number) => (
                <div
                  key={field.key + "_" + index}
                  className={cn(
                    "grid grid-cols-2 gap-x-4 px-1 w-full content-start",
                    split.className
                  )}
                >
                  {split.fields.map((subfield: any) => {
                    return inputComponentBuilder(subfield, {
                      ...options,
                      isSubField: true,
                    });
                  })}
                </div>
              ))}
          </div>
        );

      case "tab":
        field.tabs.forEach((tab: any, i: number) => {
          tab.value =
            tab?.value ??
            tab?.text.replace(/\s+/g, "_").toLowerCase() ??
            "tab_" + i;
        });

        const defaultTab = field.defaultTab ?? field.tabs[0].value ?? "tab_0";
        return (
          <div
            className={cn("grid grid-cols-2 gap-x-4 px-1", fieldClass)}
            key={field.key}
          >
            <Tabs
              value={getModalDataByKey(field.key) ?? defaultTab}
              className="w-full col-span-2"
            >
              <TabsList>
                {field.tabs.map((tab: any, i: number) => {
                  return (
                    <TabsTrigger
                      value={tab.value}
                      key={"tab_trigger_" + tab.value}
                      onClick={() => {
                        setModalDataByKeys({ [field.key]: tab.value });
                      }}
                    >
                      {tab.text}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {field.tabs.map((tab: any, i: number) => {
                return (
                  <TabsContent
                    key={"tab_content_" + tab.value}
                    value={tab.value}
                  >
                    <div
                      key={field.key + "_" + i}
                      className={cn(
                        "grid grid-cols-2 gap-x-4 px-1 w-full content-start",
                        tab.className
                      )}
                    >
                      {tab.fields.map((subfield: any) => {
                        return inputComponentBuilder(subfield, options);
                      })}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
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
                Object.values(cardList).map((card: any, index: number) => {
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
                          {cardList.length > 1 && cardList.is_sequential && (
                            <div className={cn("flex gap-2")}>
                              <div
                                className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                                title={t("button.moveUp")}
                                onClick={() => {
                                  const updatedList = [...cardList];
                                  const temp = updatedList[index - 1];
                                  updatedList[index - 1] = updatedList[index];
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
                                  updatedList[index + 1] = updatedList[index];
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
                                    updatedList[updatedList.length - 1];
                                  updatedList[updatedList.length - 1] =
                                    updatedList[index];
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
                          <div className="hidden" title={t("button.more")}>
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

                          {cardList.length > min && (
                            <div
                              className="hover:cursor-pointer hover:scale-110 transition-all duration-200 opacity-50 hover:opacity-100 "
                              title={t("button.delete")}
                              onClick={() => {
                                const updatedList = [...cardList];
                                if (updatedList.length <= min) {
                                  pushAlert({
                                    type: "warning",
                                    message: t("error.MIN_LENGTH_EXCEEDED", {
                                      key: field.text,
                                      min: min,
                                    }),
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
                            field.key + "." + index + "." + subfield.key;
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
                })}

              {cardList.length > 1 && (
                <div
                  title={
                    field.is_expanded ? t("table.collapse") : t("table.showAll")
                  }
                  className="flex items-center justify-center mt-4 cursor-pointer text-[#0077c0] text-sm"
                  onClick={(e) => {
                    field.is_expanded = !field.is_expanded;
                    setModalDataByKeys({ [field.key]: cardList });
                  }}
                >
                  {field.is_expanded && t("table.collapse")}
                  {!field.is_expanded &&
                    "+" + (cardList.length - 1) + t("table.items") + "..."}
                </div>
              )}
            </div>

            {!isReadOnly && Object.values(cardList).length < max && (
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

      case "select_card":
        return (
          <div key={field.key} className={cn(fieldClass)}>
            <div className="flex items-center justify-between mb-2">
              <ModalLabel
                text={field.text}
                isRequired={isRequired}
                description={field.description}
              />
            </div>
            <div className={cn("mt-2")}>
              {cardList &&
                Object.values(cardList).map((card: any, index: number) => {
                  return (
                    <div
                      key={index}
                      className={cn(
                        "border p-4 rounded-lg mb-4 relative",
                        card.isDefault && "border-accent-foreground",
                        !card.isDefault && "hover:border-accent",
                        !field.is_expanded && !card.isDefault && "hidden"
                      )}
                      onClick={(e) => {
                        cardList.forEach((item: any, i: number) => {
                          item.isDefault = false;
                          if (i === index) {
                            item.isDefault = true;
                          }
                        });
                        setModalDataByKeys({ [field.key]: cardList });
                        onClickHandler();
                      }}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-1 ">
                        {fields.map((subfield: any) => {
                          const key =
                            field.key + "." + index + "." + subfield.key;
                          return inputComponentBuilder(
                            { ...subfield, key },
                            { ...modal.options, is_readonly: isReadOnly }
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              {cardList.length > 1 && (
                <div
                  title={
                    field.is_expanded ? t("table.collapse") : t("table.select")
                  }
                  className="flex items-center justify-center mt-4 cursor-pointer text-[#0077c0] text-sm"
                  onClick={(e) => {
                    field.is_expanded = !field.is_expanded;
                    setModalDataByKeys({ [field.key]: cardList });
                  }}
                >
                  {field.is_expanded && t("table.collapse")}
                  {!field.is_expanded && t("table.select")}
                </div>
              )}
            </div>
          </div>
        );

      case "button":
        return (
          <div title={field.text} key={fieldKey} className={cn(fieldClass, "")}>
            <Button
              type="button"
              className={cn(
                fieldClass,
                "w-full flex justify-center items-center"
              )}
              onClick={onClickHandler}
            >
              {field.icon && <div className="w-[10px]">{field.icon}</div>}
              <div className="line-clamp-1 overflow-hidden">{fieldText}</div>
            </Button>
          </div>
        );

      case "icon":
        return (
          <div
            title={fieldText}
            key={fieldKey}
            className={cn(fieldClass, "")}
            onClick={onClickHandler}
          >
            {field.icon && <div className="w-[10px]">{field.icon}</div>}
          </div>
        );

      case "credit_card":
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => {
                const start = i * 4;
                const fieldValue = (modalValue || "").replace(/\s/g, "");
                return (
                  <Input
                    ref={creditCardRef[i]}
                    key={field.key + "_" + i}
                    id={field.key}
                    type={isMasked && i != 3 ? "password" : "text"}
                    placeholder={placeholder}
                    readOnly={isReadOnly}
                    required={isRequired}
                    className={cn(
                      isReadOnly ||
                        (isMasked && "bg-gray-100 dark:bg-gray-800"),
                      "text-center"
                    )}
                    disabled={isReadOnly || isMasked}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\s/g, "");
                      e.target.value = value;
                      let newValue = fieldValue.slice(0, start) + value;
                      // if (value.length < 4) {
                      //   newValue += fieldValue.slice(
                      //     start + value.length,
                      //     fieldValue.length
                      //   );
                      // }

                      setModalDataByKeys({ [field.key]: newValue });
                      if (newValue.length > i * 4 + 4) {
                        creditCardRef[i + 1].current?.focus();
                      }

                      if (newValue.length == 16) {
                        setIsMasked(true);
                      }
                    }}
                    value={modalValue?.slice(i * 4, (i + 1) * 4) ?? ""}
                  />
                );
              })}
            </div>
            <div className="text-right">
              <button
                onClick={() => {
                  setIsMasked(false);
                  setModalDataByKeys({ [field.key]: "" });
                  setTimeout(() => {
                    creditCardRef[0].current?.focus();
                  });
                }}
                className="text-sm"
              >
                {t("button.edit")}
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div key={fieldKey} className={fieldClass}>
            <ModalLabel
              text={fieldText}
              isRequired={isRequired}
              description={fieldDescription}
            />
            <div className="flex items-center justify-center px-1">
              {field.l_icon && field.l_icon}

              <div className="relative w-full">
                <div className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground">
                  {field.icon}
                </div>
                {!isReadOnly && modalValue && (
                  <div
                    className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer"
                    onClick={() => {
                      setModalDataByKeys({ [field.key]: "" });
                    }}
                  >
                    <IconX stroke={1} size={16} />
                  </div>
                )}
                <Input
                  id={field.key}
                  type={field.type}
                  placeholder={placeholder}
                  readOnly={isReadOnly}
                  required={isRequired}
                  className={cn(
                    isReadOnly && "bg-gray-100 dark:bg-gray-800",
                    field.icon && "pl-8"
                  )}
                  disabled={isReadOnly}
                  onChange={(e) => {
                    if (field.is_int) {
                      e.target.value = e.target.value.replace(/[^0-9]/g, "");
                    }
                    if (field.max) {
                      if (parseInt(e.target.value) > field.max) {
                        e.target.value = field.max;
                        pushAlert({
                          type: "warning",
                          message: t("error.MAX_VALUE_EXCEEDED", {
                            key: fieldText,
                            value: field.max,
                          }),
                        });
                      }
                    }
                    setModalDataByKeys({ [field.key]: e.target.value });
                  }}
                  onBlur={(e) => {
                    if (field.min) {
                      if (parseInt(e.target.value) < field.min) {
                        e.target.value = field.min;
                        pushAlert({
                          type: "warning",
                          message: t("error.MIN_VALUE_EXCEEDED", {
                            key: fieldText,
                            value: field.min,
                          }),
                        });
                        setModalDataByKeys({ [field.key]: field.min });
                      }
                    }
                  }}
                  value={modalValue ?? ""}
                  onKeyDown={onSubmitHandler}
                />
              </div>

              {field.r_icon && field.r_icon}
            </div>
          </div>
        );
    }
  };

  return inputComponentBuilder;
}
