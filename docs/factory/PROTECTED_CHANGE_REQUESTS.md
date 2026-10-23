# Precise Protected Approvals Remaining

The owner **already** approved G1 business rules, Q1–Q14 and the subscription-only caps. Do not ask those again.

Only send a narrow approval request when its reviewed artifact actually exists:

| Reserved action | Required proposal before requesting approval | Do not do |
| --- | --- | --- |
| Final protected G1 acceptance suite | Versioned test cases + exact immutable SHA + independent reviewer + synthetic adapter contract + expected CI check | Do not self-lock or self-approve the review-only 24-case candidate |
| Protected workflow/branch-rule change | Exact additive patch vs current main, required check names, security scan implications, review and rollback | Do not delete or rename required checks, disable secret scans, waive critical advisories |
| New permissions/secrets/network or existing ERP schema | Host identity, minimum rights, specific resource, isolation/rollback proof and reviewer | No public IP fallback, key disclosure, broad Docker/sudo or real financial data |
| First FitDesk staging deployment | Dedicated synthetic target, tested SHA/CI/digest, preflight smoke and rollback design | No reuse of demo Hello World approval as FitDesk authorization |
| Production/commercial launch | Full five-gate and three-run qualified evidence, separate human release decision | Never infer approval from owner absence or "overnight" |

**Execution policy:** Prepare review-only proposals and tests within previously approved bounds. If a reserved gate is required, mark BLOCKED, retain other independent progress, and escalate **only that** concrete approval with exact artifact SHA and risks.
