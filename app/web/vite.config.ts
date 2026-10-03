import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// In sviluppo il backend FastAPI gira su :8000 (./spada avvia) e Vite su
// :5173: le rotte dell'API e il frontend precedente (/legacy) passano dal
// proxy, così il browser vede una sola origine e non serve CORS.
const BACKEND = process.env.SPADA_API_URL || "http://127.0.0.1:8000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/gare": BACKEND,
      "/sistema": BACKEND,
      "/salute": BACKEND,
      "/docs": BACKEND,
      "/openapi.json": BACKEND,
      // Il frontend precedente, finché convive col nuovo.
      "/legacy": { target: BACKEND, rewrite: (p) => p.replace(/^\/legacy/, "") },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
})
