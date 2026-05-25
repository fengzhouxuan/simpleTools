import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "./",
  plugins: [preact()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
