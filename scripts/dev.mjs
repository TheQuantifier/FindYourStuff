import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const api = spawn("node", ["api/src/server.js"], {
  stdio: "inherit",
  cwd: projectRoot,
});

const web = spawn("node", ["scripts/static-server.mjs"], {
  stdio: "inherit",
  cwd: projectRoot,
});

function shutdown(code = 0) {
  api.kill("SIGINT");
  web.kill("SIGINT");
  process.exit(code);
}

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
