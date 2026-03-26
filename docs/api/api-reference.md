# API Reference

> All API routes organized by domain. Total: 120+ endpoints.

**Base URL:** `https://app.trafficai.io/api`
**Auth:** Supabase session cookie (unless noted otherwise)

---

## Authentication

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/auth/callback` | Public | Supabase Auth callback handler |
| POST | `/auth/assign-role` | Admin | Assign role to user |

---

## Pixel Tracking (Public)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/pixel/track` | None | Track page view/event from pixel JS |
| POST | `/pixel/webhook` | Webhook key | Receive webhook events |

---

## Pixels

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/pixels` | User | List user's pixels |
| POST | `/pixels` | User | Create a new pixel |
| GET | `/pixels/[id]` | User | Get pixel details |
| PUT | `/pixels/[id]` | User | Update pixel |
| DELETE | `/pixels/[id]` | User | Delete pixel |
| POST | `/pixels/[id]/sync-visitors` | User | Manually trigger visitor sync for a pixel |

---

## Visitors

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/visitors` | User | List visitors (paginated, filterable) |
| GET | `/visitors/[id]` | User | Get visitor details |
| PUT | `/visitors/[id]` | User | Update visitor |
| DELETE | `/visitors/[id]` | User | Delete visitor |

---

## Audiences

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/audiences` | User | List audiences |
| POST | `/audiences` | User | Create audience |
| GET | `/audiences/[id]` | User | Get audience details |
| PUT | `/audiences/[id]` | User | Update audience |
| DELETE | `/audiences/[id]` | User | Delete audience |
| GET | `/audiences/attributes` | User | Get available filter attributes |
| POST | `/audiences/custom` | User | Create custom audience with filters |
| GET | `/audiences/manual/[id]` | User | Get manual audience contacts |
| POST | `/audiences/manual/[id]` | User | Upload contacts to manual audience |
| GET | `/audiences/manual/[id]/export` | User | Export audience contacts as CSV |
| GET | `/audiences/manual/counts` | User | Get contact counts per audience |

---

## Audience Requests

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/audience-requests` | User | List user's audience requests |
| POST | `/audience-requests` | User | Submit a new audience request |
| GET | `/audience-requests/[id]` | User | Get request details |

---

## Pixel Requests

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/pixel-requests` | User | List user's pixel requests |
| POST | `/pixel-requests` | User | Submit a new pixel request |
| GET | `/pixel-requests/[id]` | User | Get request details |

---

## Integrations (Generic)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/integrations` | User | List all integrations for user |
| GET | `/integrations/[type]` | User | Get integration by type |
| GET | `/integrations/status-all` | User | Get status of all integrations |

### Klaviyo

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/klaviyo/connect` | User | Connect with API key |
| GET | `/integrations/klaviyo/status` | User | Connection status |
| GET | `/integrations/klaviyo/lists` | User | Fetch Klaviyo lists |
| POST | `/integrations/klaviyo/sync-visitors` | User | Sync visitors to list |
| POST | `/integrations/klaviyo/sync-audience` | User | Sync audience to list |
| POST | `/integrations/klaviyo/push-events` | User | Push events to Klaviyo |
| GET | `/integrations/klaviyo/push-events-config` | User | Get push events config |
| GET | `/integrations/klaviyo/metrics` | User | Fetch metrics |
| GET | `/integrations/klaviyo/metric-aggregates` | User | Metric aggregations |

### HubSpot

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/hubspot/connect` | User | Connect with access token |
| GET | `/integrations/hubspot/status` | User | Connection status |
| POST | `/integrations/hubspot/sync-visitors` | User | Sync visitors as contacts |
| POST | `/integrations/hubspot/sync-audience` | User | Sync audience as contacts |

### Slack

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/slack/connect` | User | Connect with webhook URL |
| GET | `/integrations/slack/status` | User | Connection status |
| POST | `/integrations/slack/send-test` | User | Send test notification |

### Zapier

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/zapier/connect` | User | Configure trigger webhooks |
| GET | `/integrations/zapier/status` | User | Connection status |
| POST | `/integrations/zapier/test-trigger` | User | Fire test webhook |

### Salesforce

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/salesforce/connect` | User | Connect with token + URL |
| GET | `/integrations/salesforce/status` | User | Connection status |
| POST | `/integrations/salesforce/sync-visitors` | User | Sync visitors as leads |
| POST | `/integrations/salesforce/sync-audience` | User | Sync audience as leads |

### Shopify

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/shopify/connect` | User | Connect with token + domain |
| GET | `/integrations/shopify/status` | User | Connection status |
| POST | `/integrations/shopify/sync-visitors` | User | Sync visitors as customers |

