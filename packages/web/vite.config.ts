import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";
import ports from "../../__ports.cjs";
import { ensureSignedIn } from "./src/api/publik";

const root = path.resolve(__dirname, "../..");

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, root, "");
  Object.assign(process.env, env);

  // A clone's first screen is this dev server, so Sign in with publik runs
  // before it listens. Builds (including Vercel's) never prompt.
  if (command === "serve" && !process.env.VERCEL) await ensureSignedIn();

  return {
    // All env files live at the repo root — keep Vite's own env loading there too,
    // so packages/web/.env* files can never shadow the root .env.
    envDir: root,
    plugins: [
      honoDevPlugin(),
      react(),
      tailwind(),
      assetOptimizerPlugin(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/web"),
      },
    },
    server: {
      port: ports.website,
      strictPort: true,
      allowedHosts: true,
      hmr: { overlay: false },
      cors: false,
    },
  };
});
