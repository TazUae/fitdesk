# Claude Code Usage-Limit and Codex Fallback Policy

**Binding owner decision:** only existing Claude Pro and ChatGPT subscription authentication; $0 incremental API usage. **No metered credits, purchased extra usage, paid API fallback, or provider keys.**

## Budget tuple (same for both providers)
| Constraint | Task | Trial | 3-trial batch |
| --- | ---: | ---: | ---: |
| Combined ACP prompt turns | 8 | 12 | 36 |
| Wall-clock maximum | 10 min | 25 min | 75 min |
| Per-prompt timeout | 120 s | 120 s | 120 s |
| Repair retry | 1/task | inside shared totals | inside shared totals |
| Claude → Codex handoff | at most 1 confirmed limit/task | inside totals | inside totals |
| Active model executor | 1 global | 1 global | 1 global |

Counter and deadline enforcement must be **external**, durable and atomic across subprocesses. An LLM remembering how many turns it used is not an enforcement control. Actual runtime enforcement is NOT QUALIFIED.

## Provider failure classification
- `CLAUDE_CONFIRMED_SUBSCRIPTION_LIMIT`: documented positive signal from the authenticated Claude CLI/session; persist sanitized reason and any provider-provided reset time. Only this condition permits **one** Codex handoff.
- `AUTH_ERROR`, `GENERIC_429`, `TIMEOUT`, `NETWORK_ERROR`, `UNKNOWN_RESPONSE`, `AMBIGUOUS_EFFECT`: do not infer subscription exhaustion or switch provider automatically. Reconcile effects; BLOCKED unless a separately approved safe retry is available.
- `BUDGET_EXHAUSTED`, `TRIAL_OR_BATCH_EXPIRED`: STOP; do not switch, extend deadline, purchase credits or create parallel agents.
- `CODEX_UNAVAILABLE`: preserve checkpoint, STOP; no API credentials or money fallback.

## Handoff exact sequence
1. Detect and verify a real Claude subscription usage limit **without reading/exposing auth tokens**.
2. Persist checkpoint + task/lease/retry/turn counters; ensure Claude worker is terminated/reaped and writer lock relinquished.
3. Reconcile Git diff, HEAD, worktree, active writers, CI/PR and any staging/merge effects. Don't duplicate.
4. Independently verify Codex is logged in via subscription, has isolated credentials and no host access beyond worker policy. Never copy Claude secrets into Codex runtime.
5. Acquire same task's writer lease with fresh fencing epoch. Reserve remaining turns/time atomically; run one bounded continuation from the checkpoint.
6. Run affected static, function and protected gates and an independent different-model review; record agent transition and evidence.
7. If any precondition missing, mark `BLOCKED_USAGE_LIMIT` and preserve state. Resume only on verified authorization and available budget. A provider reset does not reset a factory task's fixed limits.

## Tests that must pass
Simulated confirmed Claude limit triggers at most one handoff; generic 429 cannot switch; no two writers; quotas don't reset; no paid API keys; ambiguous deploy not repeated; post-handoff protected CI is non-bypassable. No actual authenticated handoff passed yet.
