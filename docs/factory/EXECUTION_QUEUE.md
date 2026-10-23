# Dependency-Ordered Factory Execution Queue

**As-of checkpoint:** 2026-10-23. Status must be reverified live before acting. One task = one branch = one worktree = one active writer; do not open duplicate worker sessions.

| Order | Next smallest task | Authority | Done evidence | Status at checkpoint |
| --- | --- | --- | --- | --- |
| 01 | Reconcile Forge current task/checkpoint/lease/worktree/writer and diagnose `test_one_active_writer_and_idempotency_unchanged` timeout | Read-only + bounded nonprotected preparation | clean state, root cause, passing bounded regression | INSPECTED / TEST TIMEOUT |
| 02 | Independently prove authenticated Claude/Codex ACP subprocess/tool env/FD/proc isolation with synthetic canaries | Q1–Q5; only constrained proof, no inferred trust | security negative tests, no leak, no unauthorized access | NOT_RUN |
| 03 | Prove durable hard caps, single writer, checkpoint recovery and exact limit classifications | Q5 + owner limits | forced stop/recovery and budget test report | OFFLINE PROTOTYPE TESTED; LIVE NOT_RUN |
| 04 | Review existing 24-case `ZDN_G1_v0.3.0` candidate; build synthetic adapter outside coding worker; pin immutable SHA | Q8–Q10, no protected change without owner | independent tests + exact SHA + requested sign-off | CANDIDATE; 24 PRODUCT TESTS NOT_RUN |
| 05 | Reconcile six required GitHub contexts vs one-job main workflow; review additive CI proposal | Q11 preparation; protected change still reserved | actual diff, review, approved CI on final candidate | 12 STATIC PROPOSAL CHECKS PASS; NOT_APPLIED |
| 06 | Prepare isolated synthetic FitDesk ERP and tightly scoped staging resource/credential path | Q8–Q9 and existing network paths; later staging approval | identity and ownership assertions, fake data, safe rollback | NOT_RUN |
| 07 | Start one FitDesk PPS task once G1, worker safety and budget enforcement gates PASS | Conditional Q12 | PR SHA, unit/API tests, Graphify impact, independent reviewer | BLOCKED |
| 08 | Execute G1–G5 with actual running synthetic app E2E and artifact identity | existing five gates + protected CI | required evidence artifacts PASS | NOT_RUN |
| 09 | Fresh trials R1 seeded 8–10 defects, R2 crash recovery, R3 conflict + Project B isolation + caps | Q13–Q14; global batch limits | all five adversarial properties PASS across 3 baselines | 0/3 |
| 10 | Separate FLL evaluation and independent final factory qualification | v0.6.2 | signed evidence index + GO/NO-GO | NOT_RUN |

## Scheduling rules
- A blocked critical dependency never authorizes jumping to a dangerous later action. If independent docs/test prep can proceed safely, do that within scope.
- Revalidate main/protected branch and final merge candidate; last known main SHA is a reference, not permission to assume unchanged.
- Unknown access, helper identity, event state, subscription quota, tool containment or limit counts = **BLOCKED**, not fallback/loop.
- No auto-merge, no staging launch without specific release approval, no production. Never create additional agents/swarms because a task takes longer than one bounded run.
