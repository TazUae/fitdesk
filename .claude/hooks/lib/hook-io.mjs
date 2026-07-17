// Shared stdin/exit helpers for FitDesk PreToolUse guard hooks.
// Node built-ins only — no dependencies.

import fs from "node:fs";

export function readStdinJson() {
  const chunks = [];
  const fd = 0;
  const buf = Buffer.alloc(65536);
  while (true) {
    let bytesRead;
    try {
      bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
    } catch (err) {
      if (err.code === "EAGAIN") continue;
      if (err.code === "EOF") break;
      throw err;
    }
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function allow() {
  process.exit(0);
}

export function warn(message) {
  process.stderr.write(`[fitdesk-hook warn] ${message}\n`);
  process.exit(0);
}

export function block(message) {
  process.stderr.write(`[fitdesk-hook BLOCK] ${message}\n`);
  process.exit(2);
}
