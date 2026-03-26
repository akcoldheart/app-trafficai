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
| 6 | [Shopify](#shopify) | E-commerce | API Key + URL | Sync visitors | Manual | No |
| 7 | [Mailchimp](#mailchimp) | Email Marketing | API Key | Sync visitors, audiences, lists | Manual | No |
| 8 | [Pipedrive](#pipedrive) | CRM | API Key | Sync visitors, audiences | Manual | No |
| 9 | [ActiveCampaign](#activecampaign) | Email Marketing | API Key + URL | Sync visitors, audiences, lists | Manual | No |
| 10 | [Facebook](#facebook) | Advertising | OAuth | Sync audiences | Manual | No |
| 11 | [LinkedIn](#linkedin) | Outreach | Credentials | Campaigns, sync visitors | Via extension | Yes (30m) |
| 12 | [RingCentral](#ringcentral) | Outreach | OAuth | SMS automation | Yes | Yes (10m) |
| 13 | [Google Ads](#google_ads) | Advertising | OAuth | Audiences, conversions | Manual | No |

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
| `api_key_and_url` | Salesforce, Shopify, ActiveCampaign | API key + instance URL (URL stored in `config`) |
| `webhook_url` | Slack | User pastes webhook URL, stored in `webhook_url` column |
| `triggers` | Zapier | Multiple webhook URLs stored in `config` per trigger type |
| `oauth` | Facebook, RingCentral, Google Ads | Server-side OAuth flow with callback URL |
| `credentials` | LinkedIn | Email/password stored encrypted (used via Chrome extension) |

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
- `POST /api/integrations/hubspot/sync`

**Features:** Syncs visitors as HubSpot contacts with properties mapped from visitor fields.

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
**Auth:** Admin API Access Token (`shpat_*`) + Shop Domain
**API Endpoints:**
- `POST /api/integrations/shopify/connect`
- `GET /api/integrations/shopify/status`
- `POST /api/integrations/shopify/sync`

**Features:** Syncs visitors as Shopify customers.

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
