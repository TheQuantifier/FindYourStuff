import crypto from "node:crypto";

import { env } from "./env.js";
import { applyMigrationsOnce } from "./migrations.js";
import { sql } from "./db.js";
import { ensureUsersTable, getAppUser, touchUserSeen, toSessionUser } from "./users.js";

export const SESSION_COOKIE_NAME = "fys_session";

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function getSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.sessionDays);
  return expiresAt;
}

export async function ensureSessionsTable() {
  await ensureUsersTable();
  await applyMigrationsOnce();
}

export function parseCookies(cookieHeader = "") {
  return String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) {
        return acc;
      }

      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function createSessionCookie(token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (env.nodeEnv === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export async function createSession({ userId, userAgent = "", ipAddress = "" }) {
  await ensureSessionsTable();

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = getSessionExpiry();
  const [row] = await sql`
    INSERT INTO app_sessions (
      session_id,
      user_id,
      token_hash,
      user_agent,
      ip_address,
      expires_at
    )
    VALUES (
      ${crypto.randomUUID()},
      ${userId},
      ${hashSessionToken(token)},
      ${userAgent || null},
      ${ipAddress || null},
      ${expiresAt.toISOString()}
    )
    RETURNING
      session_id AS "sessionId",
      user_id AS "userId",
      expires_at::TEXT AS "expiresAt"
  `;

  return {
    ...row,
    token,
  };
}

export async function getSessionFromHeaders(headers = {}) {
  await ensureSessionsTable();

  const cookies = parseCookies(headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [row] = await sql`
    SELECT
      session_id AS "sessionId",
      user_id AS "userId",
      expires_at::TEXT AS "expiresAt",
      revoked_at::TEXT AS "revokedAt"
    FROM app_sessions
    WHERE token_hash = ${hashSessionToken(token)}
    LIMIT 1
  `;

  if (!row || row.revokedAt || new Date(row.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  await sql`
    UPDATE app_sessions
    SET updated_at = NOW(), last_seen_at = NOW()
    WHERE session_id = ${row.sessionId}
  `;

  await touchUserSeen(row.userId);
  const user = await getAppUser(row.userId);
  if (!user) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    user: toSessionUser(user),
  };
}

export async function revokeSessionFromHeaders(headers = {}) {
  await ensureSessionsTable();
  const cookies = parseCookies(headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return;
  }

  await sql`
    UPDATE app_sessions
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE token_hash = ${hashSessionToken(token)}
      AND revoked_at IS NULL
  `;
}
