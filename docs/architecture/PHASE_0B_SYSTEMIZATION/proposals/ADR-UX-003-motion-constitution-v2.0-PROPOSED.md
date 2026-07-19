> **Status:** Proposed v2.0 amendment — NOT authoritative.
> **Governing approved decision:** `docs/architecture/PHASE_0B_SYSTEMIZATION/ADR-UX-003-FITDESK_MOTION_CONSTITUTION.md` (Status: Approved v1.1) remains binding.
> **Preserved:** 2026-07-19, from the uncommitted 2026-07-18 UI/UX modernization pass working tree.
> **Purpose:** This file exists so the proposed v2.0 content is not lost when the
> canonical filename is restored to its approved v1.1 body. It requires explicit
> product-owner approval before it can supersede v1.1.

---

# ADR-UX-003 — FitDesk Motion Constitution

Status: Proposed v2.0 — product-owner direction incorporated; replaces v1.1 when adopted in the active repository
Date: 2026-07-18

## Context

FitDesk motion must support spatial awareness, state clarity, and perceived responsiveness without distracting trainers or implying success before authoritative confirmation.

## Core Law

Motion explains state.

Motion never exists merely to decorate, impress, or conceal latency.

## Allowed Motion

- sheet and drawer entry/exit;
- accordion expansion;
- dashboard-local rail collapse;
- selection and focus feedback;
- inline loading or progress feedback;
- confirmed state transition after the server accepts a consequential action;
- route/context transitions only when existing routing behavior is preserved.

## Forbidden Motion

- decorative page-load sequences;
- floating particles, glow pulses, sparkle, or animated gradients;
- bouncing metrics or attention-seeking cards;
- autoplay effects;
- motion that delays task completion;
- motion that masks an unresolved request;
- success animation before billing, payment, invoice, package, booking, completion, cancellation, no-show, rescheduling, or WhatsApp confirmation.

## Timing

| Role | Target |
|---|---:|
| Micro feedback | 120–160ms |
| Standard transition | 160–200ms |
| Complex sheet/drawer transition | 200–300ms maximum |

Use the shortest duration that preserves comprehension.

## Reduced Motion

All non-essential movement must respond to `prefers-reduced-motion`.

Reduced-motion mode should:

- remove transforms where possible;
- use immediate or short opacity changes;
- preserve state and focus behavior;
- never remove necessary loading or status information.

## Mobile Rule

Bottom sheets are preferred for focused create, review, and triage flows.

Do not stack multiple modals. Preserve the parent context and restore focus to the initiating control.

## Implementation Rule

Prefer:

1. existing CSS transitions and motion tokens;
2. existing motion infrastructure already owned by the slice;
3. native View Transitions only after verifying browser support, accessibility, and route contracts.

Do not add a motion dependency or introduce a new transition architecture without approval.

## Claude Code Skill Interaction

`frontend-design` motion ideas are advisory and must be rejected when decorative.

`web-design-guidelines` reduced-motion and focus findings are accepted through existing tokens and primitives.

`vercel-react-best-practices` performance suggestions must not change protected flow semantics.

`fitdesk-guardrail` classifies any new motion dependency, route transition, or protected-flow animation as `Stop — needs approval`.

## Governance

If motion does not clarify state, remove it.

If motion communicates success, authoritative success must already be confirmed.
