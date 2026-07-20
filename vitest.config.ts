import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Exclude the build output so Vitest never tries to collect the exported
    // static bundle as test files.
    exclude: ["node_modules", "out", ".next"],

    // Keeps the CI `npm test` gate green while the first modules are still
    // being built. Remove once the suite is established, so that an empty or
    // mis-globbed test run fails loudly instead of silently passing.
    passWithNoTests: true,
  },
});
