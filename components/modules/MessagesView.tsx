'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2,
  XCircle,
  Send,
  Sparkles,
  MessageCircle,
  Clock,
} from 'lucide-react'
import { generateDraftMessage, sendMessage } from '@/actions/messages'
import { DRAFT_TYPES } from '@/lib/claude'
import { Avatar } from '@/components/modules/Avatar'
import type { Client, MessageLog, DraftType } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MessagesViewProps {
  client:       Client
  messages:     MessageLog[]
  /** Pre-selected draft type from URL query param (e.g. ?type=invoice). */
  initialType?: string
  /** Pre-associated invoice ID from URL query param (e.g. ?invoiceId=SINV-001). */
  invoiceId?:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>(DRAFT_TYPES.map(d => d.type))

function toValidType(raw: string | undefined): DraftType {
  if (raw && VALID_TYPES.has(raw)) return raw as DraftType
  return 'invoice'
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month:  'short',
      day:    'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageHistoryItem({ msg }: { msg: MessageLog }) {
  const sent = msg.status === 'sent'
  return (
    <div
      className="rounded-2xl border p-4 space-y-2"
      style={{
        backgroundColor: sent
          ? 'rgba(78,203,160,0.06)'
          : 'rgba(232,92,106,0.06)',
        borderColor: sent
          ? 'rgba(78,203,160,0.2)'
          : 'rgba(232,92,106,0.2)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {sent ? (
            <CheckCircle2
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--fd-green)' }}
            />
          ) : (
            <XCircle
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--fd-red)' }}
            />
          )}
          <span
            className="text-xs font-semibold capitalize"
            style={{ color: sent ? 'var(--fd-green)' : 'var(--fd-red)' }}
          >
            {sent ? 'Sent' : 'Failed'}
          </span>
          <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>
            · {msg.messageType.replace('_', ' ')}
          </span>
        </div>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fd-muted)' }}>
          <Clock className="h-3 w-3" />
          {formatTime(msg.sentAt)}
        </span>
      </div>

      <p
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: 'var(--fd-text)' }}
      >
        {msg.body}
      </p>

      {!sent && msg.errorDetail && (
        <p className="text-xs" style={{ color: 'var(--fd-red)' }}>
          {msg.errorDetail}
        </p>
      )}
    </div>
  )
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center gap-2 py-8">
      <MessageCircle
        className="h-8 w-8 opacity-30"
        style={{ color: 'var(--fd-muted)' }}
      />
      <p className="text-sm text-center" style={{ color: 'var(--fd-muted)' }}>
        No messages sent yet.
        <br />
        Generate a draft and send it below.
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MessagesView({
  client,
  messages:  initialMessages,
  initialType,
  invoiceId,
}: MessagesViewProps) {
  const router = useRouter()

  const [selectedType, setSelectedType] = useState<DraftType>(
    toValidType(initialType),
  )
  const [draftBody,    setDraftBody]    = useState('')
  const [sentMessages, setSentMessages] = useState<MessageLog[]>(initialMessages)

  const [isGenerating, startGenerate] = useTransition()
  const [isSending,    startSend]     = useTransition()

  const busy = isGenerating || isSending

  // ── Generate ──────────────────────────────────────────────────────────────

  function handleGenerate() {
    startGenerate(async () => {
      const result = await generateDraftMessage(selectedType, client.id, invoiceId)
      if (result.success) {
        setDraftBody(result.data)
        toast.success('Draft ready — review before sending')
      } else {
        toast.error(result.error)
      }
    })
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  function handleSend() {
    if (!draftBody.trim()) return

    // Financial messages need explicit confirmation before sending
    const isFinancial = selectedType === 'invoice' || selectedType === 'reminder'
    if (
      isFinancial &&
      !window.confirm(
        `Send this ${selectedType} message to ${client.name} via WhatsApp?\n\n"${draftBody.slice(0, 120)}${draftBody.length > 120 ? '…' : ''}"`,
      )
    ) {
      return
    }

    startSend(async () => {
      const result = await sendMessage({
        clientId:    client.id,
        phone:       client.phone,
        body:        draftBody,
        messageType: selectedType,
        invoiceId,
      })

      if (result.success) {
        toast.success('Message sent via WhatsApp')
        setSentMessages(prev => [result.data, ...prev])
        setDraftBody('')
        router.refresh()
      } else {
        // Log the failed attempt in the history so the trainer can see it
        const failedLog: MessageLog = {
          trainerId:   'unknown',
          clientId:    client.id,
          messageType: selectedType,
          body:        draftBody,
          status:      'failed',
          errorDetail: result.error,
          sentAt:      new Date().toISOString(),
        }
        setSentMessages(prev => [failedLog, ...prev])
        toast.error(result.error)
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-4 pb-24">

      {/* Client header */}
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <Avatar name={client.name} size="lg" />
        <div className="min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--fd-text)' }}>
            {client.name}
          </p>
          <p className="text-sm" style={{ color: 'var(--fd-muted)' }}>
            {client.phone || 'No phone number'}
          </p>
        </div>
      </div>

      {/* Composer ────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
          Compose Message
        </p>

        {/* Type selector pills */}
        <div className="flex flex-wrap gap-2">
          {DRAFT_TYPES.map(({ type, label }) => {
            const active = selectedType === type
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                disabled={busy}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                style={
                  active
                    ? { backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }
                    : {
                        backgroundColor: 'rgba(138,143,168,0.10)',
                        color: 'var(--fd-muted)',
                      }
                }
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Selected type description */}
        <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
          {DRAFT_TYPES.find(d => d.type === selectedType)?.description}
        </p>

        {/* Draft textarea */}
        <textarea
          rows={5}
          value={draftBody}
          onChange={e => setDraftBody(e.target.value)}
          placeholder="Tap Generate to draft a message, or type your own…"
          disabled={busy}
          className="w-full resize-none rounded-xl border bg-transparent p-3 text-sm outline-none transition-opacity placeholder:opacity-50 disabled:opacity-50"
          style={{
            borderColor: 'var(--fd-border)',
            color: 'var(--fd-text)',
          }}
        />

        {/* Character count */}
        {draftBody.length > 0 && (
          <p
            className="text-right text-xs"
            style={{ color: draftBody.length > 1000 ? 'var(--fd-red)' : 'var(--fd-muted)' }}
          >
            {draftBody.length} chars
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-text)' }}
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>

          <button
            onClick={handleSend}
            disabled={busy || !draftBody.trim() || !client.phone}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending…' : 'Send via WhatsApp'}
          </button>
        </div>

        {!client.phone && (
          <p className="text-xs text-center" style={{ color: 'var(--fd-red)' }}>
            No phone number on file — add one to the client profile before sending.
          </p>
        )}
      </div>

      {/* Message history ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fd-muted)' }}>
          Sent Messages
        </p>

        {sentMessages.length === 0 ? (
          <EmptyHistory />
        ) : (
          sentMessages.map((msg, i) => (
            <MessageHistoryItem key={msg.id ?? msg.sentAt + i} msg={msg} />
          ))
        )}
      </div>
    </div>
  )
}
