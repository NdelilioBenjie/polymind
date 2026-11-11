import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// One build produces everything Chrome needs: the side panel page, the
// service worker and the content script. Load `dist/` as an unpacked extension.
export default defineConfig({
  plugins: [react()],
  base: "",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, "sidepanel.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
        content: resolve(import.meta.dirname, "src/content.ts"),
      },
      output: {
        // Chrome loads these two by fixed name from manifest.json.
        entryFileNames: (chunk) =>
          chunk.name === "background" || chunk.name === "content" ? "[name].js" : "assets/[name]-[hash].js",
      },
    },
  },
});
