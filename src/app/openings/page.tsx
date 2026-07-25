import { RepertoireView } from "@/features/repertoire/components/repertoire-view";

export default function OpeningsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Openings</h1>
      <RepertoireView />
    </div>
  );
}
