"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Gauge,
  Keyboard,
  Link2,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUPPORTED_VISUALIZATION_SUBSET } from "@/lib/visualization/query-visualizer";
import type { VisualizationAggregate, VisualizationPanel, VisualizationPlan, VisualizationStep, VisualizationTable } from "@/lib/visualization/types";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const GROUP_STYLES = [
  "border-l-primary bg-selected",
  "border-l-info bg-info-tint",
  "border-l-warning bg-warning-tint",
  "border-l-destructive bg-destructive-tint",
  "border-l-success bg-success-tint",
] as const;

function rowKey(table: VisualizationTable, row: unknown[], index: number) {
  return table.rowIds?.[index] !== undefined
    ? `row-${table.rowIds[index]}`
    : table.rowKeys?.[index] ?? `${JSON.stringify(row)}-${index}`;
}

function displayValue(value: unknown) {
  if (value === null) return "NULL";
  if (value instanceof Uint8Array) return `BLOB · ${value.byteLength} B`;
  return String(value);
}

function tableRowCount(table: VisualizationTable) {
  return table.totalRows ?? table.values.length;
}

function VisualTable({ table, step, previous, original = false, compact = false, label }: {
  table: VisualizationTable;
  step?: VisualizationStep;
  previous?: VisualizationTable;
  original?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const highlighted = new Set(step?.highlightedColumns?.map((column) => column.toLowerCase()));
  const matches = new Set(step?.matchingRowIds ?? []);
  const matchingKeys = new Set(step?.matchingRowKeys ?? []);
  const affected = new Set(step?.highlightedRowIds ?? []);
  const unmatched = new Set(step?.unmatchedRowIds ?? []);
  const unmatchedKeys = new Set(step?.unmatchedRowKeys ?? []);
  const changes = new Map(step?.cellChanges?.map((change) => [`${change.rowId}:${change.column.toLowerCase()}`, change]) ?? []);
  const groupOrder = new Map<string, number>();
  table.rowGroups?.forEach((group) => {
    if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
  });
  const previousPositions = new Map(previous?.values.map((row, index) => [rowKey(previous, row, index), index]) ?? []);
  const hasFilter = !original && (step?.matchingRowIds !== undefined || step?.matchingRowKeys !== undefined);

  return <div
    className={cn(
      "workspace-scrollbar overflow-auto rounded-xl border bg-table",
      compact ? "max-h-64" : "max-h-[430px]",
      step?.projectionPhase === "apply" && "qq-project-apply",
    )}
    aria-label={label}
  >
    <Table className="min-w-max">
      <TableHeader className="sticky top-0 z-10 bg-table-header"><TableRow><TableHead className="w-12 border-r text-center">#</TableHead>{table.columns.map((column, index) => <TableHead key={`${column}-${index}`} className={cn("min-w-28 border-r transition-colors last:border-r-0", !original && highlighted.has(column.toLowerCase()) && "bg-selected text-selected-foreground")}>{column}</TableHead>)}</TableRow></TableHeader>
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
            hasFilter && isMatch && "border-l-success bg-success-tint ring-1 ring-inset ring-success/25",
            hasFilter && !isMatch && "opacity-60",
            isUnmatched && "border-l-warning bg-warning-tint",
            isAffected && step?.rowTone === "related" && "border-l-info bg-info-tint ring-1 ring-inset ring-info/25",
            isAffected && step?.rowTone === "insert" && "border-l-success bg-success-tint ring-1 ring-inset ring-success/25",
            isAffected && step?.rowTone === "update" && "border-l-warning bg-warning-tint ring-1 ring-inset ring-warning/25",
            isAffected && step?.rowTone === "delete" && "border-l-destructive bg-destructive-tint ring-1 ring-inset ring-destructive/25",
            group && GROUP_STYLES[(groupOrder.get(group) ?? 0) % GROUP_STYLES.length],
            step?.animateReorder && "qq-order-row",
            step?.animateCombine && "qq-combine-row",
          )}
          style={step?.animateReorder ? ({ "--qq-row-shift": `${shift}px` } as React.CSSProperties) : undefined}
        >
          <TableCell className="border-r text-center text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
          {row.map((value, columnIndex) => {
            const column = table.columns[columnIndex] ?? "";
            const change = id === undefined ? undefined : changes.get(`${id}:${column.toLowerCase()}`);
            return <TableCell key={columnIndex} className={cn("max-w-64 border-r font-mono text-[13px] transition-colors last:border-r-0", !original && highlighted.has(column.toLowerCase()) && "bg-selected text-selected-foreground", change && "bg-warning-tint text-warning ring-1 ring-inset ring-warning/30")} title={displayValue(value)}>
              {change ? <span className="flex min-w-24 flex-col"><span>{displayValue(change.after)}</span><span className="mt-0.5 text-xs text-muted-foreground line-through">was {displayValue(change.before)}</span></span> : value === null ? <span className="italic text-muted-foreground">NULL</span> : <span className="block truncate">{displayValue(value)}</span>}
            </TableCell>;
          })}
        </TableRow>;
      }) : <TableRow><TableCell colSpan={table.columns.length + 1} className="h-28 text-center text-xs text-muted-foreground">No rows at this stage.</TableCell></TableRow>}</TableBody>
    </Table>
    {table.truncated ? <div className="sticky bottom-0 border-t bg-surface-elevated/95 px-3 py-2 text-center text-xs text-muted-foreground">Showing the first {table.values.length} of {table.totalRows} rows to keep animation responsive. SQLite validation still uses the full result.</div> : null}
  </div>;
}

