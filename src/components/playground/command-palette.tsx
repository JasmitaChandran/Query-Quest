"use client";

import * as React from "react";
import {
  BookOpenCheck,
  Command,
  Database,
  Download,
  FileInput,
  GraduationCap,
  History,
  Network,
  Play,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Table2,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import { CreateDatabaseDialog } from "@/components/import/create-database-dialog";
import { ImportDatabaseDialog } from "@/components/import/import-database-dialog";
import { TableDesignerDialog } from "@/components/playground/table-designer-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDatabaseStore } from "@/store/database-store";
import { useWorkspaceStore } from "@/store/workspace-store";

type CommandItem = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  run: () => void | Promise<void>;
};

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true'], .monaco-editor"));
}

export function CommandPalette({ onEnterTeachingMode }: { onEnterTeachingMode: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [importOpen, setImportOpen] = React.useState(false);
  const [createDatabaseOpen, setCreateDatabaseOpen] = React.useState(false);
  const [createTableOpen, setCreateTableOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const setActivePanel = useWorkspaceStore((state) => state.setActivePanel);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const databases = useDatabaseStore((state) => state.databases);
  const exportDatabase = useDatabaseStore((state) => state.exportDatabase);
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const openDialog = (dialog: "import" | "database" | "table") => {
    setOpen(false);
    window.setTimeout(() => {
      if (dialog === "import") setImportOpen(true);
      else if (dialog === "database") setCreateDatabaseOpen(true);
      else setCreateTableOpen(true);
    }, 0);
  };

  const commands = React.useMemo<CommandItem[]>(() => [
    { id: "editor", label: "Open SQL Editor", description: "Write and run SQL", keywords: "query code", icon: BookOpenCheck, run: () => setActivePanel("editor") },
    { id: "visualizer", label: "Open Visualizer", description: "Replay the current query journey", keywords: "animation steps", icon: Waypoints, run: () => setActivePanel("visualizer") },
    { id: "data", label: "Open Table Data", description: "Edit the selected table", keywords: "visual spreadsheet rows", icon: Rows3, run: () => setActivePanel("data") },
    { id: "schema", label: "Open ER Diagram", description: "Explore schema relationships", keywords: "foreign key diagram", icon: Network, run: () => setActivePanel("schema") },
    { id: "history", label: "Open Query History", description: "Find saved and executed queries", keywords: "saved recent", icon: History, run: () => setActivePanel("history") },
    { id: "run", label: "Run Current SQL", description: "Uses the editor's existing execution and safety checks", keywords: "execute", icon: Play, run: () => window.dispatchEvent(new Event("queryquest:run-sql")) },
    { id: "visualize", label: "Visualize Current SQL", description: "Generate the educational query journey", keywords: "animate", icon: Sparkles, run: () => window.dispatchEvent(new Event("queryquest:visualize-sql")) },
    { id: "import", label: "Import Database", description: "SQLite, CSV, JSON, or supported MySQL dump", keywords: "upload file", icon: FileInput, run: () => openDialog("import") },
    { id: "create-db", label: "Create Database", description: "Create an empty browser-local SQLite database", keywords: "new", icon: Plus, run: () => openDialog("database") },
    { id: "create-table", label: "Create Table", description: "Open the visual SQLite table designer", keywords: "schema columns", icon: Table2, disabled: !activeDatabaseId, run: () => openDialog("table") },
    { id: "teaching", label: "Enter Teaching Mode", description: "Open the classroom presentation layout", keywords: "fullscreen projector presentation", icon: GraduationCap, run: onEnterTeachingMode },
    {
      id: "export-db",
      label: "Download Active Database",
      description: activeDatabase ? `Export ${activeDatabase.name} as SQLite` : "No active database",
      keywords: "export sqlite file",
      icon: Download,
      disabled: !activeDatabaseId,
      run: async () => {
        if (!activeDatabaseId || !activeDatabase) return;
        const exported = await exportDatabase(activeDatabaseId);
        const url = URL.createObjectURL(new Blob([exported.bytes as BlobPart], { type: "application/vnd.sqlite3" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${activeDatabase.name.replace(/[^a-z0-9_-]+/gi, "-") || "database"}.sqlite`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        toast.success("Database downloaded");
      },
    },
  ], [activeDatabase, activeDatabaseId, exportDatabase, onEnterTeachingMode, setActivePanel]);

  const filtered = commands.filter((command) => `${command.label} ${command.description} ${command.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const runCommand = async (command: CommandItem) => {
    if (command.disabled) return;
    setOpen(false);
    try { await command.run(); }
    catch (error) { toast.error("Command could not complete", { description: error instanceof Error ? error.message : "Try again." }); }
  };

  return <>
    <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Open command palette" title="Command palette · Ctrl/⌘ K"><Command /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12vh] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Navigate or run an existing QueryQuest action. SQL is never executed merely by opening this menu.</DialogDescription>
        </DialogHeader>
        <label className="flex h-12 items-center gap-3 border-b border-border px-4"><Search className="size-4 text-muted-foreground" /><span className="sr-only">Search commands</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <div className="workspace-scrollbar max-h-[55vh] overflow-y-auto p-2" role="listbox" aria-label="Available commands">{filtered.length ? filtered.map((command) => { const Icon = command.icon; return <button key={command.id} type="button" role="option" aria-disabled={command.disabled} disabled={command.disabled} onClick={() => void runCommand(command)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-55"><span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface"><Icon className="size-4 text-primary" /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{command.label}</span><span className="block truncate text-xs text-muted-foreground">{command.description}</span></span></button>; }) : <div className="px-4 py-10 text-center"><Database className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">No matching commands</p><p className="mt-1 text-xs text-muted-foreground">Try a navigation tab, database action, or query action.</p></div>}</div>
      </DialogContent>
    </Dialog>
    <ImportDatabaseDialog hideTrigger open={importOpen} onOpenChange={setImportOpen} />
    <CreateDatabaseDialog hideTrigger open={createDatabaseOpen} onOpenChange={setCreateDatabaseOpen} />
    <TableDesignerDialog hideTrigger open={createTableOpen} onOpenChange={setCreateTableOpen} />
  </>;
}
