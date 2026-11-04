import Link from "next/link";
import { ArrowLeft, Map } from "lucide-react";

import { QueryQuestLogo } from "@/components/queryquest-logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page-grid grid min-h-screen place-items-center px-5">
      <div className="text-center">
        <div className="mx-auto mb-10 flex justify-center">
          <QueryQuestLogo />
        </div>
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Map className="size-6" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-primary">404</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-.04em]">Quest not found</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground">
          This path does not exist yet. Return home to choose another direction.
        </p>
        <Button asChild className="mt-7">
          <Link href="/">
            <ArrowLeft />
            Back to home
          </Link>
        </Button>
      </div>
    </main>
  );
}
