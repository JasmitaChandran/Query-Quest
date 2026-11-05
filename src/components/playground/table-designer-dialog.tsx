"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Braces, Columns3, Info, KeyRound, Link2, LoaderCircle, Plus, ShieldCheck, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SQLiteDeclaredType, SQLiteForeignKeyAction, SqlValue, TableColumnDefinition } from "@/lib/database/types";
import { buildCreateTableSql, getSQLiteAffinity, SQLITE_DECLARED_TYPES } from "@/lib/database/visual-sql";
import { useDatabaseStore } from "@/store/database-store";
import { cn } from "@/lib/utils";

type DesignerColumn = TableColumnDefinition & { designerId: string };
type UniqueGroup = { id: string; columnIds: string[] };
type CheckGroup = { id: string; expression: string };

const FOREIGN_KEY_ACTIONS: SQLiteForeignKeyAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];
let nextDesignerId = 0;
const designerId = (prefix: string) => `${prefix}-${Date.now()}-${nextDesignerId += 1}`;

function newColumn(index: number): DesignerColumn {
  return {
    designerId: designerId("column"),
    name: index === 0 ? "id" : `column_${index + 1}`,
    type: index === 0 ? "INTEGER" : "TEXT",
    length: null,
    precision: null,
    scale: null,
    primaryKey: index === 0,
    autoincrement: false,
    notNull: false,
    unique: false,
    hasDefault: false,
    defaultValue: null,
    defaultKind: "literal",
    defaultExpression: "",
    checkExpression: "",
    foreignKey: null,
  };
}

function stripDesignerId(column: DesignerColumn): TableColumnDefinition {
  const { designerId, ...definition } = column;
  void designerId;
  return definition;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number | null | undefined; min: number; max?: number; onChange: (value: number | null) => void }) {
  return <label className="space-y-1 text-[10px] font-semibold text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary" /></label>;
}

function ConstraintToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium", disabled && "opacity-45")}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-3.5 accent-violet-500" />{label}</label>;
}

