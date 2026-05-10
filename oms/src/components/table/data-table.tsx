"use client";

import {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { http_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert } from "@/types/Utils";
import { IconCheck, IconX } from "@tabler/icons-react";
import moment from "moment";
import { useTranslations } from "next-intl";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";

export type Column = {
  id: string;
  type: string;
  title: string;
  className?: string;
  filter?: boolean;
  sort?: boolean;
  data?: {
    label: string;
    value: string;
    icon?: React.ComponentType<{
      className?: string;
    }>;
    className?: string;
  }[];
  actions?: any[];
  options?: any;
};

type Header = {
  column: any;
  table: any;
};

interface DataTableProps<TData, TValue> {
  langCode: string;
  tableSettings: any;
  setModalData: any;
  setOpenModal: (value: boolean) => void;
  setActiveModalId: (value: string) => void;
  toRefreshTable: number;
  setMainTableData: (value: any[]) => void;
  setMainRowSelection: (value: any) => void;
  pushAlert: (alert: Alert) => void;
}

export function DataTable<TData, TValue>({
  langCode,
  tableSettings,
  setModalData,
  setOpenModal,
  setActiveModalId,
  toRefreshTable,
  setMainTableData,
  setMainRowSelection,
  pushAlert,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pageSize, setPageSize] = React.useState(10);
  const [pageNo, setPageNo] = React.useState(1);
  const [dataCount, setDataCount] = React.useState<number>(0);
  const [tableData, setTableData] = React.useState<TData[]>([]);
  const [filters, setFilters] = React.useState<any>({});
  const [sort, setSort] = React.useState<any>({});
  const t = useTranslations();
  const message = t("error.INTERNAL_SERVER_ERROR"); // DEFAULT_ERROR_MESSAGE

  const formTableColumns = (columns: Column[]) => {
    return columns.map((c) => {
      let header = ({ column }: Header) => (
        <DataTableColumnHeader
          column={c}
          title={c.title}
          sort={sort}
          setSort={setSort}
        />
      );

      let cell = (row: any) => (
        <div className={c.className}>{row.getValue(c.id)}</div>
      );

      switch (c.type) {
        case "select":
          header = ({ table }: Header) => (
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label="Select all"
              className="translate-y-[2px]"
            />
          );
          cell = ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              className="translate-y-[2px]"
            />
          );
          break;
        case "boolean":
          header = ({ column }: Header) => (
            <DataTableColumnHeader
              column={column}
              title={c.title}
              sort={sort}
              setSort={setSort}
            />
          );
          cell = ({ row }) => {
            return (
              <div className="flex items-center space-x-2">
                {row.getValue(c.id) ? (
                  <span className="text-green-500">
                    <IconCheck stroke={1} size={16} />
                  </span>
                ) : (
                  <span className="text-red-500">
                    <IconX stroke={1} size={16} />
                  </span>
                )}
              </div>
            );
          };
          break;
        case "status":
          const classMap = (c.data || []).reduce((acc: any, item: any) => {
            acc[item.value] = item.className || "";
            return acc;
          }, {});
          const labelMap = (c.data || []).reduce((acc: any, item: any) => {
            acc[item.value] = item.label;
            return acc;
          }, {});
          cell = (r: any) => {
            let label = "";
            const rValue = r.getValue(c.id);
            if (typeof rValue === "string") {
              label = labelMap[rValue];
            } else {
              if (rValue) {
                if (rValue.length == 1) {
                  label = labelMap[rValue];
                }
                if (rValue.length > 1) {
                  label = labelMap[rValue[0]];
                }
              }
            }

            return (
              <div className="flex items-center space-x-1">
                <Badge
                  className={cn(
                    classMap[r.getValue(c.id)] && "text-white",
                    classMap[r.getValue(c.id)] || ""
                  )}
                >
                  {label}
                </Badge>
                {rValue && typeof rValue != "string" && rValue.length > 1 && (
                  <span
                    title={rValue && rValue.length - 1 + "+"}
                    className={cn(
                      "inline-flex items-center rounded-md bg-gray-50 ",
                      "px-2 py-1 text-xs font-medium text-gray-600 ",
                      "ring-1 ring-gray-500/10 ring-inset",
                      "cursor-pointer hover:bg-gray-100"
                    )}
                  >
                    ...
                  </span>
                )}
              </div>
            );
          };
          break;
        case "date":
          cell = ({ row }: { row: any }) => {
            const dateFormat = moment(row.getValue(c.id)).format(
              c?.options?.format ?? "YYYY-MM-DD HH:mm:ss"
            );
            return (
              <div className="flex items-center space-x-2">
                {row.getValue(c.id) && <span>{dateFormat}</span>}
              </div>
            );
          };
          break;
        case "actions":
          cell = ({ row }: { row: any }) => {
            return (
              <div className="flex items-center space-x-2">
                {c.actions &&
                  c.actions.map((action: any) => {
                    return (
                      <div key={"action_" + row.id + "_" + action.text}>
                        {action.icon && (
                          <action.icon
                            stroke={1}
                            title={action.text}
                            className={cn(
                              "w-5 h-5 cursor-pointer hover:scale-110 transition-all",
                              action.className ?? "text-gray-400"
                            )}
                            onClick={() => {
                              if (action.modal) {
                                setActiveModalId(action.modal);
                                setModalData({});
                                setModalData({ ...row.original });
                                setOpenModal(true);
                              }
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          };
          break;
      }

      return {
        accessorKey: c.id,
        header,
        cell,
        enableSorting: false,
        enableHiding: false,
      };
    });
  };
  const columns = formTableColumns(tableSettings.columns);
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
    pageCount: Math.ceil(dataCount / pageSize),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const refreshTable = async () => {
    if (tableSettings?.api) {
      const api = tableSettings.api;
      const langCode = localStorage.getItem("lang") || "en";
      const [method, url] = api.split(":");
      const param = tableSettings.params || {};
      const callApi = await http_request(
        method,
        url,
        {
          ...param,
          ...filters,
          pageSize,
          pageNo,
          sort,
        },
        {
          langCode,
        }
      );

      try {
        const json = await callApi.json();
        if (json?.status === 200) {
          setMainTableData(json.data.results);
          setTableData(json.data.results);
          setDataCount(json.data.count);
        } else {
          pushAlert({
            type: "error",
            message: json.message ?? message,
          });
        }
      } catch (e) {
        pushAlert({
          type: "error",
          message,
        });
      }
    }
  };

  React.useEffect(() => {
    const to = setTimeout(() => {
      refreshTable();
    }, 800);
    return () => clearTimeout(to);
  }, [pageSize, pageNo, filters, sort, toRefreshTable]);
  React.useEffect(() => {
    const storedPageSize = localStorage.getItem("pageSize");
    if (storedPageSize) {
      setPageSize(Number(storedPageSize));
    }
  }, []);

  React.useEffect(() => {
    setMainRowSelection(rowSelection);
  }, [rowSelection]);

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        columnSettings={tableSettings.columns}
        filters={filters}
        setFilters={setFilters}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {t("table.no_data")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        table={table}
        pageNo={pageNo}
        pageSize={pageSize}
        setPageNo={setPageNo}
        setPageSize={setPageSize}
        dataCount={dataCount}
      />
    </div>
  );
}
