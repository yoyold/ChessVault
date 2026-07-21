import { NewGameForm } from "@/features/games/edit/new-game-form";

export default function NewGamePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">New game</h1>
      <NewGameForm />
    </div>
  );
}
