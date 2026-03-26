# Database Guide

> PostgreSQL database managed via Supabase. All schema changes are tracked as numbered SQL migrations.

---

## 1. Connection Details

- **Provider:** Supabase (managed PostgreSQL)
- **Client libraries:** `@supabase/supabase-js`, `@supabase/ssr`
- **RLS:** Enabled on all user-facing tables
- **Default row limit:** 1000 per request (always use `.range()` for large queries)

### Client Patterns

```typescript
// Server-side (bypasses RLS) -- crons, admin routes, background jobs
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Request-scoped (respects RLS) -- user-facing API routes
import { createClient } from '@/lib/supabase/api';
const supabase = createClient(req, res);
```

---

## 2. Core Tables

### Authentication & Users

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `auth.users` | Supabase Auth users | `id`, `email` |
| `users` | App user profiles | `id`, `email`, `role`, `role_id`, `stripe_customer_id`, `trial_*` |
| `roles` | RBAC role definitions | `id`, `name`, `permissions` (JSONB) |

### Pixels & Visitors

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `pixels` | Tracking pixel configs | `id`, `user_id`, `status`, `visitors_api_url`, `visitors_api_last_fetched_at` |
| `visitors` | Identified website visitors | `id`, `pixel_id`, `user_id`, `visitor_id`, `email`, `lead_score`, `metadata` (JSONB) |
| `pixel_events` | Raw tracking events | `id`, `pixel_id`, `event_type`, `page_url`, `created_at` |

**Critical constraint:** `visitors(visitor_id, pixel_id)` UNIQUE -- enables batch upsert

**Note:** `visitors` table has NO `phone` column. Phone is stored in `metadata` JSONB field.

### Audiences

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `audiences` | Audience segments | `id`, `user_id`, `name`, `filter_criteria` |
| `audience_contacts` | Manually uploaded contacts | `id`, `audience_id`, `email`, `first_name`, `last_name` |
| `audience_assignments` | Visitor-to-audience mapping | `visitor_id`, `audience_id` |

### Integrations

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `platform_integrations` | All 13+ integrations | `user_id`, `platform`, `api_key`, `config` (JSONB), `is_connected` |
| `ringcentral_sms_templates` | SMS templates | `user_id`, `pixel_id`, `message_template`, `filters`, `is_active` |
| `ringcentral_sms_log` | SMS send history | `user_id`, `pixel_id`, `visitor_id`, `status`, `sent_date` |
| `linkedin_campaigns` | LinkedIn drip campaigns | `user_id`, `status`, `daily_limit`, `operating_hours_*` |
| `linkedin_campaign_contacts` | Campaign contact queue | `campaign_id`, `visitor_id`, `status`, `sent_at` |

**Unique constraint:** `platform_integrations(user_id, platform)` -- one per user per platform

### System

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `system_logs` | API/webhook/error logs | `type`, `event_name`, `status`, `message`, `user_id`, `created_at` |
| `app_settings` | Global app config | `key`, `value` |
| `menu_items` | Admin sidebar menu | `name`, `path`, `icon`, `order` |
| `notifications` | Admin notifications | `user_id`, `message`, `is_read` |
| `user_api_keys` | Shared AudienceLab API key | `api_key` |

### Referrals

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `referral_codes` | User referral/affiliate codes | `user_id`, `code` (unique), `commission_rate`, `total_clicks`, `is_active` |
| `referrals` | Referred signup tracking | `referrer_user_id`, `referred_user_id`, `status`, `commission_amount`, `monthly_revenue` |
| `referral_payouts` | Commission payout history | `user_id`, `amount`, `status` (pending/processing/paid/failed) |

**Unique constraint:** `referral_codes(LOWER(code))` -- case-insensitive unique codes
**Unique constraint:** `referrals(referred_user_id)` WHERE NOT NULL -- one referral per user

### Payments

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `stripe_subscriptions` | Subscription records | `user_id`, `stripe_subscription_id`, `status` |
| `credits` | User credit balance | `user_id`, `balance`, `transactions` |

