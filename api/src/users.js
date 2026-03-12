import crypto from "node:crypto";

import { getAdminEmails } from "./env.js";
import { applyMigrationsOnce } from "./migrations.js";
import { sql } from "./db.js";

export const USER_ROLES = ["user", "admin", "support", "analyst"];

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isValidUserRole(value) {
  return USER_ROLES.includes(value);
}

export function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  if (actualHash.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualHash, expected);
}

export async function ensureUsersTable() {
  await applyMigrationsOnce();
}

async function countAdmins() {
  const [row] = await sql`
    SELECT COUNT(*)::INT AS count
    FROM app_users
    WHERE role = 'admin'
  `;

  return row?.count ?? 0;
}

async function shouldBootstrapAdmin(email) {
  const adminEmails = new Set(getAdminEmails());
  if (email && adminEmails.has(email)) {
    return true;
  }

  return (await countAdmins()) === 0;
}

function toPublicUser(row) {
  if (!row) {
    return null;
  }

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function createAppUser({ email, name, passwordHash }) {
  await ensureUsersTable();

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const bootstrapRole = (await shouldBootstrapAdmin(normalizedEmail)) ? "admin" : "user";
  const [row] = await sql`
    INSERT INTO app_users (user_id, email, name, password_hash, role)
    VALUES (
      ${crypto.randomUUID()},
      ${normalizedEmail},
      ${normalizeName(name)},
      ${passwordHash},
      ${bootstrapRole}
    )
    RETURNING
      user_id AS "userId",
      email,
      name,
      password_hash AS "passwordHash",
      role,
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt",
      last_seen_at::TEXT AS "lastSeenAt"
  `;

  return row;
}

export async function findUserAuthByEmail(email) {
  await ensureUsersTable();
  const [row] = await sql`
    SELECT
      user_id AS "userId",
      email,
      name,
      password_hash AS "passwordHash",
      role,
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt",
      last_seen_at::TEXT AS "lastSeenAt"
    FROM app_users
    WHERE email = ${normalizeEmail(email)}
    LIMIT 1
  `;

  return row ?? null;
}

export async function getAppUser(userId) {
  await ensureUsersTable();
  const [row] = await sql`
    SELECT
      user_id AS "userId",
      email,
      name,
      role,
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt",
      last_seen_at::TEXT AS "lastSeenAt"
    FROM app_users
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return row ?? null;
}

export async function touchUserSeen(userId) {
  await ensureUsersTable();
  await sql`
    UPDATE app_users
    SET updated_at = NOW(), last_seen_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function listAppUsers() {
  await ensureUsersTable();
  return sql`
    SELECT
      user_id AS "userId",
      email,
      name,
      role,
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt",
      last_seen_at::TEXT AS "lastSeenAt"
    FROM app_users
    ORDER BY
      CASE role WHEN 'admin' THEN 0 ELSE 1 END,
      COALESCE(name, email, user_id) ASC
  `;
}

export async function setAppUserRole({ targetUserId, role }) {
  await ensureUsersTable();

  if (!isValidUserRole(role)) {
    throw new Error("Invalid role.");
  }

  const target = await getAppUser(targetUserId);
  if (!target) {
    throw new Error("User not found.");
  }

  if (target.role === "admin" && role !== "admin") {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      throw new Error("At least one admin must remain.");
    }
  }

  const [updated] = await sql`
    UPDATE app_users
    SET role = ${role}, updated_at = NOW()
    WHERE user_id = ${targetUserId}
    RETURNING
      user_id AS "userId",
      email,
      name,
      role,
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt",
      last_seen_at::TEXT AS "lastSeenAt"
  `;

  return toPublicUser(updated);
}

export function toSessionUser(row) {
  return toPublicUser(row);
}
