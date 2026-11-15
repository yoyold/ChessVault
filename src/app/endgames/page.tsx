import { EndgamesView } from "@/features/endgames/components/endgames-view";

export default function EndgamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Endgames</h1>
      <EndgamesView />
    </div>
  );
}
