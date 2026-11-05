"use client";

import * as React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Gauge, Pause, Play, RotateCcw, Rows3, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUPPORTED_VISUALIZATION_SUBSET } from "@/lib/visualization/query-visualizer";
import type { VisualizationPanel, VisualizationPlan, VisualizationStep, VisualizationTable } from "@/lib/visualization/types";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const GROUP_STYLES = [
  "border-l-violet-500 bg-violet-500/[.06]",
  "border-l-cyan-500 bg-cyan-500/[.06]",
  "border-l-amber-500 bg-amber-500/[.06]",
  "border-l-fuchsia-500 bg-fuchsia-500/[.06]",
  "border-l-emerald-500 bg-emerald-500/[.06]",
] as const;

function rowKey(table: VisualizationTable, row: unknown[], index: number) {
  return table.rowKeys?.[index] ?? (table.rowIds?.[index] !== undefined ? `row-${table.rowIds[index]}` : `${JSON.stringify(row)}-${index}`);
}

function displayValue(value: unknown) {
  if (value === null) return "NULL";
  if (value instanceof Uint8Array) return `BLOB · ${value.byteLength} B`;
  return String(value);
}

function VisualTable({ table, step, previous, original = false, compact = false }: { table: VisualizationTable; step?: VisualizationStep; previous?: VisualizationTable; original?: boolean; compact?: boolean }) {
  const highlighted = new Set(step?.highlightedColumns?.map((column) => column.toLowerCase()));
  const matches = new Set(step?.matchingRowIds ?? []);
  const matchingKeys = new Set(step?.matchingRowKeys ?? []);
  const affected = new Set(step?.highlightedRowIds ?? []);
  const unmatched = new Set(step?.unmatchedRowIds ?? []);
  const unmatchedKeys = new Set(step?.unmatchedRowKeys ?? []);
  const changes = new Map(step?.cellChanges?.map((change) => [`${change.rowId}:${change.column.toLowerCase()}`, change]) ?? []);
  const groupOrder = new Map<string, number>();
  table.rowGroups?.forEach((group) => { if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size); });
  const previousPositions = new Map(previous?.values.map((row, index) => [rowKey(previous, row, index), index]) ?? []);
  const hasFilter = !original && (step?.matchingRowIds !== undefined || step?.matchingRowKeys !== undefined);

  return <div className={cn("workspace-scrollbar overflow-auto rounded-xl border bg-background/50", compact ? "max-h-64" : "max-h-[430px]")}>
    <Table className="min-w-max">
      <TableHeader className="sticky top-0 z-10 bg-card"><TableRow><TableHead className="w-12 border-r text-center">#</TableHead>{table.columns.map((column, index) => <TableHead key={`${column}-${index}`} className={cn("min-w-28 border-r last:border-r-0 transition-colors", !original && highlighted.has(column.toLowerCase()) && "bg-violet-500/15 text-violet-500")}>{column}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{table.values.length ? table.values.map((row, rowIndex) => {
        const id = table.rowIds?.[rowIndex];
        const key = rowKey(table, row, rowIndex);
        const isMatch = id !== undefined ? matches.has(id) : matchingKeys.has(key);
        const isAffected = id !== undefined && affected.has(id);
        const isUnmatched = (id !== undefined && unmatched.has(id)) || unmatchedKeys.has(key);
        const group = table.rowGroups?.[rowIndex];
        const priorIndex = previousPositions.get(key) ?? rowIndex;
        const shift = (priorIndex - rowIndex) * 37;
        return <TableRow
          key={key}
          className={cn(
            "border-l-4 border-l-transparent transition-all duration-500",
            hasFilter && isMatch && "bg-emerald-500/12 ring-1 ring-inset ring-emerald-500/25",
            hasFilter && !isMatch && "opacity-25",
            isUnmatched && "border-l-amber-500 bg-amber-500/10",
            isAffected && step?.rowTone === "insert" && "border-l-emerald-500 bg-emerald-500/12 ring-1 ring-inset ring-emerald-500/25",
            isAffected && step?.rowTone === "update" && "border-l-amber-500 bg-amber-500/12 ring-1 ring-inset ring-amber-500/25",
            isAffected && step?.rowTone === "delete" && "border-l-red-500 bg-red-500/12 ring-1 ring-inset ring-red-500/25",
            group && GROUP_STYLES[(groupOrder.get(group) ?? 0) % GROUP_STYLES.length],
            step?.animateReorder && "qq-order-row",
            step?.animateCombine && "qq-combine-row",
          )}
          style={step?.animateReorder ? ({ "--qq-row-shift": `${shift}px` } as React.CSSProperties) : undefined}
        >
          <TableCell className="border-r text-center text-[10px] text-muted-foreground">{rowIndex + 1}</TableCell>
          {row.map((value, columnIndex) => {
            const column = table.columns[columnIndex] ?? "";
            const change = id === undefined ? undefined : changes.get(`${id}:${column.toLowerCase()}`);
            return <TableCell key={columnIndex} className={cn("max-w-64 border-r font-mono text-xs last:border-r-0 transition-colors", !original && highlighted.has(column.toLowerCase()) && "bg-violet-500/10 text-violet-700 dark:text-violet-300", change && "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300")} title={displayValue(value)}>
              {change ? <span className="flex min-w-24 flex-col"><span>{displayValue(change.after)}</span><span className="mt-0.5 text-[9px] text-muted-foreground line-through">was {displayValue(change.before)}</span></span> : value === null ? <span className="italic text-muted-foreground">NULL</span> : <span className="block truncate">{displayValue(value)}</span>}
            </TableCell>;
          })}
        </TableRow>;
      }) : <TableRow><TableCell colSpan={table.columns.length + 1} className="h-28 text-center text-xs text-muted-foreground">No rows at this stage.</TableCell></TableRow>}</TableBody>
    </Table>
    {table.truncated ? <div className="sticky bottom-0 border-t bg-card/95 px-3 py-2 text-center text-[10px] text-muted-foreground">Showing the first {table.values.length} of {table.totalRows} rows to keep animation responsive. SQLite validation still uses the full result.</div> : null}
  </div>;
}

