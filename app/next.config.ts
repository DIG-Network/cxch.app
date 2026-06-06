import type { NextConfig } from "next";

// CRITICAL: this app runs as a pure client-side SPA via Next.js static
// export (`output: "export"`). There is no SSR, no API routes, no edge
// runtime — `next build` emits an `out/` directory of static HTML/JS/wasm
// that any static webhost or CDN can serve (mirrors the shielded-wallet
// reference setup).
//
// WHY STATIC EXPORT:
//   * WalletConnect's `SignClient` opens an IndexedDB store at construction
//     time; IndexedDB doesn't exist in Node, so any SSR pass would crash.
//   * The cmojo-core wasm bundle is browser-only by nature.
//   * Sage Wallet integration is inherently client-side.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  // Static hosts can't run the Next image optimizer.
  images: { unoptimized: true },

  webpack(config, { isServer, dev }) {
    // Optional dependencies of @walletconnect's pino logger and key-value store.
    // Pulling them into the bundle breaks the build, so we externalize them.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // From https://github.com/vercel/next.js/blob/canary/examples/with-webassembly/next.config.js
    // Use the client static directory in the server bundle and prod mode, which
    // fixes `Error occurred prerendering page "/"`.
    config.output.webassemblyModuleFilename =
      isServer && !dev
        ? "../static/wasm/[modulehash].wasm"
        : "static/wasm/[modulehash].wasm";

    // Webpack 5 does not enable WebAssembly by default.
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    return config;
  },
};

export default nextConfig;
