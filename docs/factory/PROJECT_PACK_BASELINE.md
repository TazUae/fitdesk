# Zaidan AI Software Factory v0.6.2 — Versioned Requirements Baseline

**Source:** user-provided `Zaidan_AI_Software_Factory_ChatGPT_Project_v0.6.2.zip` (Project Pack, `PROJECT_INSTRUCTIONS.md` and `IMPLEMENTATION_ROADMAP.md`). This is a **source-derived requirements summary**, not a new approval, an implementation, or a replacement for existing FitDesk `CLAUDE.md`. Dated owner approvals on GitHub issue #53 supersede this pack's older unresolved decisions.

## Mission and exclusions
Prove **one** FitDesk pay-per-session invoicing slice with a lean, cloud-capable autonomous delivery loop. The only second project is a deliberately minimal **synthetic isolation/concurrency** target. No complete FitDesk/ClinicOS rebuild, digital banking, live payments, real patient/financial data, production access, commercial launch or new multi-agent platform.

## Lean architecture and boundaries
- Authority: GitHub Issues, pull requests, protected branches, GitHub Actions.
- Control: reuse Forge, `safe-autonomy` hooks and `protected-paths.json` only after actual enforcement is inspected and tested; do not duplicate Hermes/Forge or invent a second task-owner service.
- Execution: one coding agent per task, single active writer, unique branch and disposable restricted worktree/container. Self-hosted OpenHands optional, only if measured simplification.
- Review: independent different-model review plus deterministic protected checks, no agent self-approval.
- Verification: unit, API/DB integration, tenant ownership, tampered totals, lifecycle/failure, Playwright actual-app E2E, lint/typecheck/build, architecture, Gitleaks, Trivy, applicable Semgrep, SBOM/dependency checks.
- Evidence: PR, CI job/run, test reports, commit SHA, image digest, deployment ID, screenshot/trace, rollback, cost and retries; sanitize secrets.
- Learning: small version-controlled FLL proposals separately tested against baseline/held-out; no active configuration change between the three qualification trials.
- Do **not** add Temporal, Kubernetes, Redis, OPA, dashboards, Slack/Linear, vector store or multi-agent swarm without measured necessity. Factory remains headless.

## Mandatory delivery loop and gates
Human-approved issue/spec and independent locked tests (G1) → isolate → build → static security (G2) → functional unit/integration/Playwright (G3) → independent review and verified final-merge candidate (G4) → approved synthetic staging + commit/CI/digest identity + smoke and rollback (G5) → evidence report.

Mandatory status **PASS/FAIL/NOT_RUN**; NOT_APPLICABLE only when explicitly preapproved. Any FAIL/NOT_RUN = NO-GO.

## Qualification
Five adversarial properties across **three independent fresh-baseline trials**:
1. Seed 8–10 known defects, catch each by intended control.
2. Interrupt a worker; recover without duplicate merge/deploy.
3. Verify no cross-project data/secrets leakage, using minimal synthetic Project B.
4. Trace staged artifact to commit SHA, test/CI run and digest.
5. Prove caps stop spending/execution.

R1 baseline+defects; R2 fresh baseline+crash; R3 fresh baseline+integration conflict/failure. Do not reuse a previously completed implementation. Record cost/turns, time, retries, interventions, reviewer findings, escaped defects and all gate reports. Three green build logs are not qualification.

## Operational permissions
Perform routine **non-destructive approved** test/repair/proposal work, inspect identity/resource ownership before mutation, stop on real operator denial. Production release, destructive operations, real financial/customer data, network/SSH/firewall/secret/permission expansion, protected test/CI modifications and material scope/budget increases require specific human approval.

## Current reconciled decisions
Use [OWNER_DECISIONS.md](OWNER_DECISIONS.md) and GitHub issue #53, **not** the original pack's old questions: G1-DEC-01..08 business rules approved, Q1–Q14 A approved conditionally, existing Claude Pro/ChatGPT subscriptions only, **$0 incremental billed APIs**, 8 turns/10 min task, 12/25 trial, 36/75 batch, 120s prompt, one retry and one confirmed usage-limit handoff. These are policy decisions; live enforcement must still pass. Final protected acceptance suite SHA and reserved approvals are separate.

**Factory-wide status at 2026-10-23:** G1–G5 NOT_RUN; three independent trials 0/3; **NO-GO**.
