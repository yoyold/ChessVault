import { DatabaseStats } from "@/features/games/components/database-stats";
import { ImportCard } from "@/features/games/components/import-card";

export default function OverviewPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything here is stored on this device only.
        </p>
      </header>

      <DatabaseStats />
      <ImportCard />
    </div>
  );
}
