import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for the web client.
 */
export default defineConfig({
  plugins: [react()]
});
