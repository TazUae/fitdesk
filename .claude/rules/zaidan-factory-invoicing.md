# Zaidan Pilot — FitDesk Financial Invariants

Applies to the narrowly approved pay-per-session invoicing slice; does not supersede product rules in root `CLAUDE.md`. Do not infer actual ERP tenant settings from test defaults.

- Authenticated trainer may invoice only a completed, tenant-authorized, correctly classified PPS session.
- Session price is a **tenant-approved booking-price snapshot with provenance**, not a free browser input or merely a stored unverified `FD Session.rate`.
- ERP-authoritative tax, currency and rounding must be known and validated. Unverified settings fail closed in synthetic acceptance; do not silently default USD/0% tax.
- Server independently derives and verifies trainer, tenant, session, ERP customer, price, tax, currency and total. Browser-supplied IDs, rate, amount, tax or status cannot override.
- At most one invoice per authorized session under **true concurrent** requests: use a durable uniqueness/idempotency boundary at the actual synthetic financial write, not only a `findInvoiceBySession(limit:1)` lookup.
- Explicit invoice lifecycle and ERP `docstatus` mapping. Unknown states fail closed; draft/issued/cancelled/paid transitions require authorized state and proof; no synthetic trial may create a real Payment Entry or payment link.
- Under ERP create/submit/timeout/failure ambiguity, reconcile existing effects before replay; never mark success speculatively.
- Foreign tenant/trainer/customer read/create/issue/mark-paid access must fail without information leaks.
- Critical tests must cover price provenance, amount tampering, tax/currency, tenant ownership, concurrent duplicates, partial failure, lifecycle and missing authorization, with actual running synthetic app Playwright proof when relevant.
- Root `CLAUDE.md`'s prohibition on product AI auto-creating invoices applies to *trainer-facing AI actions*, not the developer's ability to implement owner-authorized server workflows. The completed product must preserve trainer approvals.

The eight target business decisions are owner-approved, but the **independent protected executable test SHA and final G1 sign-off are reserved**. See `docs/factory/FITDESK_PPS_G1.md`.
