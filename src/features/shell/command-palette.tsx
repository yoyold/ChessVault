"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_ITEMS } from "./navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Keyboard-first navigation and actions.
 *
 * Open state is controlled by the shell so that the header's search button and
 * the keyboard shortcut drive the same state directly, rather than one of them
 * having to simulate the other.
 *
 * Unbuilt modules are excluded rather than listed and disabled: in a sidebar
 * you scan, a greyed-out row is useful information; in a search box you type
 * into, a result that does nothing is a dead end.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { setTheme } = useTheme();

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search for a page or an action"
    >
      <CommandInput placeholder="Go to a page or run a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_ITEMS.filter((item) => item.available).map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => run(() => router.push(item.href))}
            >
              <item.icon />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem value="Light theme" onSelect={() => run(() => setTheme("light"))}>
            <Sun />
            Light
          </CommandItem>
          <CommandItem value="Dark theme" onSelect={() => run(() => setTheme("dark"))}>
            <Moon />
            Dark
          </CommandItem>
          <CommandItem value="System theme" onSelect={() => run(() => setTheme("system"))}>
            <Monitor />
            Match system
            <CommandShortcut>default</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
