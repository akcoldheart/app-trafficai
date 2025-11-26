# Traffic AI Admin Panel - Database Schema Reference

Quick reference for the Supabase database schema.

## Tables

### 1. `public.users`

Extends `auth.users` with role information.

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role user_role DEFAULT 'partner',  -- admin, team, or partner
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Columns:**
- `id` - User ID (links to auth.users)
- `email` - User email address
- `role` - User role (admin/team/partner)
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

**Indexes:**
- `idx_users_email` on `email`
- `idx_users_role` on `role`

---

### 2. `public.user_api_keys`

Stores Traffic AI API keys assigned to users by admins.

```sql
CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  assigned_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
```

**Columns:**
- `id` - Unique identifier
- `user_id` - User this API key belongs to (one per user)
- `api_key` - The Traffic AI API key
- `assigned_by` - Admin who assigned this key
- `created_at` - When key was assigned
- `updated_at` - Last update timestamp

**Indexes:**
- `idx_user_api_keys_user_id` on `user_id`

**Constraints:**
- One API key per user (UNIQUE constraint on user_id)

---

### 3. `public.audit_logs`

Tracks all user actions for security and compliance.

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Columns:**
- `id` - Unique identifier
- `user_id` - User who performed the action
- `action` - Action performed (e.g., 'create_audience', 'delete_audience')
- `resource_type` - Type of resource (e.g., 'audience', 'user')
- `resource_id` - ID of the resource affected
- `metadata` - Additional data as JSON
- `created_at` - When action was performed

**Indexes:**
- `idx_audit_logs_user_id` on `user_id`
- `idx_audit_logs_created_at` on `created_at DESC`

**Common Actions:**
- `list_audiences`
- `view_audience`
- `create_audience`
- `create_custom_audience`
- `delete_audience`
- `enrich_contact`
- `add_credits`
- `list_users`
- `update_user_role`
- `assign_api_key`
- `remove_api_key`

---

## Enums

### `user_role`

```sql
CREATE TYPE user_role AS ENUM ('admin', 'team', 'partner');
```

**Values:**
- `admin` - Full access, can manage users and API keys
- `team` - Access to all features except admin panel
- `partner` - Limited access (default)

---

## Row Level Security (RLS) Policies

All tables have RLS enabled. Here are the key policies:

### `users` table:

1. **Users can view own data**
   ```sql
   auth.uid() = id
   ```

2. **Admins can view all users**
   ```sql
   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
   ```

3. **Admins can update users**
   ```sql
   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
   ```

### `user_api_keys` table:

1. **Users can view own API keys**
   ```sql
   auth.uid() = user_id
   ```

2. **Admins can view all API keys**
   ```sql
   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
   ```

3. **Admins can manage all API keys**
   ```sql
   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
   ```

### `audit_logs` table:

1. **Users can view own logs**
   ```sql
   auth.uid() = user_id
   ```

2. **Admins can view all logs**
   ```sql
   EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
   ```

3. **All authenticated users can insert logs**
   ```sql
   auth.uid() = user_id
   ```

---

## Triggers

### 1. Auto-create user profile on signup

```sql
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'partner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Purpose**: Automatically creates a user profile with default 'partner' role when a new user signs up.

### 2. Auto-update `updated_at` timestamp

```sql
CREATE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

**Purpose**: Automatically updates the `updated_at` column on every UPDATE.

---

## Common Queries

### Get user with role:
```sql
SELECT id, email, role, created_at
FROM public.users
WHERE id = 'user-uuid';
```

### Get user's API key:
```sql
SELECT api_key
FROM public.user_api_keys
WHERE user_id = 'user-uuid';
```

### Get recent audit logs for a user:
```sql
SELECT action, resource_type, resource_id, metadata, created_at
FROM public.audit_logs
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 50;
```

### List all users (admin only):
```sql
SELECT id, email, role, created_at,
  EXISTS (
    SELECT 1 FROM user_api_keys WHERE user_id = users.id
  ) as has_api_key
FROM public.users
ORDER BY created_at DESC;
```

### Assign API key to user:
```sql
INSERT INTO public.user_api_keys (user_id, api_key, assigned_by)
VALUES ('user-uuid', 'api-key-value', 'admin-uuid')
ON CONFLICT (user_id) DO UPDATE
  SET api_key = EXCLUDED.api_key,
      assigned_by = EXCLUDED.assigned_by,
      updated_at = NOW();
```

### Change user role:
```sql
UPDATE public.users
SET role = 'admin', updated_at = NOW()
WHERE id = 'user-uuid';
```

---

## Migration Script

The complete migration script is in `supabase-schema.sql`.

To run it:
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase-schema.sql`
4. Paste and execute

---

## Permissions

The schema grants these permissions:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

---

## Notes

- All IDs use UUID (not auto-incrementing integers)
- All timestamps use TIMESTAMPTZ (timezone-aware)
- RLS policies ensure data isolation
- Triggers handle automatic profile creation
- One API key per user (enforced by UNIQUE constraint)
- Audit logs are append-only (no UPDATE or DELETE)

---

## Backup & Restore

### Backup specific tables:
```bash
supabase db dump -f backup.sql
```

### Restore from backup:
```bash
psql -h db.xxx.supabase.co -U postgres -d postgres -f backup.sql
```

---

## Performance Considerations

- Indexes on frequently queried columns (email, role, user_id, created_at)
- JSONB for flexible metadata storage
- Partitioning audit_logs by date (optional, for high volume)

---

**Schema Version**: 1.0
**Last Updated**: 2025-01-25