### Mailchimp

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/mailchimp/connect` | User | Connect with API key |
| GET | `/integrations/mailchimp/status` | User | Connection status |
| GET | `/integrations/mailchimp/lists` | User | Fetch mailing lists |
| POST | `/integrations/mailchimp/sync-visitors` | User | Sync visitors to list |
| POST | `/integrations/mailchimp/sync-audience` | User | Sync audience to list |

### Pipedrive

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/pipedrive/connect` | User | Connect with API token |
| GET | `/integrations/pipedrive/status` | User | Connection status |
| POST | `/integrations/pipedrive/sync-visitors` | User | Sync visitors as contacts |
| POST | `/integrations/pipedrive/sync-audience` | User | Sync audience as contacts |

### ActiveCampaign

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/activecampaign/connect` | User | Connect with key + URL |
| GET | `/integrations/activecampaign/status` | User | Connection status |
| GET | `/integrations/activecampaign/lists` | User | Fetch contact lists |
| POST | `/integrations/activecampaign/sync-visitors` | User | Sync visitors to list |
| POST | `/integrations/activecampaign/sync-audience` | User | Sync audience to list |

### Facebook

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/facebook/connect` | User | Store app credentials |
| GET | `/integrations/facebook/auth` | User | Start OAuth flow |
| GET | `/integrations/facebook/callback` | OAuth | OAuth callback |
| GET | `/integrations/facebook/status` | User | Connection status |
| GET | `/integrations/facebook/ad-accounts` | User | List ad accounts |
| GET/POST | `/integrations/facebook/audiences` | User | Manage custom audiences |
| POST | `/integrations/facebook/import-audience` | User | Import audience to Facebook |

### LinkedIn

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/linkedin/connect` | User | Connect with credentials |
| GET | `/integrations/linkedin/status` | User | Connection status |
| GET/POST | `/integrations/linkedin/campaigns` | User | List/create campaigns |
| GET/PUT/DELETE | `/integrations/linkedin/campaigns/[id]` | User | Campaign CRUD |
| GET | `/integrations/linkedin/extension/pending` | Extension | Get pending connection requests |
| POST | `/integrations/linkedin/extension/report` | Extension | Report send result |
| POST | `/integrations/linkedin/extension/token` | User | Generate extension token |
| POST | `/integrations/linkedin/extension/verify` | Extension | Verify extension token |

### RingCentral

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/ringcentral/connect` | User | Store client credentials |
| GET | `/integrations/ringcentral/callback` | OAuth | OAuth callback |
| GET | `/integrations/ringcentral/status` | User | Connection status |
| GET/POST | `/integrations/ringcentral/templates` | User | CRUD SMS templates |
| GET | `/integrations/ringcentral/sms-log` | User | View SMS send history |

### Google Ads

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/integrations/google_ads/connect` | User | Store OAuth credentials |
| GET | `/integrations/google_ads/callback` | OAuth | OAuth callback |
| GET | `/integrations/google_ads/status` | User | Connection status |
| GET | `/integrations/google_ads/accounts` | User | List ad accounts |
| POST | `/integrations/google_ads/import-audience` | User | Import audience to Google Ads |
| POST | `/integrations/google_ads/upload-conversions` | User | Upload offline conversions |

---

## Chat / Messaging

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/POST | `/chat/messages` | User | List/send messages |
| GET | `/chat/conversations` | User | List conversations |
| POST | `/chat/conversations` | User | Create conversation |
| GET | `/chat/conversations/[id]` | User | Get conversation |
| PUT | `/chat/conversations/[id]` | User | Update conversation |
| POST | `/chat/conversations/admin-create` | Admin | Create conversation as admin |
| POST | `/chat/conversations/merge` | Admin | Merge conversations |
| GET | `/chat/conversations/unread` | User | Get unread count |
| GET/POST | `/chat/auto-replies` | Admin | Manage auto-reply rules |

---

## Payments (Stripe)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/stripe/create-checkout` | User | Create Stripe checkout session |
| POST | `/stripe/portal` | User | Create Stripe billing portal link |
| POST | `/stripe/verify-session` | User | Verify checkout session |
| POST | `/stripe/webhook` | Stripe signature | Stripe webhook handler |

---

