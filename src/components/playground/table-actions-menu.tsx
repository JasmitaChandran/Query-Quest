"use client";

import * as React from "react";
import {
  Download,
  Eye,
  MoreHorizontal,
  TableProperties,
  Trash2,
  TriangleAlert,
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
} from "@/components/ui/dialog";
import type { TableSummary } from "@/lib/database/types";
import { queryResultToCsv } from "@/lib/database/workspace-format";
import { quoteIdentifier } from "@/lib/database/visual-sql";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

export function TableActionsMenu({
  table,
  onEditSchema,
}: {
  table: TableSummary;
  onEditSchema: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement>(null);
  const selectTable = useDatabaseStore((state) => state.selectTable);
  const exportTable = useDatabaseStore((state) => state.exportTable);
  const runQuery = useDatabaseStore((state) => state.runQuery);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const viewData = async () => {
    setMenuOpen(false);
    await selectTable(table.name);
    setActivePanel("data");
  };

  const download = async () => {
    setMenuOpen(false);
    try {
      const result = await exportTable(table.name);
      const url = URL.createObjectURL(
        new Blob([queryResultToCsv(result)], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${table.name.replace(/[^a-z0-9_-]+/gi, "-") || "table"}.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Table exported", {
        description: `${result.rowCount} row${result.rowCount === 1 ? "" : "s"} downloaded as CSV.`,
      });
    } catch (error) {
      toast.error("Could not export table", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };

  const remove = async () => {
    try {
      const keyword = table.type === "view" ? "VIEW" : "TABLE";
      await runQuery(`DROP ${keyword} ${quoteIdentifier(table.name)};`);
      setDeleteOpen(false);
      setConfirmation("");
      toast.success(`${table.type === "view" ? "View" : "Table"} deleted`, {
        description: "The schema change is checkpointed and can be undone.",
      });
    } catch (error) {
      toast.error(`Could not delete ${table.type}`, {
        description: error instanceof Error ? error.message : "Nothing was removed.",
      });
    }
  };

  return <>
    <div ref={menuRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 text-muted-foreground hover:text-foreground"
        aria-label={`Table actions for ${table.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <MoreHorizontal />
      </Button>
      {menuOpen ? <div role="menu" aria-label={`Actions for table ${table.name}`} className="absolute right-0 top-8 z-30 w-48 rounded-lg border border-border bg-popover p-1.5 shadow-xl">
        <button type="button" role="menuitem" onClick={() => void viewData()} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Eye className="size-3.5" />View Data</button>
        {table.type === "table" ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEditSchema(); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><TableProperties className="size-3.5" />Edit Schema</button> : null}
        <button type="button" role="menuitem" onClick={() => void download()} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover"><Download className="size-3.5" />Export CSV</button>
        <div className="my-1 border-t border-border" />
        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmation(""); setDeleteOpen(true); }} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition hover:bg-destructive-tint"><Trash2 className="size-3.5" />Delete {table.type === "view" ? "View" : "Table"}</button>
      </div> : null}
    </div>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <div className="grid size-11 place-items-center rounded-xl bg-destructive-tint text-destructive"><TriangleAlert className="size-5" /></div>
          <DialogTitle>Delete “{table.name}”?</DialogTitle>
          <DialogDescription>This removes the {table.type} from the active database. QueryQuest creates a database checkpoint first, so the schema change can be undone.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-destructive/20 bg-destructive-tint p-3 text-xs leading-5 text-muted-foreground">Type <strong className="text-foreground">{table.name}</strong> to confirm this destructive action.</div>
        <label className="space-y-2 text-xs font-semibold">{table.type === "view" ? "View" : "Table"} name<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="ui-input w-full border-destructive/35" /></label>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button type="button" variant="destructive" disabled={confirmation !== table.name || isMutating} onClick={() => void remove()}>{isMutating ? "Deleting…" : `Delete ${table.type === "view" ? "View" : "Table"}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
