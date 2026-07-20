import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GamesBrowser } from "@/features/games/components/games-browser";

export default function GamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Games</h1>

      {/*
        `useSearchParams` suspends during prerendering, where no request URL
        exists. Static export requires the boundary to be explicit; without it
        the build fails rather than degrading at runtime.
      */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <GamesBrowser />
      </Suspense>
    </div>
  );
}
