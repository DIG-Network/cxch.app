import type { NextConfig } from "next";

// This configuration mirrors the working WASM + WalletConnect setup from
// Yakuhito/streaming-ui. Deviating from it tends to cause prerender errors
// ("Error occurred prerendering page") and runtime WebAssembly LinkErrors.
const nextConfig: NextConfig = {
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