function PanelGrid({ panels }: { panels: VisualizationPanel[] }) {
  return <div className="grid gap-3 lg:grid-cols-2">{panels.map((panel) => <section key={panel.id} className="min-w-0 rounded-xl border bg-card/40 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-semibold">{panel.label}</p><span className="text-[9px] text-muted-foreground">{panel.table.totalRows ?? panel.table.values.length} rows</span></div><VisualTable compact table={panel.table} step={{ id: panel.id, kind: "source", title: panel.label, clause: "TABLE", explanation: "", table: panel.table, highlightedColumns: panel.highlightedColumns, highlightedRowIds: panel.highlightedRowIds, unmatchedRowIds: panel.unmatchedRowIds, rowTone: "insert" }} /></section>)}</div>;
}

function GroupCards({ step }: { step: VisualizationStep }) {
  if (!step.groups?.length) return null;
  return <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{step.groups.slice(0, 12).map((group, index) => <div key={group.id} className={cn("rounded-lg border-l-4 bg-card/60 p-3", GROUP_STYLES[index % GROUP_STYLES.length])}><p className="truncate text-[10px] font-semibold" title={group.label}>{group.label}</p><p className="mt-1 text-[9px] text-muted-foreground">{group.rowCount} contributing row{group.rowCount === 1 ? "" : "s"}</p>{group.calculations.map((calculation) => <p key={calculation} className="mt-1 font-mono text-[10px] text-primary">{calculation}</p>)}</div>)}</div>;
}

