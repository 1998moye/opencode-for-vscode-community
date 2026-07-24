import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "webview",
  plugins: [react()],
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    codeSplitting: false,
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/app[extname]",
        inlineDynamicImports: true
      }
    }
  }
});
