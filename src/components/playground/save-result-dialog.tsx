"use client";

import * as React from "react";
import { LoaderCircle, Save, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDatabaseStore } from "@/store/database-store";

export function SaveResultDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("query_result");
  const [error, setError] = React.useState<string | null>(null);
  const lastSelectSql = useDatabaseStore((state) => state.lastSelectSql);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const saveResultAsTable = useDatabaseStore((state) => state.saveResultAsTable);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    try { await saveResultAsTable(name); toast.success("Result saved as table", { description: `${name} is now available in Database Explorer.` }); setOpen(false); setName("query_result"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the result table."); }
  };

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm" disabled={!lastSelectSql}><Save />Save result as table</Button></DialogTrigger><DialogContent><form onSubmit={submit}><DialogHeader><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Table2 className="size-5" /></div><DialogTitle>Save result as a new table</DialogTitle><DialogDescription>QueryQuest will checkpoint the database and execute SQLite CREATE TABLE AS SELECT using the last successful SELECT.</DialogDescription></DialogHeader><label className="mt-5 block text-xs font-semibold">New table name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-mono text-sm outline-none focus:border-primary" /></label>{error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}<DialogFooter className="mt-6"><Button type="submit" disabled={isMutating || !name.trim()}>{isMutating ? <LoaderCircle className="animate-spin" /> : <Save />}{isMutating ? "Saving…" : "Create table"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
