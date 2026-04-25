import { cn } from '@/lib/utils'

// ─── Stable colour palette ────────────────────────────────────────────────────
// Each colour is chosen to be legible on the dark background.

const COLORS = [
  '#E8C547', // gold   (accent)
  '#4ECBA0', // green
  '#5B9CF6', // blue
  '#E85C6A', // red
  '#A78BFA', // purple
  '#F97316', // orange
  '#06B6D4', // cyan
  '#EC4899', // pink
] as const

/**
 * djb2 hash — fast, deterministic, good distribution for short strings.
 * Returns a stable index into COLORS for a given name.
 */
function nameToColorIndex(name: string): number {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash) ^ name.charCodeAt(i)
    hash = hash >>> 0 // keep unsigned 32-bit
  }
  return hash % COLORS.length
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Sizes ────────────────────────────────────────────────────────────────────

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-20 w-20 text-2xl',
} as const

// ─── Component ────────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name)
  const color = COLORS[nameToColorIndex(name)]

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold',
        SIZE_CLASSES[size],
        className,
      )}
      style={{
        // Subtle tinted background derived from the accent colour
        backgroundColor: `${color}22`,
        color,
      }}
      aria-label={name}
    >
      {initials}
    </div>
  )
}
