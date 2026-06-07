interface Props {
  greeting:  string
  firstName: string
  /** Pre-built status line from buildHeaderStatus(). */
  status:    string
  today:     string
}

function formatTodayLabel(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday:  'long',
    month:    'long',
    day:      'numeric',
  })
}

export function TodayHero({ greeting, firstName, status, today }: Props) {
  return (
    <div className="px-0.5 pb-1">
      {/* Date kicker */}
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.09em]"
        style={{ color: 'var(--fd-muted)' }}
      >
        {formatTodayLabel(today)}
      </p>

      {/* Greeting */}
      <h2
        className="mt-1 text-xl font-bold leading-tight lg:text-2xl"
        style={{ color: 'var(--fd-text)' }}
      >
        {greeting}, {firstName}
      </h2>

      {/* Status line */}
      <p
        className="mt-0.5 text-sm"
        style={{ color: 'var(--fd-muted)' }}
      >
        {status}
      </p>
    </div>
  )
}
