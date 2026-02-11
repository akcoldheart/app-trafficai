# Traffic AI Admin Panel - Developer Guide

Technical reference for developers building on and contributing to the Traffic AI Admin Panel.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Local Development Setup](#4-local-development-setup)
5. [Authentication System](#5-authentication-system)
6. [API Layer](#6-api-layer)
7. [Database Schema](#7-database-schema)
8. [Role-Based Access Control](#8-role-based-access-control)
9. [Frontend Patterns](#9-frontend-patterns)
10. [Third-Party Integrations](#10-third-party-integrations)
11. [Testing](#11-testing)
12. [Deployment](#12-deployment)
13. [Environment Variables](#13-environment-variables)
14. [Code Conventions](#14-code-conventions)

---

## 1. Architecture Overview

```
Browser (Next.js Frontend)
    |
    v
Next.js API Routes (Proxy Layer)
    |
    +--> Supabase (Auth + PostgreSQL)
    |
    +--> Traffic AI API (External)
    |
    +--> Stripe (Payments)
```

The application follows a **proxy architecture**:
- The frontend never communicates with external APIs directly
- All API calls route through Next.js API routes at `/api/*`
- API routes handle authentication, add credentials, log actions, and forward requests
- Supabase provides authentication and database storage
- The Traffic AI API provides visitor intelligence and enrichment capabilities

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 14.2.18 |
| Language | TypeScript | 5.x |
| UI Library | React | 18.2.0 |
| CSS Framework | Bootstrap (via Tabler) | 5.3.3 |
| Component Library | Tabler UI | 1.0.0-beta20 |
| Icons | Tabler Icons React | 3.0.0 |
| Auth & DB | Supabase | 2.84.0 |
| Validation | Zod | 4.1.13 |
| Payments | Stripe | 20.2.0 |
| Onboarding | driver.js | 1.4.0 |
| Package Manager | pnpm | 10.19.0 |
| E2E Testing | Playwright | latest |
| Deployment | Vercel | - |

---

## 3. Project Structure

```
src/
├── pages/                    # Next.js pages (file-based routing)
│   ├── _app.tsx              # App wrapper with providers
│   ├── _document.tsx         # HTML document structure
│   ├── index.tsx             # Dashboard
│   ├── api/                  # API routes (server-side)
│   │   ├── auth/             # Auth endpoints
│   │   ├── audiences/        # Audience CRUD
│   │   ├── admin/            # Admin-only endpoints
│   │   ├── chat/             # Chat endpoints
│   │   ├── credits/          # Credit system
│   │   ├── enrich/           # Contact enrichment
│   │   ├── visitors/         # Visitor data
│   │   ├── pixels/           # Pixel management
│   │   ├── stripe/           # Payment integration
│   │   ├── integrations/     # Third-party integrations
│   │   └── websites/         # Website management
│   ├── auth/                 # Auth pages (login, signup, etc.)
│   ├── audiences/            # Audience management pages
│   ├── admin/                # Admin pages
│   ├── account/              # User account pages
│   ├── chat/                 # Chat pages
│   └── partner/              # Partner dashboard
│
├── components/               # React components
│   ├── layout/               # Layout components
│   │   ├── Layout.tsx        # Main layout wrapper
│   │   ├── Sidebar.tsx       # Dynamic sidebar
│   │   ├── Header.tsx        # Top header bar
│   │   ├── TopBar.tsx        # Secondary nav bar
│   │   ├── PageHeader.tsx    # Page title component
│   │   └── Footer.tsx        # Footer
│   ├── chat/                 # Chat-specific components
│   ├── UpgradeNotification   # Plan upgrade prompts
│   ├── TrialNotification     # Trial status display
│   ├── ChatBubble            # Chat widget
│   └── ThemeSettings         # Theme customization
│
├── contexts/                 # React Context providers
│   ├── AuthContext.tsx        # Auth state & user profile
│   ├── UpgradeContext.tsx     # Feature gating & plan checks
│   └── OnboardingContext.tsx  # Onboarding tour (driver.js)
│
├── lib/                      # Utilities & services
│   ├── api.ts                # TrafficAPI service class
│   ├── api-helpers.ts        # Server-side auth helpers
│   ├── auth.ts               # Auth utilities
│   ├── settings.ts           # App settings helpers
│   ├── webhook-logger.ts     # Webhook event logging
│   ├── api-cache.ts          # Response caching
│   └── supabase/
│       ├── client.ts         # Browser Supabase client
│       ├── server.ts         # Server Supabase client
│       ├── middleware.ts      # Auth middleware helpers
│       ├── api.ts            # Server-side Supabase API
│       └── types.ts          # Database TypeScript types
│
├── types/                    # Custom TypeScript type definitions
├── styles/                   # Global CSS
│   └── globals.css           # Custom styles
└── middleware.ts             # Next.js edge middleware (auth guard)
```

### Path Aliases

Configured in `tsconfig.json`:

```typescript
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import styles from '@/styles/globals.css';
```

---

## 4. Local Development Setup

### Prerequisites

```bash
node --version   # v18+
pnpm --version   # v10+
```

### Installation

```bash
git clone <repository-url>
cd admin-panel
pnpm install
```

### Environment Configuration

```bash
cp .env.example .env.local
```

Fill in all required variables (see [Environment Variables](#13-environment-variables)).

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migration SQL from the `supabase/` directory in the SQL editor
3. Verify tables are created: `users`, `user_api_keys`, `audit_logs`, `roles`, `menu_items`, `role_permissions`, `pixels`, `visitors`, etc.

### Running the App

```bash
pnpm dev          # http://localhost:3000
```

### Other Commands

```bash
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # ESLint checks
pnpm type-check   # TypeScript type checking (tsc --noEmit)
```

---

## 5. Authentication System

### Overview

Authentication uses **Supabase Auth** with the **PKCE (Proof Key for Code Exchange)** flow, which is the recommended approach for browser-based apps.

### Flow

```
1. User submits credentials or clicks OAuth
2. Supabase returns an auth code
3. Code is exchanged for session tokens
4. Tokens stored in HTTP-only cookies
5. Middleware validates tokens on each request
6. Tokens auto-refresh before expiration
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/supabase/client.ts` | Browser Supabase client (PKCE flow) |
| `src/lib/supabase/server.ts` | Server Supabase client (service role) |
| `src/middleware.ts` | Route protection & session refresh |
| `src/contexts/AuthContext.tsx` | Global auth state provider |
| `src/pages/auth/login.tsx` | Login page (email + OAuth) |
| `src/pages/auth/callback.tsx` | OAuth callback handler |
| `src/pages/api/auth/assign-role.ts` | Role assignment endpoint |

### Supabase Client Configuration

```typescript
// src/lib/supabase/client.ts
const client = createBrowserClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,  // Manual code exchange
  }
});
```

`detectSessionInUrl: false` is critical - it prevents race conditions during OAuth callback handling.

### Middleware (Route Protection)

```typescript
// src/middleware.ts
// Protects all routes EXCEPT:
// - /auth/*         (login, signup, callback, reset)
// - /pixel.js       (tracking pixel script)
// - /api/pixel      (pixel data endpoint)
// - /api/stripe/webhook (Stripe webhook)
```

Unauthenticated users are redirected to `/auth/login?redirect=<original-url>`.

### Using Auth in Components

```typescript
import { useAuth } from '@/contexts/AuthContext';

export default function MyPage() {
  const { user, userProfile, userRole, loading, signOut } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Redirect to="/auth/login" />;

  return <div>Hello, {userProfile?.full_name}</div>;
}
```

### Auth Context Values

| Value | Type | Description |
|-------|------|-------------|
| `user` | `User \| null` | Supabase auth user object |
| `userProfile` | `UserProfile \| null` | Profile from `users` table |
| `userRole` | `string` | Current role name |
| `userMenuItems` | `MenuItem[]` | Sidebar items for role |
| `loading` | `boolean` | Auth state loading |
| `signOut` | `() => void` | Logout function |
| `refreshUser` | `() => void` | Re-fetch user data |

---

## 6. API Layer

### Architecture

All external API communication goes through Next.js API routes:

```
Frontend  -->  /api/audiences  -->  Traffic AI API
                    |
                    +--> Auth check
                    +--> Get user's API key from DB
                    +--> Forward request with credentials
                    +--> Log action to audit_logs
                    +--> Return response
```

### TrafficAPI Service (`src/lib/api.ts`)

The frontend uses the `TrafficAPI` class to call API routes:

```typescript
import { TrafficAPI } from '@/lib/api';

// List audiences
const audiences = await TrafficAPI.getAudiences();

// Create audience
const audience = await TrafficAPI.createAudience({ name: '...', filters: {...} });

// Enrich contact
const contact = await TrafficAPI.enrichContact({ email: 'user@example.com' });

// Get credits
const credits = await TrafficAPI.getCredits();
```

### API Helper Functions (`src/lib/api-helpers.ts`)

Server-side utilities for API routes:

```typescript
import {
  getAuthenticatedUser,
  getUserApiKey,
  requireRole,
  logAuditEvent,
} from '@/lib/api-helpers';

export default async function handler(req, res) {
  // Verify the user is authenticated
  const user = await getAuthenticatedUser(req, res);
  if (!user) return; // 401 already sent

  // Get user's Traffic AI API key
  const apiKey = await getUserApiKey(user.id);
  if (!apiKey) return res.status(403).json({ error: 'No API key assigned' });

  // Forward to external API
  const response = await fetch(`${TRAFFIC_AI_API_URL}/audiences`, {
    headers: { 'X-API-Key': apiKey },
  });

  // Log the action
  await logAuditEvent(user.id, 'list_audiences', 'audience');

  return res.json(await response.json());
}
```

### Admin-Only Endpoints

```typescript
import { requireRole } from '@/lib/api-helpers';

export default async function handler(req, res) {
  // Returns null and sends 403 if user is not admin
  const roleCheck = await requireRole(req, res, 'admin');
  if (!roleCheck) return;

  // Admin-only logic here
}
```

### API Route Structure

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/audiences` | GET, POST | User | List/create audiences |
| `/api/audiences/[id]` | GET, DELETE | User | Get/delete audience |
| `/api/audiences/custom` | POST | User | Create custom audience |
| `/api/audiences/attributes` | GET | User | Get filter attributes |
| `/api/enrich` | POST | User | Enrich a contact |
| `/api/credits` | GET | User | Get credit balance |
| `/api/visitors` | GET | User | List visitors |
| `/api/pixels` | GET, POST | User | Manage pixels |
| `/api/chat/*` | Various | User | Chat operations |
| `/api/admin/*` | Various | Admin | Admin operations |
| `/api/stripe/*` | Various | Mixed | Payment operations |

---

## 7. Database Schema

### Core Tables

#### `users`
```sql
id              UUID PRIMARY KEY    -- References auth.users
email           TEXT UNIQUE
role            user_role           -- 'admin' | 'team' | 'user'
role_id         UUID FK             -- References roles table
full_name       TEXT
phone           TEXT
company         TEXT
company_website TEXT
plan            TEXT                -- 'trial' | 'starter' | 'growth' | 'professional' | 'enterprise'
trial_ends_at   TIMESTAMPTZ
onboarding_completed BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `user_api_keys`
```sql
id              UUID PRIMARY KEY
user_id         UUID FK UNIQUE      -- One key per user
api_key         TEXT                -- Traffic AI API key
assigned_by     UUID FK             -- Admin who assigned
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `audit_logs`
```sql
id              UUID PRIMARY KEY
user_id         UUID FK
action          TEXT                -- e.g., 'create_audience'
resource_type   TEXT                -- e.g., 'audience'
resource_id     TEXT
metadata        JSONB
created_at      TIMESTAMPTZ         -- Indexed DESC
```

#### `roles`
```sql
id              UUID PRIMARY KEY
name            TEXT UNIQUE
description     TEXT
is_system       BOOLEAN             -- System roles can't be deleted
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `menu_items`
```sql
id              UUID PRIMARY KEY
name            TEXT
href            TEXT
icon            TEXT                -- Tabler icon name
display_order   INTEGER
parent_id       UUID FK             -- Self-referencing for submenus
is_active       BOOLEAN
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `role_permissions`
```sql
id              UUID PRIMARY KEY
role_id         UUID FK
menu_item_id    UUID FK
created_at      TIMESTAMPTZ
```

#### `visitors`
```sql
id              UUID PRIMARY KEY
pixel_id        UUID FK
user_id         UUID FK
visitor_id      TEXT
email           TEXT
first_name      TEXT
last_name       TEXT
company         TEXT
job_title       TEXT
linkedin_url    TEXT
lead_score      INTEGER
is_identified   BOOLEAN
is_enriched     BOOLEAN
enrichment_source TEXT
enrichment_data JSONB
total_pageviews INTEGER
total_sessions  INTEGER
total_time_on_site FLOAT
max_scroll_depth FLOAT
total_clicks    INTEGER
form_submissions INTEGER
city            TEXT
state           TEXT
country         TEXT
ip_address      TEXT
first_seen_at   TIMESTAMPTZ
last_seen_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### Row Level Security (RLS)

All tables have RLS enabled. General policy pattern:

```sql
-- Users can read their own data
CREATE POLICY "Users can view own data"
  ON table_name FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all data
CREATE POLICY "Admins can view all data"
  ON table_name FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
```

### Triggers

- **`handle_new_user()`** - Auto-creates a `users` row when a new `auth.users` entry is inserted
- **`update_updated_at()`** - Auto-updates `updated_at` on row modification

---

## 8. Role-Based Access Control

### Roles

| Role | Scope | Description |
|------|-------|-------------|
| `admin` | Full access | Manage users, roles, approvals, settings |
| `team` | Standard access | Use all features, no admin panel |
| `user` | Limited access | Basic features based on plan |

### How RBAC Works

1. User's `role_id` links to the `roles` table
2. `role_permissions` maps roles to `menu_items`
3. `AuthContext` fetches role + menu items via `/api/auth/assign-role`
4. `Sidebar.tsx` renders menu items dynamically
5. API routes check roles with `requireRole()`

### Adding a New Role

1. Insert into `roles` table
2. Insert relevant `role_permissions` entries linking to `menu_items`
3. Assign users to the new role via `role_id`

### Feature Gating by Plan

The `UpgradeContext` checks the user's plan and gates features:

```typescript
import { useUpgrade } from '@/contexts/UpgradeContext';

function MyComponent() {
  const { canAccess, showUpgrade } = useUpgrade();

  if (!canAccess('custom_audiences')) {
    return <UpgradeNotification feature="custom_audiences" />;
  }

  return <CustomAudienceForm />;
}
```

---

## 9. Frontend Patterns

### Page Layout

Every page uses the `Layout` component:

```typescript
import Layout from '@/components/layout/Layout';

export default function MyPage() {
  return (
    <Layout
      pageTitle="Page Title"
      pagePretitle="Section"
      pageActions={<button className="btn btn-primary">Action</button>}
    >
      {/* Page content */}
    </Layout>
  );
}
```

### State Management

The app uses React Context for global state:

- **`AuthContext`** - User authentication & profile
- **`UpgradeContext`** - Plan-based feature gating
- **`OnboardingContext`** - Onboarding tour state

Local state uses `useState` and `useEffect` hooks. No external state library (Redux, Zustand) is used.

### UI Components

The app uses **Tabler UI** components (Bootstrap 5-based):

```tsx
// Buttons
<button className="btn btn-primary">Primary</button>
<button className="btn btn-outline-secondary">Secondary</button>

// Cards
<div className="card">
  <div className="card-header">
    <h3 className="card-title">Title</h3>
  </div>
  <div className="card-body">Content</div>
</div>

// Tables
<div className="table-responsive">
  <table className="table table-vcenter">
    <thead><tr><th>Column</th></tr></thead>
    <tbody><tr><td>Data</td></tr></tbody>
  </table>
</div>

// Icons
import { IconUsers, IconPlus } from '@tabler/icons-react';
<IconUsers size={20} />
```

### API Calls from Pages

```typescript
import { TrafficAPI } from '@/lib/api';

export default function AudiencesPage() {
  const [audiences, setAudiences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    TrafficAPI.getAudiences()
      .then(data => setAudiences(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  // render...
}
```

### Theme Customization

Theme colors are controlled via CSS variables injected at runtime:

```typescript
// ThemeSettings.tsx
document.documentElement.style.setProperty('--tblr-primary', color);
```

---

## 10. Third-Party Integrations

### Supabase

**Client-side** (`src/lib/supabase/client.ts`):
- PKCE auth flow
- Cookie-based sessions
- Used by `AuthContext` and frontend data fetching

**Server-side** (`src/lib/supabase/server.ts`):
- Service role key (bypasses RLS)
- Used in API routes for admin operations
- Never exposed to the browser

### Stripe

**Integration files:**
- `src/pages/api/stripe/create-checkout.ts` - Create billing sessions
- `src/pages/api/stripe/portal.ts` - Customer portal access
- `src/pages/api/stripe/verify-session.ts` - Verify payment completion
- `src/pages/api/stripe/webhook.ts` - Handle Stripe events

**Webhook events handled:**
- `checkout.session.completed` - Update user plan
- `customer.subscription.updated` - Plan changes
- `customer.subscription.deleted` - Cancellations

**Configuration**: Stripe keys are stored in the `app_settings` table (not environment variables in production).

### Traffic AI API

**Base URL**: Set via `TRAFFIC_AI_API_URL` environment variable

**Authentication**: `X-API-Key` header with per-user API keys stored in `user_api_keys` table

**Endpoints consumed:**
- `GET /audiences` - List audiences
- `POST /audiences` - Create audience
- `GET /audiences/{id}` - Get audience
- `DELETE /audiences/{id}` - Delete audience
- `POST /audiences/custom` - Custom AI audience
- `GET /attributes` - Filter attributes
- `POST /enrich` - Contact enrichment
- `GET /credits` - Credit balance

---

## 11. Testing

### Playwright (E2E)

Configuration in `playwright.config.ts`.

```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test tests/auth.spec.ts

# Run in headed mode
npx playwright test --headed

# Generate test
npx playwright codegen http://localhost:3000
```

### Type Checking

```bash
pnpm type-check   # Runs tsc --noEmit
```

### Linting

```bash
pnpm lint          # ESLint with next/core-web-vitals
```

---

## 12. Deployment

### Vercel (Recommended)

**Configuration** (`vercel.json`):
```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "no-store, must-revalidate" }]
    }
  ]
}
```

**Deployment steps:**
1. Push to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Add all environment variables
4. Deploy

**Post-deployment:**
1. Update `NEXT_PUBLIC_APP_URL` to your Vercel domain
2. Update Supabase OAuth redirect URLs
3. Update Google Cloud Console OAuth credentials
4. Verify Stripe webhook endpoint URL

### Deployment Checklist

- [ ] All environment variables configured in Vercel
- [ ] Supabase URL and keys are correct
- [ ] `TRAFFIC_AI_API_URL` is set
- [ ] Google OAuth redirect URLs updated
- [ ] Supabase Auth redirect URLs updated
- [ ] Stripe webhook URL updated
- [ ] Database migrations applied
- [ ] First admin user created
- [ ] SSL certificate active (automatic on Vercel)

---

## 13. Environment Variables

### Required

| Variable | Side | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key |
| `TRAFFIC_AI_API_URL` | Server only | Traffic AI API base URL |
| `NEXT_PUBLIC_APP_URL` | Client + Server | Application base URL |

### Optional

| Variable | Side | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_PAPERCUPS_ACCOUNT_ID` | Client | Chat widget account ID |
| `NEXT_PUBLIC_PAPERCUPS_INBOX_ID` | Client | Chat widget inbox ID |
| `NEXT_PUBLIC_PAPERCUPS_BASE_URL` | Client | Chat widget API URL |
| `STRIPE_SECRET_KEY` | Server only | Stripe API key (prefer app_settings table) |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook secret |
| `DEBUG` | Server only | Enable debug logging |

> **Important**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never prefix secret keys with `NEXT_PUBLIC_`.

---

## 14. Code Conventions

### File Naming

- **Pages**: `kebab-case.tsx` (Next.js convention)
- **Components**: `PascalCase.tsx`
- **Utilities**: `kebab-case.ts`
- **Types**: `kebab-case.ts`
- **API routes**: `kebab-case.ts`

### TypeScript

- Strict mode enabled
- Use interfaces for object types
- Use Zod for runtime validation on API routes
- Avoid `any` - use `unknown` if type is truly unknown

### Imports

```typescript
// External libraries first
import { useState, useEffect } from 'react';
import { IconUsers } from '@tabler/icons-react';

// Internal imports (use path aliases)
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI } from '@/lib/api';
```

### API Route Pattern

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    // Handle GET
  } else if (req.method === 'POST') {
    // Handle POST
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end();
  }
}
```

### Component Pattern

```typescript
import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';

export default function FeaturePage() {
  const { user, userProfile } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch data, handle state...

  return (
    <Layout pageTitle="Feature" pagePretitle="Section">
      {/* Content */}
    </Layout>
  );
}
```

### Git Workflow

- Branch from `main` for features and fixes
- Use descriptive commit messages
- Run `pnpm lint` and `pnpm type-check` before committing

---

## Further Reading

- [Quick Guide](./quick-guide.md) - Get started in 30 minutes
- [User Guide](./user-guide.md) - Full feature walkthrough
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tabler UI Documentation](https://tabler.io/docs)
