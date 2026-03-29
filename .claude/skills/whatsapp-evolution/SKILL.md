---
name: whatsapp-evolution
description: Use when implementing WhatsApp message flows, Evolution API calls, message templates, delivery logging, or approval-gated messaging.
---

# Evolution API / WhatsApp Skill

Evolution API is an integration layer only. It is never a source of truth for business data. This skill governs all WhatsApp messaging work in FitDesk.

---

## Core Rules

- Never call Evolution API directly from a client component
- All message sending must happen server-side (server actions or route handlers)
- All messages must use defined templates — no ad-hoc freeform sends
- Every outgoing message must be logged with full context
- Sensitive financial messages require explicit user approval before sending
- Delivery failures must surface in the UI — never swallow them silently

---

## Supported Message Types

| Type                     | Trigger                          | Approval Required |
|--------------------------|----------------------------------|-------------------|
| Invoice send             | Trainer sends invoice            | Yes               |
| Payment reminder         | Trainer triggers reminder        | Yes               |
| Session reminder         | Scheduled or manual              | Optional          |
| Missed session follow-up | After session marked missed      | Optional          |

---

## Message Template Structure

All templates must be structured and reusable:

```ts
type MessageTemplate = {
  type: 'invoice_send' | 'payment_reminder' | 'session_reminder' | 'missed_session'
  recipientPhone: string
  variables: Record<string, string>
}

function renderTemplate(template: MessageTemplate): string {
  // combine type + variables into final message body
}
```

- Keep template definitions separate from sending logic
- Validate that all required variables are present before rendering

---

## Send Flow

```
1. Trainer triggers action in UI
2. Server action renders the message template
3. For approval-required messages: return rendered preview to UI
4. Trainer confirms → server action sends via Evolution API
5. Log result (success or failure) with full context
```

- Separate message creation from message delivery
- Never skip the approval step for financial messages in MVP

---

## Message Log Entry Shape

```ts
type MessageLog = {
  id: string
  trainerId: string
  clientId: string
  messageType: MessageTemplate['type']
  renderedBody: string
  status: 'sent' | 'failed' | 'pending'
  errorDetail?: string
  sentAt: string // ISO timestamp
}
```

---

## Error Handling

- Return a typed result from every send operation
- Log failures with error detail from the Evolution API response
- Surface failed sends to the trainer in the UI — do not silently retry without feedback

---

## What to Avoid

- Auto-sending invoice or payment messages without trainer confirmation
- Storing any business-critical state (payment status, session status) only in WhatsApp delivery results
- Client-side direct calls to Evolution API
- Freeform unstructured message content
- Swallowing delivery errors
