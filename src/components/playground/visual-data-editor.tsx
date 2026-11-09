"use client";

import * as React from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";
import { AlertTriangle, LoaderCircle, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SqlValue, TableDataEdit } from "@/lib/database/types";
import { buildTableEditStatements } from "@/lib/database/visual-sql";
import { useDatabaseStore } from "@/store/database-store";

type DraftRow = { key: string; rowId?: number; values: SqlValue[]; original: SqlValue[]; isNew: boolean };
const sameValue = (left: SqlValue, right: SqlValue) => left instanceof Uint8Array && right instanceof Uint8Array ? left.length === right.length && left.every((value, index) => value === right[index]) : left === right;

function parseCell(raw: string, type: string): SqlValue {
  if (raw === "") return null;
  if (type.includes("INT")) { const value = Number(raw); if (!Number.isSafeInteger(value)) throw new Error(`“${raw}” is not a valid integer.`); return value; }
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) { const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`“${raw}” is not a valid number.`); return value; }
  return raw;
}

export function VisualDataEditor() {
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const schema = useDatabaseStore((state) => state.selectedSchema);
  const records = useDatabaseStore((state) => state.editableRecords);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const saveTableEdits = useDatabaseStore((state) => state.saveTableEdits);
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [deleted, setDeleted] = React.useState<number[]>([]);
  const [filter, setFilter] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(records ? records.values.map((values, index) => ({ key: `row-${records.rowIds[index]}`, rowId: records.rowIds[index], values: [...values], original: [...values], isNew: false })) : []);
    setDeleted([]); setFilter(""); setError(null);
  }, [records]);

  const updateCell = React.useCallback((key: string, index: number, raw: string) => {
    setError(null);
    try {
      const value = parseCell(raw, schema?.columns[index]?.type ?? "TEXT");
      setRows((current) => current.map((row) => row.key === key ? { ...row, values: row.values.map((cell, cellIndex) => cellIndex === index ? value : cell) } : row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid value."); }
  }, [schema]);

  const columns = React.useMemo<ColumnDef<DraftRow>[]>(() => [
    { id: "row", header: "#", cell: ({ row }) => row.index + 1 },
    ...(schema?.columns.map((column, index) => ({ id: column.name, header: column.name, accessorFn: (row: DraftRow) => row.values[index], cell: ({ row }: { row: { original: DraftRow } }) => {
      const value = row.original.values[index];
      const blob = value instanceof Uint8Array || column.type.toUpperCase().includes("BLOB");
      return <input value={blob ? "BLOB values are protected" : value === null ? "" : String(value)} disabled={blob} onChange={(event) => updateCell(row.original.key, index, event.target.value)} placeholder="NULL" className="h-10 min-w-32 w-full bg-transparent px-2 font-mono text-[13px] outline-none focus:bg-primary/[.06] disabled:text-muted-foreground" aria-label={`${column.name} row ${row.original.key}`} />;
    } })) ?? []),
    { id: "actions", header: "", cell: ({ row }) => <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete row ${row.index + 1}`} onClick={() => { const item = row.original; if (item.rowId !== undefined) setDeleted((current) => [...current, item.rowId!]); setRows((current) => current.filter((candidate) => candidate.key !== item.key)); }}><Trash2 /></Button> },
  ], [schema, updateCell]);

  // TanStack Table intentionally exposes stateful functions that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, state: { globalFilter: filter }, onGlobalFilterChange: setFilter, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), globalFilterFn: (row, _id, value) => row.original.values.some((cell) => String(cell ?? "NULL").toLowerCase().includes(String(value).toLowerCase())) });

  const edits = React.useMemo<TableDataEdit[]>(() => [
    ...deleted.map((rowId) => ({ type: "delete" as const, rowId })),
    ...rows.flatMap((row): TableDataEdit[] => row.isNew ? [{ type: "insert", values: row.values }] : row.values.some((value, index) => !sameValue(value, row.original[index])) ? [{ type: "update", rowId: row.rowId!, values: row.values }] : []),
  ], [deleted, rows]);
  const statements = selectedTable && schema ? buildTableEditStatements(selectedTable, schema.columns.map((column) => column.name), edits) : [];

  const addRow = () => { if (!schema) return; setRows((current) => [...current, { key: `new-${crypto.randomUUID()}`, values: schema.columns.map(() => null), original: schema.columns.map(() => null), isNew: true }]); };
  const save = async () => {
    if (!selectedTable || !edits.length) return;
    if (deleted.length && !window.confirm(`Permanently delete ${deleted.length} row${deleted.length === 1 ? "" : "s"}? Changes are committed atomically.`)) return;
    try { await saveTableEdits(selectedTable, edits); toast.success("Table changes saved", { description: `${edits.length} protected operation${edits.length === 1 ? "" : "s"} committed.` }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save table changes."); }
  };

  if (!selectedTable || !schema) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><p className="text-sm font-semibold">Choose a table to edit</p><p className="mt-2 text-xs text-muted-foreground">Select a table in Database Explorer, then return to Visual data.</p></div></div>;
  if (!records) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><AlertTriangle className="mx-auto size-8 text-warning" /><p className="mt-3 text-sm font-semibold">This object is read-only</p><p className="mt-2 text-xs text-muted-foreground">Views and tables without row identifiers remain available in the SQL editor.</p></div></div>;

  return <section className="flex min-h-[calc(100vh-9rem)] flex-col bg-card/15">
    <header className="flex flex-wrap items-center gap-3 border-b p-4"><div><p className="text-sm font-semibold">Visual data editor · <span className="font-mono text-primary">{selectedTable}</span></p><p className="text-xs text-muted-foreground">Blank cells save as NULL. BLOB cells are protected.</p></div><div className="ml-auto flex gap-2"><Button variant="outline" size="sm" onClick={addRow}><Plus />Add row</Button><Button size="sm" onClick={() => void save()} disabled={!edits.length || isMutating}>{isMutating ? <LoaderCircle className="animate-spin" /> : <Save />}{isMutating ? "Saving…" : `Save changes${edits.length ? ` (${edits.length})` : ""}`}</Button></div></header>
    {deleted.length ? <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-tint px-4 py-2 text-xs text-warning"><AlertTriangle className="size-4" />{deleted.length} row deletion{deleted.length === 1 ? "" : "s"} pending. Saving is destructive and requires confirmation.</div> : null}
    {error ? <div className="border-b border-destructive/30 bg-destructive-tint px-4 py-2 text-[13px] text-destructive">{error}</div> : null}
    <div className="flex h-10 items-center gap-2 border-b px-4"><Search className="size-3.5 text-muted-foreground" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search records…" className="flex-1 bg-transparent text-[13px] outline-none" /><span className="text-xs text-muted-foreground">{table.getRowModel().rows.length} rows</span></div>
    <div className="workspace-scrollbar min-h-72 flex-1 overflow-auto"><Table className="min-w-max"><TableHeader className="sticky top-0 z-10 bg-table-header"><TableRow>{table.getHeaderGroups()[0].headers.map((header) => <TableHead key={header.id} className="border-r last:border-r-0">{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow></TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.original.key} className={row.original.isNew ? "border-l-4 border-l-success bg-success-tint" : ""}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="border-r p-0 last:border-r-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>
    <div className="border-t p-4"><p className="mb-2 text-[13px] font-semibold">Generated SQL preview <span className="font-normal text-muted-foreground">· values remain parameterized</span></p><pre className="max-h-40 overflow-auto rounded-xl border bg-code p-3 font-mono text-[13px] leading-6 text-code-foreground">{statements.length ? statements.map((statement) => `${statement.sql};\n-- params: ${JSON.stringify(statement.parameters)}`).join("\n") : "-- Edit a cell, add a row, or stage a deletion to preview SQL."}</pre></div>
  </section>;
}
