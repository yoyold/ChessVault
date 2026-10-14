import { NotesView } from "@/features/notes/components/notes-view";

export default function NotesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Notes</h1>
      <NotesView />
    </div>
  );
}
