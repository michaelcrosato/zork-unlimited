import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI imports the engine from ../src (outside ui/), so allow serving it in dev.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: {
    outDir: "dist",
    // The released UI is one offline HTML file. Keep the generated Night Watch
    // texture inside the stylesheet so the existing inliner has no asset tail.
    assetsInlineLimit: 4_000_000,
  },
});
