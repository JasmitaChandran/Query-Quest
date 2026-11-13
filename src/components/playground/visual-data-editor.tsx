"use client";

import * as React from "react";
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight,
  Clipboard, Code2, CornerDownLeft, LoaderCircle, Pencil, Plus, Save, Search, X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createVisualDataColumns } from "@/components/playground/visual-data-editor-cells";
import type { EditableTableRecords, SqlValue } from "@/lib/database/types";
import {
  buildVisualTableEdits, describeVisualEditError, gridNavigationTarget,
  parameterizedSqlPreview, parseVisualCellValue, sameSqlValue,
  summarizeVisualChanges, validateVisualDrafts, visualCellKey,
  type GridNavigationKey, type VisualChangeSummary, type VisualDraftRow,
} from "@/lib/database/visual-data-editor";
import { buildTableEditStatements } from "@/lib/database/visual-sql";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const HINT_KEY = "queryquest.visual-data-editor.hint-dismissed";

function displayValue(value: SqlValue) {
  if (value === null) return "NULL";
  if (value instanceof Uint8Array) return `BLOB (${value.byteLength} bytes)`;
  return String(value);
}

function draftsFromRecords(records: EditableTableRecords | null) {
  return records
    ? records.values.map((values, index): VisualDraftRow => ({
        key: `row-${records.rowIds[index]}`, rowId: records.rowIds[index],
        values: [...values], original: [...values], isNew: false,
      }))
    : [];
}

