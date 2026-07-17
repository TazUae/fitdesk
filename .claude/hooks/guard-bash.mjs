#!/usr/bin/env node
// PreToolUse guard for Bash commands.
// Blocks clearly destructive / production-mutating commands and raw ERP
// credential prints. Deterministic string/regex matching only — no LLM
// judgment. Read-only audit commands are not on any denylist and pass
// through untouched.
//
// Exit 0 = allow, exit 2 = block (per Claude Code PreToolUse hook contract).

import { readStdinJson, allow, block } from "./lib/hook-io.mjs";

const input = readStdinJson();
if (input.tool_name !== "Bash") allow();

const command = String(input.tool_input?.command ?? "");
if (!command) allow();

// Destructive / forbidden-without-approval patterns (CLAUDE.md §5, §7).
const DESTRUCTIVE_PATTERNS = [
  { re: /docker\s+system\s+prune/i, reason: "docker system prune" },
  { re: /docker\s+volume\s+rm/i, reason: "docker volume rm" },
  { re: /docker\s+image\s+prune/i, reason: "docker image prune" },
  { re: /docker(-|\s)compose\s+.*down\s+.*-v\b/i, reason: "docker compose down -v" },
  { re: /docker\s+compose\s+down\b/i, reason: "docker compose down" },
  { re: /docker\s+restart\b/i, reason: "docker restart" },
  { re: /docker\s+rm\b/i, reason: "docker rm" },
  { re: /rm\s+-rf\b/i, reason: "rm -rf" },
  { re: /git\s+reset\s+--hard\b/i, reason: "git reset --hard" },
  { re: /git\s+clean\s+-fd\b/i, reason: "git clean -fd" },
  { re: /git\s+push\s+.*--force(-with-lease)?\b/i, reason: "git push --force / --force-with-lease" },
  { re: /\bbench\s+(drop-site|--force)\b/i, reason: "destructive bench command" },
  { re: /\bdrop\s+(table|database)\b/i, reason: "destructive database command" },
];

for (const { re, reason } of DESTRUCTIVE_PATTERNS) {
  if (re.test(command)) {
    block(`Destructive command blocked (${reason}). Requires explicit user approval per CLAUDE.md §5/§7. Command: ${command}`);
  }
}

// Raw ERP credential print guard — block printing a real .env (never .env.example).
const printsRealEnv =
  /\b(cat|type|more|less)\b[^\n]*\.env(?!\.example)\b/i.test(command) ||
  /\b(Get-Content|gc)\b[^\n]*\.env(?!\.example)\b/i.test(command) ||
  /\becho\b[^\n]*\$(ERP_API_KEY|ERP_API_SECRET)\b/i.test(command) ||
  /\$env:(ERP_API_KEY|ERP_API_SECRET)\b/i.test(command);

if (printsRealEnv) {
  block(`Command appears to print raw ERP credentials or a real .env file. Blocked per CLAUDE.md §8 (never print secrets). Command: ${command}`);
}

allow();
