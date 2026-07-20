"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSettings,
  getSettings,
  subscribeToSettings,
  type AppSettings,
} from "@/lib/settings";

/**
 * Subscribe to user settings.
 *
 * Re-renders when settings change, including from another tab, and yields the
 * defaults during static rendering where localStorage does not exist.
 */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeToSettings, getSettings, getServerSettings);
}
