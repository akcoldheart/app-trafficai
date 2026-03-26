# System Architecture

> Complete technical reference for the Traffic AI platform architecture.

---

## 1. High-Level Overview

```
                         +------------------+
                         |   Vercel (CDN)   |
                         |  Next.js 14 SSR  |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |             |              |
              +-----+----+ +-----+-----+ +-----+------+
              | Supabase | | External  | |   Stripe   |
              | Postgres | |   APIs    | |  Payments  |
              |  + Auth  | +-----------+ +------------+
              +----------+ | AudienceLab|
                           | Klaviyo    |
                           | Facebook   |
                           | Google Ads |
                           | LinkedIn   |
                           | RingCentral|
                           | + 7 more   |
                           +-----------+
```

### Core Principles

- **Proxy architecture** -- frontend never calls external APIs directly; all traffic routes through `/api/*` routes
- **Service role pattern** -- server-side operations use `createClient(URL, SERVICE_ROLE_KEY)` to bypass RLS
- **Cron-driven sync** -- 4 Vercel Cron jobs handle background data syncing (hourly, 30-min, 10-min intervals)
- **Row-Level Security** -- Supabase RLS policies enforce data isolation per user

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (Pages Router) | 14.2.x |
| Language | TypeScript | 5.x |
| UI | Bootstrap 5 + Tabler UI | 5.3.3 / 1.0.0-beta20 |
| Icons | @tabler/icons-react | 3.x |
| Database | PostgreSQL (Supabase) | - |
| Auth | Supabase Auth + SSR | 0.7.x |
| Payments | Stripe | 20.x |
| Validation | Zod | 4.x |
| Hosting | Vercel | - |
| Package Manager | pnpm | 10.19.x |

---

## 3. Project Structure

```
admin-panel/
├── docs/                         # Documentation (this folder)
│   ├── architecture/             # System design docs
│   ├── api/                      # API reference
│   ├── database/                 # Schema & migration docs
│   ├── integrations/             # Integration docs
│   ├── cron-jobs/                # Background job docs
│   ├── operations/               # Runbooks & QA checklists
│   └── development/              # Contributing & process docs
├── src/
│   ├── components/               # React UI components
│   ├── contexts/                 # React context providers
│   ├── data/                     # Static/seed data
│   ├── lib/                      # Shared utilities & helpers
│   │   ├── api-helpers.ts        # Auth guards (getAuthenticatedUser, requireRole)
│   │   ├── visitors-api-fetcher.ts  # Core visitor sync engine
│   │   ├── integrations.ts       # Integration registry
│   │   ├── webhook-logger.ts     # System log writer
│   │   ├── google-ads.ts         # Google Ads helpers
│   │   ├── ringcentral.ts        # RingCentral helpers
│   │   ├── hashing.ts            # SHA-256 hashing for integrations
│   │   └── supabase/             # Supabase client factories
│   ├── pages/
│   │   ├── api/                  # 160+ API routes
│   │   │   ├── admin/            # Admin-only endpoints
│   │   │   ├── cron/             # 4 scheduled cron handlers
│   │   │   ├── integrations/     # 13+ integration endpoints
│   │   │   ├── pixels/           # Pixel CRUD + sync
│   │   │   ├── visitors/         # Visitor CRUD
│   │   │   ├── audiences/        # Audience management
│   │   │   ├── chat/             # Messaging system
│   │   │   ├── stripe/           # Payment webhooks
│   │   │   └── ...
│   │   └── [page].tsx            # Frontend pages
│   ├── styles/                   # Global CSS
│   └── types/                    # TypeScript definitions
├── supabase/
│   └── migrations/               # 57 numbered SQL migrations
├── chrome-extension/             # LinkedIn automation extension
├── public/                       # Static assets
├── vercel.json                   # Cron schedules + headers
└── package.json
```

---

## 4. Authentication & Authorization

### Auth Flow

```
Browser → Supabase Auth (email/password or magic link)
       → Session cookie set via @supabase/ssr
       → middleware.ts validates session on every request
       → API routes call getAuthenticatedUser() for user identity
       → requireRole() enforces RBAC
```

### Middleware Bypasses

These routes skip session validation:

| Route | Auth Method |
|-------|------------|
| `/api/pixel/*` | Public (tracking pixel) |
| `/api/stripe/webhook` | Stripe signature verification |
| `/api/cron/*` | `CRON_SECRET` bearer token |
| `/pixel.js` | Public (JS script) |

### RBAC Model

- Roles stored in `roles` table with JSON permissions
- Users linked to roles via `role_id` in `users` table
- `requireRole('admin')` guard on admin-only API routes
- Default roles: `admin`, `user`, `partner`

---

## 5. Data Flow

### Visitor Sync Pipeline

```
Vercel Cron (hourly)
  → /api/cron/fetch-visitors
    → Query pixels (status=active, visitors_api_url set)
    → Interleave by user for fairness
    → For each pixel:
      → Fetch from AudienceLab API (paginated, with retry)
      → Aggregate contacts by UUID (pageviews, clicks, etc.)
      → Split into new inserts vs existing updates
      → Batch insert (200/batch) + batch update (50/batch)
      → Auto-sync new visitors to Klaviyo if enabled
      → Log result to system_logs table
```

