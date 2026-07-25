"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query currently matches.
 *
 * Layout belongs in CSS, and this is not for laying out — it is for the cases
 * where a measurement has to exist as a number in JavaScript. A virtualised
 * list is the example: it asks how tall a row is in order to decide how many
 * rows to create at all, and a Tailwind breakpoint cannot answer that.
 *
 * Reports `false` for the server snapshot, because a static export has no
 * viewport to measure. That makes the wide layout the one rendered into the
 * HTML, and a narrow screen corrects it on hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
