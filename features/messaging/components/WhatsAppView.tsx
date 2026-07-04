'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Wifi,
  WifiOff,
  QrCode,
  RefreshCw,
  Unplug,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import {
  connectWhatsApp,
  refreshWhatsAppQr,
  pollWhatsAppStatus,
  disconnectWhatsApp,
  reconnectWhatsApp,
} from '@/actions/whatsapp'
import type { WhatsAppConnection, WhatsAppConnectionStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatsAppViewProps {
  initial: WhatsAppConnection | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: WhatsAppConnectionStatus): string {
  switch (status) {
    case 'connected':    return 'Connected'
    case 'pairing':      return 'Waiting for scan…'
    case 'disconnected': return 'Disconnected'
    case 'error':        return 'Error'
    case 'not_connected': return 'Not connected'
  }
}

function statusColor(status: WhatsAppConnectionStatus): string {
  switch (status) {
    case 'connected':    return 'var(--fd-green)'
    case 'pairing':      return 'var(--fd-accent)'
    case 'disconnected': return 'var(--fd-muted)'
    case 'error':        return 'var(--fd-red)'
    case 'not_connected': return 'var(--fd-muted)'
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WhatsAppConnectionStatus }) {
  const color = statusColor(status)
  const Icon =
    status === 'connected'    ? CheckCircle2 :
    status === 'pairing'      ? Loader2      :
    status === 'error'        ? AlertCircle  :
    WifiOff

  return (
    <div className="flex items-center gap-2">
      <Icon
        className={`h-4 w-4 ${status === 'pairing' ? 'animate-spin' : ''}`}
        style={{ color }}
      />
      <span className="text-sm font-semibold" style={{ color }}>
        {statusLabel(status)}
      </span>
    </div>
  )
}

// ─── QR panel ─────────────────────────────────────────────────────────────────

function QrPanel({
  qrCode,
  pairingCode,
  onRefresh,
  busy,
}: {
  qrCode?: string
  pairingCode?: string
  onRefresh: () => void
  busy: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      {qrCode ? (
        <div
          className="rounded-2xl border p-3 bg-white"
          style={{ borderColor: 'var(--fd-border)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCode}
            alt="WhatsApp QR code"
            width={220}
            height={220}
            className="block rounded-xl"
          />
        </div>
      ) : (
        <div
          className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
        >
          <QrCode className="h-16 w-16 opacity-20" style={{ color: 'var(--fd-muted)' }} />
        </div>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--fd-muted)' }}>
        Open WhatsApp → Settings → Linked Devices → Link a Device
      </p>

      {pairingCode && (
        <div
          className="rounded-xl border px-4 py-2 text-center"
          style={{ borderColor: 'var(--fd-border)', backgroundColor: 'var(--fd-card)' }}
        >
          <p className="text-xs mb-1" style={{ color: 'var(--fd-muted)' }}>Pairing code</p>
          <p className="text-lg font-bold tracking-widest" style={{ color: 'var(--fd-text)' }}>
            {pairingCode}
          </p>
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-text)' }}
      >
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        Refresh QR
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WhatsAppView({ initial }: WhatsAppViewProps) {
  const [conn, setConn] = useState<WhatsAppConnection | null>(initial)
  const [isPending, startTransition] = useTransition()

  const status: WhatsAppConnectionStatus = conn?.status ?? 'not_connected'

  // ── Auto-poll while pairing ──────────────────────────────────────────────
  const poll = useCallback(() => {
    startTransition(async () => {
      const result = await pollWhatsAppStatus()
      if (result.success) {
        setConn(result.data)
        if (result.data.status === 'connected') {
          toast.success('WhatsApp connected!')
        }
      }
    })
  }, [])

  useEffect(() => {
    if (status !== 'pairing') return
    const id = setInterval(poll, 4000)
    return () => clearInterval(id)
  }, [status, poll])

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleConnect() {
    startTransition(async () => {
      const result = await connectWhatsApp()
      if (result.success) {
        setConn(result.data)
        toast.success('QR ready — scan with WhatsApp')
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRefreshQr() {
    startTransition(async () => {
      const result = await refreshWhatsAppQr()
      if (result.success) {
        setConn(result.data)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleDisconnect() {
    if (!window.confirm('Disconnect WhatsApp? You will need to scan a new QR code to reconnect.')) return
    startTransition(async () => {
      const result = await disconnectWhatsApp()
      if (result.success) {
        setConn(result.data)
        toast.success('WhatsApp disconnected')
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleReconnect() {
    if (!window.confirm('This will delete the current instance and create a new QR code. Continue?')) return
    startTransition(async () => {
      const result = await reconnectWhatsApp()
      if (result.success) {
        setConn(result.data)
        toast.success('New QR ready — scan with WhatsApp')
      } else {
        toast.error(result.error)
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const busy = isPending

  return (
    <div className="flex flex-col gap-6 p-4">

      {/* Status card */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" style={{ color: 'var(--fd-accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--fd-text)' }}>
              WhatsApp
            </span>
          </div>
          <StatusBadge status={status} />
        </div>

        {conn?.phoneNumber && (
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4" style={{ color: 'var(--fd-green)' }} />
            <span className="text-sm" style={{ color: 'var(--fd-text)' }}>
              {conn.displayName ? `${conn.displayName} · ` : ''}{conn.phoneNumber}
            </span>
          </div>
        )}

        {conn?.lastError && status === 'error' && (
          <p className="text-xs rounded-xl border px-3 py-2" style={{ color: 'var(--fd-red)', borderColor: 'rgba(232,92,106,0.2)', backgroundColor: 'rgba(232,92,106,0.06)' }}>
            {conn.lastError}
          </p>
        )}
      </div>

      {/* QR panel — shown while pairing */}
      {status === 'pairing' && (
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: 'var(--fd-surface)', borderColor: 'var(--fd-border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--fd-muted)' }}>
            Scan QR Code
          </p>
          <QrPanel
            qrCode={conn?.qrCode}
            pairingCode={conn?.pairingCode}
            onRefresh={handleRefreshQr}
            busy={busy}
          />
        </div>
      )}

      {/* Connected info */}
      {status === 'connected' && (
        <div
          className="rounded-2xl border p-4 space-y-2"
          style={{ backgroundColor: 'rgba(78,203,160,0.06)', borderColor: 'rgba(78,203,160,0.2)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--fd-green)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--fd-green)' }}>
              Ready to send messages
            </span>
          </div>
          {conn?.lastConnectedAt && (
            <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
              Connected {new Date(conn.lastConnectedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        {(status === 'not_connected' || status === 'disconnected') && (
          <button
            onClick={handleConnect}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            {busy ? 'Connecting…' : 'Connect WhatsApp'}
          </button>
        )}

        {status === 'connected' && (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(232,92,106,0.12)', color: 'var(--fd-red)' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}
            {busy ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}

        {(status === 'error' || status === 'disconnected' || status === 'pairing') && (
          <button
            onClick={handleReconnect}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'rgba(138,143,168,0.12)', color: 'var(--fd-text)' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            {busy ? 'Reconnecting…' : 'Reconnect (new QR)'}
          </button>
        )}
      </div>

      {/* Instance info */}
      {conn?.instanceName && (
        <p className="text-xs text-center" style={{ color: 'var(--fd-muted)' }}>
          Instance: {conn.instanceName}
        </p>
      )}
    </div>
  )
}
