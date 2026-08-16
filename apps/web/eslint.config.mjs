import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored AlignUI base components + shadcn chart.tsx, and the AlignUI
    // utilities (invariant 8, components/ui/SOURCES.md). Byte-identical to
    // their docs sources — a lint rule they trip is not ours to fix, and
    // silencing it inline would break byte-identity.
    "components/ui/**",
    "utils/**",
  ]),
]);

export default eslintConfig;
