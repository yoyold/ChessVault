import { StatisticsView } from "@/features/statistics/components/statistics-view";

export default function StatisticsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Statistics</h1>
      <StatisticsView />
    </div>
  );
}
