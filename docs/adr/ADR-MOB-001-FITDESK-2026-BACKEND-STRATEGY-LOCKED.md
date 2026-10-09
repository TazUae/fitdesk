# ADR-MOB-001 — FitDesk Backend Modernization and Native Mobile API Strategy (2026)

**Decision:** RETAIN AND MODERNIZE THE EXISTING MODULAR BACKEND; BUILD A NEW, CLEAN MOBILE API BOUNDARY INSIDE THAT BACKEND.  
**Decision state:** **PRODUCT + BACKEND DIRECTION LOCKED — v1.0** (2026-10-09); repository adoption and independent Security/ERP/DevOps approvals remain subject to protected review gates.  
**Authority:** FitDesk Product Owner and Technical Lead / Backend approver (self-identified and delegated execution authority in this project's conversation). This does **not** assert that independent Security, ERP/Finance, DevOps, or Release approvals were obtained.  
**Scope:** FitDesk backend, proposed iOS/Android trainer-first clients, native API interfaces, ERPNext/Control Plane boundaries, and delivery governance.  
**Parent authority:** `FITDESK_BACKEND_MOBILE_READINESS_MASTER_PLAN_LOCKED_v1.0.md` (2026-10-09), especially §1 Binding Decisions, §2 evidence labels, §3 Gates A–D, §4 twelve-phase backlog, and §7 owner decisions.  
**Replaces:** Nothing. This ADR **confirms and operationalizes** the existing locked plan; it neither supersedes its requirements nor authorizes a merge, deployment, migration, new mobile endpoint or security exception.  
**Canonical repository location (after approved merge):** `docs/adr/ADR-MOB-001-FITDESK-2026-BACKEND-STRATEGY-LOCKED.md`.  
**Evidence snapshot date:** 2026-10-09. Re-evaluate repository/runtime assertions against the precise candidate and deployed Git SHAs before release.  
**Classification:** Internal architecture decision; no production credentials or customer data.

## 1. Executive decision — binding rules

1. **Keep FitDesk's current backend and related repositories.** No clean-room total rewrite, parallel replacement backend, microservice split, second accounting datastore, ERPNext replacement, or new standalone mobile backend **by default**.
2. **Create a clean, contract-first mobile interface** in the existing Next.js backend, initially as versioned Route Handlers at **proposed** `/api/mobile/v1`, reusing approved domain/application services. Existing Next.js Server Actions and infrastructure endpoints **must not** be passed off as stable native API contracts.
3. **Keep business logic transport-independent where practical.** A new mobile boundary uses request validation, a server-derived actor/tenant/trainer context, application use cases, least-privilege response DTOs, and existing domain/ERP adapters; it must not duplicate scheduling, ledger or payment rules.
4. **Keep financial authority singular.** ERPNext remains the authority for accounting-facing customer, invoice and payment records. Any consequential operation uses validated server-side amounts/currency, durable idempotency, revision/consistency guards as applicable, and reliable reconciliation of uncertain outcomes; native or web clients never become a competing financial ledger.
5. **Enforce authorization at the data/action boundary.** Next.js Proxy/middleware is for early routing or coarse redirects only, **not** the security boundary. Every sensitive read and write must verify authenticated principal, tenant, trainer/role and ownership of the object being accessed, including cross-tenant and cross-trainer negative tests. Derive identity from server-trusted credentials, not caller-supplied identifiers.
6. **Keep native identity unapproved pending proof.** Assess the installed Better Auth configuration and external-browser OAuth/OIDC Authorization Code + PKCE (RFC 8252, RFC 9700), token issuer/audience, rotation/revocation, replay handling, redirect/tenant mapping, and OS-protected credentials. Do not infer native-token support from web-cookie login or proxy tests; use an alternative IdP only through a separate reviewed ADR.
7. **Keep the mobile contract at OpenAPI 3.1 for this locked delivery plan.** OpenAPI 3.2.1 was published on 2026-09-10, but upgrading the schema dialect needs an owner-approved tooling-compatibility ADR; the existing mobile YAML remains a **draft** until contract-owner approval. Require schema lint/semantic tests, synthetic mocks, API compatibility checks, standardized errors (RFC 9457) and generated or verified client contracts.
8. **Keep the trainer-first product scope.** Client native login, offline financial commits, unapproved push/messaging scope and other expansion remain gated decisions. Offline drafts/reads are not authoritative; online authorization/revision/state revalidation precedes consequential effects.
9. **Protect source and release gates.** Work in approved isolated, short-lived worktrees; preserve existing dirty worktrees and encrypted backups. Enforce locked dependencies, SBOM, secret/dependency scans, provenance where feasible, protected CI, exact-source regression tests, human review, staged rollout and rollback. Never waive a failed gate simply to merge.
10. **Change this direction only via an approved versioned ADR or plan change log** backed by demonstrable technical evidence, cost/risk comparison, migration and rollback plan, and affected owner approvals. This ADR does not self-approve future changes.

**Normative interpretation:** Items 1–10 apply to future FitDesk mobile-backend planning and design under the existing Locked Master Plan. An unmerged repository PR contains a recorded decision but is **not** equivalent to adopted `main` governance; release and code gates remain separate.

## 2. Why this was selected — 2026 FitDesk evidence

The evidence supports incremental modernization rather than a wholesale rebuild:

| FitDesk observation | Evidence class | Implication / limit |
|---|---|---|
| The web implementation is mainly Next.js Server Actions, with domain logic for clients, scheduling, sessions, packages and invoices and adapters for ERP/Control Plane. | **DOC + REPO inventory** | Reusable behavior and dependency boundaries exist; suitability of each module still requires code-level validation. |
| The available HTTP Route Handlers are internal infrastructure, not a stable public/native API. A `/api/mobile/v1` contract is proposed, not deployed. | **REPO + PROPOSAL** | Introduce a clean versioned API rather than exposing existing actions unchanged. |
| ERPNext is the accounting/customer identity authority under the product's approved architecture. | **LOCKED DECISION + DOC** | Full rewrite adds high-risk identity, reconciliation and financial correctness migration work. |
| Draft foundation PR #46 and stacked security PR #48 exist and are **not merged**. | **REPO** | Security/platform remediation is in progress, not in the production baseline. |
| On security PR #48 head `8886ba4c4886351c524948882867b9ab2f69be74`, GitHub Actions run `37969474172`: Node 20 clean install, TypeScript, 85 Vitest files / **2,575 tests**, Next.js + Docker build, source secret scan, CycloneDX SBOM and critical production-dependency audit passed. | **CI / exact SHA** | Demonstrates an upgrade path and testable existing behavior, **not** proof of total authorization coverage, complete compatibility, or production deployment. |
| The same run's ESLint 9/React Hooks check failed with **27 errors, 5 warnings**, mostly across existing UI/scheduling components. | **CI / exact SHA** | A frontend compatibility/remediation issue remains; **not evidence that core backend must be rebuilt**. See Issue #50. |
| Native OAuth security, deployed source SHA/configuration, exhaustive tenant/resource checks, ERP outcome recovery, performance, incident/recovery metrics and independent approvals are unverified. | **UNVERIFIED** | High-risk security and operational work remains mandatory; do not assert production readiness. |

**GitHub evidence:** [Draft PR #46](https://github.com/TazUae/fitdesk/pull/46), [Draft PR #48](https://github.com/TazUae/fitdesk/pull/48), [Actions run 37969474172](https://github.com/TazUae/fitdesk/actions/runs/37969474172), [critical dependency tracker #47](https://github.com/TazUae/fitdesk/issues/47), [high-severity follow-up #49](https://github.com/TazUae/fitdesk/issues/49), [React Hooks migration #50](https://github.com/TazUae/fitdesk/issues/50). These references are evidence snapshots, not a release signoff.

## 3. 2026 engineering benchmark — directional, not certification

Ratings deliberately use **Established / Partial / Gap / Unverified** rather than invented numerical maturity scores.

| Dimension | 2026 target engineering control | FitDesk evidence-based posture | Required proof of completion |
|---|---|---|---|
| Modularity | Small, transport-independent service interfaces and clear domain/application/adapter boundaries; avoid gratuitous microservices | **Partial / strong reusable candidates** | Domain dependency map + safe vertical-slice integration; no duplication of core rules. |
| API design | Contract-first, versioned HTTP API; explicit DTOs, validation, normalized errors, bounded pagination, compatibility tests | **Gap** (native API not implemented) | Approved OpenAPI **3.1** schema, lint/mocks, generated/verified client models, contract and integration tests. |
| Tenant/object authorization | OWASP API1/API3 + ASVS 5 controls at every protected operation; deny-by-default tests | **Unverified / P0** | Cross-tenant, cross-trainer, by-ID and property authorization tests per route and mutation. |
| Native auth/session | RFC 8252/9700, external user agent + PKCE, issuer/audience, revocation, reuse/replay defenses | **Unverified / P0** | Approved native IdP ADR, integration and adversarial lifecycle tests, independent Security signoff. |
| Billing/ERP correctness | Single ERPNext authority; idempotent consequential writes; retry/reconciliation/outbox as appropriate | **Partial design / high-risk runtime unknown** | Consistency and concurrency matrix, ERP timeout/retry/duplicate tests, Finance/ERP signoff. |
| Reproducible supply chain | Protected PRs, locked install, CI quality, SBOM, audit, secret scan, provenance and verifiable rollback | **Partial** (5/6 CI checks on candidate; draft) | Green full CI on a single reviewed merged source SHA and independently reviewed artifacts/controls. |
| Privacy and client resilience | Least data; validated caching, purge on logout/tenant switch, explicit online revalidation | **Unverified / later gate** | Mobile storage/deletion/offline/recovery acceptance tests. |
| Operations and SLOs | Measured latency/error/throughput, tracing, recovery budgets and incident owners; five DORA delivery metrics | **Unverified** | Representative staging/production measurements and approved SLOs, runbooks, restoration tests. |
| Release governance | Immutable evidence, independent security/ERP/DevOps approvals, phased rollout and rollback | **Partial** | Exact-sha risk review, human signoffs, written Gates A–D, rollback exercise. |

This benchmark is **not** an ASVS, MASVS, SOC 2, SLSA, or security compliance certification, nor a quantitative total-cost-of-ownership study.

## 4. Option assessment and rejected alternatives

| Option | Outcome | Rationale |
|---|---|---|
| **A — Modernize existing modular FitDesk backend and add a clean native API boundary** | **ACCEPTED DEFAULT** | Preserves testable domain semantics and ERP authority while enabling a new, independently validated mobile contract. Supports small reversible changes and progressive architecture improvements. |
| B — Rewrite the entire FitDesk backend and replace its integrations | **REJECTED as default** | Would require revalidating authentication, tenant ownership, scheduling state, billing/ledger behavior, ERPNext reconciliation and migrations with no demonstrated business/systemic justification; increases transition risk. |
| C — Create a separate greenfield mobile backend/service now | **REJECTED as default** | Adds operational and consistency boundaries, token/tenant mapping and data duplication risk before actual scaling/isolation needs are demonstrated. May be reconsidered by ADR with evidence. |
| D — Expose existing Server Actions unchanged to native mobile clients | **REJECTED** | Internal web transport is not an approved stable mobile contract or native identity/authorization boundary. |
| E — Replace ERPNext as financial authority | **OUT OF SCOPE / REJECTED by locked plan** | Requires explicit Finance/ERP/product owner decision and a separate data migration/reconciliation program. |

**Cost statements are qualitative hypotheses, not estimates.** No verified rewrite estimates, independent code health audit, production operating metrics, or total-cost model currently supports quantitative savings or delivery-time claims.

## 5. Target boundaries and dependency direction

```text
Trainer native iOS / Android
    |  HTTPS; native identity/session only after security gate
    v
FitDesk /api/mobile/v1  [PROPOSED — not implemented]
    |  validated requests, approved OpenAPI contract, least-privilege DTOs
    v
AuthN / AuthZ application boundary
    |  server-derived user + tenant + trainer + roles + object ownership
    v
Transport-independent FitDesk application/domain services
    |                  |                         |
    v                  v                         v
Local FitDesk data   ERPNext adapter            Control Plane adapter
(tenant-scoped)      (financial authority)      (provisioning authority)
```

- **Dependency rule:** Route Handler → application service/use case → domain rules → reviewed adapters. Domain rules do not import native/web view components, Route Handlers, or external transport DTOs. Server Actions may reuse those application services but are not the API contract.
- **Security rule:** Proxy redirects are defense in depth, never a substitute for route/use-case/object authorization. Filtering must occur **before pagination**, with resource ownership rechecked on writes.
- **Finance rule:** Never assume HTTP success/failure equals settled ERP payment; treat uncertain outcomes as reconcilable operations. Require durable idempotency and audit trails for consequential mutations.
- **Compatibility rule:** Use one approved API schema source of truth and verify supported older mobile builds before backend deployment; no competing handwritten client/server models.
- **Deployment rule:** Keep the existing web app and backend operating while progressively introducing versioned native routes; no new service extraction based on aesthetics alone.

## 6. Sequencing and acceptance gates — existing master plan wins

**Immediate P0: complete Phase 2.** Resolve the existing React Hooks lint failures in [Issue #50](https://github.com/TazUae/fitdesk/issues/50) without disabling rules; ensure six required CI jobs pass on one candidate revision; complete Security/DevOps review, sources/tool licenses and provenance controls. Draft PR #46 and PR #48 **must not merge** based solely on this ADR. The security candidate's 5/6 success is a checkpoint, **not Phase 2 completion**.

**Phase 3:** Verify critical findings against the *deployed* SHA/config, complete threat model for identity, object/tenant access, ERP and payments; add explicit negative tests and human Security/ERP signoff. Avoid conflating vulnerability-free dependency audit with complete application security.

**Phase 4:** Prove and approve native OAuth/OIDC flows, external-browser PKCE, redirect/token/session lifecycles and revocation before live native login.

**Phase 5 / Gate A:** Approve the mobile MVP endpoint/DTO contract at OpenAPI **3.1** (even though OpenAPI 3.2.1 is published); wire semantic lint, examples, mocks and compatibility regression tests. Trainer-first mobile clients may build against approved synthetic mocks.

**Phase 6 / Gate B:** Deliver *one small, tenant-safe, read-only* vertical slice: `/me`, mobile configuration and bounded client/schedule reads via shared application services. Require cross-tenant/by-ID negative tests, contract tests and segregated staging integration with both native clients.

**Phases 7–12 / Gates C and D:** Consequential mutations only after online state validation, idempotency/revision protection, ERP reconciliation, performance/privacy/offline rules and staged release approvals. Preserve the master plan's twelve-phase ordering/overlap and Gate A–D dependencies.

**Quality budgets:** The master plan's proposed p95 targets (light reads ≤300 ms, list/schedule reads ≤500 ms), 5xx and payload targets are **unmeasured proposals**; calibrate with realistic data and owner-approved load/staging measurements. DORA metrics similarly require actual data before rating FitDesk's performance.

## 7. Decision lock, review and amendment protocol

**Decision owner:** Product Owner + Technical Lead / Backend approver. This owner has approved the **strategic direction** in this project's conversation and asked to record and lock it. This is **not** an independent security or code review.

**Effective rules:** Items §1.1–10 apply to design proposals and workstream scopes immediately as an interpretation of the already locked master plan. **Repository-governance adoption** requires normal protected PR merge into `main` and appropriate affected-owner review; publishing a draft PR alone does not make new files canonical. This ADR does not override other approved product, security, ERP, release or documentation authority maps.

**Change mechanism:** No silent rewrite, new service, API dialect change or auth/financial authority change. A change requires all of:

1. A **new versioned ADR** (`Supersedes ADR-MOB-001 v1.0`) or a master-plan change-log amendment, describing exact affected decisions, before/after, alternatives and evidence; **never rewrite v1.0 in place** after it is adopted.
2. A measurable technical or business trigger: e.g. proven inability to implement strong tenant isolation using current domain boundaries; independent security findings requiring architectural replacement; verified performance/SLO shortfall despite bounded optimization; a credible total-cost/cutover analysis establishing substantial net advantage; or an approved product/ERP strategy change. None is assumed to have occurred.
3. Impact assessment for all existing web/mobile clients, data ownership, ERPNext correctness, migration, incident response, team ownership, rollback and compatibility. Include a small alternative spike/vertical slice where the choice is genuinely uncertain.
4. Named affected-owner approvals (Product, Backend and—where impacted—Security, ERP/Finance, Mobile, SRE/DevOps, QA/Release); protected GitHub PR with required independent reviewer and checks; links to exact commits/tests. No forced merges or reduction of gate thresholds.
5. Updated source-of-truth architecture index and retained historical ADR with `Superseded by...` metadata; current state and handoff documents must link to the new approved record.

**Review trigger:** Reassess this decision at the first approved staging mobile read vertical slice, upon a material production security/reliability finding, or prior to any proposed greenfield backend project. A routine framework release or lint warning alone does **not** trigger a full rewrite.

**Approval record:** **Product/Backend direction approved by user; independent affected-owner signoffs NOT YET PROVIDED.** No electronic signatures or named independent reviewers are fabricated. Documentation PR may be reviewed separately; protected branch rules, existing workstreams and CI remain authoritative.

## 8. Source authority and external references

**FitDesk primary authority**
- `FITDESK_BACKEND_MOBILE_READINESS_MASTER_PLAN_LOCKED_v1.0.md` (2026-10-09), §§1–4, 6–7. The locked plan prevails on conflicts.
- `FITDESK_NATIVE_MOBILE_SOURCE_REVIEW.md` (2026-10-08 source bundle review). Documentary evidence; canonical product/ERP docs and live source outrank derived summaries.
- Phase 2 source/evidence: GitHub draft PRs [#46](https://github.com/TazUae/fitdesk/pull/46), [#48](https://github.com/TazUae/fitdesk/pull/48), and [run 37969474172](https://github.com/TazUae/fitdesk/actions/runs/37969474172). Live status must be rechecked, never inferred from this dated record.

**Standards verified from official publishers for 2026 benchmark**
- [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS); [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) (especially API1 broken object-level authorization and API3 object-property authorization).
- [Next.js 16 Proxy documentation](https://nextjs.org/docs/app/getting-started/proxy): Proxy is **not** the full authorization or session-management solution.
- [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) (native OAuth external user agent), [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) (OAuth 2.0 security BCP), [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) (problem details).
- [OpenAPI 3.2.1 publication, 2026-09-10](https://spec.openapis.org/oas/v3.2.1.html). **FitDesk's approved delivery schema remains 3.1** pending a separate decision.
- [NIST SSDF SP 800-218 v1.1](https://csrc.nist.gov/pubs/sp/800/218/final); [SLSA v1.2 provenance](https://slsa.dev/spec/v1.2/provenance); [DORA delivery metrics](https://dora.dev/guides/dora-metrics/).

## 9. Document control and audit trail

| Version | Date | Owner authority | Change | Adoption state |
|---|---|---|---|---|
| **v1.0** | 2026-10-09 | FitDesk Product Owner + Technical Lead / Backend approver | Captures and freezes the 2026 retain-and-modernize benchmark, options rejected, target mobile boundary and change-control obligations. Does **not** change the locked master plan. | Direction approved; project-repository merge, independent affected-owner review and release gates pending. |

**Integrity control:** The Git commit and SHA-256 of this exact file should be recorded when placed in the repository and compared during future handoffs. Do not delete older revisions; use additive superseding ADRs. Draft/pending is **not** an approved deployment.
