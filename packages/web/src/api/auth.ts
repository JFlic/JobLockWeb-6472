import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { autumn } from "autumn-js/better-auth";
import { Autumn } from "autumn-js";
import { db } from "./database";

const autumnSdk = new Autumn();

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    return origin ? [origin] : ["*"];
  },
  plugins: [
    ...runableManagedAuth({
      applicationId: process.env.APPLICATION_ID!,
      issuer: process.env.VITE_RUNABLE_AUTH_ISSUER!,
    }),
    autumn(),
  ],
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          try {
            await autumnSdk.customers.getOrCreate({
              customerId: user.id,
              name: user.name,
              email: user.email,
            });
          } catch (e) {
            console.error("[autumn] Failed to create customer on sign-up:", e);
          }
        },
      },
    },
  },
});
