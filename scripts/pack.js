#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const target = process.argv[2];
if (target !== "linux" && target !== "mac") {
  console.error("usage: node scripts/pack.js linux|mac");
  process.exit(2);
}

process.chdir(ROOT);
if (!process.env.CI) {
  process.env.GOPROXY = process.env.GOPROXY || "https://goproxy.cn,https://goproxy.io,direct";
  process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/";
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || "https://npmmirror.com/mirrors/electron-builder-binaries/";
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (res.status) process.exit(res.status);
}

if (!fs.existsSync(path.join(ROOT, "node_modules"))) run("npm", ["install"]);
if (!fs.existsSync(path.join(ROOT, "frontend", "node_modules"))) run("npm", ["install"], { cwd: path.join(ROOT, "frontend") });
run("npm", ["run", "build"], { cwd: path.join(ROOT, "frontend") });

const runtime = path.join(ROOT, "dist", "runtime");
fs.mkdirSync(runtime, { recursive: true });
const goos = target === "mac" ? "darwin" : "linux";
const outBin = path.join(runtime, "bit-tables");
if (target === "mac") {
  const amd = path.join(runtime, "bit-tables-amd64");
  const arm = path.join(runtime, "bit-tables-arm64");
  run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", amd, "./cmd/bit-tables"], {
    env: { ...process.env, CGO_ENABLED: "0", GOOS: "darwin", GOARCH: "amd64" },
  });
  run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", arm, "./cmd/bit-tables"], {
    env: { ...process.env, CGO_ENABLED: "0", GOOS: "darwin", GOARCH: "arm64" },
  });
  if (process.platform === "darwin") {
    run("lipo", ["-create", "-output", outBin, amd, arm]);
    fs.rmSync(amd, { force: true });
    fs.rmSync(arm, { force: true });
  } else {
    fs.renameSync(process.arch === "arm64" ? arm : amd, outBin);
    fs.rmSync(amd, { force: true });
    fs.rmSync(arm, { force: true });
  }
} else {
  run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", outBin, "./cmd/bit-tables"], {
    env: { ...process.env, CGO_ENABLED: "0", GOOS: goos, GOARCH: "amd64" },
  });
}

if (target === "mac") {
  if (process.platform !== "darwin") {
    console.warn("macOS zip 建议在 Mac 上打包；当前将尝试 electron-builder，可能失败。");
  }
  run("npx", ["electron-builder", "--mac", "zip", "--x64", "--arm64"]);
} else {
  run("npx", ["electron-builder", "--linux", "zip", "--x64"]);
}

console.log("package under dist/desktop/");
