# Traffic AI Admin Panel - Setup Guide

Complete setup instructions for deploying the Traffic AI Admin Panel with Supabase authentication and Vercel hosting.

## Prerequisites

- Node.js 18+ and pnpm
- Supabase account ([https://supabase.com](https://supabase.com))
- Vercel account ([https://vercel.com](https://vercel.com))
- Google Cloud Console project (for Google OAuth)

---

## 1. Supabase Setup

### Step 1: Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in project details and create

### Step 2: Run Database Migration

1. Go to your project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase-schema.sql`
4. Paste and run the SQL script

This will create:
- `users` table with role-based access
- `user_api_keys` table for storing Traffic AI API keys
- `audit_logs` table for tracking user actions
- Row Level Security (RLS) policies
- Automatic user profile creation on signup

### Step 3: Configure Google OAuth

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Google** provider
3. Go to [Google Cloud Console](https://console.cloud.google.com)
4. Create OAuth 2.0 credentials:
   - **Authorized JavaScript origins**: `https://your-project.supabase.co`
   - **Authorized redirect URIs**: `https://your-project.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret
6. Paste them into Supabase Google provider settings
7. Save

### Step 4: Get Supabase Credentials

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep secret!)

---

## 2. Local Development Setup

### Step 1: Clone and Install

```bash
cd "/Applications/Traffic Ai/admin-panel"
pnpm install
```

### Step 2: Configure Environment Variables

1. Open `.env.local` file
2. Replace placeholder values with your Supabase credentials:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key

# Traffic AI API
TRAFFIC_AI_API_URL=https://v3-api-job-72802495918.us-east1.run.app

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Step 3: Create First Admin User

1. Start the dev server:
```bash
pnpm dev
```

2. Go to [http://localhost:3000/auth/signup](http://localhost:3000/auth/signup)
3. Sign up with your admin email
4. Go to Supabase dashboard → **Table Editor** → `users` table
5. Find your user and change `role` to `admin`

### Step 4: Assign API Key to Admin

1. Go to **Table Editor** → `user_api_keys` table
2. Click **Insert** → **Insert row**
3. Fill in:
   - `user_id`: Your user ID (from users table)
   - `api_key`: Your Traffic AI API key
   - `assigned_by`: Your user ID
4. Save

### Step 5: Test the Application

1. Log out and log back in
2. You should now have access to all pages
3. As admin, you can manage users at `/admin/users`

---

## 3. Vercel Deployment

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Add Supabase authentication and admin features"
git push origin main
```

### Step 2: Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `.next`

### Step 3: Add Environment Variables

In Vercel project settings → **Environment Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TRAFFIC_AI_API_URL=https://v3-api-job-72802495918.us-east1.run.app
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production
```

### Step 4: Update Supabase Redirect URLs

1. Go to Supabase dashboard → **Authentication** → **URL Configuration**
2. Add your Vercel deployment URL to:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

### Step 5: Update Google OAuth

1. Go to Google Cloud Console
2. Update OAuth credentials:
   - Add `https://your-app.vercel.app` to Authorized JavaScript origins
   - Keep Supabase callback URL

### Step 6: Deploy

1. Click **Deploy** in Vercel
2. Wait for build to complete
3. Visit your production URL

---

## 4. User Management (Admin Only)

### Creating Users

Users can self-register at `/auth/signup`

### Assigning Roles

1. Log in as admin
2. Go to Supabase dashboard → `users` table
3. Change user's `role` column:
   - `admin` - Full access, can manage users and API keys
   - `team` - Access to all features except admin panel
   - `partner` - Limited access (default for new users)

### Assigning API Keys

**Option A: Via Admin Panel (Coming Soon)**
- Navigate to `/admin/users`
- Click on user → "Assign API Key"

**Option B: Via API**
```bash
curl -X PUT https://your-app.vercel.app/api/admin/api-keys/USER_ID \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "traffic-ai-api-key"}'
```

**Option C: Via Supabase Dashboard**
1. Go to `user_api_keys` table
2. Insert new row with user_id and api_key

---

## 5. Architecture Overview

### Authentication Flow

1. User signs up/logs in → Supabase Auth
2. Trigger creates user profile in `users` table with default role `partner`
3. Admin assigns Traffic AI API key via `user_api_keys` table
4. User accesses dashboard → Middleware checks auth
5. API routes retrieve user's API key and proxy to Traffic AI backend

### Role-Based Access Control

| Feature | Admin | Team | Partner |
|---------|-------|------|---------|
| View Dashboard | ✅ | ✅ | ✅ |
| Create Audiences | ✅ | ✅ | ✅ |
| Enrich Contacts | ✅ | ✅ | ✅ |
| Add Credits | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ |
| Assign API Keys | ✅ | ❌ | ❌ |
| View Audit Logs | ✅ | ❌ | ❌ |

### Database Schema

```
users
├── id (UUID, references auth.users)
├── email (TEXT)
├── role (user_role enum: admin/team/partner)
├── created_at
└── updated_at

user_api_keys
├── id (UUID)
├── user_id (UUID, references users)
├── api_key (TEXT)
├── assigned_by (UUID, references users)
├── created_at
└── updated_at

audit_logs
├── id (UUID)
├── user_id (UUID)
├── action (TEXT)
├── resource_type (TEXT)
├── resource_id (TEXT)
├── metadata (JSONB)
└── created_at
```

---

## 6. Troubleshooting

### "No API key assigned" Error

**Solution**: Admin needs to assign an API key to your user via the `user_api_keys` table.

### OAuth Redirect Error

**Solution**: Check that redirect URLs are correctly configured in both Supabase and Google Cloud Console.

### Middleware Loop / Infinite Redirects

**Solution**: Make sure `/auth/*` routes are accessible without authentication. Check `src/middleware.ts`.

### Can't Access Admin Pages

**Solution**: Verify your role is set to `admin` in the `users` table.

### Database Connection Errors

**Solution**: Verify Supabase credentials in `.env.local` and check Supabase project status.

---

## 7. Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
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

## 8. Security Best Practices

1. **Never commit `.env.local`** - It's in `.gitignore`
2. **Keep `SUPABASE_SERVICE_ROLE_KEY` secret** - Only use server-side
3. **Use HTTPS in production** - Vercel provides this automatically
4. **Rotate API keys regularly** - Update in `user_api_keys` table
5. **Monitor audit logs** - Check `audit_logs` table for suspicious activity
6. **Enable MFA** - In Supabase dashboard for admin accounts

---

## 9. Next Steps

1. ✅ Complete authentication setup
2. ✅ Deploy to Vercel
3. ⏳ Build admin user management UI (optional)
4. ⏳ Add audit log viewer (optional)
5. ⏳ Implement rate limiting (optional)
6. ⏳ Add email notifications (optional)

---

## Support

For issues or questions:
- Check Supabase documentation: [https://supabase.com/docs](https://supabase.com/docs)
- Check Next.js documentation: [https://nextjs.org/docs](https://nextjs.org/docs)
- Check Vercel documentation: [https://vercel.com/docs](https://vercel.com/docs)
