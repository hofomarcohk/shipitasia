"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconX } from "@tabler/icons-react";
import { Table } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Column } from "./data-table";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  columnSettings: Column[];
  filters: any;
  setFilters: (filters: any) => void;
}

export function DataTableToolbar<TData>({
  table,
  columnSettings,
  filters,
  setFilters,
}: DataTableToolbarProps<TData>) {
  const isFiltered = filters && Object.keys(filters).length > 0;
  const t = useTranslations();
  const reset = t("table.reset");
  const text = {
    reset: t("table.reset"),
    item_selected: t("table.item_selected"),
    no_data: t("table.no_data"),
  };
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder={t("table.search")}
          value={filters.search || ""}
          onChange={(event) => {
            setFilters({
              ...filters,
              search: event.target.value,
            });
          }}
          className="h-8 w-[150px] lg:w-[250px]"
        />

        {columnSettings.map((columnSetting) => {
          return (
            columnSetting.filter &&
            columnSetting.data && (
              <DataTableFacetedFilter
                key={columnSetting.id}
                columnId={columnSetting.id}
                title={columnSetting.title}
                options={columnSetting.data || []}
                text={text}
                filters={filters}
                setFilters={setFilters}
              />
            )
          );
        })}

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => setFilters({})}
            className="h-8 px-2 lg:px-3"
          >
            {reset}
            <IconX className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
