# Cron Jobs Reference

> All scheduled background jobs running on Vercel Cron. Each job is a Next.js API route invoked automatically.

**Configuration:** `vercel.json` (crons array)
**Auth:** All cron routes require `Authorization: Bearer ${CRON_SECRET}` header
**Middleware:** All `/api/cron/*` routes bypass session auth (see `middleware.ts`)

---

## Schedule Overview

| Job | Route | Schedule | Frequency | Timeout |
|-----|-------|----------|-----------|---------|
| [Visitor Sync](#1-visitor-sync) | `/api/cron/fetch-visitors` | `0 * * * *` | Hourly | 300s |
| [Klaviyo Events](#2-klaviyo-events) | `/api/cron/push-klaviyo-events` | `*/30 * * * *` | Every 30 min | 300s |
| [LinkedIn Drip](#3-linkedin-drip) | `/api/cron/linkedin-drip` | `*/30 * * * *` | Every 30 min | 300s |
| [RingCentral SMS](#4-ringcentral-sms) | `/api/cron/ringcentral-sms` | `*/10 * * * *` | Every 10 min | 300s |

---

## 1. Visitor Sync

**File:** `src/pages/api/cron/fetch-visitors.ts`
**Engine:** `src/lib/visitors-api-fetcher.ts`
**Schedule:** Hourly (`0 * * * *`)

### What it does

Syncs visitor data from the AudienceLab API into the `visitors` table for all active pixels.

### Processing Logic

1. **Fetch pixels** -- Queries all pixels with `status='active'` AND `visitors_api_url IS NOT NULL`, paginated to handle 1000+ pixels
2. **Interleave by user** -- Round-robin ordering ensures each user gets one pixel processed before any user gets a second (prevents multi-pixel users from starving others)
3. **Priority ordering** -- Within each user, pixels are sorted by `visitors_api_last_fetched_at` ascending (oldest first, never-synced first)
4. **Timeout guard** -- Stops processing at 270s (4.5 min), leaving 30s buffer before Vercel's 300s hard limit
5. **Per-pixel processing:**
   - Fetch all pages from AudienceLab API (batches of 2 pages, with retry on 429)
   - Group contacts by UUID/EDID, aggregate events (pageviews, clicks, form submissions, scroll depth)
   - Calculate lead score (base 15, +2/pageview, +3/click, +10/form, etc., max 100)
   - Split into new inserts vs existing updates
   - Batch insert (200/batch), batch update (50/batch parallel)
   - Update pixel `visitors_api_last_fetched_at` and `visitors_api_last_fetch_status`
   - Auto-sync new visitors to Klaviyo if integration is configured
6. **Log result** to `system_logs` table

### Multi-Pixel Fairness

Users can have multiple pixels. The interleave algorithm ensures fair processing:

```
Example: User A has 5 pixels, User B has 2 pixels, User C has 1 pixel

Processing order: B[1], A[1], C[1], B[2], A[2], A[3], A[4], A[5]

If timeout hits at pixel 4, next run prioritizes: A[3], A[4], A[5]
(because their timestamps are oldest)
```

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| AudienceLab API down (5xx) | No new visitors synced | Automatic retry next hour |
| Rate limited (429) | Exponential backoff (2s, 4s, 8s), then skip | Retried next hour |
| Timeout (>270s) | Remaining pixels skipped | Skipped pixels prioritized next run |
| DB insert error | Error logged, other pixels continue | Check `system_logs` for details |
| No API key | All pixels fail with "No API key configured" | Add key in Settings |

### System Log Events

| Event Name | Status | When |
|------------|--------|------|
| `visitors_api_sync` | `success` | Pixel sync completed |
| `visitors_api_sync` | `error` | Pixel sync failed |
| `klaviyo_auto_sync_visitors` | `success` | New visitors auto-synced to Klaviyo |

### Monitoring

- **System Logs page:** Filter by event `visitors_api_sync` to see per-pixel results
- **Pixel detail page:** Check `visitors_api_last_fetched_at` and `visitors_api_last_fetch_status`
- **Vercel dashboard:** Check cron execution logs for timeout/crash errors

---

## 2. Klaviyo Events

**File:** `src/pages/api/cron/push-klaviyo-events.ts`
**Schedule:** Every 30 minutes (`*/30 * * * *`)

### What it does

For each connected Klaviyo integration, performs two operations:

1. **Auto-sync visitors to list** -- If `auto_sync_visitors=true` and `default_list_id` is set, syncs new/updated visitors to the configured Klaviyo list (incremental, using `last_synced_at`)
2. **Auto-push events** -- If `auto_push_events=true`, pushes enabled event types to Klaviyo

### Config Schema (in `platform_integrations.config`)

```json
{
  "auto_sync_visitors": true,
  "default_list_id": "KlaviyoListId",
  "auto_sync_pixel_id": "optional-specific-pixel-id",
  "auto_push_events": true,
  "push_events_enabled": {
    "high_intent": true,
    "price_sensitive": true,
    "returning_visitor": false
  }
}
```

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Klaviyo API error | Events not pushed for that user | Retried next 30-min run |
| Invalid API key | Sync fails, error logged | User must reconnect Klaviyo |

### System Log Events

| Event Name | Status | When |
|------------|--------|------|
| `klaviyo_auto_sync_visitors` | `success` / `error` | Visitor list sync result |
| `klaviyo_auto_push_events` | `success` / `error` | Event push result |

---

## 3. LinkedIn Drip

**File:** `src/pages/api/cron/linkedin-drip.ts`
**Schedule:** Every 30 minutes (`*/30 * * * *`)
**Status:** Monitoring only -- actual sending requires Chrome extension

### What it does

Monitors active LinkedIn campaigns and enforces scheduling rules:

1. Fetch all campaigns with `status='active'`
2. For each campaign:
   - Verify user has active LinkedIn integration
   - Check if current time is within `operating_hours_start` / `operating_hours_end` (timezone-aware)
   - Count `linkedin_campaign_contacts` sent today vs `daily_limit`
   - Report status: `ready_to_send_awaiting_integration` / `outside_operating_hours` / `daily_limit_reached`

### Important

This cron does NOT send connection requests. Actual sending requires the Chrome extension (`chrome-extension/` directory) which runs in the user's browser. This cron only validates scheduling constraints.

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Invalid timezone | Campaign skipped (returns false) | Fix timezone in campaign settings |
| No LinkedIn integration | Campaign marked `skipped_inactive_account` | User must connect LinkedIn |

---

## 4. RingCentral SMS

**File:** `src/pages/api/cron/ringcentral-sms.ts`
**Schedule:** Every 10 minutes (`*/10 * * * *`)

### What it does

Sends automated SMS messages to new website visitors via RingCentral:

1. Fetch all users with active RingCentral integration
2. For each user:
   - Refresh OAuth token if expired
   - Fetch active SMS templates (`ringcentral_sms_templates`)
   - For each template:
     - Check time window (template schedule)
     - Query new visitors from last 30 minutes matching the template's pixel
     - Apply filters: `min_lead_score`, dedup (no duplicate text same day), `frequency_cap_hours`
     - Extract phone from visitor `metadata` / `enrichment_data`
     - Substitute template variables (`{{first_name}}`, `{{company}}`, etc.)
     - Send SMS via RingCentral API
     - Log result to `ringcentral_sms_log`
   - Rate limit: 1.2s delay between sends (~50 SMS/min)

### Safety Guards

| Guard | Description |
|-------|-------------|
| Time window | Template only runs during configured hours |
| Dedup | Same visitor not texted twice in one day (per pixel) |
| Frequency cap | Respects `frequency_cap_hours` between texts to same visitor |
| Lead score | Only texts visitors above `min_lead_score` threshold |
| Batch limit | Max 100 visitors per template per run |
| Rate limit | 1.2s delay between SMS sends |

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Token expired | `refreshRCTokenIfNeeded` auto-refreshes | Automatic |
| Token refresh fails | All SMS for that user skipped | User must reconnect RingCentral |
| SMS send fails | Logged to `ringcentral_sms_log` with `status='failed'` | Check log for error |
| No phone number | Visitor skipped (counted in `skipped`) | Expected behavior |

---

## Adding a New Cron Job

Follow this checklist when adding a new cron job:

1. **Create the handler** at `src/pages/api/cron/<name>.ts`
2. **Add cron secret verification:**
   ```typescript
   const authHeader = req.headers.authorization;
   if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```
3. **Set max duration:** `export const config = { maxDuration: 300 };`
4. **Add to `vercel.json`:**
   ```json
   { "path": "/api/cron/<name>", "schedule": "*/30 * * * *" }
   ```
5. **Add timeout guard** if processing multiple items (see fetch-visitors pattern)
6. **Log results** via `logEvent()` to `system_logs`
7. **Handle multi-user fairness** if iterating over users/resources
8. **Update this document** with the new job's details
9. **Test locally** with: `curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/<name>`
