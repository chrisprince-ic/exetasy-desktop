import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // vendor/ holds verbatim third-party code (OpenAI's SIWC DevKit).
    // It ships its own node:test suite and must not be run or modified here.
    // Verify it with:  node --test vendor/siwc/local/test/*.test.mjs
    exclude: ["**/node_modules/**", "**/dist/**", "vendor/**", "out/**", "release/**"],
  },
});
