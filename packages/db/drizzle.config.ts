import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dbCredentials: {
    // The owner connection — drizzle-kit's introspection and `studio` need to
    // see everything, and generation never talks to a live database anyway.
    // apps/api and apps/worker never read this variable (§2.1.4).
    url: process.env.DATABASE_MIGRATION_URL!,
  },
});
