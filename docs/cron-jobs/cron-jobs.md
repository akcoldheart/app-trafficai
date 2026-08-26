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
| [Shopify Order Sync](#5-shopify-order-sync) | `/api/cron/sync-conversions` | `0 * * * *` | Hourly | 300s |
| [Reattribute Conversions](#6-reattribute-conversions) | `/api/cron/reattribute-conversions` | `0 3 * * *` | Daily @ 3am UTC | 300s |
| [Audience Import Worker](#7-audience-import-worker) | `/api/cron/process-audience-imports` | `* * * * *` | Every minute | 300s |
| [Chat Email Notifications](#8-chat-email-notifications) | `/api/cron/send-chat-notifications` | `* * * * *` | Every minute | 300s |

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
   - **ZeroBounce verification:** If ZeroBounce is connected and `auto_verify` is enabled, new visitor emails are verified before Klaviyo sync. Invalid emails are filtered out.
   - Auto-sync new visitors to Klaviyo if integration is configured (only verified-safe emails)
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
| `zerobounce_auto_verify` | `success` | Emails verified before Klaviyo sync |
| `zerobounce_low_credits` | `warning` | Insufficient ZeroBounce credits |

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

1. **Auto-sync visitors to list** -- If `auto_sync_visitors=true` and `default_list_id` is set, syncs new/updated visitors to the configured Klaviyo list (incremental, using `last_synced_at`). If ZeroBounce is connected with `verify_on_sync=true`, unverified emails are verified first and invalid emails are filtered out.
2. **Auto-push events** -- If `auto_push_events=true`, pushes enabled event types to Klaviyo. Invalid emails (per ZeroBounce status) are filtered out before sending events.

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

## 5. Shopify Order Sync

**File:** `src/pages/api/cron/sync-conversions.ts`
**Engine:** `src/lib/shopify-orders.ts`
**Auth:** `src/lib/shopify-auth.ts`
**Schedule:** Hourly (`0 * * * *`)

### What it does

Pulls orders from every connected Shopify integration that has an attribution pixel set, upserts them into `conversions`, and resolves attribution back to the visitor that triggered the order.

### Processing Logic

1. **Fetch integrations** -- All `platform_integrations` rows with `platform='shopify'` AND `is_connected=true`, paginated (1000/page)
2. **Build job list** -- One job per (user, pixel, shop_domain) tuple. Integrations without `orders_attribution_pixel_id` / `shop_domain` are skipped, as are those with neither `api_key` (legacy static token) nor `config.client_id` + `config.client_secret` (client credentials).
3. **Cross-tenant guard** -- A job is dropped if `pixel.user_id !== integration.user_id` (defence-in-depth against config drift)
4. **Interleave by user** -- Same round-robin pattern as `fetch-visitors`, sorted by `orders_last_fetched_at` ascending (oldest first)
5. **Timeout guard** -- Bail at 270s with 60s buffer for the in-flight Shopify call
6. **Per-job processing:**
   - 1.5s delay between jobs to be polite to Shopify
   - Resolve the access token via `getShopifyAccessToken` **inside** the per-job try block, so a merchant with revoked or misconfigured credentials fails only their own job. Client-credentials tokens live 24h and are minted here on demand.
   - Fetch up to 1000 orders since `pixel.orders_last_fetched_at`
   - For each order: `upsertConversionFromShopifyOrder` (inserts conversion, runs `resolveAttribution`)
   - Update `pixels.orders_last_fetched_at` to newest `updated_at`
   - Update `pixels.orders_last_fetch_status` (`success` / `partial: N errors` / `error: ...`)
   - Log a per-shop `shopify_orders_sync` event with `trigger='cron'`

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Shopify API down | Job marked `error: ...`, other jobs continue | Retried next hour |
| Client credentials revoked / app uninstalled | Token mint fails; that job marked `error: ...`, others continue | Merchant reconnects with fresh Client ID + Secret |
| App moved out of the store's Shopify organization | Token mint fails with a 400 | Client credentials grant requires app and store in the same org |
| Attribution pixel not set | Integration silently skipped | User must pick attribution pixel in Settings |
| Cross-tenant config drift | Job dropped before fetch | Manual fix to `platform_integrations.config` |
| Timeout (>270s) | Tail jobs skipped | `skipped_timeout` in response; ordering means stalest go first next run |

### System Log Events

| Event Name | Status | When |
|------------|--------|------|
| `shopify_orders_sync` | `success` / `warning` / `error` | Per-shop sync result |
| `sync_conversions` | `success` / `warning` / `error` | Overall cron summary |

---

## 6. Reattribute Conversions

**File:** `src/pages/api/cron/reattribute-conversions.ts`
**Engine:** `resolveAttribution` from `src/lib/shopify-orders.ts`
**Schedule:** Daily at 03:00 UTC (`0 3 * * *`)

### What it does

Re-runs attribution against the last 30 days of unmatched conversions. Catches late identifications — visitor orders Monday, gets identified Tuesday → this job retro-attributes on Wednesday's run.

### Processing Logic

1. **Window:** 30 days back, only rows where both `matched_visitor_id` and `matched_contact_id` are NULL
2. **Keyset pagination:** `ORDER BY ordered_at ASC` with `gt(ordered_at, cursor)` for cursor advance
3. **Per page:** 200 rows; loop continues while elapsed < 270s − 30s buffer
4. **For each row:** call `resolveAttribution`; if a match is found, update the conversion's `matched_*`, `match_method`, `match_confidence`, `identified_before_order`
5. **Limitation:** Only re-checks currently-unmatched rows. Matched rows whose `matched_visitor_id` was later deleted are NOT rechecked (accepted gap).

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Timeout before window completes | Partial pass | Next night's run resumes from oldest still-unmatched |
| Update fails on a row | Row counted in `errors`, loop continues | Logged via console.error |

### System Log Events

| Event Name | Status | When |
|------------|--------|------|
| `reattribute_conversions` | `success` / `warning` / `error` | Daily summary |

---

## 7. Audience Import Worker

**File:** `src/pages/api/cron/process-audience-imports.ts`
**Engine:** `src/lib/audience-import.ts` (`processImportJob`)
**Schedule:** Every minute (`* * * * *`)

### What it does

Processes resumable audience (re)import jobs from the `audience_import_jobs` table. This replaced the old browser-driven import loop in `src/pages/audiences/index.tsx`, which drove ~460 sequential chunk requests from the tab and **failed silently** on large audiences (e.g. "Children & Infant Nutrition", ~230k contacts / 4600 pages) whenever the tab closed, the network blipped, or the session expired — leaving a half-imported audience and no log.

### Processing Logic

1. **Claim a job** — `claim_next_audience_import_job(stale_before)` RPC uses `FOR UPDATE SKIP LOCKED` to atomically claim the oldest runnable job (a `pending` job, or a `running` job whose heartbeat is older than 5 min = crashed). Safe across overlapping cron runs.
2. **Resume from cursor** — processing starts at the job's `next_page`. Each chunk (10 pages, 5-way concurrent fetch with retries) is imported into a **staging** audience id and the cursor is advanced **only after** the chunk commits — so a crash resumes cleanly without data loss.
3. **Idempotent chunks** — each staging row is tagged with its source page in `data._p`; a chunk re-clears its page range before inserting, so re-running a chunk after a crash never duplicates rows.
4. **Timeout guard** — stops starting work at 270s. A clean deadline-pause hands the job back as `pending` (immediate reclaim next tick); only true crashes wait out the 5-min stale window.
5. **Clear-on-success (batched, resumable swap)** — when all pages are done, the staging rows are swapped onto the live id in **batches of 10k** (tracked by `swap_phase`), so the swap never trips Postgres `statement_timeout` on a large audience (~230k rows) and resumes across cron runs. Phases: (1) promote staging→live keeping the `_p` marker, (2) delete the OLD live rows (those without `_p`), (3) strip `_p` from the promoted rows. Promote-first means the live audience is **never emptied** during the cutover (it briefly holds old+new). The explicit phase cursor disambiguates delete (phase 2) from strip (phase 3) so a crash mid-swap resumes safely.
6. **Finalize** — updates `audience_requests.total_records` and logs `audience_reimport_complete` (or `audience_reimport_failed`).

### Related endpoints

- `POST /api/admin/audiences/reimport` — verifies the source URL (page 1) then enqueues a job. Idempotent: returns the existing job if one is already active for the audience.
- `GET /api/admin/audiences/import-job-status?job_id=` — progress polling for the UI (survives tab close, since the work is server-side).

### Failure modes

| Symptom | Cause | Handling |
|---------|-------|----------|
| Job stuck `running` | Worker crashed mid-chunk | Reclaimed after 5 min stale heartbeat |
| `audience_reimport_failed` log | No API key, swap error, or 12 **consecutive resumes with zero progress** (genuinely stuck — `attempts` resets to 0 whenever a chunk commits, so normal resumes never count) | Staging cleaned up; live audience preserved |
| Some pages missing | AudienceLab returned non-retryable errors for those pages | Recorded in `failed_pages`; job still completes with a `warning` |

### Log Events

| Event | Status | Notes |
|-------|--------|-------|
| `audience_reimport_start` | `info` | Emitted by the enqueue endpoint |
| `audience_reimport_complete` | `success` / `warning` | `warning` if any pages failed |
| `audience_reimport_failed` | `error` | Terminal failure (key missing, swap failed, max attempts) |
| `audience_import_worker` | `error` | Worker-level crash / claim failure |

---

## 8. Chat Email Notifications

**Route:** `/api/cron/send-chat-notifications`
**Schedule:** `* * * * *` (every minute)
**Queue table:** `chat_email_notifications`
**Transport:** `src/lib/mailer.ts` (nodemailer over SMTP; Gmail/Workspace app password)

### What it does

Drains the chat email notification queue:

- **Customer sends a message** → email every admin plus the assigned agent (one email each), with a
  link to `/chat/<id>`
- **Agent replies** → email `chat_conversations.customer_email` with the reply text and a link to `/?chat=<id>` (the widget auto-opens that conversation)

Rows are written by `enqueueChatNotifications()` in `src/lib/chat-notifications.ts`, called from
`/api/chat/messages` and `/api/chat/conversations/admin-create`. `bot` messages (widget greeting,
auto-replies) and private agent notes never enqueue anything.

### Processing Logic

1. Bail immediately if `chat_email_notifications_enabled` is not `'true'`.
2. Requeue `sending` rows whose `claimed_at` is older than 10 min (crashed run recovery).
3. Select up to 200 `pending` rows with `scheduled_at <= now()` (the debounce window has elapsed).
4. **Claim atomically:** `UPDATE ... SET status='sending' WHERE id IN (...) AND status='pending' RETURNING *`.
   Only rows this run actually transitioned come back, so two overlapping runs cannot double-send.
5. Group rows by `(conversation_id, recipient_email)` — one email per group, so a burst of messages
   becomes a single email listing them all.
6. Skip rules (marked `skipped`, no email sent):
   - admin recipient — the conversation is already `read`, or an agent already replied
   - customer recipient — the customer sent another message since (they're active in the widget)
7. Send, then mark `sent`. 200ms gap between sends; hard cap of 100 emails per run and a 240s time
   budget — anything left is released back to `pending` for the next minute and logged.

### Settings (`app_settings`, category `notifications`)

| Key | Default | Purpose |
|-----|---------|---------|
| `chat_email_notifications_enabled` | `false` | Master switch |
| `chat_notify_admins_on_customer_message` | `true` | Direction toggle |
| `chat_notify_customer_on_agent_reply` | `true` | Direction toggle |
| `chat_notification_cc_emails` | `''` | Comma list CC'd on **both** emails (see [CC behavior](#cc-behavior)) |
| `chat_notification_debounce_minutes` | `2` | Grouping window before send |
| `chat_notification_admin_cooldown_minutes` | `15` | Min gap between admin emails per conversation |
| `smtp_host` / `smtp_port` | `smtp.gmail.com` / `465` | Transport |
| `smtp_user` / `smtp_password` | — | Gmail address + **app password** (`smtp_password` is `is_secret`) |
| `smtp_from_name` / `smtp_reply_to` | `Traffic AI Support` / `''` | Envelope presentation |

Managed from **Settings → Chat Email Notifications** (admin only), which also has a
**Send test email** button (`POST /api/admin/settings/test-email`).

### CC behavior

`chat_notification_cc_emails` is applied as a real `Cc:` header, resolved at **send** time (not
enqueue time), so editing it takes effect on everything still queued.

- **Customer reply email** — single recipient, so it always carries the CC. Note this exposes those
  addresses to the customer, who can reply-all to them.
- **Admin notification** — fans out to one email per admin. Attaching the CC to all of them would
  deliver N copies to the CC'd inbox, so the cron picks **one carrier per conversation** (the
  lowest recipient address, deterministic) and only that email carries the CC.
- An address that is already the `To:` recipient is stripped from the CC list, so nobody receives
  the same email twice.
- If there are no admins at all, the CC addresses are promoted to `To:` so the notification isn't
  silently dropped.
- Known edge: if a conversation's admin rows get split across two cron runs (only under the 100-email
  cap or the time budget), each run picks its own carrier, so the CC'd inbox can receive two copies.

### Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Nothing sends, cron returns "disabled" | Master switch off | Enable in Settings |
| `SMTP is not configured` in System Logs | Missing host/user/password | Fill SMTP fields, save, send test email |
| `Invalid login` / `Username and Password not accepted` | Gmail app password wrong or revoked; 2FA off | Regenerate app password at myaccount.google.com → Security |
| Emails stop after high volume | Google Workspace daily send cap (~2,000/day) | Reduce recipients, raise debounce, or move to a dedicated ESP |
| Rows stuck at `failed` | 3 consecutive SMTP failures | Check `last_error` on the row, fix SMTP, requeue by setting `status='pending', attempts=0` |
| Duplicate emails | Should be impossible (atomic claim) | Check for a second deployment sharing the same DB and `CRON_SECRET` |

### Log Events

`system_logs` entries: `chat_notification_email` (per send, success/error),
`chat_notification_enqueue` (queue insert failures), `chat_notification_cron`
(deferred batches and failure summaries), `chat_notification_test_email` (test button).

Queue health check:

```sql
SELECT status, count(*) FROM chat_email_notifications GROUP BY 1;
```

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