### Messaging

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `chat_conversations` | Chat threads | `id`, `user_id`, `status` |
| `chat_messages` | Chat messages | `conversation_id`, `sender_id`, `content` |
| `auto_replies` | Auto-reply rules | `trigger`, `response`, `is_active` |

### Requests

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `pixel_requests` | Pixel setup requests | `user_id`, `status`, `website_url` |
| `audience_requests` | Audience data requests | `user_id`, `status`, `criteria` |
| `installation_guides` | Custom install guides | `pixel_id`, `platform`, `instructions` |

---

## 3. Migration History

Migrations are in `supabase/migrations/` with numeric prefixes.

| Range | Theme | Count |
|-------|-------|-------|
| 001-010 | Core schema, auth, RBAC, chat | 10 |
| 011-025 | Pixels, admin policies, Stripe, trial | 15 |
| 026-044 | Performance indexes, dashboard aggregates, system logs | 12 |
| 045-057 | Integrations (Klaviyo, Facebook, LinkedIn, RingCentral, Google Ads) | 13 |

**Next migration number:** `059`

### Key Migrations to Know

| Migration | What it does | Why it matters |
|-----------|-------------|----------------|
| `001_initial_schema.sql` | Users, base tables | Foundation |
| `002_visitors_table.sql` | Visitors table | Core data model |
| `027_performance_indexes.sql` | Indexes on hot paths | Query performance |
| `036_visitors_unique_constraint.sql` | `(visitor_id, pixel_id)` unique | Enables batch upsert |
| `041_create_system_logs.sql` | System logging table | Observability |
| `050_klaviyo_integration.sql` | Klaviyo-specific tables | First integration |
| `051_all_integrations.sql` | `platform_integrations` | Unified integration model |
| `057_ringcentral_google_ads_integrations.sql` | RingCentral + Google Ads | Latest |

---

## 4. Migration Conventions

### Naming

```
{NNN}_{description}.sql

NNN = 3-digit sequential number (e.g., 058)
description = snake_case summary (e.g., add_google_ads_conversion_log)
```

### Structure Template

```sql
-- Migration: {NNN}_{description}
-- Description: What this migration does and why
-- Date: YYYY-MM-DD

-- 1. Create tables
CREATE TABLE IF NOT EXISTS my_table (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_my_table_user_id ON my_table(user_id);

-- 3. Enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
CREATE POLICY "Users can view own data"
  ON my_table FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access"
  ON my_table FOR ALL
  USING (auth.role() = 'service_role');

-- 5. Add menu items (if adding a new admin page)
INSERT INTO menu_items (name, path, icon, "order", parent_id)
VALUES ('My Feature', '/admin/my-feature', 'IconName', 50, NULL)
ON CONFLICT DO NOTHING;
```

### Rules

1. **Always use `IF NOT EXISTS` / `IF EXISTS`** -- migrations must be idempotent
2. **Always enable RLS** on new tables
3. **Always add service_role policy** so crons and admin routes can access data
4. **Always add user-scoped policy** so RLS filters by `auth.uid()`
5. **Add indexes** on foreign keys and commonly queried columns
6. **Use `ON DELETE CASCADE`** for FK references to `auth.users`
7. **Test migrations locally** before deploying: run against a Supabase local instance or staging
8. **Never modify existing migrations** -- create a new migration to alter existing tables

---

## 5. Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Query returns max 1000 rows | Always paginate with `.range(from, to)` |
| `visitors` has no `phone` column | Phone is in `metadata` JSONB: `metadata->>'phone'` |
| Shared pixels: wrong `user_id` | Visitors store the pixel owner's `user_id`, not the logged-in user |
| Duplicate insert errors | Use `.upsert()` with `onConflict` or check constraint first |
| RLS blocking service operations | Use service role client, not request-scoped client |
| Large batch inserts timeout | Batch in groups of 200 with `.insert(batch)` |
