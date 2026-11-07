"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ChevronRight,
  Clock3,
  Code2,
  Columns3,
  Database,
  Download,
  FileDatabase,
  HardDrive,
  History,
  Info,
  KeyRound,
  LockKeyhole,
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
  { id: "editor" as const, label: "Editor", icon: Code2, disabled: false },
  { id: "visualizer" as const, label: "Query visualizer", icon: Waypoints, disabled: false },
  { id: "data" as const, label: "Visual data", icon: Sparkles, disabled: false },
  { id: "schema" as const, label: "Schema diagram", icon: Network, disabled: false },
  { id: "history" as const, label: "Query history", icon: History, disabled: false },
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
  const { explorerCollapsed, toggleExplorer } = useWorkspaceStore();
  const status = useDatabaseStore((state) => state.status);
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const tables = useDatabaseStore((state) => state.tables);
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const selectedSchema = useDatabaseStore((state) => state.selectedSchema);
  const switchDatabase = useDatabaseStore((state) => state.switchDatabase);
  const selectTable = useDatabaseStore((state) => state.selectTable);

  return (
    <aside
      className={cn(
        "workspace-scrollbar relative shrink-0 border-b border-border bg-card/40 transition-[width] duration-200 md:border-b-0 md:border-r",
        explorerCollapsed
          ? "h-12 w-full overflow-hidden md:h-auto md:w-14"
          : "h-72 w-full overflow-auto md:h-auto md:w-[280px] md:min-w-[230px] md:max-w-[440px] md:resize-x",
      )}
      aria-label="Database explorer"
    >
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-card/90 px-3 backdrop-blur">
        {!explorerCollapsed ? (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            <FileDatabase className="size-4" />
            Explorer
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
        <div className="flex min-h-[calc(100%-3rem)] flex-col">
          <div className="border-b border-border p-3">
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground/70">Databases</p>
            <div className="mt-2 grid gap-2 [&_button]:w-full">
              <ImportDatabaseDialog />
              <CreateDatabaseDialog />
            </div>
            <div className="workspace-scrollbar mt-2 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border bg-background/35 p-1.5">
              {databases.length ? databases.map((database) => {
                const active = database.id === activeDatabaseId;
                return <div key={database.id} className={cn("flex items-center rounded-lg transition", active ? "bg-primary/10 text-primary" : "hover:bg-accent")}>
                  <button type="button" onClick={() => void switchDatabase(database.id)} disabled={status !== "ready" || active} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs disabled:cursor-default">
                    <span className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-primary" : "bg-muted-foreground/35")} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{database.name}</span>
                    {active ? <span className="text-[8px] font-bold uppercase tracking-wide">Active</span> : null}
                  </button>
                  <DatabaseActionsMenu database={database} />
                </div>;
              }) : <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No databases yet.</p>}
            </div>
            <div className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 text-muted-foreground">
              <Search className="size-3.5" />
              <span className="text-[11px]">{activeDatabaseId ? `${tables.length} tables and views` : "Select or create a database"}</span>
            </div>
            {activeDatabaseId ? <div className="mt-2"><TableDesignerDialog /></div> : null}
          </div>

          {status === "initializing" || status === "idle" ? (
            <ExplorerLoading />
          ) : databases.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
              <div className="grid size-11 place-items-center rounded-2xl border border-border bg-muted/45 text-muted-foreground"><Database className="size-5" /></div>
              <p className="mt-4 text-sm font-semibold">No databases yet.</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Create an empty SQLite database or import one stored on your device.</p>
              <div className="mt-4 grid w-full max-w-64 grid-cols-1 gap-2 [&_button]:w-full"><ImportDatabaseDialog /><CreateDatabaseDialog /></div>
            </div>
          ) : tables.length > 0 ? (
            <div className="flex-1 p-2">
              <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[.16em] text-muted-foreground/70">
                Schema
              </p>
              <div className="space-y-0.5">
                {tables.map((table) => {
                  const active = selectedTable === table.name;
                  return (
                    <div key={table.name}>
                      <button
                        type="button"
                        onClick={() => void selectTable(table.name)}
                        onContextMenu={(event) => {
                          if (table.type !== "table") return;
                          event.preventDefault();
                          if (!active) void selectTable(table.name);
                          setSchemaEditorTable(table.name);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent",
                          active && "bg-primary/10 text-primary",
                        )}
                      >
                        <Table2 className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium">{table.name}</span>
                        <span className="text-[9px] tabular-nums text-muted-foreground">
                          {table.rowCount}
                        </span>
                      </button>
                      {active && selectedSchema ? (
                        <div className="ml-4 border-l border-border py-1 pl-3">
                          {selectedSchema.columns.map((column) => (
                            <div
                              key={column.name}
                              className="flex items-center gap-2 py-1 text-[10px] text-muted-foreground"
                            >
                              {column.primaryKey ? (
                                <KeyRound className="size-3 text-amber-500" />
                              ) : (
                                <Columns3 className="size-3" />
                              )}
                              <span className="min-w-0 flex-1 truncate">{column.name}</span>
                              <span className="max-w-20 truncate font-mono text-[8px] text-muted-foreground/70">
                                {column.type}
                              </span>
                            </div>
                          ))}
                          {table.type === "table" ? <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 w-full justify-start px-2 text-[10px] text-muted-foreground hover:text-primary" onClick={() => setSchemaEditorTable(table.name)}><TableProperties className="size-3" />Edit schema</Button> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
              <div className="grid size-11 place-items-center rounded-2xl border border-border bg-muted/45 text-muted-foreground">
                <Database className="size-5" />
              </div>
              <p className="mt-4 text-sm font-semibold">Empty database</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                This logical database is ready for internal schema setup.
              </p>
            </div>
          )}

          <div className="sticky bottom-0 border-t border-border bg-card/90 p-3 backdrop-blur">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {databases.length} {databases.length === 1 ? "database" : "databases"}
              <span className="ml-auto">IndexedDB</span>
            </div>
          </div>
        </div>
      ) : null}
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
    <section className={cn("flex min-h-[270px] min-w-0 flex-1 flex-col bg-card/20", className)}>
      <header className="flex h-11 shrink-0 items-center border-b border-border px-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Icon className={cn("size-3.5", source ? "text-blue-500" : "text-violet-500")} />
          {source ? "Original table" : "Result table"}
        </div>
        {source && selectedTable ? (
          <span className="ml-2 max-w-28 truncate rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-semibold text-blue-500">
            {selectedTable}
          </span>
        ) : null}
        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
          {result?.rowCount ?? 0} rows
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {!source && result?.columns.length ? <SaveResultDialog /> : null}
          {!source && result?.columns.length ? <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={downloadCsv} title="Download result as CSV"><Download />CSV</Button> : null}
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
            <div className="grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-destructive">SQL execution failed</p>
            <p className="mt-1.5 max-w-md font-mono text-xs leading-5 text-muted-foreground">
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
    <div className="flex min-h-12 items-center gap-1 overflow-x-auto border-b border-border bg-card/35 px-3 sm:px-4">
      {workspaceTabs.map((tab) => {
        const Icon = tab.icon;
        const active = activePanel === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => setActivePanel(tab.id)}
            className={cn(
              "relative inline-flex h-12 shrink-0 items-center gap-2 px-3 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45",
              active && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
            {tab.disabled ? <LockKeyhole className="size-2.5" /> : null}
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-1 border-l pl-2">
        <WorkspaceManagerDialog />
        <Button variant="outline" size="sm" className="mr-1 border-violet-500/25 bg-violet-500/[.06] text-violet-600 hover:bg-violet-500/10 dark:text-violet-300" onClick={onEnterTeachingMode} aria-label="Enter Teaching Mode"><GraduationCap /><span className="hidden lg:inline">Teaching Mode</span></Button>
        <Button variant="ghost" size="icon-sm" disabled={!canUndo || isMutating} onClick={() => void runAction("undo")} title="Undo database change" aria-label="Undo database change"><Undo2 /></Button>
        <Button variant="ghost" size="icon-sm" disabled={!canRedo || isMutating} onClick={() => void runAction("redo")} title="Redo database change" aria-label="Redo database change"><Redo2 /></Button>
        <Button variant="ghost" size="icon-sm" disabled={isMutating} onClick={() => void runAction("reset")} title="Reset database" aria-label="Reset database"><RotateCcw /></Button>
      </div>
      <div className="hidden items-center gap-2 text-[10px] text-muted-foreground sm:flex">
        <Info className="size-3" />
        Worker-isolated SQLite
      </div>
    </div>
  );
}

function DatabaseErrorBanner() {
  const error = useDatabaseStore((state) => state.error);
  const clearError = useDatabaseStore((state) => state.clearError);
  if (!error) return null;

  return (
    <div className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">
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
  const activeWorkspaceId = useDatabaseStore((state) => state.activeWorkspaceId);
  const saveWorkspaceSettings = useDatabaseStore((state) => state.saveWorkspaceSettings);

  React.useEffect(() => {
    if (status !== "ready" || !activeWorkspaceId) return;
    const timeout = window.setTimeout(() => {
      void saveWorkspaceSettings({ activePanel, editorSql, explorerCollapsed }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [activePanel, activeWorkspaceId, editorSql, explorerCollapsed, saveWorkspaceSettings, status]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <WorkspaceNavigation onEnterTeachingMode={() => {
        setTeachingMode(true);
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }} />
      <DatabaseErrorBanner />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ExplorerSidebar />
        <div className="min-w-0 flex-1">
          {activePanel === "data" ? <VisualDataEditor /> : activePanel === "schema" ? <SchemaDiagram /> : activePanel === "visualizer" ? <QueryVisualizer /> : activePanel === "history" ? <QueryHistoryPanel /> : <><MonacoSqlEditor /><div className="flex min-h-[290px] flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0"><DataPanel kind="source" className="md:resize-x md:overflow-auto" /><DataPanel kind="result" /></div></>}
        </div>
      </div>
      <footer className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card/60 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", status === "ready" ? "bg-emerald-500" : "bg-amber-500")} />
          {activeDatabase?.name ?? (status === "ready" ? "No active database" : "Initializing database")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="size-3" />
          IndexedDB persisted
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Clock3 className="size-3" />
          SQLite WebAssembly · worker
        </span>
      </footer>
      {teachingMode ? <TeachingMode onExit={() => setTeachingMode(false)} /> : null}
    </div>
  );
}
