import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-40" />
      <Card>
        <SkeletonRows count={rows} />
      </Card>
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-10" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-72" />
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

      <SectionSkeleton rows={5} />
      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={4} />
      <span className="sr-only">Loading mission control</span>
    </div>
  );
}
