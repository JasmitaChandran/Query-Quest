import Link from "next/link";

import { cn } from "@/lib/utils";

export function QueryQuestLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label="QueryQuest home"
    >
      <span className="relative grid size-9 place-items-center rounded-xl bg-[linear-gradient(145deg,var(--brand-violet),var(--brand-blue))] shadow-[0_8px_24px_-8px_var(--primary-glow)] transition-transform group-hover:-rotate-3 group-hover:scale-105">
        <span className="grid grid-cols-2 gap-[3px]">
          <span className="size-[5px] rounded-[2px] bg-white" />
          <span className="size-[5px] rounded-[2px] bg-white/55" />
          <span className="size-[5px] rounded-[2px] bg-white/55" />
          <span className="size-[5px] rounded-[2px] bg-white" />
        </span>
      </span>
      <span className={cn("font-display text-lg font-bold tracking-[-0.035em]", compact && "hidden sm:block")}>
        Query<span className="text-primary">Quest</span>
      </span>
    </Link>
  );
}
