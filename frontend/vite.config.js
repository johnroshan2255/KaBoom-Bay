import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // CrazyGames serves the zip from a subfolder: assets must be relative
  server: {
    port: 5173,
    host: true, // expose on LAN for mobile/touch testing
  },
  build: {
    chunkSizeWarningLimit: 3000, // Rapier's WASM-in-JS chunk is ~2.8MB; well within the 50MB budget
    target: "es2022",
    sourcemap: false,
    // Keep the initial download small for CrazyGames' 50MB limit:
    // split heavy libs into their own cacheable chunks (Vite 8 / Rolldown syntax).
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "rapier", test: /node_modules[\\/]@dimforge[\\/]/ },
            { name: "colyseus", test: /node_modules[\\/]@colyseus[\\/]/ },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
