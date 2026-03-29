import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind class names safely.
 * Combines clsx (conditionals, arrays) with tailwind-merge (deduplication).
 *
 * Usage: cn('px-4', isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
