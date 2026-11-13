"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Code2,
  Columns3,
  Database,
  Download,
  FileDatabase,
  HardDrive,
  History,
  KeyRound,
  Link2,
  PanelLeftClose,
  Rows3,
  Search,
  Sparkles,
  Table2,
  TableProperties,
  X,
  Undo2,
  Redo2,
  RotateCcw,
  Waypoints,
  Network,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";

import { DatabaseDataTable } from "@/components/playground/database-data-table";
import { VisualDataEditor } from "@/components/playground/visual-data-editor";
import { TableDesignerDialog } from "@/components/playground/table-designer-dialog";
import { CreateDatabaseDialog } from "@/components/import/create-database-dialog";
import { ImportDatabaseDialog } from "@/components/import/import-database-dialog";
import { QueryHistoryPanel } from "@/components/playground/query-history-panel";
import { SaveResultDialog } from "@/components/playground/save-result-dialog";
import { QueryVisualizer } from "@/components/playground/query-visualizer";
import { DatabaseActionsMenu } from "@/components/playground/database-actions-menu";
import { TableActionsMenu } from "@/components/playground/table-actions-menu";
import { TableSchemaEditorDialog } from "@/components/playground/table-schema-editor-dialog";
import { TeachingMode } from "@/components/playground/teaching-mode";
import { WorkspaceManagerDialog } from "@/components/playground/workspace-manager-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { queryResultToCsv } from "@/lib/database/workspace-format";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

const MonacoSqlEditor = dynamic(
  () =>
    import("@/components/playground/monaco-sql-editor").then(
      (module) => module.MonacoSqlEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[330px] space-y-3 border-b border-border p-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    ),
  },
);

const SchemaDiagram = dynamic(
  () => import("@/components/playground/schema-diagram").then((module) => module.SchemaDiagram),
  { ssr: false, loading: () => <div className="grid min-h-[520px] place-items-center"><Skeleton className="h-40 w-72 rounded-2xl" /></div> },
);

const workspaceTabs = [
  { id: "editor" as const, label: "SQL Editor", icon: Code2 },
  { id: "visualizer" as const, label: "Visualizer", icon: Waypoints },
  { id: "data" as const, label: "Table Data", icon: Sparkles },
  { id: "schema" as const, label: "ER Diagram", icon: Network },
  { id: "history" as const, label: "History", icon: History },
];

function ExplorerLoading() {
  return (
    <div className="space-y-3 p-3" aria-label="Loading database explorer">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-8 w-[88%]" />
    </div>
  );
}

