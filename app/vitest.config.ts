import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit-test config for the TypeScript layer (fee math, formatting, coin
// selection). Tests run in Node — the pure logic needs no DOM — and the
// cmojo-core WASM module is loaded from its wasm-pack build via the same
// `@wasm` alias the app uses, so the fee-parity test exercises the real
// compiled Rust rather than a re-implementation.
export default defineConfig({
  resolve: {
    alias: {
      "@wasm": fileURLToPath(new URL("./wasm-pkg/cmojo_core.js", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["app/lib/format.ts", "app/lib/fees.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
