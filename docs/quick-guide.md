# Traffic AI Admin Panel - Quick Guide

Get up and running with Traffic AI in under 30 minutes.

---

## Prerequisites

- **Node.js** 18+ installed
- **pnpm** 10+ installed (`npm install -g pnpm`)
- A **Supabase** project ([supabase.com](https://supabase.com))
- A **Google Cloud** project (for OAuth - optional)

---

## 1. Clone & Install

```bash
git clone <repository-url>
cd admin-panel
pnpm install
```

## 2. Configure Environment

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `TRAFFIC_AI_API_URL` | Traffic AI API base URL |
| `NEXT_PUBLIC_APP_URL` | Your app URL (default: `http://localhost:3000`) |

## 3. Set Up the Database

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Run the database migration script located in `supabase/` directory
4. This creates all required tables, RLS policies, and triggers

## 4. Start the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 5. Create Your First Admin Account

1. Navigate to `/auth/signup` and create an account
2. Open Supabase Dashboard > **Table Editor** > `users` table
3. Change your user's `role` field to `admin`
4. Refresh the app - you now have admin access

## 6. Assign an API Key

1. Go to **Admin > Users** in the sidebar
2. Click on your user account
3. Enter a Traffic AI API key and save
4. You can now use audience creation, enrichment, and visitor tracking

---

## Key Areas of the App

| Feature | URL | Description |
|---------|-----|-------------|
| Dashboard | `/` | Real-time visitor stats and analytics |
| Pixels | `/pixels` | Create and manage tracking pixels |
| Visitors | `/visitors` | View identified website visitors |
| Audiences | `/audiences` | Build and manage audience segments |
| Enrichment | `/enrich` | Search and enrich contact data |
| Chat | `/chat` | Conversations with site visitors |
| Billing | `/account/billing` | Subscription plans and billing |
| Admin Panel | `/admin/users` | User management (admin only) |

---

## Common Commands

```bash
pnpm dev          # Start development server
pnpm build        # Create production build
pnpm start        # Run production server
pnpm lint         # Run linter
pnpm type-check   # Check TypeScript types
```

---

## Deployment (Vercel)

1. Push your code to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Add all environment variables from `.env.local` to Vercel's dashboard
4. Update Supabase OAuth redirect URLs to your Vercel domain
5. Deploy

---

## Troubleshooting

### "Not authenticated" after login
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
- Check that the Supabase project has email auth enabled

### Can't see admin menu items
- Verify your `role` is set to `admin` in the `users` table
- Check that `roles` and `menu_items` tables are populated

### API calls return 401/403
- Ensure you have an API key assigned in Admin > Users
- Check that `TRAFFIC_AI_API_URL` is correct in `.env.local`

### OAuth login fails
- Verify Google OAuth credentials in Supabase Auth settings
- Ensure redirect URL is set to `<your-domain>/auth/callback`

---

## Next Steps

- Read the [User Guide](./user-guide.md) for a full feature walkthrough
- Read the [Developer Guide](./developer-guide.md) for architecture and contribution details