function ExplorerSidebar() {
  const [schemaEditorTable, setSchemaEditorTable] = React.useState<string | null>(null);
  const [tableFilter, setTableFilter] = React.useState("");
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [collapsedSelectedKey, setCollapsedSelectedKey] = React.useState<string | null>(null);
  const { explorerCollapsed, explorerWidth, toggleExplorer, setExplorerWidth } = useWorkspaceStore();
  const status = useDatabaseStore((state) => state.status);
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);
  const tables = useDatabaseStore((state) => state.tables);
  const tableSchemas = useDatabaseStore((state) => state.tableSchemas);
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const switchDatabase = useDatabaseStore((state) => state.switchDatabase);
  const selectTable = useDatabaseStore((state) => state.selectTable);

  const filteredTables = tables.filter((table) =>
    table.name.toLocaleLowerCase().includes(tableFilter.trim().toLocaleLowerCase()),
  );

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = explorerWidth;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (nextEvent: PointerEvent) =>
      setExplorerWidth(startWidth + nextEvent.clientX - startX);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  const toggleTable = async (tableName: string) => {
    const tableKey = `${activeDatabaseId ?? "none"}:${tableName}`;
    const currentlyExpanded = expandedTables.has(tableName) || (
      selectedTable === tableName && collapsedSelectedKey !== tableKey
    );
    if (selectedTable !== tableName) {
      await selectTable(tableName);
      setCollapsedSelectedKey(null);
    } else {
      setCollapsedSelectedKey(currentlyExpanded ? tableKey : null);
    }
    setExpandedTables((current) => {
      const next = new Set(current);
      if (currentlyExpanded) next.delete(tableName);
      else next.add(tableName);
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "relative shrink-0 border-b border-border bg-sidebar transition-[width] duration-200 md:border-b-0 md:border-r",
        explorerCollapsed
          ? "h-11 w-full overflow-hidden md:h-auto md:w-14"
          : "h-80 w-full overflow-hidden md:h-auto md:w-[var(--explorer-width)] md:min-w-[230px] md:max-w-[360px]",
      )}
      style={{ "--explorer-width": `${explorerWidth}px` } as React.CSSProperties}
      aria-label="Database explorer"
    >
      <div className="sticky top-0 z-10 flex h-11 items-center justify-between border-b border-border bg-surface-elevated/95 px-3 backdrop-blur">
        {!explorerCollapsed ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <FileDatabase className="size-4" />
            Database Explorer
          </div>
        ) : (
          <Database className="mx-auto hidden size-4 text-muted-foreground md:block" />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleExplorer}
          aria-label={explorerCollapsed ? "Expand database explorer" : "Collapse database explorer"}
          title={explorerCollapsed ? "Expand explorer" : "Collapse explorer"}
          className={cn(explorerCollapsed && "absolute right-2 top-2 md:static")}
        >
          {explorerCollapsed ? <ChevronRight /> : <PanelLeftClose />}
        </Button>
      </div>

      {!explorerCollapsed ? (
        <div className="flex h-[calc(100%-2.75rem)] min-h-0 flex-col">
          {status === "initializing" || status === "idle" ? <ExplorerLoading /> : databases.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
              <div className="grid size-11 place-items-center rounded-2xl border border-border bg-muted/45 text-muted-foreground"><Database className="size-5" /></div>
              <p className="mt-4 text-sm font-semibold">No databases yet.</p>
              <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Create an empty SQLite database or import one stored on your device.</p>
              <div className="mt-4 grid w-full max-w-64 grid-cols-1 gap-2 [&_button]:w-full"><ImportDatabaseDialog /><CreateDatabaseDialog /></div>
            </div>
          ) : (
            <>
              <section className="shrink-0 border-b border-border p-3">
                <div className="flex items-center justify-between gap-2"><p className="ui-kicker">Databases <span className="text-muted-foreground">({databases.length})</span></p></div>
                <div className="mt-2 grid grid-cols-2 gap-2 [&_button]:w-full"><ImportDatabaseDialog triggerLabel="Import" /><CreateDatabaseDialog triggerLabel="Create" /></div>
                <div className="workspace-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface p-1.5">
                  {databases.map((database) => {
                    const active = database.id === activeDatabaseId;
                    return <div key={database.id} className={cn("flex items-center rounded-lg border border-transparent transition", active ? "border-primary/25 bg-selected text-selected-foreground" : "hover:bg-hover")}>
                      <button type="button" onClick={() => { setTableFilter(""); setExpandedTables(new Set()); setCollapsedSelectedKey(null); void switchDatabase(database.id); }} disabled={status !== "ready" || active} title={database.name} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] disabled:cursor-default">
                        {active ? <ChevronDown className="size-3.5 shrink-0 text-primary" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate font-semibold">{database.name}</span>
                        {active ? <span className="text-xs font-semibold uppercase tracking-wide">Active</span> : null}
                      </button>
                      <DatabaseActionsMenu database={database} />
                    </div>;
                  })}
                </div>
              </section>

              <section className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-11 items-center gap-2 px-3 pt-1"><div className="min-w-0 flex-1"><p className="ui-kicker truncate" title={activeDatabase?.name}>Tables — {activeDatabase?.name}</p></div><TableDesignerDialog trigger={<Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs"><Table2 className="size-3.5" />Create</Button>} /></div>
                <label className="mx-3 mb-2 flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-muted-foreground"><Search className="size-3.5" /><input value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} placeholder="Search tables…" className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none" /><span className="text-xs tabular-nums">{filteredTables.length}</span></label>
                {tables.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center px-5 py-7 text-center"><div className="grid size-11 place-items-center rounded-2xl border border-border bg-muted/45 text-muted-foreground"><Table2 className="size-5" /></div><p className="mt-4 text-sm font-semibold">No tables yet.</p><p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Create the first table in {activeDatabase?.name}.</p><div className="mt-4"><TableDesignerDialog /></div></div> : <div className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">{filteredTables.length ? <div className="space-y-1">{filteredTables.map((table) => {
                  const selected = selectedTable === table.name;
                  const expanded = expandedTables.has(table.name) || (
                    selected && collapsedSelectedKey !== `${activeDatabaseId ?? "none"}:${table.name}`
                  );
                  const schema = tableSchemas[table.name];
                  const foreignColumns = new Set(schema?.foreignKeys.map((foreignKey) => foreignKey.fromColumn) ?? []);
                  return <div key={table.name} className={cn("overflow-visible rounded-lg border border-transparent", selected && "border-primary/20 bg-selected/55")}>
                    <div className="flex items-center"><button type="button" onClick={() => void toggleTable(table.name)} title={table.name} className={cn("flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[13px] transition hover:bg-hover", selected && "text-selected-foreground")}>
                      {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}<Table2 className="size-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate font-medium">{table.name}</span><span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{table.rowCount} rows</span>
                    </button><TableActionsMenu table={table} onEditSchema={() => setSchemaEditorTable(table.name)} /></div>
                    {expanded && schema ? <div className="ml-5 border-l border-border pb-1 pl-3 pr-2">{schema.columns.map((column) => {
                      const foreignKey = foreignColumns.has(column.name);
                      return <div key={column.name} className="flex min-h-7 items-center gap-2 py-1 text-xs text-muted-foreground">{column.primaryKey ? <KeyRound className="size-3 shrink-0 text-warning" aria-label="Primary key" /> : foreignKey ? <Link2 className="size-3 shrink-0 text-info" aria-label="Foreign key" /> : <Columns3 className="size-3 shrink-0" />}<span className="min-w-0 flex-1 truncate" title={column.name}>{column.name}</span><span className="max-w-20 truncate font-mono text-xs" title={column.type || "TEXT"}>{column.type || "TEXT"}</span>{column.primaryKey ? <span className="text-xs font-semibold text-warning">PK</span> : foreignKey ? <span className="text-xs font-semibold text-info">FK</span> : null}</div>;
                    })}{table.type === "table" ? <Button type="button" variant="ghost" size="sm" className="mt-1 w-full justify-start px-2 text-xs text-muted-foreground hover:text-primary" onClick={() => setSchemaEditorTable(table.name)}><TableProperties className="size-3.5" />Edit schema</Button> : null}</div> : null}
                  </div>;
                })}</div> : <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No tables match “{tableFilter}”.</p>}</div>}
              </section>

              <div className="shrink-0 border-t border-border bg-surface-elevated/95 p-3 backdrop-blur"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />{databases.length} {databases.length === 1 ? "database" : "databases"}<span className="ml-auto">IndexedDB</span></div></div>
            </>
          )}
        </div>
      ) : null}
      {!explorerCollapsed ? <div role="separator" aria-orientation="vertical" aria-label="Resize database explorer" title="Drag to resize Database Explorer" onPointerDown={startResize} className="absolute inset-y-0 right-0 z-20 hidden w-1.5 cursor-col-resize touch-none bg-transparent transition hover:bg-primary/25 md:block" /> : null}
      <TableSchemaEditorDialog tableName={schemaEditorTable} open={Boolean(schemaEditorTable)} onOpenChange={(nextOpen) => { if (!nextOpen) setSchemaEditorTable(null); }} />
    </aside>
  );
}

