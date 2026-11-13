"use client";

import * as React from "react";
import { Database, Download, Info, MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DatabaseMetadata } from "@/lib/database/types";
import { useDatabaseStore } from "@/store/database-store";

export function DatabaseActionsMenu({ database }: { database: DatabaseMetadata }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [name, setName] = React.useState(database.name);
  const [confirmation, setConfirmation] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement>(null);
  const renameDatabase = useDatabaseStore((state) => state.renameDatabase);
  const deleteDatabase = useDatabaseStore((state) => state.deleteDatabase);
  const exportDatabase = useDatabaseStore((state) => state.exportDatabase);
  const isMutating = useDatabaseStore((state) => state.isMutating);

  React.useEffect(() => {
    if (!menuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const openRenameDialog = () => {
    setName(database.name);
    setMenuOpen(false);
    setRenameOpen(true);
  };

  const openDeleteDialog = () => {
    setConfirmation("");
    setMenuOpen(false);
    setDeleteOpen(true);
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await renameDatabase(database.id, name);
      setRenameOpen(false);
      toast.success("Database renamed", { description: `The database is now named “${name.trim()}”.` });
    } catch (error) {
      toast.error("Could not rename database", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDatabase(database.id);
      setDeleteOpen(false);
      toast.success("Database deleted", { description: `“${database.name}” and its browser-stored data were removed.` });
    } catch (error) {
      toast.error("Could not delete database", { description: error instanceof Error ? error.message : "Nothing was removed. Try again." });
    }
  };

  const handleDownload = async () => {
    setMenuOpen(false);
    try {
      const exported = await exportDatabase(database.id);
      const url = URL.createObjectURL(new Blob([exported.bytes as BlobPart], { type: "application/vnd.sqlite3" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${database.name.replace(/[^a-z0-9_-]+/gi, "-") || "database"}.sqlite`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Database downloaded", { description: "The SQLite file includes the complete schema and records." });
    } catch (error) { toast.error("Could not download database", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  return <>
    <div ref={menuRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-9 text-muted-foreground hover:text-foreground"
        aria-label={`Database actions for ${database.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal />
      </Button>
      {menuOpen ? <div role="menu" aria-label={`Actions for ${database.name}`} className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-border bg-popover p-1.5 shadow-xl">
        <button type="button" role="menuitem" onClick={openRenameDialog} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Pencil className="size-3.5" />Rename Database</button>
        <button type="button" role="menuitem" onClick={() => void handleDownload()} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Download className="size-3.5" />Export Database</button>
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDetailsOpen(true); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Info className="size-3.5" />Database Details</button>
        <div className="my-1 border-t border-border" />
        <button type="button" role="menuitem" onClick={openDeleteDialog} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition hover:bg-destructive-tint"><Trash2 className="size-3.5" />Delete Database</button>
      </div> : null}
    </div>

    <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
      <DialogContent>
        <form onSubmit={(event) => void handleRename(event)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Rename database</DialogTitle>
            <DialogDescription>Choose a clear name for this browser-local database. Its tables and records will not change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={`rename-${database.id}`} className="text-xs font-semibold">Database name</label>
            <input id={`rename-${database.id}`} autoFocus value={name} onChange={(event) => setName(event.target.value)} className="ui-input w-full" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || name.trim() === database.name || isMutating}>{isMutating ? "Renaming…" : "Rename Database"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <div className="grid size-11 place-items-center rounded-xl bg-destructive-tint text-destructive"><TriangleAlert className="size-5" /></div>
          <DialogTitle>Delete “{database.name}”?</DialogTitle>
          <DialogDescription>Deleting this database permanently removes all of its tables, records, query history, and checkpoints from this browser. Other databases will not be affected.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-destructive/20 bg-destructive/[.06] p-3 text-xs leading-5 text-muted-foreground">Type <strong className="text-foreground">{database.name}</strong> to confirm.</div>
        <div className="space-y-2">
          <label htmlFor={`delete-${database.id}`} className="text-xs font-semibold">Database name</label>
          <input id={`delete-${database.id}`} autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="ui-input w-full border-destructive/35 focus-visible:border-destructive" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={confirmation !== database.name || isMutating}>{isMutating ? "Deleting…" : "Delete Database"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent>
        <DialogHeader>
          <div className="grid size-11 place-items-center rounded-xl bg-selected text-selected-foreground"><Database className="size-5" /></div>
          <DialogTitle>{database.name}</DialogTitle>
          <DialogDescription>Browser-local metadata for this logical SQLite database.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-xl border bg-surface p-4 text-[13px] sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Source</dt><dd className="mt-1 font-medium capitalize">{database.source}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Size</dt><dd className="mt-1 font-medium">{formatBytes(database.sizeBytes)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-1 font-medium">{new Date(database.createdAt).toLocaleString()}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium">{new Date(database.updatedAt).toLocaleString()}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Stable internal identifier</dt><dd className="mt-1 break-all font-mono text-xs">{database.id}</dd></div>
        </dl>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setDetailsOpen(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
