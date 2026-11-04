import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Check,
  Database,
  Eye,
  FileCode2,
  GitBranch,
  Layers3,
  Play,
  Sparkles,
  Table2,
  WandSparkles,
} from "lucide-react";

import { QueryQuestLogo } from "@/components/queryquest-logo";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const journey = [
  {
    step: "01",
    icon: Database,
    title: "Bring your schema",
    description:
      "Start with a database file and meet its tables, columns, and relationships in a calm, readable workspace.",
  },
  {
    step: "02",
    icon: FileCode2,
    title: "Write with context",
    description:
      "Keep the schema beside your query, so the structure you need is always one glance away.",
  },
  {
    step: "03",
    icon: GitBranch,
    title: "Build understanding",
    description:
      "Future learning layers will make joins, filters, and transformations easier to reason about step by step.",
  },
] as const;

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_55%_40%,rgba(94,94,255,.25),transparent_58%)] blur-2xl" />
      <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#10131d] shadow-[0_35px_100px_-25px_rgba(35,24,86,.75)] ring-1 ring-black/20">
        <div className="flex h-11 items-center border-b border-white/[.07] px-4">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#ff6b6b]" />
            <span className="size-2.5 rounded-full bg-[#ffd166]" />
            <span className="size-2.5 rounded-full bg-[#58d68d]" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-md border border-white/[.07] bg-white/[.035] px-3 py-1 text-[10px] font-medium text-slate-500">
            <Braces className="size-3" />
            learning_workspace.sql
          </div>
        </div>

        <div className="grid min-h-[390px] grid-cols-[128px_1fr] sm:grid-cols-[164px_1fr]">
          <aside className="border-r border-white/[.07] bg-[#0d1018] p-3 sm:p-4">
            <p className="mb-4 text-[9px] font-bold uppercase tracking-[.2em] text-slate-600">
              Explorer
            </p>
            <div className="space-y-2 text-[10px] text-slate-400">
              <div className="flex items-center gap-2 text-slate-300">
                <Database className="size-3 text-violet-400" />
                shop_db
              </div>
              <div className="ml-2 space-y-1.5 border-l border-white/10 pl-3">
                <div className="flex items-center gap-2 rounded-md bg-violet-500/10 px-2 py-1.5 text-violet-300">
                  <Table2 className="size-3" />
                  customers
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-slate-500">
                  <Table2 className="size-3" />
                  orders
                </div>
                <div className="flex items-center gap-2 px-2 py-1 text-slate-500">
                  <Table2 className="size-3" />
                  products
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex h-11 items-center justify-between border-b border-white/[.07] px-3 sm:px-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300">
                <FileCode2 className="size-3.5 text-blue-400" />
                Query 01
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-violet-500 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-lg shadow-violet-500/20">
                <Play className="size-2.5 fill-current" />
                Run
              </div>
            </div>

            <div className="h-40 border-b border-white/[.07] bg-[#11151f] p-4 font-mono text-[10px] leading-6 sm:p-5 sm:text-[11px]">
              <div>
                <span className="mr-4 text-slate-700">1</span>
                <span className="text-violet-300">SELECT</span>{" "}
                <span className="text-slate-300">c.name, COUNT(o.id)</span>
              </div>
              <div>
                <span className="mr-4 text-slate-700">2</span>
                <span className="text-violet-300">FROM</span>{" "}
                <span className="text-blue-300">customers</span>{" "}
                <span className="text-slate-300">c</span>
              </div>
              <div>
                <span className="mr-4 text-slate-700">3</span>
                <span className="text-violet-300">JOIN</span>{" "}
                <span className="text-blue-300">orders</span>{" "}
                <span className="text-slate-300">o</span>
              </div>
              <div>
                <span className="mr-4 text-slate-700">4</span>
                <span className="text-violet-300">ON</span>{" "}
                <span className="text-slate-300">c.id = o.customer_id</span>
              </div>
              <div>
                <span className="mr-4 text-slate-700">5</span>
                <span className="text-violet-300">GROUP BY</span>{" "}
                <span className="text-slate-300">c.name;</span>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-600">
                    Visual query path
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">Illustrative product direction</p>
                </div>
                <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-[8px] font-semibold text-emerald-300">
                  3 steps
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                {["customers", "JOIN orders", "GROUP BY"].map((label, index) => (
                  <div key={label} className="contents">
                    <div className="min-w-0 flex-1 rounded-lg border border-white/[.08] bg-white/[.035] px-2 py-3 text-center text-[8px] font-semibold text-slate-400 sm:px-3 sm:text-[9px]">
                      {label}
                    </div>
                    {index < 2 && <ArrowRight className="size-3 shrink-0 text-violet-500/70" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <SiteHeader />
      <div className="page-grid pointer-events-none absolute inset-x-0 top-16 h-[760px] opacity-55" />
      <div className="soft-noise pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute left-[-12%] top-20 size-[420px] rounded-full bg-violet-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute right-[-10%] top-60 size-[500px] rounded-full bg-blue-500/10 blur-[120px]" />

      <main className="relative">
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-20 sm:px-6 lg:grid-cols-[.92fr_1.08fr] lg:gap-10 lg:pb-32 lg:pt-28">
          <div className="max-w-2xl">
            <div className="reveal mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[.07] px-3 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              SQL learning, made visible
            </div>
            <h1 className="reveal reveal-delay-1 font-display text-[clamp(3.2rem,7vw,6.8rem)] font-bold leading-[.91] tracking-[-.065em] text-balance">
              See what your SQL is{" "}
              <span className="bg-[linear-gradient(120deg,var(--brand-violet),var(--brand-blue))] bg-clip-text text-transparent">
                really doing.
              </span>
            </h1>
            <p className="reveal reveal-delay-2 mt-7 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
              QueryQuest is a focused learning workspace where schemas, queries, and results come
              together—so you can move from memorizing syntax to understanding the story in your data.
            </p>
            <div className="reveal reveal-delay-2 mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/playground">
                  Open SQL Playground
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/import">
                  <Database />
                  Import a database
                </Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                Built for learning
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                Distraction-free workspace
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" />
                Runs in your browser
              </span>
            </div>
          </div>

          <div className="reveal reveal-delay-2 lg:translate-x-5">
            <ProductPreview />
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/35 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-6 lg:py-28">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">The learning loop</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-5xl">
                A clearer path from schema to insight.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                QueryQuest is being shaped around one continuous workflow, with every panel adding
                context instead of clutter.
              </p>
            </div>

            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
              {journey.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.step} className="group relative bg-background p-7 sm:p-8">
                    <div className="mb-10 flex items-center justify-between">
                      <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:-rotate-3 group-hover:scale-105">
                        <Icon className="size-5" />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground/60">{item.step}</span>
                    </div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 sm:px-6 lg:grid-cols-2 lg:py-32">
          <Card className="relative overflow-hidden bg-[linear-gradient(145deg,color-mix(in_oklab,var(--card)_95%,var(--primary)_5%),var(--card))] p-6 sm:p-8">
            <div className="absolute right-0 top-0 size-40 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative mb-7 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-blue-500/10 text-blue-500">
                <Eye className="size-5" />
              </div>
              <div>
                <p className="font-display text-sm font-semibold">Side-by-side reasoning</p>
                <p className="text-xs text-muted-foreground">Original data and query result</p>
              </div>
            </div>
            <div className="relative grid gap-4 sm:grid-cols-2">
              {["Source table", "Result table"].map((title, panelIndex) => (
                <div key={title} className="overflow-hidden rounded-xl border border-border bg-background/70">
                  <div className="flex h-9 items-center justify-between border-b border-border px-3">
                    <span className="text-[10px] font-semibold">{title}</span>
                    <span className="size-1.5 rounded-full bg-primary/70" />
                  </div>
                  <div className="p-3">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} className="mb-2 flex gap-2 last:mb-0">
                        <span className="h-2 flex-[.6] rounded-full bg-muted" />
                        <span
                          className="h-2 flex-1 rounded-full bg-muted"
                          style={{ opacity: panelIndex === 1 && row > 1 ? 0.45 : 1 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="lg:pl-10">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-primary">
              <WandSparkles className="size-4" />
              IDE confidence, learner clarity
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-[-.04em] sm:text-5xl">
              Professional enough to grow into.
            </h2>
            <p className="mt-6 text-base leading-8 text-muted-foreground">
              The workspace borrows the structure of a modern database IDE—explorer, editor, source,
              and result panels—then pares it back for focused practice.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <Layers3 className="mb-3 size-5 text-primary" />
                <p className="text-sm font-semibold">Modular workspace</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Resizable sections that adapt to the task at hand.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <Sparkles className="mb-3 size-5 text-primary" />
                <p className="text-sm font-semibold">Purposeful states</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Clear guidance when data or functionality is not available yet.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-6 lg:pb-28">
          <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(120deg,rgba(124,58,237,.12),rgba(59,130,246,.08))] px-6 py-14 text-center sm:px-12 sm:py-20">
            <div className="absolute left-1/2 top-0 -z-10 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[90px]" />
            <h2 className="font-display text-3xl font-bold tracking-[-.04em] sm:text-5xl">
              Your next query starts here.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              Explore the live workspace, inspect a relational sample, and run your first read-only
              query entirely in the browser.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/playground">
                  Explore the workspace
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <QueryQuestLogo />
          <p>Browser-native SQLite · Built for curious minds.</p>
        </div>
      </footer>
    </div>
  );
}