function DataPanel({ kind, className }: { kind: "source" | "result"; className?: string }) {
  const source = kind === "source";
  const sourceRecords = useDatabaseStore((state) => state.sourceRecords);
  const queryResult = useDatabaseStore((state) => state.queryResult);
  const queryError = useDatabaseStore((state) => state.queryError);
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const isTableLoading = useDatabaseStore((state) => state.isTableLoading);
  const isQueryRunning = useDatabaseStore((state) => state.isQueryRunning);
  const result = source ? sourceRecords : queryResult;
  const loading = source ? isTableLoading : isQueryRunning;
  const Icon = source ? Table2 : Rows3;

  const downloadCsv = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([queryResultToCsv(result)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `queryquest-result-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("CSV downloaded", { description: `${result.rowCount} result row${result.rowCount === 1 ? "" : "s"} exported.` });
  };

  return (
    <section className={cn("flex min-h-[270px] min-w-0 flex-1 flex-col bg-table", className)}>
      <header className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={cn("size-3.5", source ? "text-info" : "text-primary")} />
          {source ? "Original table" : "Result table"}
        </div>
        {source && selectedTable ? (
          <span className="ml-2 max-w-28 truncate rounded-full bg-info-tint px-2 py-0.5 text-xs font-semibold text-info">
            {selectedTable}
          </span>
        ) : null}
        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {result?.rowCount ?? 0} rows
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {!source && result?.columns.length ? <SaveResultDialog /> : null}
          {!source && result?.columns.length ? <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={downloadCsv} title="Download result as CSV"><Download />CSV</Button> : null}
          <Columns3 className="size-3" />
          {result?.columns.length ?? 0} columns
          {!source && result ? (
            <span className="ml-1 whitespace-nowrap">{result.elapsedMs.toFixed(1)} ms</span>
          ) : null}
        </div>
      </header>
      <div className="workspace-scrollbar flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading table data">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-11/12" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : !source && queryError ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center" role="alert">
            <div className="grid size-11 place-items-center rounded-2xl bg-destructive-tint text-destructive">
              <AlertCircle className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-destructive">SQL execution failed</p>
            <p className="mt-1.5 max-w-md font-mono text-[13px] leading-5 text-muted-foreground">
              {queryError}
            </p>
          </div>
        ) : result && result.columns.length > 0 ? (
          <DatabaseDataTable result={result} label={source ? "original table" : "query result"} />
        ) : (
          <EmptyState
            compact
            icon={source ? Database : Rows3}
            title={source ? "Choose a source table" : "Run a SELECT query"}
            description={
              source
                ? "Select a table in the explorer to inspect its stored records."
                : "Your real SQLite result will appear here without leaving the browser."
            }
          />
        )}
      </div>
    </section>
  );
}

function EditorDatabaseContextBar() {
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const status = useDatabaseStore((state) => state.status);
  const switchDatabase = useDatabaseStore((state) => state.switchDatabase);

  return <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-border bg-surface-elevated px-3 py-1.5 sm:px-4">
    <Database className="size-3.5 text-primary" />
    <label className="flex min-w-0 items-center gap-2 text-[13px] font-medium"><span className="text-muted-foreground">Database:</span><select aria-label="Active database" value={activeDatabaseId ?? ""} disabled={status !== "ready" || databases.length === 0} onChange={(event) => void switchDatabase(event.target.value)} className="h-8 max-w-64 min-w-0 rounded-lg border border-border bg-surface px-2 text-[13px] font-semibold text-foreground outline-none focus:border-primary">
      {databases.length === 0 ? <option value="">No databases</option> : databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}
    </select></label>
    <span className="text-xs text-muted-foreground">Schemas and autocomplete update when the selection changes. SQL is not executed automatically.</span>
  </div>;
}

function WorkspaceNavigation({ onEnterTeachingMode }: { onEnterTeachingMode: () => void }) {
  const { activePanel, setActivePanel } = useWorkspaceStore();
  const canUndo = useDatabaseStore((state) => state.canUndo);
  const canRedo = useDatabaseStore((state) => state.canRedo);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const undo = useDatabaseStore((state) => state.undo);
  const redo = useDatabaseStore((state) => state.redo);
  const resetDatabase = useDatabaseStore((state) => state.resetDatabase);

  const runAction = async (action: "undo" | "redo" | "reset") => {
    if (action === "reset" && !window.confirm("Reset this database to its initial saved checkpoint? Current changes will be checkpointed so the reset can be undone.")) return;
    try { await (action === "undo" ? undo() : action === "redo" ? redo() : resetDatabase()); toast.success(action === "reset" ? "Database reset" : `${action[0].toUpperCase()}${action.slice(1)} complete`); }
    catch (error) { toast.error(`Could not ${action}`, { description: error instanceof Error ? error.message : "Try again." }); }
  };

  return (
    <div className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-3 sm:px-4">
      {workspaceTabs.map((tab) => {
        const Icon = tab.icon;
        const active = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActivePanel(tab.id)}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-[13px] font-medium text-muted-foreground transition hover:text-foreground",
              active && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-1 border-l pl-2">
        <WorkspaceManagerDialog />
        <Button variant="outline" size="sm" className="mr-1 border-primary/25 bg-selected text-selected-foreground hover:bg-hover" onClick={onEnterTeachingMode} aria-label="Enter Teaching Mode"><GraduationCap /><span className="hidden lg:inline">Teaching Mode</span></Button>
        <Button variant="ghost" size="icon-sm" disabled={!canUndo || isMutating} onClick={() => void runAction("undo")} title="Undo database change" aria-label="Undo database change"><Undo2 /></Button>
        <Button variant="ghost" size="icon-sm" disabled={!canRedo || isMutating} onClick={() => void runAction("redo")} title="Redo database change" aria-label="Redo database change"><Redo2 /></Button>
        <Button variant="ghost" size="icon-sm" disabled={isMutating} onClick={() => void runAction("reset")} title="Reset database" aria-label="Reset database"><RotateCcw /></Button>
      </div>
    </div>
  );
}

function DatabaseErrorBanner() {
  const error = useDatabaseStore((state) => state.error);
  const clearError = useDatabaseStore((state) => state.clearError);
  if (!error) return null;

  return (
    <div className="flex items-start gap-2 border-b border-destructive/25 bg-destructive-tint px-4 py-2 text-[13px] text-destructive" role="alert">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1">{error}</span>
      <Button variant="ghost" size="icon-sm" onClick={clearError} aria-label="Dismiss database error">
        <X />
      </Button>
    </div>
  );
}

export function SqlWorkspace() {
  const [teachingMode, setTeachingMode] = React.useState(false);
  const status = useDatabaseStore((state) => state.status);
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);
  const activePanel = useWorkspaceStore((state) => state.activePanel);
  const editorSql = useWorkspaceStore((state) => state.editorSql);
  const explorerCollapsed = useWorkspaceStore((state) => state.explorerCollapsed);
  const explorerWidth = useWorkspaceStore((state) => state.explorerWidth);
  const activeWorkspaceId = useDatabaseStore((state) => state.activeWorkspaceId);
  const saveWorkspaceSettings = useDatabaseStore((state) => state.saveWorkspaceSettings);

  React.useEffect(() => {
    if (status !== "ready" || !activeWorkspaceId) return;
    const timeout = window.setTimeout(() => {
      void saveWorkspaceSettings({ activePanel, editorSql, explorerCollapsed, explorerWidth }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [activePanel, activeWorkspaceId, editorSql, explorerCollapsed, explorerWidth, saveWorkspaceSettings, status]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-background">
      <WorkspaceNavigation onEnterTeachingMode={() => {
        setTeachingMode(true);
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }} />
      <DatabaseErrorBanner />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ExplorerSidebar />
        <div className="min-w-0 flex-1">
          <div hidden={activePanel !== "editor"}><EditorDatabaseContextBar /><MonacoSqlEditor /><div className="flex min-h-[290px] flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0"><DataPanel kind="source" className="md:resize-x md:overflow-auto" /><DataPanel kind="result" /></div></div>
          <div hidden={activePanel !== "visualizer"}><QueryVisualizer /></div>
          <div hidden={activePanel !== "data"}><VisualDataEditor /></div>
          <div hidden={activePanel !== "schema"}><SchemaDiagram /></div>
          <div hidden={activePanel !== "history"}><QueryHistoryPanel /></div>
        </div>
      </div>
      <footer className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-elevated px-3 py-1 text-xs text-muted-foreground sm:px-4">
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3" />
          {activeDatabase?.name ?? "No active database"}
        </span>
        <span className="inline-flex items-center gap-1.5" title="SQLite runs locally in a Web Worker">
          <span className={cn("size-1.5 rounded-full", status === "ready" ? "bg-success" : "bg-warning")} />
          {status === "ready" ? "SQLite ready" : "SQLite initializing"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5" title="Database files and workspace metadata are stored in browser IndexedDB">
          <HardDrive className="size-3" />
          Saved locally
        </span>
      </footer>
      {teachingMode ? <TeachingMode onExit={() => setTeachingMode(false)} /> : null}
    </div>
  );
}
