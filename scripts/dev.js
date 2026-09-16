#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://127.0.0.1:5173";

function waitHttp(url, tries = 80) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 200);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 200);
      });
    };
    tick(tries);
  });
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: false,
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${cmd} exited ${code}`);
    }
  });
  return child;
}

function npmInstallIfNeeded(dir) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    const result = spawn("npm", ["install"], {
      cwd: dir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    return new Promise((resolve, reject) => {
      result.on("exit", (code) => {
        if (code) reject(new Error("npm install failed"));
        else resolve();
      });
    });
  }
  return Promise.resolve();
}

async function main() {
  process.chdir(ROOT);
  await npmInstallIfNeeded(ROOT);
  await npmInstallIfNeeded(path.join(ROOT, "frontend"));

  console.log("==> vite");
  run("npm", ["run", "dev"], { cwd: path.join(ROOT, "frontend") });
  await waitHttp(DEV_SERVER_URL);

  console.log("==> desktop");
  const electron = run("npx", ["electron", ".", "--disable-crash-reporter"], {
    env: {
      DEV_SERVER_URL,
      BIT_TABLES_DEV: "1",
      BIT_TABLES_ROOT: path.join(ROOT, "fixtures"),
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
  });

  console.log("");
  console.log("dev:");
  console.log(`  desktop  ${DEV_SERVER_URL}`);
  console.log("  root     fixtures/");
  console.log("");

  electron.on("exit", () => process.exit(0));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
