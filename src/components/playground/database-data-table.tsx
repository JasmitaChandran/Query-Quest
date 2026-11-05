"use client";

import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QueryResult, SqlValue, TableRecords } from "@/lib/database/types";
import { cn } from "@/lib/utils";

type DataRow = {
  rowNumber: number;
  values: SqlValue[];
};

function formatSqlValue(value: SqlValue) {
  if (value === null) return <span className="font-mono text-[11px] text-muted-foreground">NULL</span>;
  if (value instanceof Uint8Array) {
    return <span className="font-mono text-[11px] text-muted-foreground">BLOB · {value.byteLength} B</span>;
  }
  return String(value);
}

export function DatabaseDataTable({
  result,
  label,
  presentation = false,
}: {
  result: QueryResult | TableRecords;
  label: string;
  presentation?: boolean;
}) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const data = React.useMemo<DataRow[]>(
    () => result.values.map((values, index) => ({ rowNumber: index + 1, values })),
    [result.values],
  );
  const columns = React.useMemo<ColumnDef<DataRow>[]>(
    () => [
      {
        id: "rowNumber",
        header: "#",
        accessorKey: "rowNumber",
        enableGlobalFilter: false,
        cell: ({ row }) => row.original.rowNumber,
      },
      ...result.columns.map((column, index) => ({
        id: `${column}-${index}`,
        header: column,
        accessorFn: (row: DataRow) => row.values[index],
        cell: ({ row }: { row: { original: DataRow } }) => formatSqlValue(row.original.values[index]),
      })),
    ],
    [result.columns],
  );

  // TanStack Table intentionally returns stateful functions that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      return row.original.values.some((value) => String(value ?? "NULL").toLowerCase().includes(search));
    },
  });

  const visibleRows = table.getRowModel().rows;

  return (
    <div className={cn("min-w-full", presentation && "text-base")}>
      <div className={cn("sticky left-0 top-0 z-[3] flex min-w-full items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur", presentation ? "h-12" : "h-10")}>
        <Search className="size-3.5 text-muted-foreground" />
        <label className="sr-only" htmlFor={`${label}-search`}>
          Search {label}
        </label>
        <input
          id={`${label}-search`}
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder={`Search ${label}…`}
          className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60", presentation ? "h-9 text-sm" : "h-7 text-xs")}
        />
        {globalFilter ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            onClick={() => setGlobalFilter("")}
            aria-label={`Clear ${label} search`}
          >
            <X />
          </Button>
        ) : null}
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {visibleRows.length} of {data.length}
        </span>
      </div>

      <Table className="min-w-max">
        <TableHeader className={cn("sticky z-[2] bg-card", presentation ? "top-12" : "top-10")}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header, index) => (
                <TableHead
                  key={header.id}
                  className={
                    index === 0
                      ? "w-12 border-r border-border/60 text-center"
                      : cn("border-r border-border/50 last:border-r-0", presentation ? "min-w-44 text-sm" : "min-w-32")
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell, index) => {
                  const value = index === 0 ? row.original.rowNumber : row.original.values[index - 1];
                  return (
                    <TableCell
                      key={cell.id}
                      className={
                        index === 0
                          ? "border-r border-border/60 text-center text-[10px] tabular-nums text-muted-foreground"
                          : cn("max-w-96 truncate border-r border-border/40 last:border-r-0", presentation ? "px-5 py-4 font-mono text-base" : "max-w-80 text-xs")
                      }
                      title={value === null ? "NULL" : String(value)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-muted-foreground">
                No rows match “{globalFilter}”.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
