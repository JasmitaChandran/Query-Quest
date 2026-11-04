"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Columns3, LoaderCircle, Plus, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SQLiteColumnType, SqlValue, TableColumnDefinition } from "@/lib/database/types";
import { buildCreateTableSql } from "@/lib/database/visual-sql";
import { useDatabaseStore } from "@/store/database-store";

const TYPES: SQLiteColumnType[] = ["INTEGER", "REAL", "TEXT", "BLOB", "NUMERIC"];
const newColumn = (index: number): TableColumnDefinition => ({ name: index === 0 ? "id" : `column_${index + 1}`, type: index === 0 ? "INTEGER" : "TEXT", primaryKey: index === 0, notNull: false, unique: false, hasDefault: false, defaultValue: null });

export function TableDesignerDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("new_table");
  const [columns, setColumns] = React.useState<TableColumnDefinition[]>([newColumn(0), newColumn(1)]);
  const [error, setError] = React.useState<string | null>(null);
  const createTable = useDatabaseStore((state) => state.createTable);
  const isMutating = useDatabaseStore((state) => state.isMutating);

  const definition = React.useMemo(() => ({ name, columns }), [columns, name]);
  let sql = "";
  try { sql = buildCreateTableSql(definition); } catch (cause) { sql = `-- ${cause instanceof Error ? cause.message : "Complete the table definition."}`; }
  const update = (index: number, patch: Partial<TableColumnDefinition>) => setColumns((current) => current.map((column, item) => item === index ? { ...column, ...patch } : column));
  const move = (index: number, direction: -1 | 1) => setColumns((current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });

  const submit = async () => {
    setError(null);
    try {
      await createTable(definition);
      toast.success("Table created", { description: `${name} is ready for visual data entry.` });
      setOpen(false); setName("new_table"); setColumns([newColumn(0), newColumn(1)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the table."); }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm"><Plus /><span className="hidden sm:inline">Create table</span></Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
      <div className="border-b p-6"><DialogHeader><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Table2 className="size-5" /></div><DialogTitle>Visual table designer</DialogTitle><DialogDescription>Define a SQLite table using safe identifiers and supported constraints. SQLite types use affinity and do not behave like strict MySQL VARCHAR lengths.</DialogDescription></DialogHeader></div>
      <div className="space-y-5 px-6"><label className="block text-xs font-semibold">Table name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>
        <div className="overflow-x-auto rounded-xl border"><div className="grid min-w-[820px] grid-cols-[40px_1.4fr_120px_repeat(4,88px)_80px] gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>#</span><span>Column</span><span>Type</span><span>Primary</span><span>Not null</span><span>Unique</span><span>Default</span><span>Actions</span></div>
          <div className="divide-y">{columns.map((column, index) => <div key={index} className="grid min-w-[820px] grid-cols-[40px_1.4fr_120px_repeat(4,88px)_80px] items-center gap-2 px-3 py-2"><span className="text-xs text-muted-foreground">{index + 1}</span><input value={column.name} onChange={(event) => update(index, { name: event.target.value })} className="h-9 rounded-lg border bg-background px-2 font-mono text-xs" /><select value={column.type} onChange={(event) => update(index, { type: event.target.value as SQLiteColumnType })} className="h-9 rounded-lg border bg-background px-2 text-xs">{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            <input type="checkbox" checked={column.primaryKey} onChange={(event) => { const checked = event.target.checked; setColumns((current) => current.map((item, itemIndex) => ({ ...item, primaryKey: itemIndex === index ? checked : checked ? false : item.primaryKey }))); }} aria-label={`Primary key for ${column.name}`} />
            <input type="checkbox" checked={column.notNull} onChange={(event) => update(index, { notNull: event.target.checked })} aria-label={`Not null for ${column.name}`} /><input type="checkbox" checked={column.unique} onChange={(event) => update(index, { unique: event.target.checked })} aria-label={`Unique for ${column.name}`} />
            <div className="flex items-center gap-1"><input type="checkbox" checked={column.hasDefault} onChange={(event) => update(index, { hasDefault: event.target.checked })} aria-label={`Default for ${column.name}`} />{column.hasDefault ? <input value={column.defaultValue === null ? "" : String(column.defaultValue)} onChange={(event) => { const raw = event.target.value; let value: SqlValue = raw; if (column.type === "INTEGER" || column.type === "REAL" || column.type === "NUMERIC") value = raw === "" ? null : Number(raw); update(index, { defaultValue: value }); }} className="h-8 w-16 rounded-md border bg-background px-1 text-[10px]" aria-label={`Default value for ${column.name}`} /> : null}</div>
            <div className="flex"><Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${column.name} up`}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === columns.length - 1} aria-label={`Move ${column.name} down`}><ArrowDown /></Button><Button variant="ghost" size="icon-sm" onClick={() => setColumns((current) => current.filter((_, item) => item !== index))} disabled={columns.length === 1} className="text-destructive" aria-label={`Delete ${column.name}`}><Trash2 /></Button></div>
          </div>)}</div></div>
        <Button variant="outline" size="sm" onClick={() => setColumns((current) => [...current, newColumn(current.length)])}><Columns3 />Add column</Button>
        <div><p className="mb-2 text-xs font-semibold">CREATE TABLE preview</p><pre className="max-h-48 overflow-auto rounded-xl border bg-[#0f111a] p-4 font-mono text-xs leading-5 text-slate-300"><code>{sql}</code></pre></div>{error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
      </div>
      <DialogFooter className="border-t p-6"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={isMutating || sql.startsWith("--")}>{isMutating ? <LoaderCircle className="animate-spin" /> : <Plus />}{isMutating ? "Creating…" : "Create table"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
