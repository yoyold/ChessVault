"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useIsHydrated } from "./use-hydrated";

/**
 * Switch between light and dark.
 *
 * The resolved theme comes from the user's system preference and localStorage,
 * neither of which exists during the static export. *Everything* derived from
 * it therefore has to wait for hydration — not just the icon but the accessible
 * label too, which is easy to overlook because it is invisible and still
 * produces a hydration mismatch.
 *
 * The button keeps its footprint while undetermined, so the header does not
 * shift once the theme resolves.
 */
export function ThemeToggle() {
  const hydrated = useIsHydrated();
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        hydrated
          ? isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
          : "Switch theme"
      }
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {hydrated ? isDark ? <Moon /> : <Sun /> : null}
    </Button>
  );
}
