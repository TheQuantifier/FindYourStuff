import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "db", "migrations");

let appliedPromise = null;

function splitSqlStatements(sqlText) {
  return sqlText
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable() {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions() {
  const rows = await sql.query(`
    SELECT version
    FROM schema_migrations
    ORDER BY version ASC
  `);

  return new Set(rows.map((row) => row.version));
}

async function applyMigrationFile(filename) {
  const version = filename.replace(/\.sql$/i, "");
  const filePath = path.join(migrationsDir, filename);
  const rawSql = await fs.readFile(filePath, "utf8");
  const statements = splitSqlStatements(rawSql);

  for (const statement of statements) {
    await sql.query(statement);
  }

  await sql.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
}

export async function applyMigrations() {
  await ensureMigrationsTable();

  const files = (await fs.readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  const appliedVersions = await getAppliedVersions();

  for (const filename of files) {
    const version = filename.replace(/\.sql$/i, "");
    if (appliedVersions.has(version)) {
      continue;
    }

    await applyMigrationFile(filename);
  }
}

export async function applyMigrationsOnce() {
  if (!appliedPromise) {
    appliedPromise = applyMigrations().catch((error) => {
      appliedPromise = null;
      throw error;
    });
  }

  return appliedPromise;
}
