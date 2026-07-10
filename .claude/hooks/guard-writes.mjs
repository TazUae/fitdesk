#!/usr/bin/env node
// PreToolUse guard for Edit / Write / MultiEdit.
// Blocks raw ERP credentials being introduced into FitDesk source files.
// Warns (does not block) on a heuristic direct-ERP-bypass pattern outside
// the approved lib/erpnext/ and lib/controlplane/ client paths.
// Deterministic string/regex matching only — no LLM judgment.
//
// Exit 0 = allow (or warn+allow), exit 2 = block.

import { readStdinJson, allow, block, warn } from "./lib/hook-io.mjs";

const input = readStdinJson();
const toolName = input.tool_name;
if (!["Edit", "Write", "MultiEdit"].includes(toolName)) allow();

const filePath = String(input.tool_input?.file_path ?? "");

// Collect the text being introduced, across Edit / Write / MultiEdit shapes.
function collectContent(toolInput) {
  if (!toolInput) return "";
  const parts = [];
  if (typeof toolInput.content === "string") parts.push(toolInput.content);
  if (typeof toolInput.new_string === "string") parts.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (typeof e?.new_string === "string") parts.push(e.new_string);
    }
  }
  return parts.join("\n");
}

const content = collectContent(input.tool_input);

const normalizedPath = filePath.replace(/\\/g, "/");
const isExampleOrDoc =
  /\.env\.example$/i.test(normalizedPath) ||
  /\.md$/i.test(normalizedPath);
const isHookImplementation =
  normalizedPath.startsWith(".claude/hooks/") ||
  normalizedPath.includes("/.claude/hooks/");
const isSourceFile = /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(normalizedPath);

// Raw ERP credential introduction — block (source files only, never docs/example/hooks themselves).
if (isSourceFile && !isExampleOrDoc && !isHookImplementation) {
  const rawCredPattern =
    /\b(ERP_API_KEY|ERP_API_SECRET)\s*[:=]\s*["'`][^"'`\n]{4,}["'`]/;
  const envAccessPattern = /process\.env\.(ERP_API_KEY|ERP_API_SECRET)\b/;
  if (rawCredPattern.test(content) || envAccessPattern.test(content)) {
    block(
      `Blocked: raw ERP credential literal or direct process.env.(ERP_API_KEY|ERP_API_SECRET) access introduced into source file ${filePath}. FitDesk must never hold raw ERP credentials (CLAUDE.md ERPNext Integration Rules).`
    );
  }
}

// Direct ERP-bypass heuristic — warn only, outside the approved client paths.
const isApprovedErpPath =
  normalizedPath.includes("/lib/erpnext/") ||
  normalizedPath.includes("/lib/controlplane/");

if (isSourceFile && !isApprovedErpPath) {
  const bypassPattern = /\/api\/(resource|method)\//;
  if (bypassPattern.test(content)) {
    warn(
      `Possible direct ERP/Frappe call ("/api/resource/" or "/api/method/") outside the approved lib/erpnext/ or lib/controlplane/ client path in ${filePath}. Verify this goes through the approved adapter — heuristic match, may be a false positive.`
    );
  }
}

allow();