function PanelGrid({ panels, step }: { panels: VisualizationPanel[]; step: VisualizationStep }) {
  return <div className="grid gap-3 lg:grid-cols-2">{panels.map((panel) => {
    const relatedCount = panel.highlightedRowIds?.length ?? 0;
    const unmatchedCount = panel.unmatchedRowIds?.length ?? 0;
    const panelStep: VisualizationStep = {
      id: panel.id,
      kind: step.kind,
      title: panel.label,
      clause: "TABLE",
      explanation: "",
      table: panel.table,
      highlightedColumns: panel.highlightedColumns,
      highlightedRowIds: panel.highlightedRowIds,
      unmatchedRowIds: panel.unmatchedRowIds,
      rowTone: step.kind === "join" ? "related" : step.rowTone,
    };
    return <section key={panel.id} className="min-w-0 rounded-xl border bg-surface p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2"><p className="text-[13px] font-semibold">{panel.label}</p><span className="ml-auto text-xs text-muted-foreground">{tableRowCount(panel.table)} rows</span>{relatedCount ? <span className="rounded-full bg-info-tint px-2 py-0.5 text-xs font-semibold text-info">{relatedCount} related</span> : null}{unmatchedCount ? <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-semibold text-warning">{unmatchedCount} unmatched</span> : null}</div>
      <VisualTable compact table={panel.table} step={panelStep} label={`${panel.label} visualization table`} />
    </section>;
  })}</div>;
}

function GroupCards({ step }: { step: VisualizationStep }) {
  if (!step.groups?.length) return null;
  return <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{step.groups.slice(0, 12).map((group, index) => <div key={group.id} className={cn("rounded-lg border-l-4 p-3", GROUP_STYLES[index % GROUP_STYLES.length])}><p className="truncate text-[13px] font-semibold" title={group.label}>{group.label}</p><p className="mt-1 text-xs text-muted-foreground">{group.rowCount} contributing row{group.rowCount === 1 ? "" : "s"}</p>{group.calculations.map((calculation) => <p key={calculation} className="mt-1 font-mono text-xs text-primary">{calculation}</p>)}</div>)}</div>;
}

function AggregateGuide({ aggregates }: { aggregates: VisualizationAggregate[] }) {
  if (!aggregates.length) return null;
  const descriptions: Record<VisualizationAggregate["function"], string> = {
    COUNT: "COUNT(*) counts rows; COUNT(column) counts non-NULL values.",
    SUM: "SUM adds non-NULL inputs and returns NULL when no non-NULL input exists.",
    AVG: "AVG averages non-NULL inputs using SQLite numeric conversion rules.",
    MIN: "MIN returns the smallest non-NULL value in each group.",
    MAX: "MAX returns the largest non-NULL value in each group.",
  };
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{aggregates.map((aggregate) => <div key={aggregate.output} className="rounded-lg border bg-surface p-3"><p className="font-mono text-xs font-semibold text-primary">{aggregate.function}({aggregate.column}) → {aggregate.output}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{descriptions[aggregate.function]}</p></div>)}</div>;
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "primary" | "success" | "info" | "warning" }) {
  return <div className={cn("rounded-lg border px-3 py-2", tone === "primary" && "border-primary/25 bg-selected", tone === "success" && "border-success/25 bg-success-tint", tone === "info" && "border-info/25 bg-info-tint", tone === "warning" && "border-warning/25 bg-warning-tint", tone === "neutral" && "bg-surface")}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-[13px] font-semibold">{value}</p></div>;
}

