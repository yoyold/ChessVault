import { Separator } from "@/components/ui/separator";
import { PlayerNamesSetting } from "@/features/shell/player-names-setting";
import { SyncSetting } from "@/features/sync/sync-setting";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <PlayerNamesSetting />
      <Separator />
      <SyncSetting />
    </div>
  );
}
