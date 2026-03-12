import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER = "replace-me";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(apiRoot, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function getEnv(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function isConfigured(value) {
  return Boolean(value) && !value.includes(PLACEHOLDER);
}

export const env = {
  nodeEnv: getEnv("NODE_ENV", "development"),
  port: Number.parseInt(getEnv("PORT", "4000"), 10),
  sessionDays: Number.parseInt(getEnv("SESSION_DAYS", "7"), 10),
  corsOrigin: getEnv(
    "CORS_ORIGIN",
    "http://localhost:5500,http://127.0.0.1:5500",
  ),
  adminEmails: getEnv("ADMIN_EMAILS", ""),
  databaseUrl: getEnv(
    "DATABASE_URL",
    `postgresql://${PLACEHOLDER}:${PLACEHOLDER}@${PLACEHOLDER}/${PLACEHOLDER}`,
  ),
  geminiApiKey: getEnv("GEMINI_API_KEY", PLACEHOLDER),
  geminiModel: getEnv("GEMINI_MODEL", "gemini-2.5-flash"),
};

export const appConfig = {
  hasDatabase: isConfigured(env.databaseUrl),
  hasGemini: isConfigured(env.geminiApiKey),
};

export function getAllowedOrigins() {
  return env.corsOrigin
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAdminEmails() {
  return env.adminEmails
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
