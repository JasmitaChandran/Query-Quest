"use client";

import * as React from "react";
import { Database, LoaderCircle, Plus } from "lucide-react";
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
import { useDatabaseStore } from "@/store/database-store";

export function CreateDatabaseDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const createDatabase = useDatabaseStore((state) => state.createDatabase);
  const isCreating = useDatabaseStore((state) => state.isImporting);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createDatabase(name);
      toast.success("Database created", {
        description: `${name.trim()} is ready and stored in this browser.`,
      });
      setOpen(false);
      setName("");
    } catch (error) {
      toast.error("Could not create database", {
        description: error instanceof Error ? error.message : "Try another database name.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "icon-sm" : "sm"} title="Create database" aria-label={compact ? "Create database" : undefined}>
          <Plus />
          {compact ? null : "Create Database"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <DialogTitle>Create a logical database</DialogTitle>
            <DialogDescription>
              Start with an independent empty SQLite database. It will be persisted locally and can be
              switched from the explorer.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-5 block text-xs font-semibold" htmlFor="database-name">
            Database name
          </label>
          <input
            id="database-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Research Lab"
            autoComplete="off"
            className="ui-input mt-2 w-full"
          />
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {isCreating ? "Creating…" : "Create database"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
