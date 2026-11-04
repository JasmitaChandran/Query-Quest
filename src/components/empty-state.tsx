import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "min-h-40 py-6" : "min-h-64 py-10",
      )}
    >
      <div className="mb-4 grid size-11 place-items-center rounded-2xl border border-border bg-muted/50 text-muted-foreground shadow-sm">
        <Icon className="size-5" />
      </div>
      <p className="font-display text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
