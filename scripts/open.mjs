import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const processes = [];
const targetUrl = "http://127.0.0.1:5500/web/index.html";

function startProcess(command, args) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  processes.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  process.exit(code);
}

async function waitFor(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the local server is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function getOpenCommand(url) {
  switch (process.platform) {
    case "darwin":
      return ["open", [url]];
    case "win32":
      return ["cmd", ["/c", "start", "", url]];
    default:
      return ["xdg-open", [url]];
  }
}

async function main() {
  const api = startProcess("node", ["api/src/server.js"]);
  const web = startProcess("node", ["scripts/static-server.mjs"]);

  api.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });

  web.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await waitFor(targetUrl);
  const [command, args] = getOpenCommand(targetUrl);
  const opener = spawn(command, args, {
    cwd: projectRoot,
    stdio: "ignore",
    detached: true,
  });
  opener.unref();
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
