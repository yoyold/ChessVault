import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OpeningsWorkspace } from "@/features/repertoire/components/openings-workspace";

export default function OpeningsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Openings</h1>

      {/* The workspace reads its starting tab from the URL, and
          `useSearchParams` needs an explicit boundary under static export.
          See ADR 0001. */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OpeningsWorkspace />
      </Suspense>
    </div>
  );
}