function SqlCode({ sql }: { sql: string }) {
  const tokens = sql.split(/(\b(?:INSERT|INTO|VALUES|UPDATE|SET|WHERE|DELETE|FROM|NULL)\b|"[^"]+"|\?)/gi);
  return <code>{tokens.map((token, index) => {
    if (/^(INSERT|INTO|VALUES|UPDATE|SET|WHERE|DELETE|FROM|NULL)$/i.test(token)) return <span key={index} className="font-semibold text-primary">{token}</span>;
    if (/^"[^"]+"$/.test(token)) return <span key={index} className="text-info">{token}</span>;
    if (token === "?") return <span key={index} className="font-bold text-warning">?</span>;
    return <React.Fragment key={index}>{token}</React.Fragment>;
  })}</code>;
}

function ChangeReview({ summary }: { summary: VisualChangeSummary }) {
  const tone = summary.type === "insert" ? "border-success/30 bg-success-tint" : summary.type === "delete" ? "border-destructive/30 bg-destructive-tint" : "border-warning/30 bg-warning-tint";
  return <article className={cn("rounded-xl border p-3", tone)}>
    <div className="flex items-center gap-2"><span className={cn("rounded-md px-2 py-1 text-xs font-bold", summary.type === "insert" ? "bg-success/15 text-success" : summary.type === "delete" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>{summary.type.toUpperCase()}</span><p className="min-w-0 truncate font-mono text-[13px] font-semibold">{summary.label}</p></div>
    {summary.type === "update" ? <div className="mt-2 space-y-1.5">{summary.changes.map((change) => <div key={change.column} className="grid gap-1 text-xs sm:grid-cols-[minmax(100px,.6fr)_1fr]"><span className="font-mono font-semibold">{change.column}</span><span className="text-muted-foreground"><span className="line-through">{displayValue(change.before)}</span> <span aria-hidden>→</span> <strong className="text-foreground">{displayValue(change.after)}</strong></span></div>)}</div> : null}
    {summary.type === "insert" ? <p className="mt-2 text-xs text-muted-foreground">{summary.values.length} parameterized value{summary.values.length === 1 ? "" : "s"} will create one record.</p> : null}
    {summary.type === "delete" ? <p className="mt-2 text-xs text-muted-foreground">This record will be removed when the atomic batch is confirmed.</p> : null}
  </article>;
}

export function VisualDataEditor() {
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const schema = useDatabaseStore((state) => state.selectedSchema);
  const records = useDatabaseStore((state) => state.editableRecords);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const saveTableEdits = useDatabaseStore((state) => state.saveTableEdits);
  const setPendingDataEdits = useWorkspaceStore((state) => state.setPendingDataEdits);
  const [rows, setRows] = React.useState<VisualDraftRow[]>([]);
  const [deleted, setDeleted] = React.useState<number[]>([]);
  const [filter, setFilter] = React.useState("");
  const [parseErrors, setParseErrors] = React.useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = React.useState<Record<string, string>>({});
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [touchedCells, setTouchedCells] = React.useState<Set<string>>(new Set());
  const [validationAttempted, setValidationAttempted] = React.useState(false);
  const [selectedCell, setSelectedCell] = React.useState<string | null>(null);
  const [editingCell, setEditingCell] = React.useState<string | null>(null);
  const [editStart, setEditStart] = React.useState<{ key: string; value: SqlValue } | null>(null);
  const [openRowMenu, setOpenRowMenu] = React.useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [sqlOpen, setSqlOpen] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [savedFeedback, setSavedFeedback] = React.useState<string | null>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const inputRefs = React.useRef(new Map<string, HTMLInputElement>());

  const resetDraft = React.useCallback(() => {
    setRows(draftsFromRecords(records)); setDeleted([]); setParseErrors({}); setServerErrors({});
    setBatchError(null); setTouchedCells(new Set()); setValidationAttempted(false);
    setSelectedCell(null); setEditingCell(null); setReviewOpen(false);
  }, [records]);

  React.useEffect(() => { resetDraft(); setFilter(""); }, [resetDraft]);
  React.useEffect(() => { try { setShowHint(window.localStorage.getItem(HINT_KEY) !== "true"); } catch { setShowHint(true); } }, []);

  const dismissHint = React.useCallback(() => {
    setShowHint(false);
    try { window.localStorage.setItem(HINT_KEY, "true"); } catch { /* The editor still works when storage is unavailable. */ }
  }, []);

  const deletedSet = React.useMemo(() => new Set(deleted), [deleted]);
  const edits = React.useMemo(() => buildVisualTableEdits(rows, deletedSet), [deletedSet, rows]);
  const structuralErrors = React.useMemo(() => schema ? validateVisualDrafts(rows, schema, deletedSet) : {}, [deletedSet, rows, schema]);
  const visibleStructuralErrors = React.useMemo(() => Object.fromEntries(Object.entries(structuralErrors).filter(([key]) => validationAttempted || touchedCells.has(key))), [structuralErrors, touchedCells, validationAttempted]);
  const cellErrors = React.useMemo(() => ({ ...visibleStructuralErrors, ...parseErrors, ...serverErrors }), [parseErrors, serverErrors, visibleStructuralErrors]);
  const summaries = React.useMemo(() => schema ? summarizeVisualChanges(rows, schema, deletedSet) : [], [deletedSet, rows, schema]);
  const statements = React.useMemo(() => selectedTable && schema ? buildTableEditStatements(selectedTable, schema.columns.map((column) => column.name), edits) : [], [edits, schema, selectedTable]);
  const sqlPreview = React.useMemo(() => parameterizedSqlPreview(statements), [statements]);
  const modifiedCellCount = React.useMemo(() => rows.reduce((total, row) => total + row.values.filter((value, index) => !sameSqlValue(value, row.original[index])).length, 0), [rows]);

  React.useEffect(() => {
    setPendingDataEdits(edits.length);
    if (!edits.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edits.length, setPendingDataEdits]);
  React.useEffect(() => () => setPendingDataEdits(0), [setPendingDataEdits]);

  const focusCell = React.useCallback((rowIndex: number, columnIndex: number) => {
    const row = rows[rowIndex];
    if (!row || !schema) return;
    const direction = columnIndex < 0 ? -1 : 1;
    let nextColumn = Math.min(schema.columns.length - 1, Math.max(0, columnIndex));
    while (nextColumn >= 0 && nextColumn < schema.columns.length && schema.columns[nextColumn].type.toUpperCase().includes("BLOB")) nextColumn += direction;
    const target = inputRefs.current.get(visualCellKey(row.key, nextColumn));
    target?.focus(); target?.select();
  }, [rows, schema]);

  const updateCell = React.useCallback((key: string, columnIndex: number, raw: string) => {
    if (!schema) return;
    const cellKey = visualCellKey(key, columnIndex);
    setBatchError(null); setServerErrors({}); setTouchedCells((current) => new Set(current).add(cellKey));
    try {
      const value = parseVisualCellValue(raw, schema.columns[columnIndex]?.type ?? "TEXT");
      setRows((current) => current.map((row) => row.key === key ? { ...row, values: row.values.map((cell, index) => index === columnIndex ? value : cell) } : row));
      setParseErrors((current) => { const next = { ...current }; delete next[cellKey]; return next; });
    } catch (cause) { setParseErrors((current) => ({ ...current, [cellKey]: cause instanceof Error ? cause.message : "Invalid value." })); }
  }, [schema]);

  const markDeleted = React.useCallback((row: VisualDraftRow) => {
    setOpenRowMenu(null); dismissHint();
    if (row.isNew) { setRows((current) => current.filter((candidate) => candidate.key !== row.key)); return; }
    if (row.rowId !== undefined) setDeleted((current) => current.includes(row.rowId!) ? current : [...current, row.rowId!]);
  }, [dismissHint]);
  const cancelDeletion = React.useCallback((rowId: number) => { setDeleted((current) => current.filter((candidate) => candidate !== rowId)); setOpenRowMenu(null); }, []);

  const startColumnResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>, columnName: string) => {
    event.preventDefault();
    const startX = event.clientX; const startWidth = columnWidths[columnName] ?? 176; const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (nextEvent: PointerEvent) => setColumnWidths((current) => ({ ...current, [columnName]: Math.min(420, Math.max(112, startWidth + nextEvent.clientX - startX)) }));
    const stop = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", stop); handle.removeEventListener("pointercancel", stop); };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", stop); handle.addEventListener("pointercancel", stop);
  }, [columnWidths]);

  const handleCellKeyDown = React.useCallback((
    event: React.KeyboardEvent<HTMLInputElement>,
    draft: VisualDraftRow,
    rowIndex: number,
    columnIndex: number,
    cellKey: string,
  ) => {
    if (!schema) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (editStart?.key === cellKey) {
        setRows((current) => current.map((item) => item.key === draft.key
          ? { ...item, values: item.values.map((cell, index) => index === columnIndex ? editStart.value : cell) }
          : item));
      }
      setParseErrors((current) => { const next = { ...current }; delete next[cellKey]; return next; });
      event.currentTarget.blur();
      return;
    }
    if (!["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = gridNavigationTarget({
      key: event.key as GridNavigationKey,
      rowIndex,
      columnIndex,
      rowCount: rows.length,
      columnCount: schema.columns.length,
      selectionStart: event.currentTarget.selectionStart,
      selectionEnd: event.currentTarget.selectionEnd,
      valueLength: event.currentTarget.value.length,
    });
    if (!target || (target.rowIndex === rowIndex && target.columnIndex === columnIndex)) return;
    event.preventDefault();
    focusCell(target.rowIndex, target.columnIndex);
  }, [editStart, focusCell, rows.length, schema]);

  const columns = React.useMemo(() => schema ? createVisualDataColumns({
    schema,
    deletedSet,
    columnWidths,
    cellErrors,
    selectedCell,
    editingCell,
    openRowMenu,
    setInputRef: (cellKey, element) => { if (element) inputRefs.current.set(cellKey, element); else inputRefs.current.delete(cellKey); },
    updateCell,
    focusCell,
    onCellFocus: (cellKey, value) => { dismissHint(); setSelectedCell(cellKey); setEditingCell(cellKey); setEditStart({ key: cellKey, value }); },
    onCellBlur: (cellKey) => { setEditingCell((current) => current === cellKey ? null : current); setTouchedCells((current) => new Set(current).add(cellKey)); },
    onCellKeyDown: handleCellKeyDown,
    onResizePointer: startColumnResize,
    onResizeKey: (event, columnName) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setColumnWidths((current) => ({ ...current, [columnName]: Math.min(420, Math.max(112, (current[columnName] ?? 176) + (event.key === "ArrowRight" ? 12 : -12))) }));
    },
    setOpenRowMenu,
    markDeleted,
    cancelDeletion,
  }) : [], [cancelDeletion, cellErrors, columnWidths, deletedSet, dismissHint, editingCell, focusCell, handleCellKeyDown, markDeleted, openRowMenu, schema, selectedCell, startColumnResize, updateCell]);

  // TanStack Table intentionally exposes stateful functions that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, state: { globalFilter: filter }, onGlobalFilterChange: setFilter, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), globalFilterFn: (row, _id, value) => row.original.values.some((cell) => String(cell ?? "NULL").toLowerCase().includes(String(value).toLowerCase())) });

  const addRow = () => {
    if (!schema) return; dismissHint();
    const row: VisualDraftRow = { key: `new-${crypto.randomUUID()}`, values: schema.columns.map(() => null), original: schema.columns.map(() => null), isNew: true };
    setRows((current) => [...current, row]);
    const firstEditableColumn = schema.columns.findIndex((column) => !column.type.toUpperCase().includes("BLOB"));
    window.setTimeout(() => {
      const input = inputRefs.current.get(visualCellKey(row.key, Math.max(0, firstEditableColumn)));
      input?.focus();
      input?.select();
    }, 0);
  };

  const openReview = () => {
    if (!edits.length || !schema) return; setValidationAttempted(true);
    const errors = { ...structuralErrors, ...parseErrors, ...serverErrors };
    if (Object.keys(errors).length) { setBatchError(`Fix ${Object.keys(errors).length} highlighted cell issue${Object.keys(errors).length === 1 ? "" : "s"} before reviewing this batch.`); inputRefs.current.get(Object.keys(errors)[0])?.focus(); return; }
    setBatchError(null); setReviewOpen(true);
  };

  const save = async () => {
    if (!selectedTable || !edits.length || !schema) return;
    try {
      await saveTableEdits(selectedTable, edits); setReviewOpen(false); setSavedFeedback(`${edits.length} change${edits.length === 1 ? "" : "s"} saved · checkpoint created`); window.setTimeout(() => setSavedFeedback(null), 3500);
      toast.success("Table changes saved", { description: `${edits.length} protected operation${edits.length === 1 ? "" : "s"} committed atomically.` });
    } catch (cause) {
      const described = describeVisualEditError(cause); setBatchError(described.message); setReviewOpen(false);
      if (described.columns.length) {
        const next: Record<string, string> = {};
        for (const row of rows) { if (!row.isNew && !row.values.some((value, index) => !sameSqlValue(value, row.original[index]))) continue; described.columns.forEach((columnName) => { const index = schema.columns.findIndex((column) => column.name === columnName); if (index >= 0) next[visualCellKey(row.key, index)] = described.message; }); }
        setServerErrors(next);
      }
      toast.error("Changes were not saved", { description: described.message });
    }
  };

  const discard = () => { if (!edits.length) return; resetDraft(); toast("Pending changes discarded", { description: "The SQLite database was not modified." }); };
  const copySql = async () => { await navigator.clipboard.writeText(sqlPreview || "-- No pending SQL statements."); toast.success("Parameterized SQL copied", { description: "Placeholders and their bound values were copied for review." }); };

  if (!selectedTable || !schema) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><p className="text-sm font-semibold">Choose a table to edit</p><p className="mt-2 text-xs text-muted-foreground">Select a table in Database Explorer, then return to Table Data.</p></div></div>;
  if (!records) return <div className="grid min-h-[520px] place-items-center p-8 text-center"><div><AlertTriangle className="mx-auto size-8 text-warning" /><p className="mt-3 text-sm font-semibold">This object is read-only</p><p className="mt-2 text-xs text-muted-foreground">Views and tables without row identifiers remain available in the SQL editor.</p></div></div>;

  return <section className="flex min-h-[calc(100vh-9rem)] flex-col bg-card/15">
    <header className="flex flex-wrap items-center gap-3 border-b bg-surface-elevated p-4"><div className="min-w-0"><p className="text-sm font-semibold">Visual data editor · <span className="font-mono text-primary">{selectedTable}</span></p><p className="mt-0.5 text-xs text-muted-foreground">Spreadsheet-style editing · blank cells save as NULL · BLOB values remain protected</p></div><div className="ml-auto flex flex-wrap items-center justify-end gap-2">{edits.length ? <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-warning/30 bg-warning-tint px-3 text-[13px] font-semibold text-warning"><AlertCircle className="size-3.5" />{edits.length} unsaved change{edits.length === 1 ? "" : "s"}</span> : <span className="inline-flex h-9 items-center gap-2 rounded-lg border bg-surface px-3 text-xs text-muted-foreground"><Check className="size-3.5 text-success" />No pending changes</span>}<Button variant="outline" size="sm" onClick={addRow}><Plus />Add Row</Button><Button variant="ghost" size="sm" onClick={discard} disabled={!edits.length || isMutating}>Discard</Button><Button variant="outline" size="sm" onClick={openReview} disabled={!edits.length || isMutating}>Review Changes</Button><Button size="sm" onClick={openReview} disabled={!edits.length || isMutating}>{isMutating ? <LoaderCircle className="animate-spin" /> : <Save />}{isMutating ? "Saving…" : "Save Changes"}</Button></div></header>
    {showHint ? <div className="flex items-center gap-2 border-b border-primary/20 bg-selected px-4 py-2 text-[13px] text-selected-foreground"><Pencil className="size-3.5" /><span className="flex-1"><strong>Click a cell to edit.</strong> Add rows using Add Row.</span><Button variant="ghost" size="icon-sm" onClick={dismissHint} aria-label="Dismiss editing hint"><X /></Button></div> : null}
    {savedFeedback ? <div className="flex items-center gap-2 border-b border-success/25 bg-success-tint px-4 py-2 text-[13px] font-medium text-success" role="status"><CheckCircle2 className="size-4" />{savedFeedback}</div> : null}
    {deleted.length ? <div className="flex items-center gap-2 border-b border-destructive/25 bg-destructive-tint px-4 py-2 text-[13px] text-destructive"><AlertTriangle className="size-4" />{deleted.length} row deletion{deleted.length === 1 ? "" : "s"} pending. Open its row menu to cancel before saving.</div> : null}
    {batchError ? <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive-tint px-4 py-2 text-[13px] text-destructive" role="alert"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{batchError}</span><Button variant="ghost" size="icon-sm" onClick={() => setBatchError(null)} aria-label="Dismiss validation message"><X /></Button></div> : null}
    <div className="flex min-h-10 flex-wrap items-center gap-3 border-b px-4 py-1.5"><label className="flex min-w-48 flex-1 items-center gap-2"><Search className="size-3.5 text-muted-foreground" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search records…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label><span className="text-xs text-muted-foreground">{table.getRowModel().rows.length} rows</span><div className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex" aria-label="Cell state legend"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-warning" />Modified</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-success" />New row</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" />Pending deletion</span></div></div>
    <div className="workspace-scrollbar min-h-72 flex-1 overflow-auto"><Table className="min-w-max border-separate border-spacing-0"><TableHeader className="sticky top-0 z-20 bg-table-header shadow-[0_1px_0_var(--border)]"><TableRow>{table.getHeaderGroups()[0].headers.map((header) => <TableHead key={header.id} className={cn("relative border-b border-r px-2 last:border-r-0", header.id === "row" && "w-20 text-center", header.id === "actions" && "w-20 text-center")}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow></TableHeader><TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => { const pendingDelete = row.original.rowId !== undefined && deletedSet.has(row.original.rowId); return <TableRow key={row.original.key} className={cn("group/row border-l-4 border-l-transparent", row.original.isNew && "border-l-success bg-success-tint", pendingDelete && "border-l-destructive bg-destructive-tint")} aria-label={row.original.isNew ? `New row ${row.index + 1}` : pendingDelete ? `Row ${row.index + 1}, pending deletion` : `Row ${row.index + 1}`}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="border-b border-r p-0 align-top last:border-r-0">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>; }) : <TableRow><TableCell colSpan={schema.columns.length + 2} className="h-40 text-center text-[13px] text-muted-foreground">No rows match “{filter}”.</TableCell></TableRow>}</TableBody></Table></div>
    <section className="border-t bg-surface-elevated"><button type="button" onClick={() => setSqlOpen((open) => !open)} aria-expanded={sqlOpen} className="flex min-h-12 w-full items-center gap-2 px-4 text-left transition hover:bg-hover"><Code2 className="size-4 text-primary" /><span className="text-[13px] font-semibold">Generated SQL Preview</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{statements.length} statement{statements.length === 1 ? "" : "s"}</span><span className="ml-auto text-xs text-muted-foreground">Parameterized values stay separate</span>{sqlOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>{sqlOpen ? <div className="border-t p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><p className="flex-1 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Safe preview:</strong> every amber <code className="font-mono text-warning">?</code> is a placeholder. Values are bound separately by SQLite and are never interpolated into executable SQL.</p><Button variant="outline" size="sm" onClick={() => void copySql()} disabled={!statements.length}><Clipboard />Copy</Button></div>{statements.length ? <div className="workspace-scrollbar max-h-72 space-y-3 overflow-auto rounded-xl border bg-code p-3">{statements.map((statement, index) => <div key={index} className="rounded-lg border border-border/70 bg-code-surface p-3"><pre className="whitespace-pre-wrap font-mono text-[13px] leading-6 text-code-foreground"><SqlCode sql={`${statement.sql};`} /></pre><div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/70 pt-2">{Array.isArray(statement.parameters) ? statement.parameters.map((parameter, parameterIndex) => <span key={parameterIndex} className="rounded-md bg-warning-tint px-2 py-1 font-mono text-xs text-warning">?{parameterIndex + 1} = {displayValue(parameter)}</span>) : <span className="text-xs text-muted-foreground">Named parameters are bound separately.</span>}</div></div>)}</div> : <p className="rounded-xl border p-4 font-mono text-[13px] text-muted-foreground">-- Edit a cell, add a row, or stage a deletion to preview parameterized SQL.</p>}</div> : null}</section>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden"><DialogHeader><div className="grid size-11 place-items-center rounded-xl bg-selected text-selected-foreground"><CornerDownLeft className="size-5" /></div><DialogTitle>Review {edits.length} pending change{edits.length === 1 ? "" : "s"}</DialogTitle><DialogDescription>QueryQuest will create a checkpoint, run every parameterized statement in one transaction, and roll back the complete batch if any constraint fails.</DialogDescription></DialogHeader><div className="workspace-scrollbar max-h-[48vh] space-y-2 overflow-y-auto pr-1">{summaries.map((summary) => <ChangeReview key={`${summary.type}-${summary.rowKey}`} summary={summary} />)}</div><div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-surface px-3 py-2 text-xs text-muted-foreground"><span>{modifiedCellCount} modified cell{modifiedCellCount === 1 ? "" : "s"}</span><span>{rows.filter((row) => row.isNew).length} new row{rows.filter((row) => row.isNew).length === 1 ? "" : "s"}</span><span>{deleted.length} deletion{deleted.length === 1 ? "" : "s"}</span></div><DialogFooter><Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button><Button type="button" onClick={() => void save()} disabled={isMutating}>{isMutating ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}{isMutating ? "Saving…" : "Confirm Changes"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
