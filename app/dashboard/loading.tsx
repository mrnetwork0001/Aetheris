import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="aether-container py-8 sm:py-12" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-4 h-8 w-full" />
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <Skeleton className="h-4 w-32" />
            <div className="mt-5">
              <SkeletonRows count={5} />
            </div>
          </Card>
          <Card className="p-5">
            <Skeleton className="h-4 w-40" />
            <div className="mt-5">
              <SkeletonRows count={4} />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <Skeleton className="h-4 w-36" />
            <div className="mt-5">
              <SkeletonRows count={4} />
            </div>
          </Card>
          <Card className="p-5">
            <Skeleton className="h-4 w-28" />
            <div className="mt-5">
              <SkeletonRows count={3} />
            </div>
          </Card>
        </div>
      </div>
      <span className="sr-only">Loading mission control</span>
    </div>
  );
}
