"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { asset } from "@/lib/paths";

/**
 * Registers the service worker that makes the app work offline, and offers
 * updates when a new version has been deployed.
 *
 * Updates are offered, never forced. A page keeps running the build it loaded
 * with, and swapping the worker underneath it without a reload would hand it
 * scripts from a different build. Reloading on its own would be worse: it
 * would throw away whatever the user was in the middle of, an unsaved
 * annotation included. So the new version waits until the user says reload.
 *
 * Production only: the development server rebuilds on every change, and a
 * worker caching its output would serve stale code while developing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const container = navigator.serviceWorker;

    // Whether this page was already served by a worker when it loaded. On a
    // first visit it was not, and the worker taking over is simply installation
    // finishing — nothing to announce and nothing to reload.
    const hadController = container.controller !== null;
    let updateAccepted = false;

    const offer = (waiting: ServiceWorker) => {
      toast("A new version of ChessVault is available", {
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Reload",
          onClick: () => {
            updateAccepted = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const onControllerChange = () => {
      if (!hadController) return;

      if (updateAccepted) {
        window.location.reload();
        return;
      }

      // Accepted in another window. This one is still running the old build,
      // and reloading it unasked could lose work, so it only says so.
      toast("ChessVault was updated in another window", {
        duration: Number.POSITIVE_INFINITY,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    };

    container.addEventListener("controllerchange", onControllerChange);

    container
      .register(asset("/sw.js"), {
        scope: asset("/"),
        // Fetch the worker past the HTTP cache every time, so a deployment is
        // noticed on the next visit rather than whenever a cached copy expires.
        updateViaCache: "none",
      })
      .then((registration) => {
        // Found on an earlier visit and still waiting for its turn.
        if (registration.waiting && hadController) offer(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && container.controller) offer(installing);
          });
        });
      })
      .catch(() => {
        // Without a worker the app still works online, exactly as before; there
        // is nothing useful to tell the user about it.
      });

    return () => container.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
