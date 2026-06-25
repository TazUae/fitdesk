// Pure slug generation — no framework dependencies.
// Used by the Start Workspace server action and the client-side live preview.

const MAX_SLUG_LENGTH = 48

export function slugifyWorkspaceName(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')   // collapse non-alphanumeric runs to a single hyphen
    .replace(/-{2,}/g, '-')         // defensive: collapse any repeated hyphens
    .replace(/^-+|-+$/g, '')        // strip leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')             // re-strip if the length cap landed on a hyphen

  return slug || 'workspace'
}
