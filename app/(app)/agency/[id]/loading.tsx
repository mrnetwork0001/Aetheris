import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/** Mirrors the agency page layout so the shell does not jump when data lands. */
export default function AgencyLoading() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-3 w-44" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-3 w-80 max-w-[70vw]" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="!p-6">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-3 h-3 w-40" />
          </Card>
        ))}
      </div>

      <div>
        <Skeleton className="mb-4 h-5 w-16" />
        <Card>
          <SkeletonRows count={5} />
        </Card>
      </div>

      <div>
        <Skeleton className="mb-4 h-5 w-40" />
        <Card>
          <SkeletonRows count={4} />
        </Card>
      </div>

      <div>
        <Skeleton className="mb-4 h-5 w-28" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <SkeletonRows count={5} />
          </Card>
          <Card className="self-start">
            <SkeletonRows count={4} />
          </Card>
        </div>
      </div>

      <div>
        <Skeleton className="mb-4 h-5 w-28" />
        <Card>
          <SkeletonRows count={5} />
        </Card>
      </div>

      <span className="sr-only">Loading agency</span>
    </div>
  );
}
