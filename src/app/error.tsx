"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ApplicationError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error("QueryQuest route error", error); }, [error]);

  return <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-background px-6 py-16">
    <div className="w-full max-w-lg rounded-3xl border bg-card p-8 text-center shadow-xl shadow-black/5">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></div>
      <h1 className="mt-5 font-display text-2xl font-semibold">QueryQuest hit an unexpected error</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Your browser-stored databases are not cleared by this screen. Retry the current view, or refresh after closing other QueryQuest tabs.</p>
      <button type="button" onClick={retry} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCcw className="size-4" />Try again</button>
    </div>
  </main>;
}
