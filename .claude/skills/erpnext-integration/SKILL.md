---
name: erpnext-integration
description: Use when building or modifying ERPNext/Frappe integrations, server-side adapters, DocType mappings, or any business data access layer.
---

# ERPNext / Frappe Integration Skill

ERPNext is the single source of truth for all FitDesk business data. This skill governs how Claude approaches any work touching ERPNext.

---

## Core Rules

- Never call ERPNext directly from a client component
- All ERPNext calls must go through server actions or route handlers
- Preserve and respect ERPNext business logic — do not shortcut it
- Always normalize ERPNext responses into typed app-level objects before returning to the UI
- Keep all ERP credentials and API tokens server-side only

---

## DocType Mappings

| App Entity | ERPNext DocType               |
|------------|-------------------------------|
| Client     | Contact or custom Client      |
| Session    | Custom Session DocType        |
| Invoice    | Sales Invoice                 |
| Payment    | Payment Entry                 |

---

## Adapter Pattern

Build typed adapter functions that encapsulate ERP access:

```ts
// Example shape — adapt to actual ERPNext API client used
export async function getClientById(id: string): Promise<Client> {
  const raw = await erpFetch(`/api/resource/Client/${id}`)
  return normalizeClient(raw)
}
```

- One adapter per entity (clients, sessions, invoices, payments)
- Keep transformation/normalization logic in a separate mapper layer
- Return clean, minimal app-level types — not raw ERP payloads
- Never return raw ERP field names (e.g., `docstatus`, `modified_by`) to the UI unless explicitly needed

---

## Error Handling

- Catch ERP-level errors and convert them to typed app errors
- Do not let raw Frappe error messages surface to the UI
- Log ERP errors with: timestamp, action, ERP endpoint, error detail

```ts
type ERPError = {
  source: 'erpnext'
  action: string
  message: string
  timestamp: string
}
```

---

## Validation

- Validate all ERP response payloads before mapping (type guards or zod)
- If a response shape is unexpected, throw a typed error — never silently pass through malformed data

---

## What to Avoid

- Direct `fetch` to ERPNext from any client component
- Storing financial totals, invoice statuses, or payment records outside ERPNext
- Unvalidated or untyped ERP payloads entering the UI layer
- Bypassing ERPNext workflows for financial records