## Credits

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/credits` | User | Get credit balance |
| POST | `/credits/add` | Admin | Add credits to user |

---

## Account

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET/PUT | `/account/profile` | User | Get/update user profile |
| POST | `/onboarding/complete` | User | Mark onboarding complete |

---

## Dashboard

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/dashboard/stats` | User | User dashboard statistics |

---

## Admin Routes

All admin routes require `requireRole('admin')`.

### Users

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/users` | List all users |
| DELETE | `/admin/users/[id]/delete` | Delete user |
| PUT | `/admin/users/[id]/role` | Change user role |
| PUT | `/admin/users/[id]/plan` | Update user plan |
| POST | `/admin/users/[id]/extend-trial` | Extend trial period |
| POST | `/admin/impersonate` | Impersonate a user |

### Roles

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/roles` | List all roles |
| POST | `/admin/roles` | Create role |
| GET/PUT/DELETE | `/admin/roles/[id]` | Role CRUD |

### Pixels

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/admin/pixels/create` | Create pixel for any user |
| POST | `/admin/pixels/[id]/fetch-visitors` | Force sync visitors for pixel |

### Audiences

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/admin/audiences/create` | Create audience |
| GET/POST | `/admin/audiences/manual` | Manual audience management |
| POST | `/admin/audiences/import-from-url` | Import audience from URL |
| POST | `/admin/audiences/clear-contacts` | Clear audience contacts |
| POST | `/admin/audience-assignments` | Assign visitors to audiences |

### Requests

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/admin/pixel-requests/[id]/approve` | Approve pixel request |
| POST | `/admin/pixel-requests/[id]/reject` | Reject pixel request |
| POST | `/admin/audience-requests/[id]/approve` | Approve audience request |
| POST | `/admin/audience-requests/[id]/reject` | Reject audience request |
| POST | `/admin/audience-requests/[id]/reassign` | Reassign audience request |

### System

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/admin/logs` | Query system logs (filterable) |
| GET/POST | `/admin/settings` | App settings CRUD |
| GET/PUT | `/admin/settings/[key]` | Get/update specific setting |
| GET | `/admin/settings/webhook-key` | Get webhook signing key |
| GET/POST | `/admin/api-keys` | Manage API keys |
| GET/PUT | `/admin/api-keys/[userId]` | User-specific API key |
| GET | `/admin/dashboard/stats` | Admin dashboard statistics |
| GET/POST | `/admin/menu-items` | Manage sidebar menu |
| GET/PUT | `/admin/notifications` | Manage notifications |
| PUT | `/admin/notifications/[id]` | Update notification |
| POST | `/admin/notifications/mark-all-read` | Mark all read |

---

## Cron Jobs

All cron routes require `Authorization: Bearer ${CRON_SECRET}`.

| Method | Route | Schedule | Description |
|--------|-------|----------|-------------|
| GET | `/cron/fetch-visitors` | Hourly | Sync visitors from AudienceLab |
| GET | `/cron/push-klaviyo-events` | Every 30m | Auto-sync/push to Klaviyo |
| GET | `/cron/linkedin-drip` | Every 30m | Monitor LinkedIn campaigns |
| GET | `/cron/ringcentral-sms` | Every 10m | Send automated SMS |

---

## Referrals

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/referrals/my-code` | User | Get or auto-create referral code |
| PUT | `/referrals/my-code` | User | Set custom referral code |
| GET | `/referrals/stats` | User | Get referral stats and list |
| POST | `/referrals/track-click` | None | Increment click count (public) |

### Admin Referrals

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/admin/referrals` | Admin | List all referrals (paginated, filterable) |
| GET | `/admin/referrals/codes` | Admin | List all referral codes |
| PUT | `/admin/referrals/codes` | Admin | Update code (commission rate, active status) |
| GET | `/admin/referrals/payouts` | Admin | List all payouts |
| POST | `/admin/referrals/payouts` | Admin | Create a payout |
| PUT | `/admin/referrals/payouts` | Admin | Update payout status |
| GET | `/admin/referrals/stats` | Admin | Aggregate referral stats + top affiliates |

---

## Utility

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/proxy/fetch-url` | User | Proxy fetch to external URL |
| GET | `/enrich` | User | Enrich visitor data |
| GET | `/settings/stripe-prices` | User | Get Stripe pricing |
| GET/POST | `/installation-guides` | User | List/create guides |
| GET/PUT | `/installation-guides/[id]` | User | Guide CRUD |
| GET/POST | `/websites` | User | List/create websites |
| GET/PUT/DELETE | `/websites/[id]` | User | Website CRUD |
