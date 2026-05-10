import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  IconArrowDown,
  IconArrowUp,
  IconCaretUpDownFilled,
} from "@tabler/icons-react";
import { Column } from "./data-table";

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column;
  title: string;
  sort?: any;
  setSort?: (sort: any) => void;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  sort,
  setSort,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.sort) {
    return <div className={cn(className)}>{title}</div>;
  }
  if (!setSort) {
    setSort = () => {};
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
      >
        <span>{title}</span>
        <div
          onClick={() => {
            if (sort[column.id] === "asc") {
              setSort({ [column.id]: "desc" });
            } else if (sort[column.id] === "desc") {
              setSort({});
            } else {
              setSort({ [column.id]: "asc" });
            }
          }}
        >
          {sort[column.id] === "desc" ? (
            <IconArrowDown className="ml-2 h-4 w-4" />
          ) : sort[column.id] === "asc" ? (
            <IconArrowUp className="ml-2 h-4 w-4" />
          ) : (
            <IconCaretUpDownFilled className="ml-2 h-4 w-4" />
          )}
        </div>
      </Button>
    </div>
  );
}
