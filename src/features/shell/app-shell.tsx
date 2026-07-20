"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CommandPalette } from "./command-palette";
import { NavList } from "./nav-list";
import { ThemeToggle } from "./theme-toggle";
import { useShortcut } from "./use-shortcut";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <Swords className="size-5" />
      ChessVault
    </Link>
  );
}

/**
 * The application frame: navigation, header, and the region pages render into.
 *
 * The sidebar is persistent from the medium breakpoint upwards and collapses
 * into a drawer below it. Navigation is duplicated rather than reparented
 * between the two, because moving a subtree between containers on resize
 * remounts it and loses focus and scroll position.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useShortcut("mod+k", () => setPaletteOpen((previous) => !previous));

  return (
    <div className="flex min-h-svh">
      <aside className="bg-sidebar hidden w-60 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <Wordmark />
        <NavList />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="p-0">
                <SheetTitle className="text-left">
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <NavList onNavigate={() => setDrawerOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <span className="md:hidden">
            <Wordmark />
          </span>

          <div className="ml-auto flex items-center gap-1">
            {/*
              A visible affordance for the palette. The shortcut alone is
              undiscoverable, and the palette is the fastest route to anything
              once the application is familiar.
            */}
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground hidden gap-2 sm:flex"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-3.5" />
              Search
              <kbd className="bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium">
                Ctrl K
              </kbd>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
