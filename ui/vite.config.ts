import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI imports the engine from ../src (outside ui/), so allow serving it in dev.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist" },
});
