"use client";

import * as React from "react";
import {
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  Clipboard,
  Clock3,
  Play,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type View = "saved" | "history";
type HistoryFilter = "all" | "success" | "error" | "read" | "write";

export function QueryHistoryPanel() {
  const [view, setView] = React.useState<View>("saved");
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<HistoryFilter>("all");
  const [saving, setSaving] = React.useState(false);
  const [queryName, setQueryName] = React.useState("");
  const [deletingQueryId, setDeletingQueryId] = React.useState<string | null>(null);
  const history = useDatabaseStore((state) => state.queryHistory);
  const savedQueries = useDatabaseStore((state) => state.savedQueries);
  const saveQuery = useDatabaseStore((state) => state.saveQuery);
  const deleteSavedQuery = useDatabaseStore((state) => state.deleteSavedQuery);
  const editorSql = useWorkspaceStore((state) => state.editorSql);
  const queueSqlRun = useWorkspaceStore((state) => state.queueSqlRun);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSaved = savedQueries.filter((query) => !normalizedSearch || `${query.name} ${query.sql}`.toLowerCase().includes(normalizedSearch));
  const filteredHistory = history.filter((entry) => {
    const matchesText = !normalizedSearch || `${entry.databaseName} ${entry.sql} ${entry.error ?? ""}`.toLowerCase().includes(normalizedSearch);
    const matchesFilter = filter === "all" || entry.status === filter || entry.operation === filter;
    return matchesText && matchesFilter;
  });
  const deletingQuery = savedQueries.find((query) => query.id === deletingQueryId);

  const copy = async (sql: string) => {
    try { await navigator.clipboard.writeText(sql); toast.success("SQL copied"); }
    catch { toast.error("Could not copy SQL"); }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await saveQuery(queryName, editorSql);
      setSaving(false);
      setQueryName("");
      toast.success("Query saved", { description: "It is available only in this workspace." });
    } catch (error) { toast.error("Could not save query", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  return <section className="min-h-[calc(100vh-9rem)] bg-card/15 p-4 sm:p-6">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Workspace SQL library</p><h2 className="mt-1 font-display text-xl font-semibold">Saved queries & history</h2><p className="mt-2 text-sm text-muted-foreground">Find reusable SQL or inspect locally persisted executions by status and operation.</p></div>
        <Button onClick={() => setSaving(true)}><BookmarkPlus />Save current SQL</Button>
      </div>

      {saving ? <form onSubmit={(event) => void handleSave(event)} className="mt-5 flex flex-col gap-2 rounded-xl border border-primary/30 bg-selected p-3 sm:flex-row">
        <label className="sr-only" htmlFor="saved-query-name">Saved query name</label>
        <input id="saved-query-name" autoFocus value={queryName} onChange={(event) => setQueryName(event.target.value)} placeholder="Query name, e.g. Department enrollment" className="ui-input min-w-0 flex-1" />
        <Button size="sm" disabled={!queryName.trim() || !editorSql.trim()}>Save query</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setSaving(false)}>Cancel</Button>
      </form> : null}

      <div className="mt-5 flex flex-col gap-3 rounded-xl border bg-card/60 p-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg bg-muted/55 p-1" role="tablist" aria-label="SQL library view">
          {(["saved", "history"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition", view === item ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item} <span className="ml-1 text-xs text-muted-foreground">{item === "saved" ? savedQueries.length : history.length}</span></button>)}
        </div>
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3">
          <Search className="size-3.5 text-muted-foreground" /><span className="sr-only">Search queries</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SQL, names, databases, or errors" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
        </label>
        {view === "history" ? <select aria-label="Filter query history" value={filter} onChange={(event) => setFilter(event.target.value as HistoryFilter)} className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"><option value="all">All executions</option><option value="success">Succeeded</option><option value="error">Failed</option><option value="read">Read queries</option><option value="write">Write queries</option></select> : null}
      </div>

      {view === "saved" ? <div className="mt-5 grid gap-3 md:grid-cols-2">{filteredSaved.length ? filteredSaved.map((query) => <article key={query.id} className="flex min-w-0 flex-col rounded-xl border bg-card/70 p-4 shadow-sm">
        <div className="flex items-center gap-2"><Bookmark className="size-4 text-primary" /><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{query.name}</h3><time className="text-xs text-muted-foreground">{new Date(query.updatedAt).toLocaleDateString()}</time></div>
        <pre className="mt-3 max-h-44 flex-1 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[13px] leading-6"><code>{query.sql}</code></pre>
        <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="icon-sm" title="Delete saved query" aria-label={`Delete ${query.name}`} onClick={() => setDeletingQueryId(query.id)}><Trash2 /></Button><Button variant="outline" size="sm" onClick={() => void copy(query.sql)}><Clipboard />Copy</Button><Button size="sm" onClick={() => queueSqlRun(query.sql)}><Play />Open & run</Button></div>
      </article>) : <EmptyLibrary icon={Bookmark} title="No saved queries found" description={search ? "Try a different search." : "Save the SQL currently open in the editor to reuse it in this workspace."} />}</div> : <div className="mt-5 space-y-3">{filteredHistory.length ? filteredHistory.map((entry) => <article key={entry.id} className="rounded-xl border bg-card/70 p-4 shadow-sm"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{entry.status === "success" ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}<span className="font-semibold text-foreground">{entry.status === "success" ? "Succeeded" : "Failed"}</span><span>·</span><span>{entry.databaseName}</span><span>·</span><span className="uppercase">{entry.operation}</span><span className="ml-auto inline-flex items-center gap-1"><Clock3 className="size-3" />{entry.durationMs.toFixed(1)} ms</span><time className="w-full sm:w-auto">{new Date(entry.timestamp).toLocaleString()}</time></div><pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[13px] leading-6"><code>{entry.sql}</code></pre>{entry.error ? <p className="mt-2 text-[13px] text-destructive">{entry.error}</p> : null}<div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void copy(entry.sql)}><Clipboard />Copy</Button><Button size="sm" onClick={() => queueSqlRun(entry.sql)}><Play />Rerun</Button></div></article>) : <EmptyLibrary icon={Clock3} title="No query history found" description={search || filter !== "all" ? "Clear the search or filter to see more executions." : "Run SQL in the editor and it will appear here."} />}</div>}
      <Dialog open={Boolean(deletingQuery)} onOpenChange={(nextOpen) => { if (!nextOpen) setDeletingQueryId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete “{deletingQuery?.name}”?</DialogTitle><DialogDescription>This removes the saved query from the current workspace. It does not execute or change the SQL database.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeletingQueryId(null)}>Cancel</Button><Button variant="destructive" onClick={() => { if (!deletingQuery) return; void deleteSavedQuery(deletingQuery.id).then(() => { setDeletingQueryId(null); toast.success("Saved query deleted"); }).catch((error) => toast.error("Could not delete query", { description: error instanceof Error ? error.message : "Try again." })); }}><Trash2 />Delete query</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </section>;
}

function EmptyLibrary({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return <div className="col-span-full rounded-xl border border-dashed p-12 text-center"><Icon className="mx-auto size-9 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-2 text-[13px] text-muted-foreground">{description}</p></div>;
}
