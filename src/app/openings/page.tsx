import { OpeningsWorkspace } from "@/features/repertoire/components/openings-workspace";

export default function OpeningsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Openings</h1>
      <OpeningsWorkspace />
    </div>
  );
}
