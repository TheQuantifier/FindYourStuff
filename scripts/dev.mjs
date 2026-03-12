import { spawn } from "node:child_process";

const api = spawn("node", ["api/src/server.js"], {
  stdio: "inherit",
  cwd: process.cwd(),
});

const web = spawn("python3", ["-m", "http.server", "5500", "-d", "web"], {
  stdio: "inherit",
  cwd: process.cwd(),
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
