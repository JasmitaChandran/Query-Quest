"use client";

import * as React from "react";
import { Check, Database, Download, FolderKanban, FolderOpen, HardDrive, Import, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { parsePortableWorkspace } from "@/lib/database/workspace-format";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  return name.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "workspace";
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function WorkspaceManagerDialog() {
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const workspaces = useDatabaseStore((state) => state.workspaces);
  const workspaceDatabaseCounts = useDatabaseStore((state) => state.workspaceDatabaseCounts);
  const activeWorkspaceId = useDatabaseStore((state) => state.activeWorkspaceId);
  const databases = useDatabaseStore((state) => state.databases);
  const usage = useDatabaseStore((state) => state.workspaceUsage);
  const isMutating = useDatabaseStore((state) => state.isMutating || state.isImporting);
  const createWorkspace = useDatabaseStore((state) => state.createWorkspace);
  const switchWorkspace = useDatabaseStore((state) => state.switchWorkspace);
  const renameWorkspace = useDatabaseStore((state) => state.renameWorkspace);
  const deleteWorkspace = useDatabaseStore((state) => state.deleteWorkspace);
  const exportWorkspace = useDatabaseStore((state) => state.exportWorkspace);
  const importWorkspace = useDatabaseStore((state) => state.importWorkspace);
  const refreshWorkspaceMetadata = useDatabaseStore((state) => state.refreshWorkspaceMetadata);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const deletingWorkspace = workspaces.find((workspace) => workspace.id === deletingId);

  React.useEffect(() => {
    if (open) void refreshWorkspaceMetadata().catch(() => undefined);
  }, [open, refreshWorkspaceMetadata]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createWorkspace(newName);
      toast.success("Workspace created", { description: `“${newName.trim()}” is now active.` });
      setNewName("");
    } catch (error) { toast.error("Could not create workspace", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renamingId) return;
    try {
      await renameWorkspace(renamingId, renameValue);
      setRenamingId(null);
      toast.success("Workspace renamed");
    } catch (error) { toast.error("Could not rename workspace", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  const handleDelete = async () => {
    if (!deletingWorkspace) return;
    try {
      await deleteWorkspace(deletingWorkspace.id);
      setDeletingId(null);
      setConfirmation("");
      toast.success("Workspace deleted", { description: `“${deletingWorkspace.name}” and all of its local data were removed.` });
    } catch (error) { toast.error("Could not delete workspace", { description: error instanceof Error ? error.message : "Nothing was removed." }); }
  };

  const handleExport = async () => {
    try {
      const portable = await exportWorkspace();
      downloadFile(new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" }), `${safeFileName(portable.workspace.name)}.queryquest.json`);
      toast.success("Workspace downloaded", { description: "The file includes SQLite records, saved queries, history, settings, and diagram layouts." });
    } catch (error) { toast.error("Could not download workspace", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const portable = parsePortableWorkspace(await file.text());
      const existing = workspaces.find((workspace) => workspace.id === portable.workspace.id);
      const overwrite = Boolean(existing);
      if (existing && !window.confirm(`Replace “${existing.name}”? Its databases, saved queries, history, settings, and checkpoints will be permanently replaced by this import.`)) return;
      await importWorkspace(portable, overwrite);
      toast.success("Workspace imported", { description: `“${portable.workspace.name}” is ready with ${portable.databases.length} database${portable.databases.length === 1 ? "" : "s"}.` });
    } catch (error) { toast.error("Could not import workspace", { description: error instanceof Error ? error.message : "The file is invalid." }); }
  };

  const openWorkspace = (workspaceId: string, name: string) => {
    void switchWorkspace(workspaceId).then(() => {
      toast.success(`Opened “${name}”`);
      setOpen(false);
    }).catch((error) => toast.error("Could not open workspace", { description: error instanceof Error ? error.message : "Try again." }));
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="max-w-52 justify-start border-primary/25 bg-selected" title="Manage workspaces"><FolderKanban className="text-primary" /><span className="truncate">{activeWorkspace?.name ?? "Workspace"}</span></Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
      <DialogHeader><DialogTitle>Workspace manager</DialogTitle><DialogDescription>A workspace contains your databases, saved queries, history, and preferences. Each workspace stays isolated in browser storage.</DialogDescription></DialogHeader>

      <div className="mt-1 flex flex-col gap-3 rounded-xl border bg-muted/25 p-3 sm:flex-row sm:items-center">
        <form onSubmit={(event) => void handleCreate(event)} className="flex min-w-0 flex-1 gap-2"><label className="sr-only" htmlFor="new-workspace-name">New workspace name</label><input id="new-workspace-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New workspace name" className="ui-input min-w-0 flex-1" /><Button size="sm" disabled={!newName.trim() || isMutating}><Plus />Create Workspace</Button></form>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isMutating}><Upload />Import Workspace</Button>
        <input ref={fileRef} type="file" accept=".json,.queryquest.json,application/json" className="hidden" onChange={(event) => void handleImport(event)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="workspace-list-title">
          <div className="mb-2 flex items-center justify-between"><h3 id="workspace-list-title" className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Your workspaces</h3><span className="text-xs text-muted-foreground">{workspaces.length} total</span></div>
          {workspaces.length ? <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[minmax(180px,1fr)_110px_170px_260px] gap-3 border-b bg-table-header px-3 py-2 text-xs font-semibold text-muted-foreground md:grid"><span>Workspace name</span><span>Databases</span><span>Last modified</span><span className="text-right">Actions</span></div>
            {workspaces.map((workspace) => {
              const active = workspace.id === activeWorkspaceId;
              return <div key={workspace.id} className={cn("border-b p-3 last:border-b-0 md:grid md:grid-cols-[minmax(180px,1fr)_110px_170px_260px] md:items-center md:gap-3", active ? "bg-selected" : "bg-surface hover:bg-hover/55")}>
                {renamingId === workspace.id ? <form onSubmit={(event) => void handleRename(event)} className="flex gap-2 md:col-span-4"><label className="sr-only" htmlFor={`workspace-rename-${workspace.id}`}>Workspace name</label><input id={`workspace-rename-${workspace.id}`} autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="ui-input min-w-0 flex-1" /><Button size="sm" disabled={!renameValue.trim() || isMutating}><Check />Save</Button><Button type="button" variant="ghost" size="sm" onClick={() => setRenamingId(null)}>Cancel</Button></form> : <>
                  <div className="min-w-0"><span className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4 shrink-0 text-primary" /><span className="truncate">{workspace.name}</span>{active ? <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs uppercase tracking-wide text-selected-foreground">Active</span> : null}</span><span className="mt-1 block text-xs text-muted-foreground md:hidden">{workspaceDatabaseCounts[workspace.id] ?? (active ? databases.length : 0)} databases · Updated {new Date(workspace.updatedAt).toLocaleString()}</span></div>
                  <span className="hidden items-center gap-1.5 text-[13px] md:flex"><Database className="size-3.5 text-muted-foreground" />{workspaceDatabaseCounts[workspace.id] ?? (active ? databases.length : 0)}</span>
                  <time className="hidden text-xs text-muted-foreground md:block" dateTime={workspace.updatedAt}>{new Date(workspace.updatedAt).toLocaleString()}</time>
                  <div className="mt-3 flex flex-wrap justify-end gap-1.5 md:mt-0"><Button variant={active ? "ghost" : "outline"} size="sm" disabled={active || isMutating} onClick={() => openWorkspace(workspace.id, workspace.name)}><FolderOpen />{active ? "Open" : "Open Workspace"}</Button><Button variant="ghost" size="sm" onClick={() => { setRenamingId(workspace.id); setRenameValue(workspace.name); }}><Pencil />Rename</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeletingId(workspace.id); setConfirmation(""); }}><Trash2 />Delete</Button></div>
                </>}
              </div>;
            })}
          </div> : <div className="rounded-xl border border-dashed p-10 text-center"><FolderKanban className="mx-auto size-9 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">Create your first workspace.</p><p className="mt-2 text-[13px] text-muted-foreground">Keep databases and queries organized in an isolated workspace.</p></div>}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card/60 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="size-4 text-info" />Active workspace storage</div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/45 p-3"><span className="block text-muted-foreground">Databases</span><strong className="mt-1 block">{databases.length} · {formatBytes(usage?.databaseBytes ?? 0)}</strong></div><div className="rounded-lg bg-muted/45 p-3"><span className="block text-muted-foreground">Checkpoints</span><strong className="mt-1 block">{formatBytes(usage?.checkpointBytes ?? 0)}</strong></div><div className="col-span-2 rounded-lg bg-muted/45 p-3"><span className="block text-muted-foreground">Workspace total</span><strong className="mt-1 block text-base">{formatBytes(usage?.totalBytes ?? 0)}</strong></div></div></div>
          <div className="rounded-xl border bg-card/60 p-4"><p className="text-sm font-semibold">Portable workspace</p><p className="mt-1 text-[13px] leading-5 text-muted-foreground">Download a versioned bundle containing SQLite records, saved queries, history, preferences, and diagram positions.</p><Button variant="outline" className="mt-4 w-full" onClick={() => void handleExport()} disabled={isMutating}><Download />Download Workspace</Button></div>
        </aside>
      </div>

      {deletingWorkspace ? <div className="rounded-xl border border-destructive/30 bg-destructive-tint p-4" role="alertdialog" aria-labelledby="delete-workspace-title"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 className="size-4" /></div><div><p id="delete-workspace-title" className="text-sm font-semibold">Delete “{deletingWorkspace.name}”?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This permanently removes its databases and records, saved queries, history, checkpoints, diagram positions, and settings. Other workspaces are not affected.</p></div></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="workspace-delete-confirmation">Type workspace name to confirm</label><input id="workspace-delete-confirmation" autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`Type ${deletingWorkspace.name} to confirm`} className="ui-input min-w-0 flex-1 border-destructive/35 focus-visible:border-destructive" /><Button variant="destructive" disabled={confirmation !== deletingWorkspace.name || isMutating} onClick={() => void handleDelete()}><Trash2 />Delete Workspace</Button><Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button></div></div> : null}

      <DialogFooter className="items-center sm:justify-between"><p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Import className="size-3" />Workspace files stay on this device unless you download them.</p><Button variant="outline" onClick={() => setOpen(false)}>Done</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
