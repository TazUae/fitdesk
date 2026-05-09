# Screenshot Template

For each row in `REGRESSION_MATRIX.md` that warrants visual evidence, capture using this template.

## File naming

```
docs/QA/EVIDENCE_YYYY-MM-DD/<row-number>_<short-name>.png
```

Examples:
- `docs/QA/EVIDENCE_2026-05-09/02_dashboard-initial-render.png`
- `docs/QA/EVIDENCE_2026-05-09/22_pilot-allowlist-block.png`

## Capture conventions

- **Device width:** 375px (mobile profile in Chrome DevTools) for primary captures
- **Browser zoom:** 100%
- **DevTools:** closed for the screenshot
- **Cursor:** out of frame
- **Sensitive data:** mask phone numbers (last 4 visible at most), full names (first name + initial), and any payment values that aren't synthetic test data
- **Timestamps:** include the system clock visible in screenshots (proves "this was today")

## What to capture per row

### Dashboard / list rows
- Full visible viewport
- The specific element being tested with the cursor or arrow visible (annotate in MS Paint or Skitch — keep it minimal)

### Form rows
- 2 captures: empty form + after-submit success state

### Toast / dialog rows
- 1 capture mid-dialog with the dialog text legible

### API rows (curl)
- Capture the terminal: command + first 5 lines of response
- Mask any auth header values (use HIDDEN)

### Error/empty state rows
- Capture the entire mobile viewport showing the ErrorState/EmptyState component
- Include the URL bar so the route is verifiable

## Bundling

After execution:

```bash
cd docs/QA
tar czf EVIDENCE_$(date +%F).tar.gz EVIDENCE_$(date +%F)/
```

Attach the tarball to the PILOT_LAUNCH_CHECKLIST.md sign-off ticket.

## Retention

- Last 3 evidence runs kept in-repo
- Older runs archived to backup storage (named operator)
