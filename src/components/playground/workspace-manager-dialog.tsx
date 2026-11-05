"use client";

import * as React from "react";
import {
  Check,
  Download,
  FolderKanban,
  HardDrive,
  Import,
  Pencil,
  Plus,
  Trash2,
  Upload,
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
      toast.success("Workspace exported", { description: "The file includes SQLite records, saved queries, history, settings, and diagram layouts." });
    } catch (error) { toast.error("Could not export workspace", { description: error instanceof Error ? error.message : "Try again." }); }
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
      toast.success("Workspace restored", { description: `“${portable.workspace.name}” is ready with ${portable.databases.length} database${portable.databases.length === 1 ? "" : "s"}.` });
    } catch (error) { toast.error("Could not import workspace", { description: error instanceof Error ? error.message : "The file is invalid." }); }
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="max-w-52 justify-start border-violet-500/25 bg-violet-500/[.06]" title="Manage workspaces">
        <FolderKanban className="text-violet-500" />
        <span className="truncate">{activeWorkspace?.name ?? "Workspace"}</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Workspace manager</DialogTitle>
        <DialogDescription>Keep databases, saved SQL, history, and layout settings isolated in browser-local workspaces.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Your workspaces</p>
          <div className="space-y-2">
            {workspaces.map((workspace) => {
              const active = workspace.id === activeWorkspaceId;
              return <div key={workspace.id} className={cn("rounded-xl border p-3 transition", active ? "border-violet-500/40 bg-violet-500/[.06]" : "bg-card/50")}>
                {renamingId === workspace.id ? <form onSubmit={(event) => void handleRename(event)} className="flex gap-2">
                  <label className="sr-only" htmlFor={`workspace-rename-${workspace.id}`}>Workspace name</label>
                  <input id={`workspace-rename-${workspace.id}`} autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  <Button size="sm" disabled={!renameValue.trim() || isMutating}><Check />Save</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRenamingId(null)}>Cancel</Button>
                </form> : <div className="flex items-center gap-2">
                  <button type="button" disabled={active || isMutating} onClick={() => void switchWorkspace(workspace.id).then(() => toast.success(`Switched to “${workspace.name}”`)).catch((error) => toast.error("Could not switch workspace", { description: error instanceof Error ? error.message : "Try again." }))} className="min-w-0 flex-1 text-left disabled:cursor-default">
                    <span className="flex items-center gap-2 text-sm font-semibold"><FolderKanban className="size-4 text-violet-500" /><span className="truncate">{workspace.name}</span>{active ? <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] uppercase tracking-wide text-violet-600 dark:text-violet-300">Active</span> : null}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">Updated {new Date(workspace.updatedAt).toLocaleString()}</span>
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => { setRenamingId(workspace.id); setRenameValue(workspace.name); }} title={`Rename ${workspace.name}`} aria-label={`Rename ${workspace.name}`}><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => { setDeletingId(workspace.id); setConfirmation(""); }} title={`Delete ${workspace.name}`} aria-label={`Delete ${workspace.name}`}><Trash2 /></Button>
                </div>}
              </div>;
            })}
          </div>
          <form onSubmit={(event) => void handleCreate(event)} className="mt-3 flex gap-2 rounded-xl border border-dashed p-3">
            <label className="sr-only" htmlFor="new-workspace-name">New workspace name</label>
            <input id="new-workspace-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New workspace name" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
            <Button size="sm" disabled={!newName.trim() || isMutating}><Plus />Create</Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-card/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="size-4 text-blue-500" />Browser storage</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-muted/45 p-3"><span className="block text-muted-foreground">Databases</span><strong className="mt-1 block">{databases.length} · {formatBytes(usage?.databaseBytes ?? 0)}</strong></div>
              <div className="rounded-xl bg-muted/45 p-3"><span className="block text-muted-foreground">Checkpoints</span><strong className="mt-1 block">{formatBytes(usage?.checkpointBytes ?? 0)}</strong></div>
              <div className="col-span-2 rounded-xl bg-muted/45 p-3"><span className="block text-muted-foreground">Workspace total</span><strong className="mt-1 block text-base">{formatBytes(usage?.totalBytes ?? 0)}</strong></div>
            </div>
          </div>
          <div className="rounded-2xl border bg-card/60 p-4">
            <p className="text-sm font-semibold">Portable workspace</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Export a versioned JSON bundle containing complete SQLite files and workspace metadata. Import validates every database before replacing existing data.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Button variant="outline" onClick={() => void handleExport()} disabled={isMutating}><Download />Export Workspace</Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={isMutating}><Upload />Import Workspace</Button>
              <input ref={fileRef} type="file" accept=".json,.queryquest.json,application/json" className="hidden" onChange={(event) => void handleImport(event)} />
            </div>
          </div>
        </div>
      </div>

      {deletingWorkspace ? <div className="rounded-2xl border border-destructive/30 bg-destructive/[.06] p-4" role="alertdialog" aria-labelledby="delete-workspace-title">
        <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 className="size-4" /></div><div><p id="delete-workspace-title" className="text-sm font-semibold">Delete “{deletingWorkspace.name}”?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This permanently removes its databases and records, saved queries, history, checkpoints, diagram positions, and settings. Other workspaces are not affected.</p></div></div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="workspace-delete-confirmation">Type workspace name to confirm</label>
          <input id="workspace-delete-confirmation" autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`Type ${deletingWorkspace.name} to confirm`} className="h-9 min-w-0 flex-1 rounded-lg border border-destructive/30 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-destructive/20" />
          <Button variant="destructive" disabled={confirmation !== deletingWorkspace.name || isMutating} onClick={() => void handleDelete()}><Trash2 />Delete permanently</Button>
          <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
        </div>
      </div> : null}

      <DialogFooter className="items-center sm:justify-between">
        <p className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><Import className="size-3" />Workspace files stay on this device unless you export them.</p>
        <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
