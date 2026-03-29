---
name: better-auth
description: Use when implementing login flows, session management, protected routes, or the user-to-trainer mapping with Better Auth.
---

# Better Auth Skill

Better Auth is the only frontend auth system for FitDesk. This skill governs all authentication and session work.

---

## Core Rules

- Better Auth is the sole auth system — do not use ERPNext auth for frontend users
- Supported methods: email/password and Google OAuth
- All auth secrets (client secrets, session signing keys) must remain server-side only
- Every authenticated user must map to exactly one Trainer record in ERPNext
- Protect all app routes with server-side session validation
- Never expose session tokens, auth tokens, or user credentials to client components

---

## Supported Auth Methods

| Method         | Status      |
|----------------|-------------|
| Email/Password | Required    |
| Google Sign-In | Required    |
| ERPNext Auth   | Never use   |

---

## Session & User Helpers

Create typed server-side helpers for auth state:

```ts
// Return the current session or null
export async function getCurrentSession(): Promise<Session | null>

// Return the current trainer record or throw if unauthenticated
export async function requireTrainer(): Promise<Trainer>
```

- Keep these helpers thin — they should not contain business logic
- Use them in every server action and route handler that touches protected data

---

## User-to-Trainer Mapping

- On first sign-in or sign-up, resolve the authenticated user to a Trainer record in ERPNext
- Store the mapping (Better Auth user ID → ERPNext Trainer ID) in a lightweight server-side store or as a Better Auth user metadata field
- The mapping must be explicit and auditable — never inferred at runtime without a clear lookup

---

## Route Protection Pattern

```ts
// In a server action or page component
const trainer = await requireTrainer()
// proceed with trainer.id to scope all data queries
```

- Never rely on client-side auth state for security decisions
- Always validate the session server-side before accessing any business data

---

## What to Avoid

- Using ERPNext session cookies or API keys as the auth mechanism for the Next.js app
- Mixing auth state into UI business logic
- Exposing any auth secret, token, or signing key to the browser
- Ambiguous or implicit user-to-trainer mapping logic
- Relying on client-side session state for data access control