function StepTeachingNotes({ plan, step }: { plan: VisualizationPlan; step: VisualizationStep }) {
  const totalRows = tableRowCount(step.table);
  const matchCount = step.matchingRowIds?.length ?? step.matchingRowKeys?.length;
  if (step.kind === "filter") return <div className="flex flex-wrap gap-2"><Metric label="Rows evaluated" value={String(totalRows)} /><Metric label="TRUE · retained" value={String(matchCount ?? 0)} tone="success" /><Metric label="FALSE or NULL · removed" value={String(Math.max(0, totalRows - (matchCount ?? 0)))} /></div>;
  if (step.kind === "project") return <div className="flex flex-wrap gap-2"><Metric label="Projection state" value={step.projectionPhase === "apply" ? "Applied output" : "Source columns highlighted"} tone="primary" /><Metric label="Output columns" value={String(step.projectionPhase === "apply" ? step.table.columns.length : plan.analysis.selectedColumns.length)} /></div>;
  if (step.kind === "order") return <div className="space-y-2"><div className="flex flex-wrap gap-2">{plan.analysis.orderBy.map((term) => <span key={`${term.column}-${term.direction}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-2 font-mono text-xs font-semibold">{term.direction === "ASC" ? <ArrowUp className="size-3.5 text-info" /> : <ArrowDown className="size-3.5 text-primary" />}{term.column} · {term.direction}</span>)}</div><p className="text-xs leading-5 text-muted-foreground">Equal sort keys are not guaranteed to keep a particular relative order unless later ORDER BY terms resolve the tie.</p></div>;
  if (step.kind === "join" && plan.analysis.join) {
    const unmatched = step.unmatchedRowKeys?.length ?? 0;
    return <div className="flex flex-wrap gap-2"><Metric label="Join type" value={`${plan.analysis.join.type} JOIN`} tone="primary" /><Metric label="Row combinations" value={String(totalRows)} tone="info" />{plan.analysis.join.type === "LEFT" ? <Metric label="Unmatched left rows" value={String(unmatched)} tone="warning" /> : null}</div>;
  }
  if (step.kind === "group") return <div className="flex flex-wrap gap-2"><Metric label="Logical groups" value={String(step.groups?.length ?? 0)} tone="primary" /><Metric label="Contributing rows" value={String(totalRows)} /></div>;
  if (step.kind === "aggregate") return <AggregateGuide aggregates={plan.analysis.aggregates} />;
  return null;
}

function Timeline({ steps, stepIndex, onStepChange }: { steps: VisualizationStep[]; stepIndex: number; onStepChange: (index: number) => void }) {
  const progress = ((stepIndex + 1) / steps.length) * 100;
  return <div className="mt-3">
    <div className="mb-2 flex items-center gap-3"><p className="text-[13px] font-semibold">Step {stepIndex + 1} of {steps.length}</p><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Visualization progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1}><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} /></div><span className="text-xs tabular-nums text-muted-foreground">{Math.round(progress)}%</span></div>
    <div className="workspace-scrollbar flex gap-1.5 overflow-x-auto pb-1" aria-label="Query visualization steps">{steps.map((item, index) => {
      const state = index === stepIndex ? "active" : index < stepIndex ? "complete" : "upcoming";
      return <button key={item.id} type="button" aria-current={state === "active" ? "step" : undefined} aria-label={`${state === "complete" ? "Completed" : state === "active" ? "Current" : "Upcoming"} step ${index + 1}: ${item.clause}`} onClick={() => onStepChange(index)} className={cn("group flex min-w-32 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left transition", state === "active" && "border-primary/45 bg-selected text-selected-foreground shadow-sm", state === "complete" && "border-success/25 bg-success-tint text-success", state === "upcoming" && "bg-surface text-muted-foreground hover:bg-hover hover:text-foreground")}><span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-xs font-bold", state === "active" && "border-primary bg-primary text-primary-foreground", state === "complete" && "border-success bg-success text-white")}>{state === "complete" ? <Check className="size-3" /> : state === "active" ? <Circle className="size-2.5 fill-current" /> : index + 1}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.clause}</span><span className="block truncate text-xs opacity-75">{item.title}</span></span></button>;
    })}</div>
  </div>;
}

export function VisualizerPlayer({ plan, presentation = false, focusMode = false }: { plan: VisualizationPlan; presentation?: boolean; focusMode?: boolean }) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);
  const activePanel = useWorkspaceStore((state) => state.activePanel);
  const step = plan.steps[stepIndex];
  const previous = stepIndex > 0 ? plan.steps[stepIndex - 1].table : undefined;
  const isMutation = plan.analysis.statementType !== "select";
  const atFinalStep = stepIndex === plan.steps.length - 1;

  const goToStep = React.useCallback((index: number) => {
    setPlaying(false);
    setStepIndex(Math.min(plan.steps.length - 1, Math.max(0, index)));
  }, [plan.steps.length]);

  const togglePlayback = React.useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (atFinalStep) setStepIndex(0);
    setPlaying(true);
  }, [atFinalStep, playing]);

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (stepIndex >= plan.steps.length - 1) setPlaying(false);
      else setStepIndex(stepIndex + 1);
    }, 1500 / speed);
    return () => window.clearTimeout(timer);
  }, [plan.steps.length, playing, speed, stepIndex]);

  React.useEffect(() => {
    if (!presentation && activePanel !== "visualizer") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToStep(stepIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToStep(stepIndex + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        goToStep(0);
      } else if (event.key === "Home") {
        event.preventDefault();
        goToStep(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToStep(plan.steps.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, goToStep, plan.steps.length, presentation, stepIndex, togglePlayback]);

  const journeyLabel = plan.analysis.sourceTables.map((source) => source.tableName).join(" ↔ ");
  const sourceHeading = plan.sources.length > 1
    ? `Original sources — ${plan.sources.reduce((total, source) => total + tableRowCount(source.table), 0)} rows across ${plan.sources.length} tables`
    : `Original ${plan.sources[0]?.tableName ?? "source"} table — ${tableRowCount(plan.sources[0]?.table ?? plan.source)} rows`;

  return <div className={cn("flex flex-col bg-background", presentation ? "teaching-visualizer min-h-[calc(100vh-4.5rem)]" : "min-h-[calc(100vh-9rem)]")}>
    <header className={cn("sticky top-0 z-30 border-b bg-surface-elevated/95 shadow-sm backdrop-blur-xl", presentation ? "px-8 py-4" : "px-4 py-3 sm:px-6")}>
      <div className="flex flex-wrap items-center gap-3"><div className={cn("grid place-items-center rounded-xl bg-selected text-selected-foreground", presentation ? "size-12" : "size-10")}><Sparkles className={presentation ? "size-6" : "size-5"} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className={cn("font-display font-semibold", presentation ? "text-2xl" : "text-lg")}>Logical query journey</h2>{plan.validated ? <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-semibold text-success"><CheckCircle2 className="size-3" />SQLite validated</span> : null}{isMutation ? <span className="inline-flex items-center gap-1 rounded-full bg-info-tint px-2 py-0.5 text-xs font-semibold text-info"><ShieldCheck className="size-3" />Checkpointed · replay safe</span> : null}</div><p className={cn("truncate text-muted-foreground", presentation ? "text-sm" : "text-xs")}>{journeyLabel} · logical teaching sequence, not a physical query plan</p></div>
        <div className={cn("ml-auto flex flex-wrap items-center", presentation ? "gap-2" : "gap-1.5")}><Button variant="outline" size={presentation ? "lg" : "sm"} onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label="Previous step"><ChevronLeft /><span className={presentation ? "" : "hidden sm:inline"}>Previous</span></Button><Button size={presentation ? "lg" : "sm"} onClick={togglePlayback}>{playing ? <Pause /> : atFinalStep ? <RotateCcw /> : <Play />}{playing ? "Pause" : atFinalStep ? "Replay" : "Play"}</Button><Button variant="outline" size={presentation ? "lg" : "sm"} onClick={() => goToStep(stepIndex + 1)} disabled={atFinalStep} aria-label="Next step"><span className={presentation ? "" : "hidden sm:inline"}>Next</span><ChevronRight /></Button><Button variant="ghost" size={presentation ? "lg" : "sm"} onClick={() => goToStep(0)} aria-label="Restart visualization"><RotateCcw /><span className={presentation ? "" : "hidden xl:inline"}>Restart</span></Button><label className={cn("inline-flex items-center gap-1 text-muted-foreground", presentation ? "text-sm" : "text-xs")}><Gauge className="size-3.5" /><select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as (typeof SPEEDS)[number])} className={cn("rounded-lg border bg-surface px-2", presentation ? "h-12 text-base" : "h-9 text-xs")} aria-label="Playback speed">{SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select></label></div>
      </div>
      <Timeline steps={plan.steps} stepIndex={stepIndex} onStepChange={goToStep} />
    </header>

    <main className={cn("flex-1", presentation ? "p-7" : "p-4 sm:p-6")}>
      <div className={cn("grid items-start gap-4", !focusMode && "xl:grid-cols-2")}>
        {!focusMode ? <section className="min-w-0 rounded-xl border bg-surface-elevated p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-info-tint text-info"><Rows3 className="size-4" /></div><div><p className="text-sm font-semibold">{sourceHeading}</p><p className="text-xs text-muted-foreground">Unchanged during animation replay</p></div></div><div className="space-y-3">{plan.sources.map((source) => <div key={source.tableName}>{plan.sources.length > 1 ? <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[13px] font-medium">{source.alias ? `${source.tableName} as ${source.alias}` : source.tableName}</span><span className="text-xs text-muted-foreground">{tableRowCount(source.table)} rows</span></div> : null}<VisualTable table={source.table} original compact={plan.sources.length > 1} label={`Original ${source.tableName} table`} /></div>)}</div></section> : null}
        <section className={cn("min-w-0 rounded-xl border bg-surface-elevated p-4 shadow-sm", focusMode && "border-primary/50 ring-2 ring-primary/20")}><div className="mb-3 flex flex-wrap items-center gap-2"><div className="grid size-8 place-items-center rounded-lg bg-selected text-selected-foreground"><Sparkles className="size-4" /></div><div><p className={cn("font-semibold", presentation ? "text-lg" : "text-sm")}>Step {stepIndex + 1}: {step.clause} — {tableRowCount(step.table)} rows</p><p className={cn("text-muted-foreground", presentation ? "text-sm" : "text-xs")}>{step.title}</p></div>{focusMode ? <span className="rounded-full border border-primary/30 bg-selected px-3 py-1 text-sm font-semibold text-selected-foreground">Focused step</span> : null}<span className={cn("ml-auto rounded-full bg-selected font-bold text-selected-foreground", presentation ? "px-3 py-1 text-sm" : "px-2.5 py-1 text-xs")}>{step.clause}</span></div>{step.panels?.length ? <div className="mb-3"><PanelGrid panels={step.panels} step={step} /></div> : null}{!(step.panels?.length && (step.kind === "source" || step.projectionPhase === "highlight")) ? <VisualTable table={step.table} step={step} previous={previous} label={`${step.clause} transformation table`} /> : null}<GroupCards step={step} /></section>
      </div>

      <section className={cn("mt-4 rounded-xl border border-primary/20 bg-selected p-4 shadow-sm", presentation && "p-6", focusMode && "border-primary/50")} aria-live="polite"><div className={cn("grid gap-4", !focusMode && "lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]")}><div className="flex gap-3"><div className={cn("grid shrink-0 place-items-center rounded-lg bg-primary/10 text-primary", presentation ? "size-11" : "size-9")}><Rows3 className={presentation ? "size-5" : "size-4"} /></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Step {stepIndex + 1}: {step.clause}</p><h3 className={cn("mt-1 font-semibold", presentation ? "text-xl" : "text-base", focusMode && "text-2xl")}>{step.title}</h3><p className={cn("mt-2 text-muted-foreground", presentation ? "text-xl leading-8" : "text-sm leading-6", focusMode && "text-2xl leading-9")}>{step.explanation}</p><div className="mt-3"><StepTeachingNotes plan={plan} step={step} /></div></div></div><div className="min-w-0 rounded-lg border border-border bg-code-surface p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Code2 className="size-3.5 text-primary" />Relevant SQL clause</div><pre className={cn("workspace-scrollbar max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-code-foreground", presentation && "text-base leading-7", focusMode && "text-xl leading-8")}><code>{step.sqlFragment ?? step.clause}</code></pre></div></div><div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-primary/15 pt-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Keyboard className="size-3.5" />←/→ navigate · Space play/pause · R restart · Home/End jump</span><span className="inline-flex items-center gap-1.5"><Link2 className="size-3.5" />Logical teaching animation · SQLite remains the source of truth</span></div></section>
    </main>
  </div>;
}

export function QueryVisualizer() {
  const plan = useDatabaseStore((state) => state.visualizationPlan);
  const error = useDatabaseStore((state) => state.visualizationError);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  if (plan) return <VisualizerPlayer key={`${plan.sql}-${plan.finalResult.elapsedMs}`} plan={plan} />;
  return <div className="grid min-h-[calc(100vh-9rem)] place-items-center p-8 text-center"><div className="max-w-2xl"><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-primary/20 bg-selected text-selected-foreground"><Sparkles className="size-7" /></div><h2 className="mt-5 font-display text-2xl font-semibold">Step-by-step SQL visualizer</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Write a supported query or modification in the editor, then choose Visualize Query. Writes execute once behind a checkpoint; playback only reuses the captured before-and-after states.</p><p className="mt-4 rounded-xl border bg-surface p-4 text-left text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Bounded visualization subset:</strong> {SUPPORTED_VISUALIZATION_SUBSET}</p>{error ? <div className="mt-4 rounded-xl border border-warning/30 bg-warning-tint p-4 text-left"><p className="text-[13px] font-semibold text-warning">This query cannot be animated accurately</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p><p className="mt-2 text-xs text-muted-foreground">Normal SQL execution remains available in the editor; QueryQuest will not fabricate unsupported steps.</p></div> : null}<Button className="mt-5" onClick={() => setActivePanel("editor")}>Return to SQL editor</Button></div></div>;
}
