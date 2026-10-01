import { TrainingView } from "@/features/training/components/training-view";

export default function TacticsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tactics</h1>
      <TrainingView />
    </div>
  );
}
