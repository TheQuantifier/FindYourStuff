import http from "node:http";
import dns from "node:dns";

import { classifyMemoryMessage } from "./ai.js";
import { appConfig, env, getAllowedOrigins } from "./env.js";
import { ensureItemsTable, listRecentItems, searchItemMemories, upsertItemMemory } from "./items.js";
import { applyMigrationsOnce } from "./migrations.js";
import {
  clearSessionCookie,
  createSession,
  createSessionCookie,
  getSessionFromHeaders,
  revokeSessionFromHeaders,
} from "./sessions.js";
import {
  createAppUser,
  createPasswordHash,
  ensureUsersTable,
  findUserAuthByEmail,
  listAppUsers,
  setAppUserRole,
  verifyPassword,
} from "./users.js";

dns.setDefaultResultOrder("ipv4first");

const allowedOrigins = new Set(getAllowedOrigins());

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function getRequestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "";
}

async function requireUser(request, response) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session?.user) {
    sendJson(
      response,
      401,
      { error: "Unauthorized" },
      { "Set-Cookie": clearSessionCookie() },
    );
    return null;
  }

  return {
    id: session.user.userId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

async function requireAdmin(request, response) {
  const user = await requireUser(request, response);
  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    sendJson(response, 403, { error: "Admin access required." });
    return null;
  }

  return user;
}

async function handleRegister(request, response) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password || !name) {
    sendJson(response, 400, { error: "Name, email, and password are required." });
    return;
  }

  if (password.length < 8) {
    sendJson(response, 400, { error: "Password must be at least 8 characters." });
    return;
  }

  const existingUser = await findUserAuthByEmail(email);
  if (existingUser) {
    sendJson(response, 409, { error: "User already exists. Use another email." });
    return;
  }

  const user = await createAppUser({
    email,
    name,
    passwordHash: createPasswordHash(password),
  });

  const session = await createSession({
    userId: user.userId,
    userAgent: String(request.headers["user-agent"] || ""),
    ipAddress: getRequestIp(request),
  });

  sendJson(
    response,
    200,
    {
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
    { "Set-Cookie": createSessionCookie(session.token, new Date(session.expiresAt)) },
  );
}

async function handleLogin(request, response) {
  const body = await readJson(request);
  const email = String(body.email || body.identifier || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    sendJson(response, 400, { error: "Email and password are required." });
    return;
  }

  const user = await findUserAuthByEmail(email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    sendJson(response, 401, { error: "Invalid email or password." });
    return;
  }

  const session = await createSession({
    userId: user.userId,
    userAgent: String(request.headers["user-agent"] || ""),
    ipAddress: getRequestIp(request),
  });

  sendJson(
    response,
    200,
    {
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
    { "Set-Cookie": createSessionCookie(session.token, new Date(session.expiresAt)) },
  );
}

async function handleSession(request, response) {
  const session = await getSessionFromHeaders(request.headers);
  if (!session?.user) {
    sendJson(response, 200, { user: null }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  sendJson(response, 200, {
    user: {
      id: session.user.userId,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
    },
  });
}

async function handleLogout(request, response) {
  await revokeSessionFromHeaders(request.headers);
  sendJson(response, 200, { success: true }, { "Set-Cookie": clearSessionCookie() });
}

async function handleItems(request, response) {
  if (!appConfig.hasDatabase) {
    sendJson(response, 500, {
      error: "Update api/.env with Postgres and Gemini settings.",
    });
    return;
  }

  const user = await requireUser(request, response);
  if (!user) {
    return;
  }

  await ensureItemsTable();
  const items = await listRecentItems(user.id);
  sendJson(response, 200, { items });
}

async function handleAdminUsers(request, response) {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }

  const users = await listAppUsers();
  sendJson(response, 200, {
    users,
    currentUserId: user.id,
  });
}

async function handleAdminRoleUpdate(request, response) {
  const user = await requireAdmin(request, response);
  if (!user) {
    return;
  }

  const body = await readJson(request);
  const targetUserId = String(body.userId || "").trim();
  const role = String(body.role || "").trim();

  if (!targetUserId || !role) {
    sendJson(response, 400, { error: "userId and role are required." });
    return;
  }

  const updatedUser = await setAppUserRole({
    targetUserId,
    role,
  });

  sendJson(response, 200, { user: updatedUser });
}

async function handleChat(request, response) {
  if (!appConfig.hasDatabase) {
    sendJson(response, 500, {
      error: "Update api/.env with Postgres and Gemini settings.",
    });
    return;
  }

  const user = await requireUser(request, response);
  if (!user) {
    return;
  }

  const body = await readJson(request);
  const message = body.message?.trim();
  if (!message) {
    sendJson(response, 400, { error: "Message is required." });
    return;
  }

  await ensureItemsTable();
  const action = await classifyMemoryMessage(message);

  if (action.intent === "store" && action.itemName.trim() && action.locationDescription.trim()) {
    const memory = await upsertItemMemory({
      userId: user.id,
      itemName: action.itemName,
      locationDescription: action.locationDescription,
      category: action.category,
      sourceMessage: message,
    });
    const items = await listRecentItems(user.id);

    sendJson(response, 200, {
      reply: `Saved. I’ll remember that your ${memory.itemName} is in ${memory.locationDescription}.`,
      items,
    });
    return;
  }

  if (action.intent === "find" && action.itemName.trim()) {
    const matches = await searchItemMemories({
      userId: user.id,
      itemName: action.itemName,
      searchTerms: action.searchTerms,
    });
    const items = await listRecentItems(user.id);

    if (matches.length === 0) {
      sendJson(response, 200, {
        reply: `I couldn't find a saved location for ${action.itemName}. Try phrasing it differently or store it first.`,
        items,
      });
      return;
    }

    if (matches.length === 1) {
      const match = matches[0];
      sendJson(response, 200, {
        reply: `Your ${match.itemName} is in ${match.locationDescription}.`,
        items,
      });
      return;
    }

    const summary = matches
      .slice(0, 3)
      .map((match) => `${match.itemName}: ${match.locationDescription}`)
      .join(" ");

    sendJson(response, 200, {
      reply: `I found a few close matches. ${summary}`,
      items,
    });
    return;
  }

  sendJson(response, 200, {
    reply:
      action.response ||
      "I can store item locations and answer location questions. Try 'The charger is in the hall closet bin' or 'Where is the charger?'",
    items: await listRecentItems(user.id),
  });
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      await handleRegister(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      await handleSession(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/items") {
      await handleItems(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/users") {
      await handleAdminUsers(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/users/role") {
      await handleAdminRoleUpdate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(request, response);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

applyMigrationsOnce()
  .then(() => {
    server.listen(env.port, () => {
      console.log(`FindYourStuff API listening on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to apply migrations on startup:", error);
    process.exit(1);
  });
