import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportLoading() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-5 h-12 w-80 max-w-full" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-[480px] rounded-2xl" />
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