export function VisualizerPlayer({ plan, presentation = false, onExit }: { plan: VisualizationPlan; presentation?: boolean; onExit?: () => void }) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);
  const step = plan.steps[stepIndex];
  const previous = stepIndex > 0 ? plan.steps[stepIndex - 1].table : undefined;
  const isMutation = plan.analysis.statementType !== "select";

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStepIndex((current) => {
      if (current >= plan.steps.length - 1) { window.setTimeout(() => setPlaying(false), 0); return current; }
      return current + 1;
    }), 1500 / speed);
    return () => window.clearInterval(timer);
  }, [plan.steps.length, playing, speed]);

  React.useEffect(() => {
    if (!presentation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }
      else if (event.key === "ArrowRight") { event.preventDefault(); setPlaying(false); setStepIndex((current) => Math.min(plan.steps.length - 1, current + 1)); }
      else if (event.key === " ") { event.preventDefault(); setPlaying((current) => !current); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); setPlaying(false); setStepIndex(0); }
      else if (event.key === "Escape") onExit?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit, plan.steps.length, presentation]);

  const journeyLabel = plan.analysis.sourceTables.map((source) => source.tableName).join(" ↔ ");
  return <div className={cn("flex flex-col bg-card/15", presentation ? "teaching-visualizer min-h-[calc(100vh-4.5rem)]" : "min-h-[calc(100vh-9rem)]")}>
    <header className={cn("border-b bg-card/60", presentation ? "px-8 py-5" : "px-4 py-4 sm:px-6")}>
      <div className="flex flex-wrap items-center gap-3"><div className={cn("grid place-items-center rounded-xl bg-violet-500/10 text-violet-500", presentation ? "size-12" : "size-10")}><Sparkles className={presentation ? "size-6" : "size-5"} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className={cn("font-display font-semibold", presentation ? "text-2xl" : "text-lg")}>Logical query journey</h2>{plan.validated ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3" />SQLite validated</span> : null}{isMutation ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400"><ShieldCheck className="size-3" />Checkpointed · replay safe</span> : null}</div><p className={cn("text-muted-foreground", presentation ? "text-sm" : "text-xs")}>{journeyLabel} · {plan.steps.length} educational steps</p></div><div className={cn("ml-auto flex flex-wrap items-center", presentation ? "gap-2" : "gap-1")}><Button variant="outline" size={presentation ? "lg" : "icon-sm"} onClick={() => { setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }} disabled={stepIndex === 0} aria-label="Previous step"><ChevronLeft />{presentation ? "Previous" : null}</Button><Button size={presentation ? "lg" : "sm"} onClick={() => setPlaying((current) => !current)}>{playing ? <Pause /> : <Play />}{playing ? "Pause" : "Play"}</Button><Button variant="outline" size={presentation ? "lg" : "icon-sm"} onClick={() => { setPlaying(false); setStepIndex((current) => Math.min(plan.steps.length - 1, current + 1)); }} disabled={stepIndex === plan.steps.length - 1} aria-label="Next step">{presentation ? "Next" : null}<ChevronRight /></Button><Button variant="ghost" size={presentation ? "lg" : "icon-sm"} onClick={() => { setPlaying(false); setStepIndex(0); }} aria-label="Restart visualization"><RotateCcw />{presentation ? "Restart" : null}</Button><label className={cn("ml-1 inline-flex items-center gap-1 text-muted-foreground", presentation ? "text-sm" : "text-[10px]")}><Gauge className="size-3" /><select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as (typeof SPEEDS)[number])} className={cn("rounded-lg border bg-background px-2", presentation ? "h-12 text-base" : "h-8 text-xs")} aria-label="Playback speed">{SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div></div>
      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">{plan.steps.map((item, index) => <button key={item.id} type="button" onClick={() => { setPlaying(false); setStepIndex(index); }} className={cn("flex min-w-24 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition", index === stepIndex ? "border-primary/40 bg-primary/10 text-primary" : index < stepIndex ? "border-emerald-500/20 bg-emerald-500/[.05]" : "bg-background/40 text-muted-foreground")}><span className="grid size-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold">{index + 1}</span><span className="truncate text-[10px] font-semibold">{item.clause}</span></button>)}</div>
    </header>
    <div className={cn("grid flex-1 gap-4 xl:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]", presentation ? "p-7" : "p-4 sm:p-6")}>
      <section className="min-w-0"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold">{plan.sources.length > 1 ? "Original sources" : isMutation ? "Captured before-state" : "Original source"}</p><span className="text-[10px] text-muted-foreground">unchanged during replay</span></div><div className="space-y-3">{plan.sources.map((source) => <div key={source.tableName}><div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-medium text-muted-foreground">{source.alias ? `${source.tableName} as ${source.alias}` : source.tableName}</span><span className="text-[9px] text-muted-foreground">{source.table.totalRows ?? source.table.values.length} rows</span></div><VisualTable table={source.table} original compact={plan.sources.length > 1} /></div>)}</div></section>
      <section className="min-w-0"><div className="mb-2 flex items-center justify-between"><p className={cn("font-semibold", presentation ? "text-lg" : "text-xs")}>Step {stepIndex + 1} · {step.title}</p><span className={cn("rounded-full bg-primary/10 font-bold text-primary", presentation ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[10px]")}>{step.clause}</span></div>{step.panels?.length ? <div className="mb-3"><PanelGrid panels={step.panels} /></div> : null}{!(step.kind === "source" && step.panels?.length) ? <VisualTable table={step.table} step={step} previous={previous} /> : null}<GroupCards step={step} /><div className={cn("mt-4 rounded-xl border border-primary/20 bg-primary/[.05]", presentation ? "p-6" : "p-4")}><div className="flex gap-3"><div className={cn("grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary", presentation ? "size-11" : "size-8")}><Rows3 className={presentation ? "size-5" : "size-4"} /></div><div><p className={cn("font-semibold", presentation ? "text-base" : "text-xs")}>What happens here</p><p className={cn("mt-1 text-muted-foreground", presentation ? "text-xl leading-8" : "text-sm leading-6")}>{step.explanation}</p></div></div></div></section>
    </div>
  </div>;
}

export function QueryVisualizer() {
  const plan = useDatabaseStore((state) => state.visualizationPlan);
  const error = useDatabaseStore((state) => state.visualizationError);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  if (plan) return <VisualizerPlayer key={`${plan.sql}-${plan.finalResult.elapsedMs}`} plan={plan} />;
  return <div className="grid min-h-[calc(100vh-9rem)] place-items-center p-8 text-center"><div className="max-w-2xl"><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-500"><Sparkles className="size-7" /></div><h2 className="mt-5 font-display text-2xl font-semibold">Step-by-step SQL visualizer</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Write a supported query or modification in the editor, then choose Visualize Query. Writes execute once behind a checkpoint; playback only reuses the captured before-and-after states.</p><p className="mt-4 rounded-xl border bg-card p-4 text-left text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Bounded visualization subset:</strong> {SUPPORTED_VISUALIZATION_SUBSET}</p>{error ? <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">{error}</p> : null}<Button className="mt-5" onClick={() => setActivePanel("editor")}>Return to SQL editor</Button></div></div>;
}
