import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisPage } from "@/features/analysis/components/analysis-page";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Analysis</h1>

      {/* `useSearchParams` suspends during prerendering; static export requires
          the boundary to be explicit. See ADR 0001. */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AnalysisPage />
      </Suspense>
    </div>
  );
}
