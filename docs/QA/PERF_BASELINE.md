# Performance Baseline

**Captured:** 2026-05-09 on local docker stack (axis-local) against tenant `phase-264-fitdesk-repeat-2`.
**Stack state:** all 17 containers healthy, FitDesk container fresh after Phase 5.0.6 rebuild, no contention.
**Scripts:** `scripts/smoke/health-latency.mjs`, `scripts/smoke/erp-roundtrip.mjs`.

## Baseline numbers

### `/api/health` latency (20 samples, host → fitdesk container)

| Metric | Value |
|---|---|
| min | 4.2 ms |
| p50 | 4.8 ms |
| p95 | 5.6 ms |
| max | 8.4 ms |
| Failures | 0 / 20 |

### ERP roundtrip (FitDesk → CP → ERP, single sequential pass, container-internal network)

| Call | ms | Result |
|---|---:|---|
| Customer list | 92.7 | 200, empty array |
| Sales Invoice list | 34.8 | 200, empty array |
| FD Session list | 19.1 | 200, empty array |
| Trainer Settings (singleton) | 33.4 | 200, doc returned |
| Session Type list | 16.5 | 200, 4 items |
| **Total wall-clock** | **196.5** | 5/5 successful |

The first-call cold start (Customer list at 92.7 ms) is consistent with Frappe site warm-up. Subsequent calls settle around 15–35 ms.

## Targets (pilot baseline)

These are SLO-style targets for the pilot. Breach → file an issue, don't auto-page.

| Target | Threshold | Notes |
|---|---|---|
| `/api/health` p95 | ≤ 50 ms | Cheap endpoint; comfortable margin over current p95 of 5.6 ms |
| Dashboard render (server-side data fetch) p95 | ≤ 1500 ms | Includes 3 ERP calls (clients + sessions + invoices) + render. Current single-pass total of 196 ms suggests we have headroom. Re-measure after live data accumulates. |
| ERP single-call p95 | ≤ 250 ms | Frappe REST is the long pole; sub-100 ms typical for empty lists. |

## Frappe rate limiting

Default Frappe rate limit is **60 requests/minute per IP** (configurable per-site). The Control Plane proxies all FitDesk → ERP calls, so all FitDesk traffic appears as a single source IP from Frappe's perspective. With ~5 ERP calls per dashboard render, the practical ceiling is **~12 dashboard renders per minute per FitDesk container**.

Mitigations to consider before pilot scale:
- Per-tenant request batching at the CP layer
- Lifting Frappe rate limit per FitDesk-mediated call source (requires `bench-agent` config)
- React.cache deduplication within a single render pass (already done in Phase 4.0.3 for TrainerConfig)

## Re-running

After deployment changes that could affect perf:

```bash
# Health endpoint (host)
node scripts/smoke/health-latency.mjs

# ERP roundtrip (must run inside fitdesk container for env access)
docker cp scripts/smoke/erp-roundtrip.mjs axis-local-fitdesk-1:/tmp/
docker exec axis-local-fitdesk-1 node /tmp/erp-roundtrip.mjs
```

Append observed numbers to "Historical runs" below.

## Historical runs

| Date | Health p95 (ms) | ERP total (ms) | Notes |
|---|---:|---:|---|
| 2026-05-09 | 5.6 | 196.5 | Baseline. Empty tenant data. |

## Out-of-scope for this baseline

- Sustained load (we ran a single pass)
- Concurrent renders
- Real-data-volume scenarios (pilot tenant currently has 0 clients/invoices/sessions)
- Authenticated dashboard page render (would require a logged-in browser session — manual QA covers this)
