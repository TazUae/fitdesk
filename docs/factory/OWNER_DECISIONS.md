# Owner Decision Ledger — Do Not Re-Ask Resolved Questions

**Authoritative evidence:** dated owner approvals/comments at https://github.com/TazUae/fitdesk/issues/53 . This file is a **pointer and transcription of recorded authorization**, not a new sign-off or broader permission.

## Confirmed decisions
| ID | Decided | Precise interpretation |
| --- | --- | --- |
| G1-DEC-01..08 | APPROVED 2026-10-21 | FitDesk PPS invoicing business behavior as in `ZDN-G1-PPS-001 v0.2.0`, candidate SHA `b6ae598771a8bd5f1afa1a359623760f50519843fd37179d791dae636aca7439`. Business rules only, not final protected suite or real financial operation. |
| Q1–Q14 | All A selected | Owner-approved scoped synthetic worker/broker, minimal second project, Forge-first inspection, protected-test ownership and bounded trials, with reserved steps below. |
| Funding | DECIDED | Claude Pro + ChatGPT subscription accounts only; **$0** incremental API-billed spending. Old proposed positive USD budgets are superseded. |
| Task | DECIDED | 8 combined Claude/Codex prompt turns and 10 minutes, 120s/prompt, at most one repair retry and one **confirmed** Claude usage-limit to Codex handoff. |
| Trial | DECIDED | 12 turns / 25 minutes per fresh trial. |
| Batch | DECIDED | 36 turns / 75 minutes for 3 trials total, counting fallback and repair. |
| Concurrency | DECIDED | One globally active coding executor for pilot, one writer/task. |
| Qualification | DECIDED | 5 adversarial properties across 3 independent fresh-baseline trials; do not reuse a completed implementation. |
| Production | NOT AUTHORIZED | Production/commercial release requires a separate owner decision. |

Evidence: [funding and limits](https://github.com/TazUae/fitdesk/issues/53#issuecomment-6318983747), [G1 policy](https://github.com/TazUae/fitdesk/issues/53#issuecomment-6324308426), [Q1–Q14 exact terms](https://github.com/TazUae/fitdesk/issues/53#issuecomment-6326612457).

## Approved technical choices (scoped, conditional)
- Q1–Q4: verified factory host, distinct nologin credential broker and untrusted worker identities, fake canaries, no Docker host socket/OAuth mount, pinned nonroot disposable image, contained networking; real ACP subprocess isolation must pass before live model execution.
- Q5: inspect/reconcile Forge first, then synthetic isolated controller/checkpoint/lease work.
- Q6–Q7: fixed, disposable Dokploy test project/environment/app only; cleanup only tagged newly created synthetic resources.
- Q8–Q9: synthetic tenant price/tax/currency and reversible uniqueness experiments in **new synthetic ERP only**; never touch existing ERP schema.
- Q10–Q11: independent protected suite and additive CI diff preparation; exact suite SHA and protected policy mutations retain owner approval.
- Q12: one FitDesk coding task conditionally permitted **only after** final G1 package, containment and worker gates.
- Q13–Q14: three adversarial trials, minimal synthetic Project B for isolation/concurrency; no wider products.

## Reserved approvals — precise later requests only
1. Final owner approval of **independent protected test suite SHA** plus full versioned G1 package.
2. Reviewed protected GitHub CI/workflow/branch-rule changes; merely preparing additive diff is authorized.
3. Any host/network/secret/permission expansion, real customer/financial data or existing ERP schema/DocType modification.
4. Specific **first FitDesk staging release**, after target/resource identity and G5 prerequisites.
5. **Production/commercial go-live** — explicit separate approval after qualification.

Silence is not consent. Do not reinterpret broad “continue” requests as these reserved approvals.
