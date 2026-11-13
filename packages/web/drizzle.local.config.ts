import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/api/database/schema.ts",
  dbCredentials: { url: "file:local.db" },
});
