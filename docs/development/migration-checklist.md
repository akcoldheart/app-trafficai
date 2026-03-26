# Database Migration Checklist

> Use this checklist every time you create a new database migration.

---

## Before Writing

- [ ] Identified the next migration number: check `ls supabase/migrations/` for the latest
- [ ] Confirmed this change can't be done without a migration (e.g., not just a code change)
- [ ] Checked if an existing table can be extended instead of creating a new one

## Writing the Migration

- [ ] File named: `{NNN}_{snake_case_description}.sql`
- [ ] Header comment includes: description, date, and purpose
- [ ] All `CREATE TABLE` uses `IF NOT EXISTS`
- [ ] All `DROP` / `ALTER` uses `IF EXISTS`
- [ ] Primary key: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- [ ] Timestamps: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- [ ] Foreign keys: `REFERENCES auth.users(id) ON DELETE CASCADE` (for user FKs)
- [ ] RLS enabled: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
- [ ] Service role policy: allows `ALL` for `auth.role() = 'service_role'`
- [ ] User policy: `SELECT` / `INSERT` / `UPDATE` filtered by `auth.uid() = user_id`
- [ ] Indexes on: foreign key columns, frequently filtered columns
- [ ] Menu item inserted (if adding a new admin page)
- [ ] Uses `ON CONFLICT DO NOTHING` for seed data inserts

## Testing

- [ ] Ran on local Supabase or staging project
- [ ] Verified tables/columns created correctly
- [ ] Verified RLS policies work (test as user and as service role)
- [ ] Verified indexes exist with `\d {table}` or Table Editor

## Deploying

- [ ] Production backup taken (manual dump of affected tables)
- [ ] Migration applied to production
- [ ] Verified in Supabase Dashboard that schema matches expectations
- [ ] App still works after migration (smoke test)

## After Deploying

- [ ] Updated `docs/database/database-guide.md` with new tables/columns
- [ ] Updated next migration number in database guide
- [ ] Committed migration file to git
