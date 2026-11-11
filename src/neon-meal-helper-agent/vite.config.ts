import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev:web` serves the client and forwards /api to `npm run dev:api`.
// `npm run build:web` writes the static client to dist/, which Vercel serves (see vercel.json).
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  server: { proxy: { "/api/": "http://localhost:8787" } },
  build: { outDir: "../../dist", emptyOutDir: true },
});
