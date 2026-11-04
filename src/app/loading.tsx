import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background p-5 sm:p-8" aria-label="Loading QueryQuest">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-5">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-20 w-full max-w-xl" />
            <Skeleton className="h-20 w-4/5" />
            <Skeleton className="h-12 w-48" />
          </div>
          <Skeleton className="h-[420px] w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
