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
  },
  worker: { format: "es" },
});
