# Factory Qualification — Five Non-Bypassable Gates and Three Trials

## Mandatory gates
| Gate | Required machine-verifiable evidence | Current |
| --- | --- | --- |
| G1 Spec | Owner-approved full versioned G1 with final independent protected acceptance suite SHA, writer-proof storage, enforcement | NOT_RUN |
| G2 Static | Typecheck, lint, build, architecture, dependency/SBOM, Gitleaks, Trivy and applicable Semgrep; no critical advisory waiver | NOT_RUN |
| G3 Function | Unit/integration/ERP synthetic ownership, PPS authoritative arithmetic/tamper, durable uniqueness/races, lifecycle/failure, Playwright screenshots/traces with assertions | NOT_RUN |
| G4 Review | Different-model independent review, enforce protected branches and all checks on final merge candidate, no self-approval | NOT_RUN |
| G5 Staging | Approved synthetic FitDesk staging, tested SHA → CI run → image digest → Dokploy deployment ID, smoke tests and rollback rehearsal | NOT_RUN |

`PASS` must cite a current run/check ID and artifact; `FAIL` or `NOT_RUN` mandates `NO_GO`. `NOT_APPLICABLE` only under a preapproved policy. No green build, visual proof, AI review or Graphify report can substitute for missing controls.

## Three independent fresh-baseline trials
- **R1:** fresh immutable baseline + 8–10 seeded faults. Include tenant read/write leak, tampered total, foreign ERP Customer ID, non-atomic duplicate, wrong lifecycle/paid, broken failure handling, secret leak and protected-test/CI bypass. Show intended control catches each, not an unrelated build failure.
- **R2:** separate fresh baseline + real worker interruption and recovered task/lease/checkpoint; prove at most one merge/deploy and correct revalidation.
- **R3:** third fresh baseline + integration conflict/failure + minimal Project B concurrent isolation + forced budget stop; no cross-project data/secrets, artifact provenance intact.
- Across all runs independently demonstrate five properties: seeded defect detection, crash recovery, project isolation, commit/test/digest traceability, and enforced caps.

## Invariants
- Separate baseline per run: do not reuse a completed implementation; freeze controller and guidance throughout batch.
- Record runtime, combined turns, retries, user interventions, cloud/tool cost, escaped defects, detected seeds, test reports, commit SHA, CI run, container digest, deployment ID, rollback evidence.
- Actual permission/secret changes, protected checks and staging release require their own review and owner authority; production remains human-only.
- FLL may append sanitized lessons and propose guidance improvements, but not change active instructions between R1/R2/R3 or weaken tests/policy.
- Factory qualification only after all mandatory gates and five properties pass across all three independent trials, with independent evidence review.
