import { applyMigrations } from "./migrations.js";

try {
  await applyMigrations();
  console.log("Migrations applied successfully.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
