"use client";

import { QueryQuestLogo } from "@/components/queryquest-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="relative z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <QueryQuestLogo compact />
        <ThemeToggle />
      </div>
    </header>
  );
}
