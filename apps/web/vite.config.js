import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.VITE_DEV_HOST || "127.0.0.1";
  const port = parsePositiveInteger(env.VITE_DEV_PORT, 5173);

  return {
    plugins: [react()],
    server: {
      host,
      port,
    },
    preview: {
      host,
      port,
    },
  };
});
