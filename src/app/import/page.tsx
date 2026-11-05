import type { Metadata } from "next";
import { AlertTriangle, Check, DatabaseZap, FileCode2, HardDrive, ScanSearch, ShieldCheck } from "lucide-react";

import { CreateDatabaseDialog } from "@/components/import/create-database-dialog";
import { DropZone } from "@/components/import/drop-zone";
import { PhaseNoticeDialog } from "@/components/phase-notice-dialog";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Import Database",
  description: "Prepare a database file for your QueryQuest learning workspace.",
};

const steps = [
  { label: "Choose a file", state: "SQLite, MySQL dump, CSV, or JSON", icon: Check },
  { label: "Inspect schema", state: "Automatic", icon: ScanSearch },
  { label: "Save locally", state: "IndexedDB", icon: HardDrive },
] as const;

export default function ImportPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="relative overflow-hidden">
        <div className="page-grid pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-50" />
        <div className="pointer-events-none absolute -left-40 top-20 size-96 rounded-full bg-violet-500/10 blur-[110px]" />

        <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[.07] px-3 py-1.5 text-xs font-semibold text-primary">
                <DatabaseZap className="size-3.5" />
                Workspace setup
              </div>
              <h1 className="font-display text-3xl font-bold tracking-[-.04em] sm:text-5xl">
                Import a database
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Choose the data source you want to learn from. QueryQuest loads it into SQLite
                WebAssembly and keeps it private in your browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CreateDatabaseDialog />
              <PhaseNoticeDialog triggerLabel="How it works" />
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="bg-card/80 p-3 shadow-[0_24px_70px_-45px_rgba(65,47,145,.65)] sm:p-4">
              <DropZone />
              <div className="mt-4 flex flex-col items-start justify-between gap-3 border-t border-border px-2 pt-4 sm:flex-row sm:items-center">
                <p className="text-xs leading-5 text-muted-foreground">
                  Converted data is validated and committed through the worker-isolated SQLite engine.
                </p>
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="bg-card/70">
                <CardHeader>
                  <CardTitle>Import progress</CardTitle>
                  <CardDescription>A clear view of what happens next.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-1">
                    {steps.map((step, index) => {
                      const Icon = step.icon;
                      return (
                        <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                          {index < steps.length - 1 ? (
                            <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" />
                          ) : null}
                          <span
                            className="relative z-10 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <div className="pt-0.5">
                            <p className="text-sm font-semibold">{step.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{step.state}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>

              <Card className="bg-card/70">
                <CardHeader>
                  <CardTitle>File requirements</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex gap-3">
                    <FileCode2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">Supported formats</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        .sqlite, .sqlite3, .db (up to 50 MB), MySQL .sql dumps (up to 25 MB), CSV and JSON (up to 10 MB)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-medium">Browser-only persistence</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Files are stored in IndexedDB and restored automatically.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-500/20 bg-card/70">
                <CardHeader>
                  <CardTitle>MySQL conversion subset</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Supports common table definitions, literal INSERT values, primary and basic foreign keys, and compatible indexes. MySQL routines, triggers, views, events, FULLTEXT/SPATIAL indexes, and server behavior are reported but not emulated.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
