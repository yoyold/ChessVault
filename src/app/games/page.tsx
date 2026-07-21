import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GamesBrowser } from "@/features/games/components/games-browser";

export default function GamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Games</h1>
        <Button asChild size="sm" className="ml-auto gap-2">
          <Link href="/games/new/">
            <Plus className="size-4" />
            New game
          </Link>
        </Button>
      </div>

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
