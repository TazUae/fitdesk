'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateBufferMinutes } from '@/actions/trainerSettings'

const PRESETS = [0, 10, 15, 30] as const
type Preset = (typeof PRESETS)[number]

const DEFAULT_BUFFER = 15

function isPreset(value: number): value is Preset {
  return (PRESETS as readonly number[]).includes(value)
}

interface Props {
  initialBuffer: number | null
}

export function BufferTimeEditor({ initialBuffer }: Props) {
  const router = useRouter()
  const baseline = initialBuffer ?? DEFAULT_BUFFER
  const [value, setValue] = useState(baseline)
  const [customInput, setCustomInput] = useState(
    !isPreset(baseline) ? String(baseline) : '',
  )
  const [mode, setMode] = useState<Preset | 'custom'>(
    isPreset(baseline) ? baseline : 'custom',
  )
  const [pending, startTransition] = useTransition()

  const dirty = value !== baseline

  function selectPreset(preset: Preset) {
    setMode(preset)
    setValue(preset)
  }

  function selectCustom() {
    setMode('custom')
    const parsed = parseInt(customInput, 10)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 120) {
      setValue(parsed)
    }
  }

  function onCustomChange(raw: string) {
    setCustomInput(raw)
    const parsed = parseInt(raw, 10)
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 120) {
      setValue(parsed)
    }
  }

  function save() {
    if (!Number.isInteger(value) || value < 0 || value > 120) {
      toast.error('Buffer must be a whole number between 0 and 120 minutes.')
      return
    }

    startTransition(async () => {
      const result = await updateBufferMinutes(value)
      if (result.success) {
        toast.success('Buffer time saved')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs" style={{ color: 'var(--fd-muted)' }}>
        Minimum time between sessions
      </p>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map(preset => {
          const active = mode === preset
          return (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              disabled={pending}
              aria-pressed={active}
              className="min-w-[3.5rem] rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{
                backgroundColor: active ? 'var(--fd-accent)' : 'var(--fd-card)',
                color:           active ? 'var(--fd-bg)'     : 'var(--fd-muted)',
                border: active ? 'none' : '1px solid var(--fd-border)',
              }}
            >
              {preset === 0 ? 'None' : `${preset} min`}
            </button>
          )
        })}

        <button
          type="button"
          onClick={selectCustom}
          disabled={pending}
          aria-pressed={mode === 'custom'}
          className="min-w-[3.5rem] rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: mode === 'custom' ? 'var(--fd-accent)' : 'var(--fd-card)',
            color:           mode === 'custom' ? 'var(--fd-bg)'     : 'var(--fd-muted)',
            border: mode === 'custom' ? 'none' : '1px solid var(--fd-border)',
          }}
        >
          Custom
        </button>
      </div>

      {mode === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={120}
            step={1}
            value={customInput}
            onChange={e => onCustomChange(e.target.value)}
            disabled={pending}
            placeholder="0–120"
            className="w-24 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--fd-border)', color: 'var(--fd-text)' }}
          />
          <span className="text-xs" style={{ color: 'var(--fd-muted)' }}>minutes</span>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending || !dirty}
        className="rounded-xl px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-40"
        style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-bg)' }}
      >
        {pending ? 'Saving…' : 'Save buffer time'}
      </button>
    </div>
  )
}
