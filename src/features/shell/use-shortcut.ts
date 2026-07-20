"use client";

import { useEffect, useRef } from "react";
import { isTextEntryTarget, matchesCombo } from "@/lib/keyboard";

interface UseShortcutOptions {
  /**
   * Whether the shortcut fires while the user is typing.
   *
   * Defaults to true for combinations involving `mod`, which cannot be produced
   * accidentally while writing, and false for plain keys, which can.
   */
  allowInTextEntry?: boolean;
  enabled?: boolean;
}

/**
 * Bind a global keyboard shortcut for as long as the component is mounted.
 */
export function useShortcut(
  combo: string,
  handler: () => void,
  options: UseShortcutOptions = {},
): void {
  const { allowInTextEntry = combo.includes("mod"), enabled = true } = options;

  // Held in a ref so that an inline handler does not detach and reattach the
  // listener on every render. The ref is updated in an effect rather than
  // during render, which would not be safe under concurrent rendering.
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowInTextEntry && isTextEntryTarget(event.target)) return;
      if (!matchesCombo(event, combo)) return;

      // Claim the combination: several of these collide with browser defaults,
      // and mod+k in particular would otherwise focus the address bar.
      event.preventDefault();
      handlerRef.current();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, allowInTextEntry, enabled]);
}
