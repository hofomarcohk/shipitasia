import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { utils } from "@/cst/utils";
import { cn } from "@/lib/utils";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import { Table } from "@tanstack/react-table";
import { useTranslations } from "next-intl";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  pageNo: number;
  pageSize: number;
  setPageNo: (pageNo: number) => void;
  setPageSize: (pageSize: number) => void;
  dataCount: number;
}

export function DataTablePagination<TData>({
  table,
  pageNo,
  pageSize,
  setPageNo,
  setPageSize,
  dataCount,
}: DataTablePaginationProps<TData>) {
  const pageCount = table.getPageCount();
  const selectRowCount = table.getFilteredSelectedRowModel().rows.length;
  const t = useTranslations();
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2",
        pageCount == 0 ? "hidden" : ""
      )}
    >
      <div className="flex text-sm text-muted-foreground">
        {t("table.total")} {dataCount} {t("table.items")}
        <div className={"mx-1" + (selectRowCount ? "" : " hidden")}>
          | {selectRowCount + " " + t("table.item_selected")}
        </div>
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium hidden md:inline-block">
            {t("table.item_per_page")}
          </p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              setPageSize(Number(value));
              localStorage.setItem("pageSize", `${value}`);
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {utils.PAGE_SIZE.map((p) => (
                <SelectItem key={p} value={`${p}`}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          {t("table.page")} {pageNo} / {pageCount}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => setPageNo(1)}
            disabled={pageNo == 1}
          >
            <span className="sr-only">{t("table.first_page")}</span>
            <IconChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageNo(Math.max(pageNo - 1, 1))}
            disabled={pageNo == 1}
          >
            <span className="sr-only">{t("table.previous_page")}</span>
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageNo(Math.min(pageNo + 1, pageCount))}
            disabled={pageNo == pageCount}
          >
            <span className="sr-only">{t("table.next_page")}</span>
            <IconChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => {
              setPageNo(pageCount);
            }}
            disabled={pageNo == pageCount}
          >
            <span className="sr-only">{t("table.last_page")}</span>
            <IconChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
