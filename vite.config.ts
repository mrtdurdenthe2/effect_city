import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/web", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url))
    }
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true
      }
    }
  }
})
