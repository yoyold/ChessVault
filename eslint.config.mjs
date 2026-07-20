import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Enforcement of the layering described in ADR 0003.
 *
 * Dependencies point strictly inward: app -> features -> persistence -> core.
 * A layering rule that is only written down erodes over the years this project
 * is meant to last; one that fails the build does not.
 */
const layering = [
  {
    // The domain layer is pure TypeScript: no framework, no storage, no UI.
    // This is what keeps chess logic and scheduling testable in isolation and
    // insulated from framework churn.
    files: ["src/core/**/*.ts", "src/core/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/persistence/*", "@/features/*", "@/app/*", "@/components/*"],
              message:
                "core/ is the innermost layer and must not depend on storage, features, or UI.",
            },
            {
              group: ["react", "react-dom", "next", "next/*", "dexie", "dexie-react-hooks"],
              message:
                "core/ must stay free of framework and storage dependencies so it can be unit-tested without a DOM or a database.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/persistence/**/*.ts", "src/persistence/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/app/*", "@/components/*"],
              message:
                "persistence/ may depend on core/ only; features and UI sit above it.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.ts", "src/features/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*"],
              message:
                "features/ must not depend on route composition; app/ wires features together, not the reverse.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layering,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party engine binaries staged into public/ at build time. Linting
    // vendored, minified code reports on decisions that are not ours to make.
    "public/engine/**",
  ]),
]);

export default eslintConfig;
