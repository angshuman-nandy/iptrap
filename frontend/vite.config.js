import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the FastAPI backend so `npm run dev`
// works against a locally running `uvicorn app:app --port 7860`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7860",
    },
  },
  build: {
    outDir: "dist",
  },
});
