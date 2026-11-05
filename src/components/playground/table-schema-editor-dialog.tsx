"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Braces,
  Columns3,
  Eye,
  FileCode2,
  KeyRound,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  TableProperties,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SQLiteDeclaredType,
  SQLiteForeignKeyAction,
  SqlValue,
  TableColumnDefinition,
  TableMigrationInspection,
  TableSchemaMigrationInput,
} from "@/lib/database/types";
import { buildMigrationPreview } from "@/lib/database/schema-migration";
import { buildCreateTableSql, getSQLiteAffinity, SQLITE_DECLARED_TYPES } from "@/lib/database/visual-sql";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";

type EditorColumn = TableColumnDefinition & {
  editorId: string;
  sourceName: string | null;
};
type UniqueGroup = { id: string; columnIds: string[] };
type CheckGroup = { id: string; expression: string };

const FOREIGN_KEY_ACTIONS: SQLiteForeignKeyAction[] = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];
let idCounter = 0;
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${idCounter += 1}`;

function editableColumn(column: TableColumnDefinition, sourceName: string | null): EditorColumn {
  return { ...column, editorId: makeId("schema-column"), sourceName };
}

function newColumn(index: number) {
  return editableColumn({
    name: `column_${index + 1}`,
    type: "TEXT",
    length: null,
    precision: null,
    scale: null,
    primaryKey: false,
    autoincrement: false,
    notNull: false,
    unique: false,
    hasDefault: false,
    defaultValue: null,
    defaultKind: "literal",
    defaultExpression: "",
    checkExpression: "",
    foreignKey: null,
  }, null);
}

function stripEditor(column: EditorColumn): TableColumnDefinition {
  const { editorId, sourceName, ...definition } = column;
  void editorId;
  void sourceName;
  return definition;
}

function constraintSignature(column: TableColumnDefinition) {
  return JSON.stringify({
    primaryKey: column.primaryKey,
    autoincrement: Boolean(column.autoincrement),
    notNull: column.notNull,
    unique: column.unique,
    hasDefault: column.hasDefault,
    defaultValue: column.defaultValue,
    defaultKind: column.defaultKind,
    defaultExpression: column.defaultExpression,
    checkExpression: column.checkExpression,
    foreignKey: column.foreignKey,
  });
}

function declaredType(column: TableColumnDefinition) {
  if (column.type === "VARCHAR" || column.type === "CHAR") return `${column.type}(${column.length ?? "?"})`;
  if (column.type === "DECIMAL") return `DECIMAL(${column.precision ?? "?"},${column.scale ?? "?"})`;
  return column.type;
}

function ConstraintToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium", disabled && "opacity-45")}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-3.5 accent-violet-500" />{label}</label>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number | null | undefined; min: number; max?: number; onChange: (value: number | null) => void }) {
  return <label className="space-y-1 text-[10px] font-semibold text-muted-foreground"><span>{label}</span><input type="number" min={min} max={max} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs text-foreground outline-none focus:border-primary" /></label>;
}

function SchemaCard({ title, name, columns, tone }: { title: string; name: string; columns: TableColumnDefinition[]; tone: "current" | "proposed" }) {
  return <section className={cn("min-w-0 rounded-xl border p-3", tone === "proposed" ? "border-primary/25 bg-primary/[.04]" : "bg-card/35")}>
    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{title}</p><span className="truncate font-mono text-[10px] font-semibold">{name}</span></div>
    <div className="mt-3 space-y-1.5">{columns.map((column) => <div key={column.name} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background/45 px-2 py-1.5 text-[10px]">
      {column.primaryKey ? <KeyRound className="size-3 shrink-0 text-amber-500" /> : column.foreignKey ? <Link2 className="size-3 shrink-0 text-blue-500" /> : <Columns3 className="size-3 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate font-medium">{column.name}</span><span className="shrink-0 font-mono text-[9px] text-muted-foreground">{declaredType(column)}</span>
      {column.notNull ? <span className="hidden rounded bg-muted px-1 py-0.5 text-[8px] sm:inline">NN</span> : null}
      {column.unique ? <span className="hidden rounded bg-muted px-1 py-0.5 text-[8px] sm:inline">UQ</span> : null}
    </div>)}</div>
  </section>;
}

export function TableSchemaEditorDialog({ tableName, open, onOpenChange }: { tableName: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const inspectTableMigration = useDatabaseStore((state) => state.inspectTableMigration);
  const migrateTableSchema = useDatabaseStore((state) => state.migrateTableSchema);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const [inspection, setInspection] = React.useState<TableMigrationInspection | null>(null);
  const [name, setName] = React.useState("");
  const [columns, setColumns] = React.useState<EditorColumn[]>([]);
  const [uniqueGroups, setUniqueGroups] = React.useState<UniqueGroup[]>([]);
  const [tableChecks, setTableChecks] = React.useState<CheckGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showSql, setShowSql] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!tableName) return;
    setIsLoading(true);
    setError(null);
    setInspection(null);
    try {
      const next = await inspectTableMigration(tableName);
      const nextColumns = next.definition.columns.map((column) => editableColumn(column, column.name));
      setInspection(next);
      setName(next.definition.name);
      setColumns(nextColumns);
      setUniqueGroups((next.definition.uniqueConstraints ?? []).map((group) => ({
        id: makeId("schema-unique"),
        columnIds: group.map((columnName) => nextColumns.find((column) => column.name === columnName)?.editorId).filter((value): value is string => Boolean(value)),
      })));
      setTableChecks((next.definition.checks ?? []).map((expression) => ({ id: makeId("schema-check"), expression })));
      setAcknowledged(false);
      setShowSql(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not inspect this table schema.");
    } finally {
      setIsLoading(false);
    }
  }, [inspectTableMigration, tableName]);

  React.useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load, open]);

  const definition = React.useMemo(() => ({
    name,
    columns: columns.map(stripEditor),
    uniqueConstraints: uniqueGroups.map((group) => group.columnIds.map((id) => columns.find((column) => column.editorId === id)?.name ?? "")),
    checks: tableChecks.map((check) => check.expression),
  }), [columns, name, tableChecks, uniqueGroups]);

  const input: TableSchemaMigrationInput | null = inspection ? {
    sourceTableName: inspection.tableName,
    definition,
    columnMappings: columns.map((column) => ({ sourceColumn: column.sourceName, targetColumn: column.name })),
  } : null;

  const changes = React.useMemo(() => {
    if (!inspection) return { added: [] as string[], removed: [] as string[], renamed: [] as string[], types: [] as string[], constraints: [] as string[], reordered: false };
    const currentByName = new Map(inspection.definition.columns.map((column) => [column.name.toLowerCase(), column]));
    const sourceNames = new Set(columns.flatMap((column) => column.sourceName ? [column.sourceName.toLowerCase()] : []));
    const added = columns.filter((column) => !column.sourceName).map((column) => column.name);
    const removed = inspection.definition.columns.filter((column) => !sourceNames.has(column.name.toLowerCase())).map((column) => column.name);
    const renamed = columns.filter((column) => column.sourceName && column.sourceName.toLowerCase() !== column.name.toLowerCase()).map((column) => `${column.sourceName} → ${column.name}`);
    const types = columns.filter((column) => {
      const current = column.sourceName ? currentByName.get(column.sourceName.toLowerCase()) : null;
      return current && declaredType(current) !== declaredType(column);
    }).map((column) => `${column.sourceName}: ${declaredType(currentByName.get(column.sourceName!.toLowerCase())!)} → ${declaredType(column)}`);
    const constraints = columns.filter((column) => {
      const current = column.sourceName ? currentByName.get(column.sourceName.toLowerCase()) : null;
      return current && constraintSignature(current) !== constraintSignature(column);
    }).map((column) => column.name);
    const proposedSourceOrder = columns.flatMap((column) => column.sourceName ? [column.sourceName.toLowerCase()] : []);
    const currentSurvivingOrder = inspection.definition.columns.map((column) => column.name.toLowerCase()).filter((columnName) => sourceNames.has(columnName));
    return { added, removed, renamed, types, constraints, reordered: JSON.stringify(proposedSourceOrder) !== JSON.stringify(currentSurvivingOrder) };
  }, [columns, inspection]);

  const hasChanges = Boolean(inspection && (
    name !== inspection.tableName || changes.added.length || changes.removed.length || changes.renamed.length || changes.types.length || changes.constraints.length || changes.reordered ||
    JSON.stringify(definition.uniqueConstraints) !== JSON.stringify(inspection.definition.uniqueConstraints ?? []) ||
    JSON.stringify(definition.checks) !== JSON.stringify(inspection.definition.checks ?? [])
  ));
  const isRisky = Boolean(changes.removed.length || changes.types.length || changes.renamed.length || name !== inspection?.tableName || changes.constraints.length);

  let previewSql = "";
  let previewError: string | null = null;
  if (input) {
    try {
      buildCreateTableSql(definition);
      previewSql = buildMigrationPreview(input);
    } catch (cause) {
      previewError = cause instanceof Error ? cause.message : "Complete the proposed schema.";
      previewSql = `-- ${previewError}`;
    }
  }

  const update = (index: number, patch: Partial<EditorColumn>) => setColumns((current) => current.map((column, item) => item === index ? { ...column, ...patch } : column));
  const move = (index: number, direction: -1 | 1) => setColumns((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const remove = (index: number) => {
    const id = columns[index].editorId;
    setColumns((current) => current.filter((_, item) => item !== index));
    setUniqueGroups((current) => current.map((group) => ({ ...group, columnIds: group.columnIds.filter((columnId) => columnId !== id) })));
  };
  const changeType = (index: number, type: SQLiteDeclaredType) => update(index, {
    type,
    length: type === "VARCHAR" || type === "CHAR" ? 255 : null,
    precision: type === "DECIMAL" ? 10 : null,
    scale: type === "DECIMAL" ? 2 : null,
    autoincrement: type === "INTEGER" ? columns[index].autoincrement : false,
  });
  const changeDefault = (index: number, raw: string) => {
    const column = columns[index];
    let value: SqlValue = raw;
    if (["INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT", "REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"].includes(column.type)) value = raw === "" ? null : Number(raw);
    update(index, { defaultValue: value });
  };

  const submit = async () => {
    if (!input) return;
    setError(null);
    try {
      await migrateTableSchema(input);
      toast.success("Schema updated", { description: `${inspection?.tableName} was migrated safely to ${definition.name}. Undo is available.` });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The schema migration failed and was rolled back.");
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[94vh] max-w-[min(96vw,1440px)] overflow-y-auto p-0">
      <div className="border-b p-6">
        <DialogHeader>
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><TableProperties className="size-5" /></div>
          <DialogTitle>Edit table schema</DialogTitle>
          <DialogDescription>Design a replacement schema, review the exact changes, then let QueryQuest migrate the table inside a checked transaction and checkpoint.</DialogDescription>
        </DialogHeader>
      </div>

      {isLoading ? <div className="grid min-h-80 place-items-center p-8 text-sm text-muted-foreground"><div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Inspecting columns and dependent database objects…</div></div> : error && !inspection ? <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm leading-6 text-destructive"><div className="flex gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">This schema cannot be edited safely</p><p className="mt-1">{error}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}><RefreshCw />Inspect again</Button></div></div></div> : inspection ? <>
        <div className="grid gap-6 p-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(400px,.75fr)]">
          <div className="min-w-0 space-y-5">
            <label className="block text-xs font-semibold">Table name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Editable column grid</p><p className="mt-1 text-[10px] text-muted-foreground">Rows can be renamed, reordered, removed, or extended. Multiple PRIMARY selections create a composite key.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setColumns((current) => [...current, newColumn(current.length)])}><Plus />Add column</Button></div>
              <div className="space-y-3">{columns.map((column, index) => <article key={column.editorId} className="rounded-xl border bg-card/35">
                <div className="grid items-center gap-2 border-b p-3 md:grid-cols-[28px_minmax(130px,1fr)_150px_100px_auto]">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <input value={column.name} onChange={(event) => update(index, { name: event.target.value })} className="h-9 min-w-0 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Column ${index + 1} name`} />
                  <select value={column.type} onChange={(event) => changeType(index, event.target.value as SQLiteDeclaredType)} className="h-9 rounded-lg border bg-background px-2 text-xs" aria-label={`Type for ${column.name}`}>{SQLITE_DECLARED_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
                  <span className="rounded-md bg-muted px-2 py-1 text-center text-[9px] font-semibold text-muted-foreground">{getSQLiteAffinity(column.type)} affinity</span>
                  <div className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${column.name} up`}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === columns.length - 1} aria-label={`Move ${column.name} down`}><ArrowDown /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} disabled={columns.length === 1} className="text-destructive" aria-label={`Remove ${column.name}`}><Trash2 /></Button></div>
                </div>
                <div className="grid gap-4 p-3 lg:grid-cols-[210px_minmax(0,1fr)]">
                  <div className="flex flex-wrap content-start gap-x-4 gap-y-2"><ConstraintToggle label="PRIMARY KEY" checked={column.primaryKey} onChange={(checked) => update(index, { primaryKey: checked, autoincrement: checked ? column.autoincrement : false })} /><ConstraintToggle label="AUTOINCREMENT" checked={Boolean(column.autoincrement)} disabled={!column.primaryKey || column.type !== "INTEGER"} onChange={(checked) => update(index, { autoincrement: checked })} /><ConstraintToggle label="NOT NULL" checked={column.notNull} onChange={(checked) => update(index, { notNull: checked })} /><ConstraintToggle label="UNIQUE" checked={column.unique} onChange={(checked) => update(index, { unique: checked })} /></div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {column.type === "VARCHAR" || column.type === "CHAR" ? <NumberField label={`${column.type} length`} min={1} value={column.length} onChange={(length) => update(index, { length })} /> : null}
                    {column.type === "DECIMAL" ? <><NumberField label="Precision" min={1} value={column.precision} onChange={(precision) => update(index, { precision })} /><NumberField label="Scale" min={0} max={column.precision ?? undefined} value={column.scale} onChange={(scale) => update(index, { scale })} /></> : null}
                    <div className="space-y-1 sm:col-span-2 xl:col-span-3"><div className="flex items-center gap-2"><ConstraintToggle label="DEFAULT" checked={column.hasDefault} onChange={(checked) => update(index, { hasDefault: checked })} />{column.hasDefault ? <select value={column.defaultKind ?? "literal"} onChange={(event) => update(index, { defaultKind: event.target.value as "literal" | "expression" })} className="h-7 rounded-md border bg-background px-2 text-[10px]"><option value="literal">Literal value</option><option value="expression">SQLite expression</option></select> : null}</div>{column.hasDefault ? column.defaultKind === "expression" ? <input value={column.defaultExpression ?? ""} onChange={(event) => update(index, { defaultExpression: event.target.value })} placeholder="CURRENT_TIMESTAMP" className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Default expression for ${column.name}`} /> : <input value={column.defaultValue === null ? "" : String(column.defaultValue)} onChange={(event) => changeDefault(index, event.target.value)} placeholder="Default value" className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Default value for ${column.name}`} /> : null}</div>
                    <label className="space-y-1 sm:col-span-2 xl:col-span-3"><span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Braces className="size-3" />CHECK constraint</span><input value={column.checkExpression ?? ""} onChange={(event) => update(index, { checkExpression: event.target.value })} placeholder={`${column.name || "value"} >= 0`} className="h-8 w-full rounded-lg border bg-background px-2 font-mono text-xs" /></label>
                    <div className="space-y-2 sm:col-span-2 xl:col-span-3"><ConstraintToggle label="FOREIGN KEY" checked={Boolean(column.foreignKey)} onChange={(checked) => update(index, { foreignKey: checked ? { table: "", column: "id", onDelete: "NO ACTION", onUpdate: "NO ACTION" } : null })} />{column.foreignKey ? <div className="grid gap-2 rounded-lg border bg-background/50 p-2 sm:grid-cols-2 xl:grid-cols-4"><input value={column.foreignKey.table} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, table: event.target.value } })} placeholder="Referenced table" className="h-8 rounded-lg border bg-background px-2 font-mono text-xs" /><input value={column.foreignKey.column} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, column: event.target.value } })} placeholder="Referenced column" className="h-8 rounded-lg border bg-background px-2 font-mono text-xs" /><label className="text-[9px] text-muted-foreground">ON DELETE<select value={column.foreignKey.onDelete} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, onDelete: event.target.value as SQLiteForeignKeyAction } })} className="mt-1 h-8 w-full rounded-lg border bg-background px-1 text-[10px] text-foreground">{FOREIGN_KEY_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label><label className="text-[9px] text-muted-foreground">ON UPDATE<select value={column.foreignKey.onUpdate} onChange={(event) => update(index, { foreignKey: { ...column.foreignKey!, onUpdate: event.target.value as SQLiteForeignKeyAction } })} className="mt-1 h-8 w-full rounded-lg border bg-background px-1 text-[10px] text-foreground">{FOREIGN_KEY_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label></div> : null}</div>
                  </div>
                </div>
              </article>)}</div>
            </section>

            <section className="rounded-xl border bg-card/30 p-4">
              <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><div><p className="text-xs font-semibold">Composite unique keys and table checks</p><p className="text-[10px] text-muted-foreground">These constraints are migrated together with the column grid.</p></div></div>
              <div className="mt-4 space-y-3">{uniqueGroups.map((group, index) => <div key={group.id} className="rounded-lg border bg-background/45 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold">Composite UNIQUE {index + 1}</p><Button type="button" variant="ghost" size="icon-sm" onClick={() => setUniqueGroups((current) => current.filter((item) => item.id !== group.id))} className="text-destructive"><Trash2 /></Button></div><div className="mt-2 flex flex-wrap gap-2">{columns.map((column) => <label key={column.editorId} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px]", group.columnIds.includes(column.editorId) && "border-primary/40 bg-primary/10 text-primary")}><input type="checkbox" checked={group.columnIds.includes(column.editorId)} onChange={(event) => setUniqueGroups((current) => current.map((item) => item.id === group.id ? { ...item, columnIds: event.target.checked ? [...item.columnIds, column.editorId] : item.columnIds.filter((id) => id !== column.editorId) } : item))} />{column.name}</label>)}</div></div>)}
                {tableChecks.map((check, index) => <div key={check.id} className="flex items-center gap-2"><input value={check.expression} onChange={(event) => setTableChecks((current) => current.map((item) => item.id === check.id ? { ...item, expression: event.target.value } : item))} placeholder="start_date <= end_date" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 font-mono text-xs" aria-label={`Table check ${index + 1}`} /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setTableChecks((current) => current.filter((item) => item.id !== check.id))} className="text-destructive"><Trash2 /></Button></div>)}
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setUniqueGroups((current) => [...current, { id: makeId("schema-unique"), columnIds: [] }])}><KeyRound />Add composite unique</Button><Button type="button" variant="outline" size="sm" onClick={() => setTableChecks((current) => [...current, { id: makeId("schema-check"), expression: "" }])}><Braces />Add table check</Button></div>
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-4 2xl:sticky 2xl:top-0 2xl:self-start">
            <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr] 2xl:grid-cols-1"><SchemaCard title="Current schema" name={inspection.tableName} columns={inspection.definition.columns} tone="current" /><ArrowRight className="m-auto size-4 rotate-90 text-muted-foreground lg:rotate-0 2xl:rotate-90" /><SchemaCard title="Proposed schema" name={name || "Unnamed"} columns={definition.columns} tone="proposed" /></div>
            <section className="rounded-xl border bg-card/35 p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Change summary</p><p className="mt-1 text-[10px] text-muted-foreground">{hasChanges ? "Review every schema difference before applying." : "No schema changes yet."}</p></div><Button type="button" variant="outline" size="sm" onClick={() => setShowSql((current) => !current)} disabled={!input}><Eye />{showSql ? "Hide SQL" : "Preview SQL"}</Button></div>
              {hasChanges ? <div className="mt-3 flex flex-wrap gap-1.5">{changes.added.map((item) => <span key={`add-${item}`} className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">Added · {item}</span>)}{changes.removed.map((item) => <span key={`remove-${item}`} className="rounded-full bg-destructive/10 px-2 py-1 text-[9px] font-semibold text-destructive">Removed · {item}</span>)}{changes.renamed.map((item) => <span key={`rename-${item}`} className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-semibold text-blue-600 dark:text-blue-400">Renamed · {item}</span>)}{changes.types.map((item) => <span key={`type-${item}`} className="rounded-full bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">Type · {item}</span>)}{changes.constraints.map((item) => <span key={`constraint-${item}`} className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-semibold text-violet-600 dark:text-violet-400">Constraint · {item}</span>)}{changes.reordered ? <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-semibold">Column order changed</span> : null}{name !== inspection.tableName ? <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-semibold text-blue-600 dark:text-blue-400">Table · {inspection.tableName} → {name}</span> : null}</div> : null}
              {showSql ? <pre className="workspace-scrollbar mt-3 max-h-72 overflow-auto rounded-xl border bg-[#0f111a] p-4 font-mono text-[10px] leading-5 text-slate-300"><code>{previewSql}</code></pre> : null}
              {previewError ? <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">{previewError}</p> : null}
            </section>

            {(isRisky || inspection.warnings.length) ? <section className="rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" /><div className="min-w-0"><p className="text-xs font-semibold">Migration safeguards</p><ul className="mt-2 space-y-1 text-[10px] leading-4 text-muted-foreground">{changes.removed.length ? <li>Removed columns permanently discard their values.</li> : null}{changes.types.length ? <li>SQLite affinity conversion may change how existing values are stored or compared.</li> : null}{changes.constraints.length ? <li>New or tighter constraints can reject existing records and roll back the migration.</li> : null}{name !== inspection.tableName ? <li>Dependent foreign keys and views must remain valid after the table rename.</li> : null}{inspection.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{isRisky ? <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-background/40 p-2.5 text-[10px] leading-4"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-3.5 accent-amber-500" /><span>I understand that QueryQuest will checkpoint first, then roll back the entire migration if copy, constraints, row counts, foreign keys, or integrity validation fails.</span></label> : null}</div></div></section> : null}

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[.05] p-3 text-[10px] leading-4 text-muted-foreground"><FileCode2 className="mr-2 inline size-3.5 text-blue-500" />SQLite does not directly support every schema alteration. QueryQuest creates a replacement table, copies compatible data, recreates safe objects, validates it, and only then commits.</div>
            {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs leading-5 text-destructive"><AlertTriangle className="mr-2 inline size-4" />{error}</p> : null}
          </aside>
        </div>
        <DialogFooter className="sticky bottom-0 border-t bg-card/95 p-5 backdrop-blur"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={() => void submit()} disabled={!hasChanges || Boolean(previewError) || isMutating || (isRisky && !acknowledged)}>{isMutating ? <LoaderCircle className="animate-spin" /> : <TableProperties />}{isMutating ? "Migrating schema…" : "Apply schema changes"}</Button></DialogFooter>
      </> : null}
    </DialogContent>
  </Dialog>;
}
