"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Database,
  Expand,
  FileCode2,
  GraduationCap,
  LoaderCircle,
  Minimize2,
  RefreshCcw,
  Rows3,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { DatabaseDataTable } from "@/components/playground/database-data-table";
import { VisualizerPlayer } from "@/components/playground/query-visualizer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDatabaseStore } from "@/store/database-store";

type TeachingView = "workspace" | "visualization";
type TableView = "both" | "original" | "result";

const TeachingSqlEditor = dynamic(
  () => import("@/components/playground/monaco-sql-editor").then((module) => module.MonacoSqlEditor),
  { ssr: false, loading: () => <div className="grid h-[42vh] min-h-[360px] place-items-center text-sm text-slate-400"><div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading classroom editor…</div></div> },
);

export function TeachingMode({ onExit }: { onExit: () => void }) {
  const databases = useDatabaseStore((state) => state.databases);
  const activeDatabaseId = useDatabaseStore((state) => state.activeDatabaseId);
  const selectedTable = useDatabaseStore((state) => state.selectedTable);
  const sourceRecords = useDatabaseStore((state) => state.sourceRecords);
  const queryResult = useDatabaseStore((state) => state.queryResult);
  const visualizationPlan = useDatabaseStore((state) => state.visualizationPlan);
  const isMutating = useDatabaseStore((state) => state.isMutating);
  const resetDatabase = useDatabaseStore((state) => state.resetDatabase);
  const [view, setView] = React.useState<TeachingView>(visualizationPlan ? "visualization" : "workspace");
  const [tableView, setTableView] = React.useState<TableView>("both");
  const [isFullscreen, setIsFullscreen] = React.useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);

  const exit = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onExit();
  }, [onExit]);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
      if (event.altKey && event.key.toLowerCase() === "e") setView("workspace");
      if (event.altKey && event.key.toLowerCase() === "v" && visualizationPlan) setView("visualization");
      if (event.altKey && event.key.toLowerCase() === "o") setTableView("original");
      if (event.altKey && event.key.toLowerCase() === "r") setTableView("result");
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [exit, visualizationPlan]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => toast.error("Full-screen mode is unavailable in this browser."));
  };

  const reset = async () => {
    if (!window.confirm("Reset the active database to its original checkpoint? The current query will be preserved, and the reset itself can be undone after leaving Teaching Mode.")) return;
    try {
      await resetDatabase();
      setView("workspace");
      toast.success("Original database restored", { description: "The teaching query remains in the editor." });
    } catch (error) {
      toast.error("Could not reset database", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  return <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#090b14] text-slate-100" role="dialog" aria-modal="true" aria-label="QueryQuest Teaching Mode">
    <header className="flex min-h-18 flex-wrap items-center gap-3 border-b border-white/10 bg-[#0d101c]/95 px-5 py-3 shadow-xl backdrop-blur-xl md:px-8">
      <div className="grid size-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-300"><GraduationCap className="size-6" /></div>
      <div className="mr-auto"><div className="flex items-center gap-2"><h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">QueryQuest Teaching Mode</h1><span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-violet-300">Live classroom</span></div><p className="mt-0.5 text-xs text-slate-400">{activeDatabase?.name ?? "No database"}{selectedTable ? ` · ${selectedTable}` : ""} · Esc to exit</p></div>
      <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.035] p-1" aria-label="Teaching mode views"><button type="button" onClick={() => setView("workspace")} className={cn("flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition", view === "workspace" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}><FileCode2 className="size-4" />Editor & tables</button><button type="button" onClick={() => setView("visualization")} disabled={!visualizationPlan} className={cn("flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-35", view === "visualization" ? "bg-violet-500/20 text-violet-200" : "text-slate-400 hover:text-white")}><Sparkles className="size-4" />Visualization</button></nav>
      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={() => void reset()} disabled={isMutating}>{isMutating ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}Reset to Original Data</Button>
      <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}>{isFullscreen ? <Minimize2 /> : <Expand />}</Button>
      <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-red-500/15 hover:text-red-300" onClick={exit} aria-label="Exit Teaching Mode"><X /></Button>
    </header>

    <main className="workspace-scrollbar min-h-0 flex-1 overflow-y-auto">
      {view === "visualization" && visualizationPlan ? <VisualizerPlayer key={`${visualizationPlan.sql}-${visualizationPlan.finalResult.elapsedMs}`} plan={visualizationPlan} presentation onExit={exit} /> : <div className="min-h-full">
        <TeachingSqlEditor presentation onVisualizationReady={() => setView("visualization")} />
        <section className="border-t border-white/10 bg-[#0b0e18] p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3"><div><h2 className="font-display text-xl font-semibold">Classroom data view</h2><p className="mt-1 text-sm text-slate-400">Compare the unchanged source with the real SQLite result.</p></div><div className="ml-auto flex items-center gap-1 rounded-xl border border-white/10 bg-white/[.035] p-1">{(["both", "original", "result"] as const).map((option) => <button key={option} type="button" onClick={() => setTableView(option)} className={cn("flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold capitalize transition", tableView === option ? "bg-violet-500/20 text-violet-200" : "text-slate-400 hover:text-white")}>{option === "original" ? <Database className="size-4" /> : option === "result" ? <Rows3 className="size-4" /> : null}{option}</button>)}</div></div>
          <div className={cn("grid gap-5", tableView === "both" && "xl:grid-cols-2")}>
            {(tableView === "both" || tableView === "original") ? <TeachingTablePanel title="Original data" subtitle={selectedTable ?? "Select a table"} tone="blue">{sourceRecords ? <DatabaseDataTable result={sourceRecords} label="teaching original table" presentation /> : <TeachingEmpty title="Choose a source table" description="Select a table in the normal workspace before entering Teaching Mode, or run a query that references one." />}</TeachingTablePanel> : null}
            {(tableView === "both" || tableView === "result") ? <TeachingTablePanel title="Query result" subtitle={queryResult ? `${queryResult.rowCount} rows · ${queryResult.elapsedMs.toFixed(1)} ms` : "Run a query"} tone="violet">{queryResult?.columns.length ? <DatabaseDataTable result={queryResult} label="teaching query result" presentation /> : <TeachingEmpty title="No result yet" description="Run a supported query above. The result comes directly from the browser SQLite engine." />}</TeachingTablePanel> : null}
          </div>
        </section>
      </div>}
    </main>
  </div>;
}

function TeachingTablePanel({ title, subtitle, tone, children }: { title: string; subtitle: string; tone: "blue" | "violet"; children: React.ReactNode }) {
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111522]/90 shadow-2xl"><header className="flex items-center gap-3 border-b border-white/10 px-5 py-4"><span className={cn("size-2.5 rounded-full", tone === "blue" ? "bg-blue-400" : "bg-violet-400")} /><div><h3 className="text-base font-bold">{title}</h3><p className="mt-0.5 text-xs text-slate-400">{subtitle}</p></div></header><div className="workspace-scrollbar max-h-[44vh] overflow-auto">{children}</div></article>;
}

function TeachingEmpty({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-64 place-items-center p-8 text-center"><div><Rows3 className="mx-auto size-8 text-slate-600" /><p className="mt-4 text-lg font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p></div></div>;
}
