"use client";

import Link from "next/link";
import { DatabaseZap, FlaskConical } from "lucide-react";
import { usePathname } from "next/navigation";

import { QueryQuestLogo } from "@/components/queryquest-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/import", label: "Import Database", icon: DatabaseZap },
  { href: "/playground", label: "SQL Playground", icon: FlaskConical },
] as const;

export function SiteHeader({ workspace = false }: { workspace?: boolean }) {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl",
        workspace ? "relative" : "sticky top-0",
      )}
    >
      <div className={cn("mx-auto flex h-16 items-center gap-4 px-4 sm:px-6", !workspace && "max-w-7xl")}>
        <QueryQuestLogo compact={workspace} />
        <nav className="ml-auto flex items-center gap-1" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:px-4",
                  active && "bg-accent text-foreground shadow-sm",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="h-5 w-px bg-border" aria-hidden="true" />
        <ThemeToggle />
      </div>
    </header>
  );
}
