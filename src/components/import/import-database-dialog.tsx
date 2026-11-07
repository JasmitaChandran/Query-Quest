"use client";

import * as React from "react";
import { DatabaseZap, Import } from "lucide-react";

import { DropZone } from "@/components/import/drop-zone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ImportDatabaseDialog() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 justify-center">
          <Import />
          Import Database
        </Button>
      </DialogTrigger>
      <DialogContent className="workspace-scrollbar max-h-[92vh] max-w-5xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <DatabaseZap className="size-5" />
          </div>
          <DialogTitle>Import a database</DialogTitle>
          <DialogDescription>
            Inspect and import SQLite, CSV, JSON, or a supported MySQL dump without leaving the SQL workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 sm:p-6">
          <DropZone onImported={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
