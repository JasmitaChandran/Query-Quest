"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ChevronRight,
  Clock3,
  Code2,
  Columns3,
  Database,
  FileDatabase,
  HardDrive,
  History,
  Import,
  Info,
  KeyRound,
  LockKeyhole,
  PanelLeftClose,
  Rows3,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react";

import { DatabaseDataTable } from "@/components/playground/database-data-table";
import { VisualDataEditor } from "@/components/playground/visual-data-editor";
import { TableDesignerDialog } from "@/components/playground/table-designer-dialog";
import { CreateDatabaseDialog } from "@/components/import/create-database-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

const workspaceTabs = [
  { id: "editor" as const, label: "Editor", icon: Code2, disabled: false },
  { id: "data" as const, label: "Visual data", icon: Sparkles, disabled: false },
  { id: "history" as const, label: "Query history", icon: History, disabled: true },
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
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="active-database">
                Active database
              </label>
              <select
                id="active-database"
                value={activeDatabaseId ?? ""}
                onChange={(event) => void switchDatabase(event.target.value)}
                disabled={status !== "ready"}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-2.5 text-xs font-semibold outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
              >
                {databases.map((database) => (
                  <option key={database.id} value={database.id}>
                    {database.name}
                  </option>
                ))}
              </select>
              <Button asChild variant="outline" size="icon-sm" title="Import or create database">
                <Link href="/import" aria-label="Import or create database">
                  <Import />
                </Link>
              </Button>
            </div>
            <div className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 text-muted-foreground">
              <Search className="size-3.5" />
              <span className="text-[11px]">{tables.length} tables and views</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <CreateDatabaseDialog />
              <TableDesignerDialog />
            </div>
          </div>

          {status === "initializing" || status === "idle" ? (
            <ExplorerLoading />
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

function WorkspaceNavigation() {
  const { activePanel, setActivePanel } = useWorkspaceStore();

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
      <div className="ml-auto hidden items-center gap-2 text-[10px] text-muted-foreground sm:flex">
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
  const status = useDatabaseStore((state) => state.status);
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);
  const activePanel = useWorkspaceStore((state) => state.activePanel);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <WorkspaceNavigation />
      <DatabaseErrorBanner />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ExplorerSidebar />
        <div className="min-w-0 flex-1">
          {activePanel === "data" ? <VisualDataEditor /> : <><MonacoSqlEditor /><div className="flex min-h-[290px] flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0"><DataPanel kind="source" className="md:resize-x md:overflow-auto" /><DataPanel kind="result" /></div></>}
        </div>
      </div>
      <footer className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card/60 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", status === "ready" ? "bg-emerald-500" : "bg-amber-500")} />
          {activeDatabase?.name ?? "Initializing database"}
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
    </div>
  );
}
