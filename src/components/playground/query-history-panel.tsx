"use client";

import * as React from "react";
import { Bookmark, BookmarkPlus, CheckCircle2, ChevronDown, Clipboard, Clock3, Filter, Pencil, Play, Search, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  compactSqlPreview,
  filterQueryHistory,
  groupQueryHistory,
  historyQueryType,
  historyResultSummary,
  type HistoryOperationFilter,
  type HistorySort,
  type HistoryStatusFilter,
  type HistoryTimeFilter,
} from "@/lib/database/query-library";
import type { QueryHistoryEntry, SavedQuery } from "@/lib/database/types";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type View = "saved" | "history";
type PendingRun = Pick<QueryHistoryEntry, "sql" | "databaseId" | "databaseName">;

export function QueryHistoryPanel() {
  const [view, setView] = React.useState<View>("history");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<HistoryStatusFilter>("all");
  const [operationFilter, setOperationFilter] = React.useState<HistoryOperationFilter>("all");
  const [databaseFilter, setDatabaseFilter] = React.useState<"all" | "current" | string>("all");
  const [timeFilter, setTimeFilter] = React.useState<HistoryTimeFilter>("all");
  const [sort, setSort] = React.useState<HistorySort>("newest");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingQueryId, setEditingQueryId] = React.useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [queryName, setQueryName] = React.useState("");
  const [queryDescription, setQueryDescription] = React.useState("");
  const [deletingQueryId, setDeletingQueryId] = React.useState<string | null>(null);
  const [pendingRun, setPendingRun] = React.useState<PendingRun | null>(null);

  const history = useDatabaseStore((state) => state.queryHistory);
  const savedQueries = useDatabaseStore((state) => state.savedQueries);
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const saveQuery = useDatabaseStore((state) => state.saveQuery);
  const deleteSavedQuery = useDatabaseStore((state) => state.deleteSavedQuery);
  const switchDatabase = useDatabaseStore((state) => state.switchDatabase);
  const editorSql = useWorkspaceStore((state) => state.editorSql);
  const setEditorSql = useWorkspaceStore((state) => state.setEditorSql);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const queueSqlRun = useWorkspaceStore((state) => state.queueSqlRun);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredSaved = savedQueries.filter((query) => !normalizedSearch || `${query.name} ${query.description ?? ""} ${query.sql}`.toLowerCase().includes(normalizedSearch));
  const filteredHistory = filterQueryHistory(history, { search, status: statusFilter, operation: operationFilter, database: databaseFilter, time: timeFilter, sort }, activeDatabaseId);
  const groupedHistory = groupQueryHistory(filteredHistory);
  const deletingQuery = savedQueries.find((query) => query.id === deletingQueryId);
  const editingQuery = savedQueries.find((query) => query.id === editingQueryId);
  const originalRunDatabase = pendingRun ? databases.find((database) => database.id === pendingRun.databaseId) : undefined;
  const hasAdvancedFilters = operationFilter !== "all" || timeFilter !== "all" || sort !== "newest";

  const copy = async (sql: string) => {
    try { await navigator.clipboard.writeText(sql); toast.success("SQL copied"); }
    catch { toast.error("Could not copy SQL"); }
  };

  const loadIntoEditor = (sql: string) => {
    setEditorSql(sql);
    setActivePanel("editor");
    toast.success("Query loaded", { description: "Review the SQL before running it." });
  };

  const requestRun = (entry: PendingRun) => {
    if (entry.databaseId === activeDatabaseId) queueSqlRun(entry.sql);
    else setPendingRun(entry);
  };

  const openSaveDialog = (query?: SavedQuery) => {
    setEditingQueryId(query?.id ?? null);
    setQueryName(query?.name ?? "");
    setQueryDescription(query?.description ?? "");
    setSaveDialogOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await saveQuery(queryName, editingQuery?.sql ?? editorSql, editingQuery?.id, queryDescription);
      setSaveDialogOpen(false);
      setEditingQueryId(null);
      toast.success(editingQuery ? "Saved query updated" : "Query saved", { description: "It is available only in this workspace." });
    } catch (error) { toast.error("Could not save query", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setOperationFilter("all");
    setDatabaseFilter("all");
    setTimeFilter("all");
    setSort("newest");
  };

  return <section className="min-h-[calc(100vh-9rem)] bg-card/15 p-4 sm:p-6">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Workspace SQL library</p><h2 className="mt-1 font-display text-xl font-semibold">Query history</h2><p className="mt-2 text-sm text-muted-foreground">Search, inspect, and safely reuse SQL stored in this workspace.</p></div>
        <Button onClick={() => openSaveDialog()} disabled={!editorSql.trim()}><BookmarkPlus />Save current query</Button>
      </div>

      <div className="mt-5 rounded-xl border bg-card/70 p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex rounded-lg bg-muted/55 p-1" role="tablist" aria-label="SQL library view">
            <button type="button" role="tab" aria-selected={view === "saved"} onClick={() => setView("saved")} className={cn("min-h-8 rounded-md px-3 text-[13px] font-semibold transition", view === "saved" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Saved Queries <span className="ml-1 text-xs text-muted-foreground">{savedQueries.length}</span></button>
            <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")} className={cn("min-h-8 rounded-md px-3 text-[13px] font-semibold transition", view === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>History <span className="ml-1 text-xs text-muted-foreground">{history.length}</span></button>
          </div>
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
            <Search className="size-3.5 text-muted-foreground" /><span className="sr-only">Search queries</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === "history" ? "Search SQL, databases, or errors" : "Search saved queries"} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
          </label>
          {view === "history" ? <div className="flex flex-wrap gap-2">
            <select aria-label="Filter history by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as HistoryStatusFilter)} className="ui-input h-9 min-w-32 py-0 text-xs"><option value="all">All statuses</option><option value="success">Successful</option><option value="error">Failed</option></select>
            <select aria-label="Filter history by database" value={databaseFilter} onChange={(event) => setDatabaseFilter(event.target.value)} className="ui-input h-9 min-w-40 py-0 text-xs"><option value="all">All databases</option><option value="current">Current database</option>{databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}</select>
            <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFiltersOpen(false); }}>
              <Button variant="outline" size="sm" className={cn(hasAdvancedFilters && "border-primary/40 bg-selected")} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="advanced-history-filters"><Filter />Filters{hasAdvancedFilters ? <span className="size-1.5 rounded-full bg-primary" aria-label="Advanced filters active" /> : null}</Button>
              {filtersOpen ? <div id="advanced-history-filters" aria-label="Advanced history filters" className="absolute right-0 top-10 z-30 w-64 space-y-3 rounded-xl border bg-popover p-3 shadow-xl">
                <FilterSelect label="Operation" value={operationFilter} onChange={(value) => setOperationFilter(value as HistoryOperationFilter)} options={["all", "SELECT", "INSERT", "UPDATE", "DELETE", "DDL"]} />
                <FilterSelect label="Time" value={timeFilter} onChange={(value) => setTimeFilter(value as HistoryTimeFilter)} options={["all", "today", "7d"]} labels={{ all: "All time", today: "Today", "7d": "Last 7 days" }} />
                <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as HistorySort)} options={["newest", "oldest"]} labels={{ newest: "Newest first", oldest: "Oldest first" }} />
                <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>Reset filters</Button>
              </div> : null}
            </div>
          </div> : null}
        </div>
      </div>

      {view === "saved" ? <div className="mt-4 space-y-2">{filteredSaved.length ? filteredSaved.map((query) => <SavedQueryRow key={query.id} query={query} onCopy={copy} onLoad={loadIntoEditor} onRun={queueSqlRun} onEdit={openSaveDialog} onDelete={setDeletingQueryId} />) : <EmptyLibrary icon={Bookmark} title={search ? "No saved queries found" : "No saved queries yet."} description={search ? "Try a different search." : "Save the SQL currently open in the editor to reuse it in this workspace."} actionLabel={!search ? "Save Current Query" : undefined} onAction={!search ? () => openSaveDialog() : undefined} />}</div> : <div className="mt-4 space-y-5">{groupedHistory.length ? groupedHistory.map((group) => <section key={group.label} aria-labelledby={`history-${group.label.replaceAll(" ", "-").toLowerCase()}`}><h3 id={`history-${group.label.replaceAll(" ", "-").toLowerCase()}`} className="mb-2 px-1 text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{group.label}</h3><div className="space-y-2">{group.items.map((entry) => <HistoryRow key={entry.id} entry={entry} expanded={expandedId === entry.id} onToggle={() => setExpandedId((current) => current === entry.id ? null : entry.id)} onCopy={copy} onLoad={loadIntoEditor} onRun={requestRun} />)}</div></section>) : <EmptyLibrary icon={Clock3} title={search || statusFilter !== "all" || databaseFilter !== "all" || hasAdvancedFilters ? "No queries match these filters." : "No queries executed yet."} description={search || statusFilter !== "all" || databaseFilter !== "all" || hasAdvancedFilters ? "Adjust the search or reset filters to see more executions." : "Run SQL in the editor and each execution will be stored here."} actionLabel="Open SQL Editor" onAction={() => setActivePanel("editor")} />}</div>}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-lg"><form onSubmit={(event) => void handleSave(event)}>
          <DialogHeader><DialogTitle>{editingQuery ? "Edit saved query" : "Save current query"}</DialogTitle><DialogDescription>Saved queries belong only to the active workspace. Editing details does not execute SQL.</DialogDescription></DialogHeader>
          <div className="mt-5 space-y-4"><label className="block text-[13px] font-semibold" htmlFor="saved-query-name">Name<input id="saved-query-name" autoFocus value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="Department enrollment" className="ui-input mt-2 w-full" /></label><label className="block text-[13px] font-semibold" htmlFor="saved-query-description">Description <span className="font-normal text-muted-foreground">(optional)</span><textarea id="saved-query-description" value={queryDescription} onChange={(event) => setQueryDescription(event.target.value)} placeholder="What this query is useful for" className="ui-input mt-2 min-h-24 w-full resize-y py-2" /></label><pre className="max-h-36 overflow-auto rounded-lg bg-code p-3 font-mono text-xs leading-5 text-code-foreground"><code>{editingQuery?.sql ?? editorSql}</code></pre></div>
          <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button><Button disabled={!queryName.trim() || !(editingQuery?.sql ?? editorSql).trim()}>{editingQuery ? "Save details" : "Save query"}</Button></DialogFooter>
        </form></DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRun)} onOpenChange={(open) => { if (!open) setPendingRun(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Choose a database for this query</DialogTitle><DialogDescription>This query was originally executed against another database. QueryQuest will never switch databases silently.</DialogDescription></DialogHeader>
          <div className="mt-2 rounded-xl border bg-muted/35 p-3 text-[13px]"><p><span className="text-muted-foreground">Original database:</span> <strong>{pendingRun?.databaseName}</strong></p>{!originalRunDatabase ? <p className="mt-2 text-destructive">The original database is no longer available in this workspace.</p> : null}</div>
          <DialogFooter className="mt-4 flex-col sm:flex-row"><Button variant="outline" onClick={() => setPendingRun(null)}>Cancel</Button><Button variant="outline" disabled={!originalRunDatabase} onClick={() => { if (!pendingRun || !originalRunDatabase) return; const sql = pendingRun.sql; const databaseId = originalRunDatabase.id; setPendingRun(null); void switchDatabase(databaseId).then(() => { if (useDatabaseStore.getState().activeDatabaseId === databaseId) queueSqlRun(sql); else toast.error("Could not switch to the original database"); }); }}>Switch to Original Database</Button><Button onClick={() => { if (!pendingRun) return; const sql = pendingRun.sql; setPendingRun(null); queueSqlRun(sql); }}>Run on Current Database</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingQuery)} onOpenChange={(nextOpen) => { if (!nextOpen) setDeletingQueryId(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Delete “{deletingQuery?.name}”?</DialogTitle><DialogDescription>This removes the saved query from the current workspace. It does not execute or change the SQL database.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeletingQueryId(null)}>Cancel</Button><Button variant="destructive" onClick={() => { if (!deletingQuery) return; void deleteSavedQuery(deletingQuery.id).then(() => { setDeletingQueryId(null); toast.success("Saved query deleted"); }).catch((error) => toast.error("Could not delete query", { description: error instanceof Error ? error.message : "Try again." })); }}><Trash2 />Delete query</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  </section>;
}

export function HistoryRow({ entry, expanded, onToggle, onCopy, onLoad, onRun }: { entry: QueryHistoryEntry; expanded: boolean; onToggle: () => void; onCopy: (sql: string) => void; onLoad: (sql: string) => void; onRun: (entry: PendingRun) => void }) {
  const type = historyQueryType(entry);
  return <article className={cn("overflow-hidden rounded-xl border bg-card/75 transition", expanded && "border-primary/35 shadow-sm")}>
    <div className="flex min-w-0 items-center gap-2 p-2.5 sm:px-3">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onToggle} aria-expanded={expanded}>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", entry.status === "success" ? "bg-success-tint text-success" : "bg-destructive-tint text-destructive")}>{entry.status === "success" ? <CheckCircle2 className="size-4" aria-label="Successful" /> : <XCircle className="size-4" aria-label="Failed" />}</span>
        <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[13px] font-medium text-foreground">{compactSqlPreview(entry.sql)}</span><span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"><span>{entry.databaseName}</span><span aria-hidden>·</span><span>{historyResultSummary(entry)}</span><span aria-hidden>·</span><span>{entry.durationMs.toFixed(1)} ms</span><span aria-hidden>·</span><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></span></span>
        <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground sm:inline">{type}</span><ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <div className="hidden shrink-0 gap-1.5 md:flex"><Button variant="ghost" size="sm" onClick={() => onLoad(entry.sql)}>Load</Button><Button variant="outline" size="sm" onClick={() => onRun(entry)}><Play />Run</Button></div>
    </div>
    {expanded ? <div className="border-t bg-surface/55 p-3 sm:p-4"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]"><pre className="max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-[13px] leading-6 text-code-foreground"><code>{entry.sql}</code></pre><div className="space-y-3 text-[13px]"><div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Execution summary</p><p className="mt-1.5 font-medium">{historyResultSummary(entry)}</p><p className="mt-1 text-xs text-muted-foreground">{entry.durationMs.toFixed(1)} ms · {type}</p></div>{entry.error ? <div className="rounded-lg border border-destructive/30 bg-destructive-tint p-3"><p className="text-xs font-semibold text-destructive">Error details</p><p className="mt-1.5 break-words text-destructive">{entry.error}</p></div> : null}</div></div><div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => void onCopy(entry.sql)}><Clipboard />Copy</Button><Button variant="outline" size="sm" onClick={() => onLoad(entry.sql)}>Load into Editor</Button><Button size="sm" onClick={() => onRun(entry)}><Play />Rerun</Button></div></div> : null}
  </article>;
}

function SavedQueryRow({ query, onCopy, onLoad, onRun, onEdit, onDelete }: { query: SavedQuery; onCopy: (sql: string) => void; onLoad: (sql: string) => void; onRun: (sql: string) => void; onEdit: (query: SavedQuery) => void; onDelete: (id: string) => void }) {
  return <article className="flex flex-col gap-3 rounded-xl border bg-card/75 p-3 shadow-sm sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-selected text-primary"><Bookmark className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold">{query.name}</h3><time className="text-xs text-muted-foreground" dateTime={query.updatedAt}>Updated {new Date(query.updatedAt).toLocaleDateString()}</time></div>{query.description ? <p className="mt-1 truncate text-[13px] text-muted-foreground">{query.description}</p> : null}<p className="mt-1.5 truncate font-mono text-xs text-code-foreground">{compactSqlPreview(query.sql, 150)}</p></div></div><div className="flex flex-wrap justify-end gap-1.5"><Button variant="ghost" size="icon-sm" title="Copy SQL" aria-label={`Copy ${query.name}`} onClick={() => void onCopy(query.sql)}><Clipboard /></Button><Button variant="ghost" size="icon-sm" title="Edit saved query details" aria-label={`Edit ${query.name}`} onClick={() => onEdit(query)}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title="Delete saved query" aria-label={`Delete ${query.name}`} onClick={() => onDelete(query.id)}><Trash2 /></Button><Button variant="outline" size="sm" onClick={() => onLoad(query.sql)}>Load</Button><Button size="sm" onClick={() => onRun(query.sql)}><Play />Run</Button></div></article>;
}

function FilterSelect({ label, value, options, labels = {}, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-muted-foreground">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="ui-input mt-1.5 h-9 w-full py-0 text-xs text-foreground">{options.map((option) => <option key={option} value={option}>{labels[option] ?? (option === "all" ? "All operations" : option)}</option>)}</select></label>;
}

function EmptyLibrary({ icon: Icon, title, description, actionLabel, onAction }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="rounded-xl border border-dashed p-10 text-center"><Icon className="mx-auto size-9 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">{description}</p>{actionLabel && onAction ? <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>{actionLabel}</Button> : null}</div>;
}
