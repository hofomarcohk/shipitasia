"use client";
import { cn } from "@/lib/utils";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Input } from "../ui/input";

interface TableBuilderProps<TData, TValue> {
  modal: any;
  getModalDataByKey: (key?: string) => any;
  setModalDataByKeys: (modalData: any) => void;
}

export function TableBuilder<TData, TValue>({
  modal,
  getModalDataByKey,
  setModalDataByKeys,
}: TableBuilderProps<TData, TValue>) {
  const [r, refresh] = useState<number>(0);
  const t = useTranslations();
  const [customContent, setCustomContent] = useState<any>({});

  return (columns: any, field: any = {}) => {
    const tableData = getModalDataByKey(field.key) ?? field.default ?? [];
    const isReadOnly = field.is_readonly ?? modal.options?.is_readonly ?? false;

    if (field?.options?.render) {
      field?.options?.render(setCustomContent);
    }

    return (
      <>
        <div
          className={cn(
            "pr-4 mb-4",
            field.options?.expanded ? "" : "overflow-auto max-h-[200px]"
          )}
        >
          <table className="w-full table-auto border-collapse border border-gray-300 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                {columns.map((column: any) => {
                  return (
                    <th
                      key={column.key}
                      className={cn(
                        "p-2 text-left border-b border-gray-300 text-[12px]",
                        column.className ?? ""
                      )}
                    >
                      {column.text}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Object.values(tableData).map((row: any, index: number) => {
                return (
                  <tr key={index}>
                    {columns.map((column: any, i: number) => {
                      const isReadOnly =
                        column.is_readonly ??
                        field.is_readonly ??
                        modal.options?.is_readonly ??
                        false;

                      let content: any = null;

                      switch (column.type) {
                        case "custom":
                          const contentId = column.contentId(row);
                          return (
                            <td key={column.key} className="p-1">
                              {customContent?.[contentId] ?? <></>}
                            </td>
                          );

                        default:
                          content = (
                            <Input
                              type={column.type}
                              placeholder={column.placeholder}
                              readOnly={isReadOnly}
                              className={cn(
                                isReadOnly && "bg-gray-100 dark:bg-gray-800",
                                column.className ?? ""
                              )}
                              disabled={isReadOnly}
                              onChange={(e) => {
                                let rowData = tableData[index];
                                rowData[column.key] = e.target.value;
                                tableData[index] = rowData;
                                setModalDataByKeys({ [field.key]: tableData });
                              }}
                              onKeyDown={(e) => {
                                if (column.is_int) {
                                  if (e.key === ".") {
                                    e.preventDefault();
                                  }
                                }
                              }}
                              value={row[column.key] ?? ""}
                            />
                          );
                      }

                      return (
                        <td key={column.key} className="p-1">
                          {content}
                        </td>
                      );
                    })}

                    {!isReadOnly && (
                      <td
                        className="p-1 text-center cursor-pointer"
                        onClick={() => {
                          const newTableData = tableData.filter(
                            (item: any, i: number) => i !== index
                          );
                          setModalDataByKeys({ [field.key]: newTableData });
                        }}
                      >
                        <IconTrash
                          className="text-red-500"
                          size={12}
                          title={t("button.delete")}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
              {tableData.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="p-2 text-center text-gray-500 text-[12px]"
                  >
                    {t("table.no_data")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="w-full flex mt-2 justify-between">
          {isReadOnly && <div></div>}
          {!isReadOnly && (
            <div
              title={t("table.add_row")}
              className={cn(
                "cursor-pointer text-[12px] text-blue-500 opacity-70",
                "hover:opacity-100 flex items-center "
              )}
              onClick={() => {
                const newRow = columns.reduce((acc: any, column: any) => {
                  acc[column.key] = column.default ?? "";
                  return acc;
                }, {});
                setModalDataByKeys({
                  [field.key]: [...Object.values(tableData), newRow],
                });
              }}
            >
              <IconPlus className="text-blue-500" size={12} />
              {t("table.add_row")}
            </div>
          )}
          {tableData.length > 0 && (
            <div
              title={
                field.options?.expanded
                  ? t("table.collapse")
                  : t("table.expand")
              }
              className={cn(
                "text-[12px] text-blue-500 opacity-70 cursor-pointer",
                "hover:opacity-100 flex items-center "
              )}
              onClick={() => {
                if (!field.options) {
                  field.options = {};
                }
                field.options.expanded = !field.options.expanded;
                refresh((r) => r + 1);
              }}
            >
              {!field.options?.expanded && t("table.expand")}
              {field.options?.expanded && t("table.collapse")}
            </div>
          )}
        </div>
      </>
    );
  };
}
