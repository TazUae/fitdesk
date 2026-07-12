# US-046 Retention Risk Signals — Plan Note (STOPPED before implementation)

> Per the batch's own explicit instruction for this story: *"If retention scoring needs product
> thresholds, stop after plan note and report."* This note documents why that condition is met, and
> implementation was **not started**.

## Canonical definition

`_inputs/fitdesk-final-doc-pack-v1-1/FITDESK_SOVEREIGN_PRODUCT_BACKLOG_V2_1.md` — **US-046 is
"Cancellation Risk Management,"** not "Retention Risk Signals" generically. Its acceptance criteria,
verbatim:

```
Defines cancellation-risk thresholds.
Shows risk reason.
Suggests follow-up.
Allows dismiss/snooze with reason.
```

The **first** acceptance criterion — "Defines cancellation-risk thresholds" — is itself a required
product decision, not an implementation detail I can infer from existing data.

## Confirmed: no threshold is defined anywhere

Searched exhaustively across every documentation tier available (the Product Decisions ledger, the
full `_inputs/fitdesk-final-doc-pack-v1-1/` doc pack, `docs/execution/*`, `docs/product/*`,
`docs/plans/*`):

- `FITDESK_PRODUCT_DECISIONS_V1_0.md`'s decision ledger (PD-001 through PD-012) has **no entry**
  for cancellation-risk thresholds of any kind.
- No file anywhere in the repo contains a concrete numeric rule (e.g. "N cancellations in M days," "X
  consecutive no-shows") for what counts as at-risk.
- `docs/execution/FINAL_DOC_PACK_TRACEABILITY_MAP.md` (an existing tier-6 audit, written before this
  batch) independently confirms the same gap: *"No session-outcome, no low-package-balance, no
  cancellation-risk... signal [exists]"* and separately lists **US-046 as "Not built... no
  contradicting evidence found."*

This is the same class of gap already found and correctly deferred for US-050's package-low-balance
trigger (`docs/execution/us-050-reminder-candidates-plan.md`) — a required product decision that does
not exist yet, not a technical unknown I can resolve by reading more code.

## Why not proceed with "explainable flags instead of a score"

The batch's own scope section offers a fallback: *"Prefer flags/reasons over a fake numeric score if
thresholds are not defined."* I considered this, but the **first** acceptance criterion for canonical
US-046 is specifically *"Defines cancellation-risk thresholds"* — a flag/reason-only implementation
would still need to answer the same underlying question ("at what point does a pattern of
no-shows/cancellations count as *risk*, worth surfacing to the trainer?"). Any answer I pick myself
(e.g. "2 no-shows in a row," "3 cancellations in 30 days") would be exactly the fabricated,
undocumented threshold the batch's global forbidden scope explicitly disallows: *"Do not fake
retention scoring with arbitrary thresholds unless the canonical docs already define the threshold."*
There is no safe, non-arbitrary version of this story to build today.

## What US-049 (attendance truth) already provides for whenever this is unblocked

`lib/scheduling/attendance.ts`'s `getSessionOutcomeCounts` (US-049) already gives per-client
`noShow`/`cancelled` counts, ready to be the *input* to a threshold rule the moment a product owner
defines one — e.g. "flag if `noShow + cancelled >= N` in the client's history." No new data
infrastructure is needed; only the missing product decision.

## Recommended next step (not taken here)

A product decision recording a concrete, explainable cancellation-risk threshold (ideally as a new
PD-0xx entry, mirroring how PD-010 defined the package-renewal workflow) would unblock this story
immediately — the attendance-count data and the action-intent/dismiss-with-reason infrastructure
(US-047/US-050) it would plug into already exist.

## Not implemented

No repository, action, or UI code was written for this story. No tests were added. Story 4 is skipped
in this batch per its own stop condition; the batch continues with Story 5 (US-053).
