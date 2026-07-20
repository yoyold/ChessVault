"use client";

import { useSyncExternalStore } from "react";

/**
 * Hydration happens once and React re-renders as part of it, so there is
 * nothing to subscribe to.
 */
const subscribe = () => () => {};

/**
 * Whether the component has hydrated on the client.
 *
 * Some values genuinely do not exist during the static export — the resolved
 * colour theme, anything from localStorage — and rendering a guess for them
 * guarantees a hydration mismatch and a visible flicker of the wrong state.
 *
 * This reports `false` for the server snapshot and `true` afterwards. It is
 * preferred over the `useState` plus `useEffect` mount flag because that
 * pattern sets state inside an effect, which triggers a cascading render on
 * every mount.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
