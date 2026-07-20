"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme handling for the whole application.
 *
 * `attribute="class"` matches the `dark` custom variant defined in
 * `globals.css`, so Tailwind's dark styles key off the same class next-themes
 * toggles.
 *
 * Transitions are suppressed while switching so that changing theme is an
 * instant repaint rather than every coloured surface on the page animating
 * independently, which reads as a glitch.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
