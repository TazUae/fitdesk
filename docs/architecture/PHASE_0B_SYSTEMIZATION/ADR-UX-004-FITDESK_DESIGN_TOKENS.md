# ADR-UX-004 — FitDesk Design Tokens

Status: Approved v1.1
Date: 2026


## Context

FitDesk design tokens translate product doctrine into enforceable engineering values.

Tokens prevent arbitrary spacing, radius, typography, and color drift.

## Decision

All visual values must resolve through approved tokens.

## Token Categories

- Color
- Typography
- Radius
- Spacing
- Elevation
- Motion

## Radius Scale

| Token | Value | Use |
|---|---:|---|
| xs | 2px | Internal sub-components, compact badges |
| sm | 4px | Checkboxes, selector indicators, small inputs |
| md | 6px | Standard buttons, inline inputs, card inner elements |
| lg | 8px | Default cards, dialogs, ledger blocks |
| xl | 12px | Mobile bottom sheets, desktop side panels |

## Spacing Rhythm Matrix

| Pixel Value | Tailwind Equivalent | Approved Class Suffix |
|---:|---:|---|
| 4px | 0.25rem | `-1` |
| 8px | 0.5rem | `-2` |
| 12px | 0.75rem | `-3` |
| 16px | 1rem | `-4` |
| 24px | 1.5rem | `-6` |
| 32px | 2rem | `-8` |
| 48px | 3rem | `-12` |
| 64px | 4rem | `-16` |

Arbitrary spacing values are prohibited.

## Typography Core Reference

- Primary Engine: Geist Sans
- Numeric Engine: Geist Mono

## Color Core Reference

Color values are governed by ADR-UX-006.

Implementation must use OKLCH as canonical values and may keep HEX values only as legacy/reference comments.

## v1.1 Engineering Amendment — Token Resolution Matrix

All implementation values must map to tokenized variables.

Raw pixel values may appear in this ADR for documentation only. Implementation should use Tailwind utilities or CSS variables mapped from these tokens.

## Tailwind Rule

Developers must not use arbitrary classes such as:

```text
p-[13px]
gap-[22px]
rounded-[10px]
text-[#123456]
```

unless approved by a future ADR.

## Governance

No arbitrary visual value is allowed without ADR approval.
