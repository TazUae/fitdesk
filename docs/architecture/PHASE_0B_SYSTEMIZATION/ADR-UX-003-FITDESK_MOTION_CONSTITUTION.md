# ADR-UX-003 — FitDesk Motion Constitution

Status: Approved v1.1
Date: 2026


## Context

FitDesk motion must support trainer speed, spatial awareness, and state clarity.

Motion must never become decorative noise.

## Core Law

Motion communicates state changes.

Motion never exists for decoration.

## Allowed Motion

- Sheet transitions
- Drawer transitions
- Accordion expansion
- Success confirmation
- FAB morphs
- Dashboard triage open/close
- Inline state changes
- View-preserving route/context transitions

## Forbidden Motion

- Decorative animations
- Floating particles
- Autoplay effects
- Attention-seeking motion
- Motion that delays task completion
- Motion that hides loading latency without functional feedback

## Timing Tokens

- Fast: 150ms
- Standard: 200–250ms
- Complex: 300ms max

## Mobile Rule

Bottom sheets are preferred over modal stacks.

Mobile transitions should preserve the parent route visually whenever possible.

## v1.1 Engineering Amendment — Native Transition Layer

Where supported, page transitions, sheet openings, and dialog expansions should leverage the native View Transitions API for route/context morphs.

Motion remains approved for component state transitions.

Native browser transitions are preferred when they reduce JavaScript execution overhead and layout stutter on mobile.

## Implementation Guidance

Use:
- Motion layout transitions for accordion/card state.
- View Transitions API for route/context morphs where safe.
- CSS transitions for simple hover/focus/opacity changes.

Avoid:
- JavaScript animation for static decoration.
- Multiple nested animation libraries.
- Animations longer than 300ms in operational flows.

## Governance

If animation does not clarify state, it must be removed.
