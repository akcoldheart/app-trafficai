# Traffic AI Admin Panel - Quick Start Guide

Get up and running in 30 minutes!

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ pnpm installed (`npm install -g pnpm`)
- ✅ Supabase account (free tier is fine)
- ✅ Google Cloud Console account (for OAuth)

---

## Step 1: Supabase Setup (10 min)

### Create Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **New Project**
3. Enter project details and create

### Run Database Migration

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy entire contents of `supabase-schema.sql`
4. Paste and click **Run**
5. ✅ You should see "Success. No rows returned"

### Get Your Credentials

1. Go to **Project Settings** → **API**
2. Copy these values:
   ```
   Project URL: https://xxx.supabase.co
   anon public: eyJxxx...
   service_role: eyJxxx... (keep secret!)
   ```

---

## Step 2: Google OAuth Setup (5 min)

### In Supabase

1. Go to **Authentication** → **Providers**
2. Find **Google** and enable it
3. Copy the **Callback URL** (looks like: `https://xxx.supabase.co/auth/v1/callback`)

### In Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project or select existing
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add these URLs:
   - **Authorized JavaScript origins**: `https://xxx.supabase.co`
   - **Authorized redirect URIs**: Paste the Supabase callback URL
7. Copy **Client ID** and **Client secret**

### Back to Supabase

1. Go to **Authentication** → **Providers** → **Google**
2. Paste **Client ID** and **Client secret**
3. Click **Save**

---

## Step 3: Local Setup (5 min)

### Install Dependencies

```bash
cd "/Applications/Traffic Ai/admin-panel"
pnpm install
```

### Configure Environment

1. Open `.env.local`
2. Replace placeholders with your actual values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key-here
TRAFFIC_AI_API_URL=https://v3-api-job-72802495918.us-east1.run.app
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Start Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

✅ You should see the login page!

---

## Step 4: Create Admin Account (5 min)

### Sign Up

1. Click **Sign up**
2. Enter your email and password (min 8 characters)
3. Click **Create account**
4. You'll be redirected to login

### Make Yourself Admin

1. Go to Supabase dashboard
2. Navigate to **Table Editor** → **users** table
3. Find your email in the list
4. Click on the row to edit
5. Change `role` from `partner` to `admin`
6. Click **Save**

### Assign Your API Key

1. Still in **Table Editor**, go to **user_api_keys** table
2. Click **Insert** → **Insert row**
3. Fill in:
   - `user_id`: Copy your ID from the users table
   - `api_key`: Your Traffic AI API key
   - `assigned_by`: Same as user_id (you're assigning to yourself)
4. Click **Save**

---

## Step 5: Test Everything (5 min)

### Log In

1. Go back to [http://localhost:3000](http://localhost:3000)
2. Enter your email and password
3. Click **Sign in**

✅ You should see the Dashboard!

### Test Features

- **Dashboard**: Should load and show your stats
- **Audiences**: Should display your audiences (if any)
- **Create Audience**: Try creating a test audience
- **Enrichment**: Try enriching a contact
- **Settings**: Check your user settings
- **Header**: Click your name in top-right
  - Should show your role badge (Admin)
  - Should have "Manage Users" option

### Test Admin Features (Optional)

1. Click **Manage Users** in header dropdown
2. Go to [http://localhost:3000/admin/users](http://localhost:3000/admin/users)
3. You should see the list of users (just you for now)

---

## Step 6: Deploy to Vercel (Optional, 10 min)

### Push to GitHub

```bash
git add .
git commit -m "Add Supabase authentication and admin features"
git push origin main
```

### Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure:
   - **Framework**: Next.js (auto-detected)
   - **Root Directory**: `./`

### Add Environment Variables

Click **Environment Variables** and add:

```
NEXT_PUBLIC_SUPABASE_URL = https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key
SUPABASE_SERVICE_ROLE_KEY = your-service-role-key
TRAFFIC_AI_API_URL = https://v3-api-job-72802495918.us-east1.run.app
NEXT_PUBLIC_APP_URL = https://your-app.vercel.app
NODE_ENV = production
```

Click **Deploy**

### Update OAuth URLs

Once deployed, update redirect URLs:

**Supabase:**
1. **Authentication** → **URL Configuration**
2. Add: `https://your-app.vercel.app/auth/callback`

**Google Cloud:**
1. **APIs & Services** → **Credentials**
2. Edit your OAuth client
3. Add to **Authorized JavaScript origins**: `https://your-app.vercel.app`

✅ Done! Your app is live!

---

## Troubleshooting

### "No API key assigned" error
**Fix**: Add your API key to the `user_api_keys` table (Step 4)

### Can't log in
**Fix**: Check `.env.local` has correct Supabase credentials

### OAuth not working
**Fix**: Verify redirect URLs in both Supabase and Google Cloud Console

### "Unauthorized" errors
**Fix**: Make sure you're logged in and have an API key assigned

### Admin menu not showing
**Fix**: Change your role to `admin` in Supabase `users` table

---

## Next Steps

1. ✅ Invite team members (they can sign up at `/auth/signup`)
2. ✅ Assign roles to team members in Supabase dashboard
3. ✅ Assign API keys to users who need access
4. ✅ Customize theme colors in Settings (theme button, bottom-right)
5. ✅ Monitor audit logs in Supabase `audit_logs` table

---

## Need Help?

- **Setup Guide**: See `SETUP.md` for detailed instructions
- **Database**: See `DATABASE_SCHEMA.md` for schema reference
- **Implementation**: See `IMPLEMENTATION_SUMMARY.md` for what was built

---

## Useful Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run type checking
pnpm type-check

# Run linting
pnpm lint
```

---

## Default Credentials After Setup

- **First User Email**: Whatever you signed up with
- **Default Role**: `partner` (change to `admin` in Supabase)
- **Default Theme**: Dark mode with violet/purple accent

---

🎉 **Congratulations!** Your Traffic AI Admin Panel is now running with full authentication and admin features!
