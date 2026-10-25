import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPP SDK resolves its workers, WASM and circuits relative to its own
// files (import.meta.url), so it must be served from node_modules untouched.
export default defineConfig({
  plugins: [react()],
  // Only scan this app; vendor/ holds reference clones with their own entries.
  optimizeDeps: {
    entries: ["index.html"],
    exclude: ["stellar-private-payments"],
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/vendor/**"] },
    // The demo operator runs in server/demo/main.ts (scripts/run-demo-local.sh --dev).
    proxy: { "/api/demo": "http://localhost:8080" },
  },
  worker: { format: "es" },
  // In the production build the SDK stays out of the bundle and loads from
  // the same path the dev server uses; server/demo/main.ts serves it.
  build: {
    rollupOptions: {
      external: ["stellar-private-payments"],
      output: { paths: { "stellar-private-payments": "/node_modules/stellar-private-payments/js/index.js" } },
    },
  },
});
