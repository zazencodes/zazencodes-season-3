import path from "node:path";
import { skybridge } from "@skybridge/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [skybridge({ evals: {} }), react(), tailwindcss()],
  server: {
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ["error"],
    },
  },
  // Pre-bundle the view's dependencies at startup. Without this, Vite
  // discovers each deep `@alpic-ai/ui/components/*` import as the view loads,
  // re-optimizes, and reloads the iframe — which is most of the dev-mode wait.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "lucide-react",
      "@alpic-ai/ui/components/button",
      "@alpic-ai/ui/components/input",
      "@alpic-ai/ui/components/label",
      "@alpic-ai/ui/components/select",
      "@alpic-ai/ui/components/skeleton",
      "@alpic-ai/ui/components/table",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
