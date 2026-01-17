import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Required for pdfjs-dist which uses top-level await
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-viewer': ['pdfjs-dist'],
        },
      },
    },
  },
  // Ensure PDF.js worker is properly bundled for offline support
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
}));
