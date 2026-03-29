# FitDesk — Claude Code Rules

## Project Overview

FitDesk is a mobile-first SaaS for personal trainers to manage:
- clients
- sessions
- invoices
- payments
- WhatsApp communication

## Stack

- Frontend: Next.js App Router
- Auth: Better Auth
- Backend: ERPNext / Frappe
- Messaging: Evolution API
- Payments: Whish with provider abstraction
- Deployment: Docker on VPS

## Product Goal

Build a simple, fast, reliable PT business operating system focused on:
- getting trainers paid
- keeping clients engaged
- minimizing complexity

---

## Core Principles

- Prefer simplicity over abstraction
- Do not over-engineer
- Optimize for mobile-first usage
- Every feature must serve revenue, retention, or simplicity
- No Prisma, no Supabase, no paid auth services

---

## Architecture Rules

- ERPNext is the single source of truth for all business data
- Better Auth is the only frontend auth system — do not use ERPNext auth for frontend users
- Never call ERPNext directly from a client component
- Never call Evolution API directly from a client component
- Never call payment providers directly from a client component
- All external integrations must happen server-side (server actions or route handlers)
- Use typed server-side adapters for ERPNext, payments, and WhatsApp
- Normalize and validate external responses before returning to the UI
- Never duplicate financial source-of-truth data in any frontend-owned store

## Data Flow

```
Client → Server Action / Route Handler → Typed Adapter → External Service
       ← Normalized Response            ←               ←
```

---

## TypeScript Rules

- Strict mode always — `"strict": true` in tsconfig
- Never use `any`
- Define explicit interfaces for all core entities:
  - `Trainer`
  - `Client`
  - `Session`
  - `Invoice`
  - `Payment`
- Validate all external API payloads before use (type guards or zod schemas)
- Use typed return values on all adapter and action functions

---

## Auth Rules (Better Auth)

- Better Auth is the only auth system — email/password and Google sign-in supported
- All auth secrets stay server-side only
- Every authenticated user must map to exactly one Trainer record
- Protect all routes with server-side session checks
- Never expose session tokens or auth credentials to client components

---

## ERPNext Integration Rules

- ERPNext is authoritative for: clients, sessions, invoices, payments
- Never bypass ERPNext business logic
- Never store duplicate financial records outside ERPNext
- All ERP calls must be server-side
- Normalize ERP responses into clean app-level types before the UI sees them
- DocType mappings:
  - Client → Contact or custom Client DocType
  - Session → custom Session DocType
  - Invoice → Sales Invoice
  - Payment → Payment Entry

---

## WhatsApp / Evolution API Rules

- Evolution API is an integration layer — never a source of truth
- All messages must use templates
- All outgoing messages must be logged with timestamp, user ID, and result
- Sensitive financial messages require explicit user approval before sending
- Delivery failures must be visible in the UI
- Auto-sending without user confirmation is not allowed in MVP

---

## Payment Rules

- Payment provider logic must be abstracted — never hardcoded to Whish
- Supported providers: Whish, Cash, Bank Transfer
- Payment links must be generated server-side
- Invoice status must only be marked paid after server-side verification
- Manual payment marking must always be available as a fallback
- All payment events must be logged and auditable

---

## UI / UX Rules

- Mobile-first — design for phones first, always
- Maximum 2–3 taps for any critical action
- Avoid dense admin tables on small screens
- Prefer: cards, vertical lists, bottom sheets, simple forms
- Status must always be visible and clear:
  - Paid / Unpaid / Overdue
  - Upcoming / Completed / Missed
- Overdue invoices must appear prominently on the dashboard

---

## Business Logic Rules

- Session marked complete → update client session count and history
- Invoice must include: total amount, status, linked client
- Payment recorded → update invoice status → update dashboard metrics
- Overdue state → surface in dashboard + suggest reminder message

---

## AI Rules

- AI is assistive only — never autonomous
- Allowed: message suggestions, summaries, recommendations
- Not allowed: auto-sending messages, unreviewed financial actions, autonomous agents

---

## Error Handling Rules

- Never fail silently
- Every action must return a typed success or error result
- Show toast notifications for all user-triggered actions
- Log all integration errors with: timestamp, user ID, action type, result
- Payment and WhatsApp failures must always surface in the UI

---

## Security Rules

- No secrets in the repo
- No secrets in client components or browser-accessible code
- Validate and sanitize all inputs at system boundaries
- Sanitize all external API responses before use
- Use HTTPS for all external service calls

---

## Docker / Deployment Rules

- App must run via Docker on a VPS
- All configuration via environment variables — no hardcoded values
- Separate dev and production configs
- Include health checks in production containers
- Keep images minimal and production-safe
- Assume a reverse proxy handles TLS termination upstream

---

## What to Avoid

- Over-engineering for hypothetical scale
- Premature microservices
- Prisma or Supabase
- Tight coupling to any single provider (Whish, WhatsApp, etc.)
- Duplicate financial data outside ERPNext
- Complex agentic AI in MVP
- Auto-sending any message or payment action without user confirmation