### Integration Sync Pipeline

```
Vercel Cron (every 30 min)
  → /api/cron/push-klaviyo-events
    → For each connected Klaviyo integration:
      → Auto-sync new visitors to lists
      → Push enabled event types

Vercel Cron (every 10 min)
  → /api/cron/ringcentral-sms
    → For each connected RingCentral integration:
      → Check active templates + time windows
      → Send SMS to qualifying new visitors
      → Enforce frequency caps + dedup
```

### Referral/Affiliate Tracking Pipeline

```
1. Click: User visits ?ref=CODE
   → middleware.ts captures code in 30-day cookie, strips param, redirects

2. Signup: User creates account
   → signup.tsx reads ref_code cookie, passes in signUp metadata
   → For Google OAuth: ref_code passed via callback URL query param

3. Attribution: Auth callback fires
   → callback.ts reads ref_code from metadata or query param
   → Creates referral record (status: signed_up)
   → Sets users.referred_by

4. Conversion: User subscribes via Stripe
   → webhook.ts checkout.session.completed handler
   → Finds referral row, calculates commission, marks as converted

5. Churn: User cancels subscription
   → webhook.ts customer.subscription.deleted handler
   → Marks referral as churned
```

---

## 6. Deployment

### Vercel Configuration

- **Region:** `iad1` (US East)
- **Build:** `pnpm build`
- **Framework:** Next.js (auto-detected)
- **Max Duration:** 300s for cron routes (set per-route via `export const config`)

### Environment Variables (Required)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `CRON_SECRET` | Bearer token for Vercel Cron authentication |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret |
| `NEXT_PUBLIC_APP_URL` | Public app URL (for OAuth callbacks) |

### Cron Schedule Summary

| Job | Path | Schedule | Timeout |
|-----|------|----------|---------|
| Visitor Sync | `/api/cron/fetch-visitors` | Hourly (`0 * * * *`) | 300s |
| Klaviyo Events | `/api/cron/push-klaviyo-events` | Every 30m (`*/30 * * * *`) | 300s |
| LinkedIn Drip | `/api/cron/linkedin-drip` | Every 30m (`*/30 * * * *`) | 300s |
| RingCentral SMS | `/api/cron/ringcentral-sms` | Every 10m (`*/10 * * * *`) | 300s |

---

## 7. Key Design Patterns

### Service Role Client (Bypass RLS)

```typescript
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

Used in: cron jobs, admin endpoints, background sync operations.

### Authenticated Client (Respects RLS)

```typescript
import { createClient } from '@/lib/supabase/api';
const supabase = createClient(req, res);
```

Used in: user-facing API routes where RLS filters data to the authenticated user.

### Batch Database Operations

- **Insert:** Batches of 200 rows via `.insert(batch)`
- **Update:** Batches of 50 rows via parallel `.update().eq('id', id)`
- **Pagination:** Always use `.range(from, to)` -- Supabase defaults to max 1000 rows
- **Upsert:** Use `.upsert()` with `onConflict` for idempotent writes

### System Logging

```typescript
import { logEvent } from '@/lib/webhook-logger';
await logEvent({
  type: 'api',           // 'webhook' | 'api' | 'stripe' | 'error' | 'info' | 'audience'
  event_name: 'visitors_api_sync',
  status: 'success',     // 'success' | 'error' | 'warning' | 'info'
  message: 'Human-readable description',
  user_id: pixel.user_id,
  request_data: { ... },
  response_data: { ... },
});
```

All logs are written to the `system_logs` table and visible in the admin System Logs page.

---

## 8. External Service Dependencies

| Service | Purpose | Failure Impact |
|---------|---------|---------------|
| Supabase | Auth + Database | Full outage |
| Vercel | Hosting + Cron | Full outage |
| AudienceLab API | Visitor data source | Visitor sync stops |
| Stripe | Payments | Subscription management down |
| Klaviyo | Email/SMS marketing | Auto-sync stops |
| Facebook | Ad audience sync | Facebook import/export stops |
| Google Ads | Conversion tracking | Conversion uploads stop |
| LinkedIn | Campaign automation | Drip campaigns pause |
| RingCentral | SMS sending | SMS campaigns stop |

---

## 9. Security Model

- **RLS enforced** on all user-facing tables via Supabase policies
- **Service role** used only in server-side code (never exposed to client)
- **CRON_SECRET** protects all cron endpoints from unauthorized invocation
- **Stripe webhook signature** verification prevents spoofed payment events
- **OAuth flows** (Facebook, Google, RingCentral) use server-side token exchange
- **SHA-256 hashing** applied to PII before sending to ad platforms (Facebook, Google Ads)
- **No secrets in client code** -- all `NEXT_PUBLIC_*` vars are safe for browser exposure
