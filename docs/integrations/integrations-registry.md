# Integrations Registry

> All third-party platform integrations supported by Traffic AI.

**Storage:** `platform_integrations` table (one row per user per platform)
**Core library:** `src/lib/integrations.ts` (CRUD helpers)
**Config registry:** `src/lib/integration-configs.ts` (UI metadata, setup steps)

---

## Platform Summary

| # | Platform | Category | Auth Type | Features | Auto-Sync | Cron |
|---|----------|----------|-----------|----------|-----------|------|
| 1 | [Klaviyo](#klaviyo) | Email Marketing | API Key | Sync visitors, audiences, lists | Yes | Yes (30m) |
| 2 | [HubSpot](#hubspot) | CRM | API Key | Sync visitors, audiences | Manual | No |
| 3 | [Slack](#slack) | Notifications | Webhook URL | Notifications | N/A | No |
| 4 | [Zapier](#zapier) | Automation | Webhook triggers | Webhooks | N/A | No |
| 5 | [Salesforce](#salesforce) | CRM | API Key + URL | Sync visitors, audiences | Manual | No |
| 6 | [Shopify](#shopify) | E-commerce | Client credentials + URL | Order conversions & revenue attribution | Manual + cron | Yes |
| 7 | [Mailchimp](#mailchimp) | Email Marketing | API Key | Sync visitors, audiences, lists | Manual | No |
| 8 | [Pipedrive](#pipedrive) | CRM | API Key | Sync visitors, audiences | Manual | No |
| 9 | [ActiveCampaign](#activecampaign) | Email Marketing | API Key + URL | Sync visitors, audiences, lists | Manual | No |
| 10 | [Facebook](#facebook) | Advertising | OAuth | Sync audiences | Manual | No |
| 11 | [LinkedIn](#linkedin) | Outreach | Credentials | Campaigns, sync visitors | Via extension | Yes (30m) |
| 12 | [RingCentral](#ringcentral) | Outreach | OAuth | SMS automation | Yes | Yes (10m) |
| 13 | [Google Ads](#google_ads) | Advertising | OAuth | Audiences, conversions | Manual | No |
| 14 | [Google Sheets](#google-sheets) | Export | OAuth | Sync visitors + audiences to sheet | Manual | No |
| 15 | [ZeroBounce](#zerobounce-email-verification) | Email Verification | API Key | Email validation | Auto (on fetch) | No |

---

## Data Model

### `platform_integrations` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `auth.users` |
| `platform` | TEXT | Platform identifier (e.g., `klaviyo`, `hubspot`) |
| `api_key` | TEXT | Encrypted API key or access token |
| `webhook_url` | TEXT | Webhook endpoint (Slack, Zapier) |
| `config` | JSONB | Platform-specific configuration |
| `is_connected` | BOOLEAN | Whether integration is active |
| `last_synced_at` | TIMESTAMPTZ | Last successful sync timestamp |
| `created_at` | TIMESTAMPTZ | When connected |
| `updated_at` | TIMESTAMPTZ | Last modified |

**Unique constraint:** `(user_id, platform)` -- one integration per user per platform

---

## Auth Types

| Type | Platforms | Flow |
|------|-----------|------|
| `api_key` | Klaviyo, HubSpot, Mailchimp, Pipedrive | User pastes API key, stored in `api_key` column |
| `api_key_and_url` | Salesforce, ActiveCampaign | API key + instance URL (URL stored in `config`) |
| `webhook_url` | Slack | User pastes webhook URL, stored in `webhook_url` column |
| `triggers` | Zapier | Multiple webhook URLs stored in `config` per trigger type |
| `oauth` | Facebook, RingCentral, Google Ads, Google Sheets | Server-side OAuth flow with callback URL |
| `credentials` | LinkedIn | Email/password stored encrypted (used via Chrome extension) |
| `credentials_and_url` | Shopify | App Client ID + Client Secret + shop domain, exchanged server-side for a 24h token via the client credentials grant |

---

## Integration Details

### Klaviyo

**Category:** Email Marketing
**Auth:** Private API Key (`pk_*`)
**API Endpoints:**
- `POST /api/integrations/klaviyo/connect` -- Connect with API key
- `GET /api/integrations/klaviyo/status` -- Connection status
- `GET /api/integrations/klaviyo/lists` -- Fetch Klaviyo lists
- `POST /api/integrations/klaviyo/sync-visitors` -- Manual visitor sync to list
- `POST /api/integrations/klaviyo/push-events` -- Manual event push
- `GET /api/integrations/klaviyo/metrics` -- Fetch metrics
- `GET /api/integrations/klaviyo/metric-aggregates` -- Metric aggregations
- `GET /api/integrations/klaviyo/push-events-config` -- Push events configuration

**Auto-Sync Config (JSONB):**
```json
{
  "auto_sync_visitors": true,
  "default_list_id": "KlaviyoListId",
  "auto_sync_pixel_id": "optional-pixel-id",
  "auto_push_events": true,
  "push_events_enabled": {
    "high_intent": true,
    "price_sensitive": true,
    "returning_visitor": false
  }
}
```

**Cron:** `push-klaviyo-events` (every 30 min) handles auto-sync + event push.
Also triggered inline by `fetch-visitors` cron when new visitors are inserted.

---

### HubSpot

**Category:** CRM
**Auth:** Private App Access Token (`pat-*`)
**API Endpoints:**
- `POST /api/integrations/hubspot/connect`
- `GET /api/integrations/hubspot/status`
- `POST /api/integrations/hubspot/sync-visitors` -- Sync individual visitors as contacts
- `POST /api/integrations/hubspot/sync-audience` -- Sync an entire audience to HubSpot

**Features:** Syncs visitors as HubSpot contacts with properties mapped from visitor fields. Audience sync pushes all contacts in a saved audience.

---

### Slack

**Category:** Notifications
**Auth:** Incoming Webhook URL
**API Endpoints:**
- `POST /api/integrations/slack/connect`
- `GET /api/integrations/slack/status`
- `POST /api/integrations/slack/send-test`

**Features:** Sends formatted visitor notifications to a Slack channel.

---

### Zapier

**Category:** Automation
**Auth:** Per-trigger webhook URLs
**API Endpoints:**
- `POST /api/integrations/zapier/connect`
- `GET /api/integrations/zapier/status`
- `POST /api/integrations/zapier/test-trigger`

**Features:** Fires webhooks on events (new visitor, high intent, etc.) to trigger Zaps.

---

### Salesforce

**Category:** CRM
**Auth:** Access Token + Instance URL
**API Endpoints:**
- `POST /api/integrations/salesforce/connect`
- `GET /api/integrations/salesforce/status`
- `POST /api/integrations/salesforce/sync`

**Features:** Syncs visitors as Salesforce Leads/Contacts.

---

### Shopify

**Category:** E-commerce
**Auth:** App Client ID + Client Secret + Shop Domain (client credentials grant)

**API Endpoints:**
- `POST /api/integrations/shopify/connect` -- Validate credentials, mint first token, save
- `GET /api/integrations/shopify/status` -- Connection status (secrets redacted)
- `PUT /api/integrations/shopify/status` -- Update settings (merges; ignores secret keys)
- `DELETE /api/integrations/shopify/status` -- Disconnect (deletes the row and credentials)
- `POST /api/integrations/shopify/sync-orders` -- Manual order sync
- `GET /api/cron/sync-conversions` -- Scheduled order sync across all merchants

**Features:** Pulls orders and writes them to `conversions`, attributing revenue to a chosen pixel.

#### Authentication

Shopify stopped allowing admin-created ("legacy") custom apps on **2026-01-01**, so new stores
can no longer produce a static `shpat_` token. The integration now uses the **client credentials
grant**: the merchant creates an app in the Shopify Dev Dashboard, installs it on their store,
and gives us the Client ID and Client Secret.

```
POST https://{shop}.myshopify.com/admin/oauth/access_token
grant_type=client_credentials&client_id=...&client_secret=...
-> { access_token, scope, expires_in: 86399 }
```

**Requirements and constraints:**
- The app and the store **must belong to the same Shopify organization**. This is the most
  common setup failure; `connect.ts` surfaces a specific hint for it.
- The app must be **installed on the store** before credentials will work.
- Scopes are set on the app version in the Dev Dashboard, not requested at token time. We read
  the granted scopes back and warn if `read_orders` or `read_customers` is missing.
- Tokens **expire after 24 hours**. `src/lib/shopify-auth.ts` mints and caches them; never
  assume a stored token is still valid.
- `read_orders` only exposes the last 60 days of orders unless Shopify grants `read_all_orders`.

**Merchants with a pre-2026 custom app:** the connect form opens with a two-option chooser
("Create a new app" / "I already have an access token"), driven by `IntegrationConfig.legacyAuth`.
The legacy option swaps the setup steps and shows a single token field.
This posts `api_key` instead of `client_id`/`client_secret`, and `connect.ts` strips any
credential keys left in `config` so the resolver does not keep preferring stale credentials.

**Token resolution** (`getShopifyAccessToken` in `src/lib/shopify-auth.ts`):
1. `config.client_id` + `config.client_secret` present -> use cached `config.access_token` if
   more than 10 minutes from expiry, otherwise mint a fresh one and cache it.
2. Otherwise fall back to `api_key` -- a legacy `shpat_` token from before the cutover. These
   still work and are left untouched.

Every caller must go through `getShopifyAccessToken`. Reading `integration.api_key` directly
will skip credential-based merchants entirely.

**Config keys:** `shop_domain`, `client_id`, `client_secret`, `access_token`, `token_expires_at`,
`granted_scopes`, `auth_mode`, `orders_attribution_pixel_id`.

`client_secret`, `access_token`, and `token_expires_at` are stripped by `redactShopifyConfig`
before the config is ever returned to the browser, and the status `PUT` refuses to accept them
from the client.

---

### Mailchimp

**Category:** Email Marketing
**Auth:** API Key (includes datacenter suffix, e.g., `-us21`)
**API Endpoints:**
- `POST /api/integrations/mailchimp/connect`
- `GET /api/integrations/mailchimp/status`
- `POST /api/integrations/mailchimp/sync`
- `GET /api/integrations/mailchimp/lists`

**Features:** Syncs visitors to Mailchimp lists as subscribers.

---

### Pipedrive

**Category:** CRM
**Auth:** Personal API Token
**API Endpoints:**
- `POST /api/integrations/pipedrive/connect`
- `GET /api/integrations/pipedrive/status`
- `POST /api/integrations/pipedrive/sync`

**Features:** Syncs visitors as Pipedrive contacts/deals.

---

### ActiveCampaign

**Category:** Email Marketing
**Auth:** API Key + API URL
**API Endpoints:**
- `POST /api/integrations/activecampaign/connect`
- `GET /api/integrations/activecampaign/status`
- `POST /api/integrations/activecampaign/sync`
- `GET /api/integrations/activecampaign/lists`

**Features:** Syncs visitors as ActiveCampaign contacts with list assignment.

---

### Facebook

**Category:** Advertising
**Auth:** OAuth (App ID + App Secret)
**Callback URL:** `/api/integrations/facebook/callback`
**API Endpoints:**
- `POST /api/integrations/facebook/connect` -- Store app credentials
- `GET /api/integrations/facebook/auth` -- Start OAuth flow
- `GET /api/integrations/facebook/callback` -- OAuth callback
- `GET /api/integrations/facebook/status`
- `GET /api/integrations/facebook/ad-accounts` -- List ad accounts
- `POST /api/integrations/facebook/audiences` -- Manage custom audiences
- `POST /api/integrations/facebook/import` -- Import audience to Facebook

**Security:** PII (email, phone) is SHA-256 hashed before sending to Facebook API.

---

### LinkedIn

**Category:** Outreach
**Auth:** Credentials (email/password) + Chrome Extension token
**API Endpoints:**
- `POST /api/integrations/linkedin/connect`
- `GET /api/integrations/linkedin/status`
- `GET/POST /api/integrations/linkedin/campaigns` -- CRUD campaigns
- `GET/PUT /api/integrations/linkedin/campaigns/[id]` -- Campaign detail
- `POST /api/integrations/linkedin/extension/*` -- Extension API suite

**Features:** Automated LinkedIn connection requests via Chrome extension with drip campaign scheduling (operating hours, daily limits).

**Cron:** `linkedin-drip` (every 30 min) monitors campaigns and enforces scheduling. Actual sending requires the Chrome extension.

---

### RingCentral

**Category:** Outreach
**Auth:** OAuth (Client ID + Client Secret)
**Callback URL:** `/api/integrations/ringcentral/callback`
**API Endpoints:**
- `POST /api/integrations/ringcentral/connect`
- `GET /api/integrations/ringcentral/callback` -- OAuth callback
- `GET /api/integrations/ringcentral/status`
- `GET/POST /api/integrations/ringcentral/templates` -- SMS templates
- `GET /api/integrations/ringcentral/sms-log` -- Send history

**Config (JSONB):**
```json
{
  "rc_from_number": "+15551234567",
  "rc_access_token": "...",
  "rc_refresh_token": "...",
  "rc_token_expires_at": "2026-04-01T00:00:00Z"
}
```

**Cron:** `ringcentral-sms` (every 10 min) sends SMS to new visitors matching template filters. Includes time windows, dedup, frequency caps, and lead score thresholds.

---

### Google Ads

**Category:** Advertising
**Auth:** OAuth (Client ID + Client Secret + Developer Token)
**Callback URL:** `/api/integrations/google_ads/callback`
**API Endpoints:**
- `POST /api/integrations/google_ads/connect`
- `GET /api/integrations/google_ads/callback` -- OAuth callback
- `GET /api/integrations/google_ads/status`
- `GET /api/integrations/google_ads/accounts` -- List ad accounts
- `POST /api/integrations/google_ads/import` -- Import audience
- `POST /api/integrations/google_ads/upload-conversions` -- Offline conversions

**Security:** PII is SHA-256 hashed before sending to Google Ads API.

---

### Google Sheets

**Category:** Export
**Auth:** OAuth (Client ID + Client Secret)
**Callback URL:** `/api/integrations/google_sheets/callback`
**API Endpoints:**
- `POST /api/integrations/google_sheets/connect` -- Store OAuth client credentials
- `GET /api/integrations/google_sheets/callback` -- OAuth callback (stores access/refresh tokens)
- `GET /api/integrations/google_sheets/status`
- `POST /api/integrations/google_sheets/sync-visitors` -- Append visitors to a sheet
- `POST /api/integrations/google_sheets/sync-audience` -- Append a full audience to a sheet

**Features:** Exports visitors or audience contacts to a Google Sheet (one-way push, manual trigger).

---

### ZeroBounce (Email Verification)

**Category:** Email Verification (Global — configured in Settings, not per-user integrations page)
**Auth:** API Key
**API Endpoints:**
- `POST /api/integrations/zerobounce/connect` -- Connect with API key
- `GET /api/integrations/zerobounce/status` -- Connection status + credits
- `PUT /api/integrations/zerobounce/status` -- Update config (auto_verify, allow_catch_all, etc.)
- `DELETE /api/integrations/zerobounce/status` -- Disconnect
- `GET /api/integrations/zerobounce/credits` -- Check remaining credits
- `POST /api/integrations/zerobounce/verify` -- Manual bulk verification
- `GET /api/integrations/zerobounce/stats` -- Verification breakdown stats

**Config (JSONB):**
```json
{
  "auto_verify": true,
  "allow_catch_all": true,
  "allow_unknown": true,
  "verify_on_sync": true
}
```

**Database columns on `visitors`:**
- `email_status` -- ZeroBounce status: `valid`, `invalid`, `catch-all`, `spamtrap`, `abuse`, `do_not_mail`, `unknown`
- `email_sub_status` -- Detailed sub-status (e.g., `alias_address`, `role_based`, `disposable`)
- `email_verified_at` -- Timestamp of last verification

**Behavior:**
- **Auto-verify:** When new visitors are fetched via `visitors-api-fetcher.ts`, emails are verified via ZeroBounce before Klaviyo auto-sync
- **Verify-on-sync:** When Klaviyo `syncVisitorsForUser()` runs, unverified emails are verified first
- **Filtering:** Invalid/spamtrap/abuse/do_not_mail emails are blocked from Klaviyo sync and push events
- **Catch-all/Unknown:** Configurable via settings (default: allowed)
- **Credits:** System checks available credits before verifying; logs warning when insufficient

**System Logs:**
- `zerobounce_connect` -- Connection success/failure
- `zerobounce_disconnect` -- Disconnection
- `zerobounce_config_update` -- Settings changed
- `zerobounce_manual_verify` -- Manual bulk verification results
- `zerobounce_auto_verify` -- Auto-verification during visitor fetch
- `zerobounce_low_credits` -- Insufficient credits warning

**Note:** ZeroBounce is a global system utility, not a per-user integration. It is configured by admin on the Settings page, not on the Integrations hub page.

---

## Adding a New Integration

1. **Add platform type** to `PlatformType` in `src/lib/integrations.ts`
2. **Add config** to `INTEGRATION_CONFIGS` in `src/lib/integration-configs.ts`
3. **Add to display order** in `INTEGRATION_ORDER` array
4. **Create API endpoints** under `src/pages/api/integrations/<platform>/`
   - `connect.ts` -- Connection endpoint
   - `status.ts` -- Status check
   - `sync.ts` -- Sync visitors (if applicable)
   - `callback.ts` -- OAuth callback (if OAuth)
5. **Create migration** for any new tables (see `database/database-guide.md`)
6. **Create UI page** at `src/pages/integrations/<platform>.tsx` (if custom UI needed)
7. **Add cron job** if auto-sync is required (see `cron-jobs/cron-jobs.md`)
8. **Update this document** with the new integration details
