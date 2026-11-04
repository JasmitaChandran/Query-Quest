"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Database, FileUp, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DatabaseImportPreview, DatasetColumn, SqlValue } from "@/lib/database/types";
import { parseCsvDataset, parseJsonDataset } from "@/lib/import/dataset-parser";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";

const SQLITE_EXTENSIONS = ["db", "sqlite", "sqlite3"];
const MAX_SQLITE = 50 * 1024 * 1024;
const MAX_DATASET = 10 * 1024 * 1024;
type Prepared = { kind: "sqlite"; bytes: Uint8Array; preview: DatabaseImportPreview } | { kind: "dataset"; columns: DatasetColumn[]; rows: SqlValue[][] };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim() || "Imported database";
const safeTableName = (name: string) => baseName(name).replace(/[^A-Za-z0-9_]+/g, "_").replace(/^\d/, "_$&") || "imported_data";

function readFile(file: File, asText: boolean, onProgress: (value: number) => void) {
  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 75));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    if (asText) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export function DropZone() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [prepared, setPrepared] = React.useState<Prepared | null>(null);
  const [databaseName, setDatabaseName] = React.useState("");
  const [datasetTableName, setDatasetTableName] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [parsing, setParsing] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const databases = useDatabaseStore((state) => state.databases);
  const isImporting = useDatabaseStore((state) => state.isImporting);
  const previewSqlite = useDatabaseStore((state) => state.previewSqlite);
  const importSqlite = useDatabaseStore((state) => state.importSqlite);
  const importDataset = useDatabaseStore((state) => state.importDataset);

  const reset = React.useCallback(() => {
    setFile(null); setPrepared(null); setProgress(0); setError(null); setSuccess(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const stageFile = React.useCallback(async (next?: File) => {
    if (!next) return;
    setError(null); setSuccess(false); setPrepared(null); setFile(next); setProgress(0);
    const extension = next.name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "sql") { setError("MySQL .sql imports are not supported yet. Choose SQLite, CSV, or JSON."); return; }
    if (![...SQLITE_EXTENSIONS, "csv", "json"].includes(extension)) { setError("Unsupported file type. Choose .db, .sqlite, .sqlite3, .csv, or .json."); return; }
    const max = SQLITE_EXTENSIONS.includes(extension) ? MAX_SQLITE : MAX_DATASET;
    if (!next.size) { setError("The selected file is empty."); return; }
    if (next.size > max) { setError(`This file exceeds the ${formatBytes(max)} limit for its format.`); return; }
    setDatabaseName(baseName(next.name)); setDatasetTableName(safeTableName(next.name)); setParsing(true);
    try {
      const raw = await readFile(next, !SQLITE_EXTENSIONS.includes(extension), setProgress);
      setProgress(85);
      if (SQLITE_EXTENSIONS.includes(extension)) {
        const bytes = new Uint8Array(raw as ArrayBuffer);
        setPrepared({ kind: "sqlite", bytes, preview: await previewSqlite(bytes) });
      } else {
        const parsed = extension === "csv" ? parseCsvDataset(raw as string) : parseJsonDataset(raw as string);
        setPrepared({ kind: "dataset", ...parsed });
      }
      setProgress(100);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be parsed."); }
    finally { setParsing(false); }
  }, [previewSqlite]);

  const confirmImport = async () => {
    if (!prepared) return;
    if (!databaseName.trim()) { setError("Enter a database name."); return; }
    if (prepared.kind === "dataset" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(datasetTableName)) {
      setError("Table names must start with a letter or underscore and contain only letters, numbers, and underscores."); return;
    }
    setError(null);
    try {
      if (prepared.kind === "sqlite") await importSqlite(databaseName, prepared.bytes);
      else await importDataset({ databaseName, tableName: datasetTableName, columns: prepared.columns, rows: prepared.rows });
      setSuccess(true); toast.success("Database imported", { description: "It is saved locally and ready in SQL Playground." });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
  };

  const previewTables = prepared?.kind === "sqlite"
    ? prepared.preview.tables.map((item) => ({ name: item.summary.name, count: item.summary.rowCount, columns: item.schema.columns.map((column) => ({ name: column.name, type: column.type || "TEXT" })), headers: item.records.columns, rows: item.records.values }))
    : prepared?.kind === "dataset"
      ? [{ name: datasetTableName, count: prepared.rows.length, columns: prepared.columns, headers: prepared.columns.map((column) => column.name), rows: prepared.rows.slice(0, 5) }]
      : [];
  const duplicateName = databases.some((item) => item.name.toLowerCase() === databaseName.trim().toLowerCase());

  if (success) return <div className="grid min-h-[360px] place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[.05] p-8 text-center"><div><CheckCircle2 className="mx-auto size-12 text-emerald-500" /><h2 className="mt-4 font-display text-2xl font-semibold">Import complete</h2><p className="mt-2 text-sm text-muted-foreground">{databaseName} is stored in this browser and selected.</p><div className="mt-6 flex justify-center gap-3"><Button variant="outline" onClick={reset}>Import another</Button><Button asChild><Link href="/playground"><Database />Open in SQL Playground</Link></Button></div></div></div>;

  return <div className="space-y-5">
    <input ref={inputRef} className="sr-only" type="file" accept=".db,.sqlite,.sqlite3,.csv,.json" onChange={(event) => void stageFile(event.target.files?.[0])} aria-label="Choose a database or dataset file" />
    {!prepared ? <div className={cn("relative flex min-h-[330px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition", dragging ? "border-primary bg-primary/[.08]" : "border-border bg-muted/15 hover:border-primary/40")} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void stageFile(event.dataTransfer.files?.[0]); }}>
      <div className="grid size-16 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><FileUp className="size-7" /></div><h2 className="mt-6 font-display text-2xl font-semibold">Drop your database or dataset here</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">SQLite databases, CSV files, and JSON arrays of objects are parsed entirely inside your browser.</p><Button className="mt-6" variant="outline" onClick={() => inputRef.current?.click()}><FileUp />Browse Files</Button><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500" />Nothing is uploaded to a server</p>
    </div> : null}
    {file && !prepared ? <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p></div><Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Remove file"><X /></Button></div>{parsing ? <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">Reading and inspecting… {progress}%</p></div> : null}</div> : null}
    {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
    {prepared ? <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Preview ready</p><h2 className="mt-1 font-display text-xl font-semibold">Review before importing</h2><p className="mt-1 text-sm text-muted-foreground">{file?.name} · {file ? formatBytes(file.size) : ""}</p></div><Button variant="ghost" size="icon-sm" onClick={reset} aria-label="Cancel import"><X /></Button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Database name<input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" value={databaseName} onChange={(event) => setDatabaseName(event.target.value)} /></label>{prepared.kind === "dataset" ? <label className="space-y-2 text-sm font-medium">Table name<input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" value={datasetTableName} onChange={(event) => setDatasetTableName(event.target.value)} /></label> : null}</div>
      {duplicateName ? <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">A database with this display name exists. QueryQuest will create a separate database and will not overwrite it.</p> : null}
      <div className="space-y-4">{previewTables.length ? previewTables.map((table) => <div key={table.name} className="overflow-hidden rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3"><p className="font-mono text-sm font-semibold">{table.name}</p><p className="text-xs text-muted-foreground">{table.columns.length} columns · {table.count} rows</p></div><div className="flex flex-wrap gap-2 border-b p-3">{table.columns.map((column) => <span key={column.name} className="rounded-md border bg-background px-2 py-1 font-mono text-[11px]">{column.name} <span className="text-primary">{column.type}</span></span>)}</div><div className="max-h-52 overflow-auto"><Table><TableHeader><TableRow>{table.headers.map((header) => <TableHead key={header} className="whitespace-nowrap font-mono text-xs">{header}</TableHead>)}</TableRow></TableHeader><TableBody>{table.rows.map((row, index) => <TableRow key={index}>{row.map((value, cell) => <TableCell key={cell} className="max-w-56 truncate font-mono text-xs">{value === null ? <span className="text-muted-foreground">NULL</span> : String(value)}</TableCell>)}</TableRow>)}</TableBody></Table></div></div>) : <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">This is a valid empty SQLite database with no user tables.</p>}</div>
      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end"><Button variant="outline" onClick={reset} disabled={isImporting}>Cancel</Button><Button onClick={() => void confirmImport()} disabled={isImporting}>{isImporting ? <LoaderCircle className="animate-spin" /> : <FileUp />}{isImporting ? "Importing atomically…" : "Confirm import"}</Button></div>
    </div> : null}
  </div>;
}
