---
name: factory-qualify
description: Independently audit G1–G5 evidence and three fresh adversarial trial results; report PASS/FAIL/NOT_RUN without self-approval.
---
# Factory Qualification Evidence Check

Check `docs/factory/QUALITY_GATES_AND_TRIALS.md` and `EVIDENCE_STATUS.md`. Independently trace each claim to exact issue/PR, branch SHA, CI run/check contexts, test artifact, worker attestation, container digest, Dokploy deployment, application smoke trace and rollback record.

- G1: owner-approved *final* protected spec+suite SHA; caller cannot edit suite.
- G2: unit-toolchain static and applicable SAST/security/arch/scans pass.
- G3: integration and Playwright assertions with synthetic tenant/ERP.
- G4: different-model independent review, protected branch checks on final merge candidate, no bypass/self-approval.
- G5: staging runs exactly tested commit/digest, smoke tests and rollback rehearsal.
- Three separate independent fresh-baseline runs: seeded defects, crash, conflict/isolation/budget. Five adversarial properties must be demonstrated by their intended controls.
- Failed/NOT_RUN mandatory item -> NO-GO. A green build/review score/Graphify graph does not substitute for gates.

Use statuses PLANNED / INSPECTED / IMPLEMENTED / TESTED / QUALIFIED / BLOCKED only for work, and PASS / FAIL / NOT_RUN for mandatory checks. Do not claim GO or execute production release.
