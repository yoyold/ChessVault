import type { MetadataRoute } from "next";
import { asset } from "@/lib/paths";

/**
 * What makes the app installable.
 *
 * Installed, it opens in its own window like any other program — and, for the
 * data, it matters more than it looks: browsers treat an installed app's
 * storage as something the user chose to keep. Safari exempts it from deleting
 * the data of sites left unused for a week, and Chrome is far more willing to
 * grant persistent storage to it.
 *
 * Every URL goes through `asset()`. On GitHub Pages the app lives under the
 * repository's path, and a manifest is read by the browser as plain text: a
 * `start_url` of "/" would open the owner's user site rather than this app.
 */

// Written once at build time; a static export has nothing to run it later.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChessVault",
    short_name: "ChessVault",
    description:
      "A personal chess database, analysis workbench and training log that runs entirely in the browser.",
    id: asset("/"),
    start_url: asset("/"),
    scope: asset("/"),
    display: "standalone",
    background_color: "#202020",
    theme_color: "#202020",
    icons: [
      { src: asset("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: asset("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: asset("/icons/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
