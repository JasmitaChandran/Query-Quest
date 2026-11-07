import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background" aria-label="Loading QueryQuest SQL Playground">
      <SiteHeader />
      <div className="flex h-12 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="ml-auto h-7 w-28" />
      </div>
      <div className="flex min-h-[calc(100vh-7rem)] flex-col md:flex-row">
        <Skeleton className="h-52 w-full rounded-none md:h-auto md:w-64" />
        <div className="flex-1 p-3">
          <Skeleton className="h-[40vh] min-h-64 rounded-xl" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