export function TableDesignerDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("new_table");
  const [columns, setColumns] = React.useState<DesignerColumn[]>([newColumn(0), newColumn(1)]);
  const [uniqueGroups, setUniqueGroups] = React.useState<UniqueGroup[]>([]);
  const [tableChecks, setTableChecks] = React.useState<CheckGroup[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const createTable = useDatabaseStore((state) => state.createTable);
  const isMutating = useDatabaseStore((state) => state.isMutating);

  const definition = React.useMemo(() => ({
    name,
    columns: columns.map(stripDesignerId),
    uniqueConstraints: uniqueGroups.map((group) => group.columnIds.map((id) => columns.find((column) => column.designerId === id)?.name ?? "")),
    checks: tableChecks.map((check) => check.expression),
  }), [columns, name, tableChecks, uniqueGroups]);

  let sql = "";
  let previewError: string | null = null;
  try { sql = buildCreateTableSql(definition); }
  catch (cause) { previewError = cause instanceof Error ? cause.message : "Complete the table definition."; sql = `-- ${previewError}`; }

  const update = (index: number, patch: Partial<DesignerColumn>) => setColumns((current) => current.map((column, item) => item === index ? { ...column, ...patch } : column));
  const move = (index: number, direction: -1 | 1) => setColumns((current) => {
    const next = [...current];
    const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const removeColumn = (index: number) => {
    const id = columns[index].designerId;
    setColumns((current) => current.filter((_, item) => item !== index));
    setUniqueGroups((current) => current.map((group) => ({ ...group, columnIds: group.columnIds.filter((columnId) => columnId !== id) })));
  };
  const reset = () => {
    setName("new_table");
    setColumns([newColumn(0), newColumn(1)]);
    setUniqueGroups([]);
    setTableChecks([]);
    setError(null);
  };

  const changeType = (index: number, type: SQLiteDeclaredType) => update(index, {
    type,
    length: type === "VARCHAR" || type === "CHAR" ? 255 : null,
    precision: type === "DECIMAL" ? 10 : null,
    scale: type === "DECIMAL" ? 2 : null,
    autoincrement: type === "INTEGER" ? columns[index].autoincrement : false,
  });

  const changeDefaultValue = (index: number, raw: string) => {
    const column = columns[index];
    let value: SqlValue = raw;
    if (["INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT", "REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"].includes(column.type)) value = raw === "" ? null : Number(raw);
    update(index, { defaultValue: value });
  };

  const submit = async () => {
    setError(null);
    try {
      await createTable(definition);
      toast.success("Table created", { description: `${name} is ready for visual data entry.` });
      setOpen(false);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the table.");
    }
  };

  const primaryCount = columns.filter((column) => column.primaryKey).length;

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm"><Plus /><span className="hidden sm:inline">Create table</span></Button></DialogTrigger>
    <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
      <div className="border-b p-6">
        <DialogHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Table2 className="size-5" /></div>
          <DialogTitle>Visual table designer</DialogTitle>
          <DialogDescription>Build a valid SQLite table with declared types, relationships, checks, and composite keys. The SQL preview below is exactly what the worker executes.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[.06] p-3 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-blue-500" /><p><strong className="text-foreground">SQLite uses type affinity.</strong> VARCHAR/CHAR lengths and DECIMAL precision are preserved in the declaration but are not strictly enforced in ordinary tables. BOOLEAN, DATE, DATETIME, and TIMESTAMP are storage conventions rather than separate native storage classes.</p></div>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]">
        <div className="min-w-0 space-y-5">
          <label className="block text-xs font-semibold">Table name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Columns</p><p className="mt-1 text-[10px] text-muted-foreground">Select multiple PRIMARY boxes to create a composite primary key.</p></div>{primaryCount > 1 ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400"><KeyRound className="mr-1 inline size-3" />Composite primary key · {primaryCount} columns</span> : null}</div>
            <div className="space-y-3">{columns.map((column, index) => {
              const affinity = getSQLiteAffinity(column.type);
              return <article key={column.designerId} className="rounded-xl border bg-card/35">
                <div className="grid items-center gap-2 border-b p-3 md:grid-cols-[28px_minmax(120px,1fr)_150px_100px_auto]">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <input value={column.name} onChange={(event) => update(index, { name: event.target.value })} className="h-9 min-w-0 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Column ${index + 1} name`} />
                  <select value={column.type} onChange={(event) => changeType(index, event.target.value as SQLiteDeclaredType)} className="h-9 rounded-lg border bg-background px-2 text-xs" aria-label={`Type for ${column.name}`}>{SQLITE_DECLARED_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                  <span className="rounded-md bg-muted px-2 py-1 text-center text-[9px] font-semibold text-muted-foreground">{affinity} affinity</span>
                  <div className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${column.name} up`}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === columns.length - 1} aria-label={`Move ${column.name} down`}><ArrowDown /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => removeColumn(index)} disabled={columns.length === 1} className="text-destructive" aria-label={`Delete ${column.name}`}><Trash2 /></Button></div>
                </div>
                <div className="grid gap-4 p-3 lg:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex flex-wrap content-start gap-x-4 gap-y-2 lg:max-w-52">
                    <ConstraintToggle label="PRIMARY" checked={column.primaryKey} onChange={(checked) => update(index, { primaryKey: checked, autoincrement: checked ? column.autoincrement : false })} />
                    <ConstraintToggle label="AUTOINCREMENT" checked={Boolean(column.autoincrement)} disabled={!column.primaryKey || column.type !== "INTEGER"} onChange={(checked) => update(index, { autoincrement: checked })} />
                    <ConstraintToggle label="NOT NULL" checked={column.notNull} onChange={(checked) => update(index, { notNull: checked })} />
                    <ConstraintToggle label="UNIQUE" checked={column.unique} onChange={(checked) => update(index, { unique: checked })} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {column.type === "VARCHAR" || column.type === "CHAR" ? <NumberField label={`${column.type} length`} min={1} value={column.length} onChange={(length) => update(index, { length })} /> : null}
                    {column.type === "DECIMAL" ? <><NumberField label="Precision" min={1} value={column.precision} onChange={(precision) => update(index, { precision })} /><NumberField label="Scale" min={0} max={column.precision ?? undefined} value={column.scale} onChange={(scale) => update(index, { scale })} /></> : null}
                    <div className="space-y-1 sm:col-span-2 xl:col-span-3"><div className="flex items-center gap-2"><ConstraintToggle label="DEFAULT" checked={column.hasDefault} onChange={(checked) => update(index, { hasDefault: checked })} />{column.hasDefault ? <select value={column.defaultKind ?? "literal"} onChange={(event) => update(index, { defaultKind: event.target.value as "literal" | "expression" })} className="h-7 rounded-md border bg-background px-2 text-[10px]"><option value="literal">Literal value</option><option value="expression">SQLite expression</option></select> : null}</div>{column.hasDefault ? column.defaultKind === "expression" ? <input value={column.defaultExpression ?? ""} onChange={(event) => update(index, { defaultExpression: event.target.value })} placeholder="CURRENT_TIMESTAMP" className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Default expression for ${column.name}`} /> : column.type === "BOOLEAN" ? <select value={String(column.defaultValue ?? 0)} onChange={(event) => update(index, { defaultValue: Number(event.target.value) })} className="h-8 w-full rounded-lg border bg-background px-2 text-xs" aria-label={`Default value for ${column.name}`}><option value="0">0 · false</option><option value="1">1 · true</option></select> : <input value={column.defaultValue === null ? "" : String(column.defaultValue)} onChange={(event) => changeDefaultValue(index, event.target.value)} placeholder="Default value" className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Default value for ${column.name}`} /> : null}</div>
                    <label className="space-y-1 sm:col-span-2 xl:col-span-3"><span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Braces className="size-3" />Column CHECK expression</span><input value={column.checkExpression ?? ""} onChange={(event) => update(index, { checkExpression: event.target.value })} placeholder={`${column.name || "value"} >= 0`} className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" /></label>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-3"><ConstraintToggle label="FOREIGN KEY" checked={Boolean(column.foreignKey)} onChange={(checked) => update(index, { foreignKey: checked ? { table: "", column: "id", onDelete: "NO ACTION", onUpdate: "NO ACTION" } : null })} />{column.foreignKey ? <div className="grid gap-2 rounded-lg border bg-background/50 p-2 sm:grid-cols-2 xl:grid-cols-4"><input value={column.foreignKey.table} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, table: event.target.value } })} placeholder="Referenced table" className="h-8 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Referenced table for ${column.name}`} /><input value={column.foreignKey.column} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, column: event.target.value } })} placeholder="Referenced column" className="h-8 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Referenced column for ${column.name}`} /><label className="text-[9px] text-muted-foreground">ON DELETE<select value={column.foreignKey.onDelete} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, onDelete: event.target.value as SQLiteForeignKeyAction } })} className="mt-1 h-8 w-full rounded-lg border bg-background px-1 text-[10px] text-foreground">{FOREIGN_KEY_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label><label className="text-[9px] text-muted-foreground">ON UPDATE<select value={column.foreignKey.onUpdate} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, onUpdate: event.target.value as SQLiteForeignKeyAction } })} className="mt-1 h-8 w-full rounded-lg border bg-background px-1 text-[10px] text-foreground">{FOREIGN_KEY_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label></div> : null}</div>
                  </div>
                </div>
              </article>;
            })}</div>
            <Button type="button" variant="outline" size="sm" onClick={() => setColumns((current) => [...current, newColumn(current.length)])}><Columns3 />Add column</Button>
          </section>

          <section className="rounded-xl border bg-card/30 p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><div><p className="text-xs font-semibold">Composite and table constraints</p><p className="text-[10px] text-muted-foreground">Add multi-column UNIQUE keys or checks that involve several columns.</p></div></div>
            <div className="mt-4 space-y-3">{uniqueGroups.map((group, index) => <div key={group.id} className="rounded-lg border bg-background/45 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold">Composite UNIQUE {index + 1}</p><Button type="button" variant="ghost" size="icon-sm" onClick={() => setUniqueGroups((current) => current.filter((item) => item.id !== group.id))} className="text-destructive" aria-label={`Delete composite unique ${index + 1}`}><Trash2 /></Button></div><div className="mt-2 flex flex-wrap gap-2">{columns.map((column) => <label key={column.designerId} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px]", group.columnIds.includes(column.designerId) && "border-primary/40 bg-primary/10 text-primary")}><input type="checkbox" checked={group.columnIds.includes(column.designerId)} onChange={(event) => setUniqueGroups((current) => current.map((item) => item.id === group.id ? { ...item, columnIds: event.target.checked ? [...item.columnIds, column.designerId] : item.columnIds.filter((id) => id !== column.designerId) } : item))} />{column.name || `Column ${columns.indexOf(column) + 1}`}</label>)}</div></div>)}
              {tableChecks.map((check, index) => <div key={check.id} className="flex items-center gap-2"><input value={check.expression} onChange={(event) => setTableChecks((current) => current.map((item) => item.id === check.id ? { ...item, expression: event.target.value } : item))} placeholder="start_date <= end_date" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Table check ${index + 1}`} /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setTableChecks((current) => current.filter((item) => item.id !== check.id))} className="text-destructive" aria-label={`Delete table check ${index + 1}`}><Trash2 /></Button></div>)}
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setUniqueGroups((current) => [...current, { id: designerId("unique"), columnIds: [] }])}><KeyRound />Add composite unique</Button><Button type="button" variant="outline" size="sm" onClick={() => setTableChecks((current) => [...current, { id: designerId("check"), expression: "" }])}><Braces />Add table check</Button></div>
            </div>
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <div className="rounded-xl border bg-card/45 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold">CREATE TABLE preview</p>{previewError ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-[9px] font-semibold text-destructive">Needs attention</span> : <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">Ready for SQLite</span>}</div><pre className="workspace-scrollbar mt-3 max-h-[52vh] overflow-auto rounded-xl border bg-[#0f111a] p-4 font-mono text-[11px] leading-5 text-slate-300"><code>{sql}</code></pre>{previewError ? <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs leading-5 text-destructive">{previewError}</p> : <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground"><Link2 className="mt-0.5 size-3 shrink-0" />Foreign keys are enforced because QueryQuest enables PRAGMA foreign_keys for every browser database. SQLite performs final syntax and constraint validation when you create the table.</p>}</div>
          {error ? <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
        </aside>
      </div>

      <DialogFooter className="border-t p-6"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={() => void submit()} disabled={isMutating || Boolean(previewError)}>{isMutating ? <LoaderCircle className="animate-spin" /> : <Plus />}{isMutating ? "Creating…" : "Create table"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
