"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Link2, LockKeyhole, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ColumnSchema, SqlValue, TableSchema } from "@/lib/database/types";
import { sameSqlValue, visualCellKey, type VisualDraftRow } from "@/lib/database/visual-data-editor";
import { cn } from "@/lib/utils";

export function VisualRowNumber({ index, isNew, pendingDelete }: { index: number; isNew: boolean; pendingDelete: boolean }) {
  return <div className="flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 px-2 text-xs text-muted-foreground">
    <span>{index + 1}</span>
    {isNew ? <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">New</span> : null}
    {pendingDelete ? <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive">Delete</span> : null}
  </div>;
}

export function VisualColumnHeader({
  column,
  foreignKey,
  width,
  onResizePointer,
  onResizeKey,
}: {
  column: ColumnSchema;
  foreignKey: boolean;
  width: number;
  onResizePointer: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return <div className="relative flex min-h-12 items-center gap-2 pr-3" style={{ width }}>
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-[13px] font-semibold text-foreground" title={column.name}>{column.name}</span>
        {column.primaryKey ? <span className="inline-flex items-center gap-0.5 rounded bg-warning-tint px-1 py-0.5 text-[10px] font-bold text-warning"><KeyRound className="size-2.5" />PK</span> : null}
        {foreignKey ? <span className="inline-flex items-center gap-0.5 rounded bg-info-tint px-1 py-0.5 text-[10px] font-bold text-info"><Link2 className="size-2.5" />FK</span> : null}
      </div>
      <span className="mt-0.5 block truncate font-mono text-xs font-medium text-muted-foreground">{column.type || "TEXT"}{column.notNull ? " · NOT NULL" : ""}</span>
    </div>
    <div role="separator" aria-orientation="vertical" aria-label={`Resize ${column.name} column`} tabIndex={0} onPointerDown={onResizePointer} onKeyDown={onResizeKey} className="absolute inset-y-1 right-0 w-1.5 cursor-col-resize rounded bg-border/50 transition hover:bg-primary focus-visible:bg-primary focus-visible:outline-none" />
  </div>;
}

export function VisualEditableCell({
  draft,
  rowIndex,
  column,
  columnIndex,
  width,
  pendingDelete,
  error,
  selected,
  editing,
  onRef,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
}: {
  draft: VisualDraftRow;
  rowIndex: number;
  column: ColumnSchema;
  columnIndex: number;
  width: number;
  pendingDelete: boolean;
  error?: string;
  selected: boolean;
  editing: boolean;
  onRef: (element: HTMLInputElement | null) => void;
  onChange: (raw: string) => void;
  onFocus: (value: SqlValue) => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const value = draft.values[columnIndex];
  const blob = value instanceof Uint8Array || column.type.toUpperCase().includes("BLOB");
  const modified = !draft.isNew && !sameSqlValue(value, draft.original[columnIndex]);
  const displayValue = value === null ? "" : String(value);
  const [rawValue, setRawValue] = React.useState(displayValue);

  React.useEffect(() => {
    if (!editing && !error) setRawValue(displayValue);
  }, [displayValue, editing, error]);

  return <div
    className={cn(
      "group/cell relative min-h-11 border border-transparent bg-table transition hover:bg-hover",
      selected && "z-[1] border-primary ring-1 ring-inset ring-primary/60",
      editing && "bg-selected shadow-[inset_0_0_0_1px_var(--primary)]",
      modified && "border-l-2 border-l-warning bg-warning-tint",
      draft.isNew && "bg-success-tint",
      pendingDelete && "bg-destructive-tint opacity-75",
      error && "border-destructive bg-destructive-tint ring-1 ring-inset ring-destructive/45",
    )}
    style={{ width }}
    title={blob ? "BLOB editing is not supported in the visual editor. Use parameterized SQL for binary values." : modified ? "Modified cell" : "Click to edit"}
  >
    {blob ? <div className="flex min-h-10 items-center gap-2 px-3 font-mono text-xs text-muted-foreground"><LockKeyhole className="size-3.5" /><span>BLOB · read only</span></div> : <input
      ref={onRef}
      value={rawValue}
      disabled={pendingDelete}
      onChange={(event) => { setRawValue(event.target.value); onChange(event.target.value); }}
      onFocus={() => onFocus(value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder="NULL"
      aria-label={`${column.name}, row ${rowIndex + 1}`}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${draft.key}-${columnIndex}-error` : undefined}
      className="h-10 w-full min-w-28 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
    />}
    {modified ? <span className="absolute right-1 top-1 inline-flex items-center gap-1 rounded bg-warning/15 px-1 text-[10px] font-bold text-warning" aria-label="Modified cell"><span aria-hidden>●</span><span className="sr-only">Modified</span></span> : null}
    {!blob && !editing && !pendingDelete ? <Pencil className="pointer-events-none absolute bottom-1.5 right-1.5 size-3 text-muted-foreground opacity-0 transition group-hover/cell:opacity-70" aria-hidden /> : null}
    {error ? <p id={`${draft.key}-${columnIndex}-error`} className="border-t border-destructive/20 px-2 py-1 text-xs leading-4 text-destructive" role="alert">{error}</p> : null}
  </div>;
}

export function VisualRowActions({
  draft,
  rowIndex,
  pendingDelete,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onCancelDelete,
}: {
  draft: VisualDraftRow;
  rowIndex: number;
  pendingDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  return <div className="relative flex min-h-11 items-center justify-center" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false); }}>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Row ${rowIndex + 1} actions`} aria-haspopup="menu" aria-expanded={open} onClick={() => onOpenChange(!open)}><MoreHorizontal /></Button>
    {open ? <div role="menu" aria-label={`Actions for row ${rowIndex + 1}`} className="absolute right-1 top-10 z-30 w-44 rounded-lg border bg-popover p-1.5 shadow-xl">
      {!pendingDelete ? <button type="button" role="menuitem" onClick={onEdit} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Pencil className="size-3.5" />Edit Row</button> : null}
      {pendingDelete ? <button type="button" role="menuitem" onClick={onCancelDelete} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><RotateCcw className="size-3.5" />Cancel Deletion</button> : <button type="button" role="menuitem" onClick={onDelete} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition hover:bg-destructive-tint"><Trash2 className="size-3.5" />{draft.isNew ? "Remove New Row" : "Delete Row"}</button>}
    </div> : null}
  </div>;
}

export type VisualColumnConfig = {
  schema: TableSchema;
  deletedSet: ReadonlySet<number>;
  columnWidths: Record<string, number>;
  cellErrors: Record<string, string>;
  selectedCell: string | null;
  editingCell: string | null;
  openRowMenu: string | null;
  setInputRef: (cellKey: string, element: HTMLInputElement | null) => void;
  updateCell: (rowKey: string, columnIndex: number, raw: string) => void;
  focusCell: (rowIndex: number, columnIndex: number) => void;
  onCellFocus: (cellKey: string, value: SqlValue) => void;
  onCellBlur: (cellKey: string) => void;
  onCellKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, draft: VisualDraftRow, rowIndex: number, columnIndex: number, cellKey: string) => void;
  onResizePointer: (event: React.PointerEvent<HTMLDivElement>, columnName: string) => void;
  onResizeKey: (event: React.KeyboardEvent<HTMLDivElement>, columnName: string) => void;
  setOpenRowMenu: (key: string | null) => void;
  markDeleted: (row: VisualDraftRow) => void;
  cancelDeletion: (rowId: number) => void;
};

export function createVisualDataColumns(config: VisualColumnConfig): ColumnDef<VisualDraftRow>[] {
  const dataColumns: ColumnDef<VisualDraftRow>[] = config.schema.columns.map((column, columnIndex) => ({
    id: column.name,
    accessorFn: (row) => row.values[columnIndex],
    header: () => <VisualColumnHeader
      column={column}
      foreignKey={config.schema.foreignKeys.some((item) => item.fromColumn === column.name)}
      width={config.columnWidths[column.name] ?? 176}
      onResizePointer={(event) => config.onResizePointer(event, column.name)}
      onResizeKey={(event) => config.onResizeKey(event, column.name)}
    />,
    cell: ({ row }) => {
      const draft = row.original;
      const cellKey = visualCellKey(draft.key, columnIndex);
      const pendingDelete = draft.rowId !== undefined && config.deletedSet.has(draft.rowId);
      return <VisualEditableCell
        draft={draft}
        rowIndex={row.index}
        column={column}
        columnIndex={columnIndex}
        width={config.columnWidths[column.name] ?? 176}
        pendingDelete={pendingDelete}
        error={config.cellErrors[cellKey]}
        selected={config.selectedCell === cellKey}
        editing={config.editingCell === cellKey}
        onRef={(element) => config.setInputRef(cellKey, element)}
        onChange={(raw) => config.updateCell(draft.key, columnIndex, raw)}
        onFocus={(value) => config.onCellFocus(cellKey, value)}
        onBlur={() => config.onCellBlur(cellKey)}
        onKeyDown={(event) => config.onCellKeyDown(event, draft, row.index, columnIndex, cellKey)}
      />;
    },
  }));

  return [
    {
      id: "row",
      header: "#",
      cell: ({ row }) => <VisualRowNumber
        index={row.index}
        isNew={row.original.isNew}
        pendingDelete={row.original.rowId !== undefined && config.deletedSet.has(row.original.rowId)}
      />,
    },
    ...dataColumns,
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const draft = row.original;
        const pendingDelete = draft.rowId !== undefined && config.deletedSet.has(draft.rowId);
        return <VisualRowActions
          draft={draft}
          rowIndex={row.index}
          pendingDelete={pendingDelete}
          open={config.openRowMenu === draft.key}
          onOpenChange={(open) => config.setOpenRowMenu(open ? draft.key : null)}
          onEdit={() => { config.setOpenRowMenu(null); config.focusCell(row.index, 0); }}
          onDelete={() => config.markDeleted(draft)}
          onCancelDelete={() => { if (draft.rowId !== undefined) config.cancelDeletion(draft.rowId); }}
        />;
      },
    },
  ];
}
