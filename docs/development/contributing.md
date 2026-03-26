# Contributing Guide

> Standard process for adding features, fixing bugs, and shipping changes safely.

---

## 1. Development Workflow

```
1. Create feature branch from main
2. Implement changes
3. Run checklists (below)
4. Test locally
5. Create PR with description
6. Deploy to Vercel preview
7. Verify on preview
8. Merge to main (auto-deploys to production)
9. Post-deploy verification
```

### Branch Naming

```
feature/short-description     (new feature)
fix/short-description         (bug fix)
refactor/short-description    (code improvement)
migration/short-description   (database changes)
```

---

## 2. Pre-PR Checklists

### General Checklist (All Changes)

- [ ] Code builds without errors: `pnpm build`
- [ ] Lint passes: `pnpm lint`
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] No `console.log` left in production code (use `logEvent()` for system logging)
- [ ] Supabase queries use `.range()` for any query that could return >100 rows
- [ ] No N+1 query patterns (batch operations where possible)

### API Route Checklist

- [ ] Auth guard applied: `getAuthenticatedUser()` for user routes, `requireRole('admin')` for admin routes
- [ ] Cron routes verify `CRON_SECRET` bearer token
- [ ] Input validated (use Zod for complex payloads)
- [ ] Error responses use consistent format: `{ error: 'message' }`
- [ ] Success responses include relevant data
- [ ] `logEvent()` called for significant operations
- [ ] `maxDuration` set if processing could exceed 10s

### Database Migration Checklist

- [ ] Migration file follows naming: `{NNN}_{description}.sql`
- [ ] Uses `IF NOT EXISTS` / `IF EXISTS` for idempotency
- [ ] RLS enabled on new tables
- [ ] Service role policy added for server-side access
- [ ] User-scoped policy added for RLS filtering
- [ ] Indexes added on foreign keys and frequently queried columns
- [ ] `ON DELETE CASCADE` on FK references to `auth.users`
- [ ] Tested on local/staging Supabase instance
- [ ] Backup taken before running on production
- [ ] Rollback SQL documented (how to reverse this migration)
- [ ] Updated `docs/database/database-guide.md` with new table/column info

### Integration Checklist (New Integration)

- [ ] Platform type added to `PlatformType` in `src/lib/integrations.ts`
- [ ] Config added to `INTEGRATION_CONFIGS` in `src/lib/integration-configs.ts`
- [ ] Added to `INTEGRATION_ORDER` array
- [ ] API endpoints created: `connect`, `status`, `sync` (minimum)
- [ ] OAuth callback URL registered with third-party service (if OAuth)
- [ ] PII hashed before sending to external services (SHA-256)
- [ ] Error handling: integration failures don't crash other operations
- [ ] Cron job added if auto-sync required (with timeout guard and fairness)
- [ ] Updated `docs/integrations/integrations-registry.md`
- [ ] Updated `docs/cron-jobs/cron-jobs.md` (if cron added)

### Cron Job Checklist (New or Modified Cron)

- [ ] `CRON_SECRET` verification at top of handler
- [ ] `maxDuration: 300` set in config export
- [ ] Timeout guard: stops processing before Vercel hard-kills (use 270s limit)
- [ ] Multi-user fairness: interleave or round-robin if processing per-user resources
- [ ] Pagination: queries handle >1000 rows
- [ ] Rate limiting: appropriate delays between external API calls
- [ ] Logging: `logEvent()` for successes AND failures
- [ ] Error isolation: one user's failure doesn't crash the whole cron
- [ ] Schedule added to `vercel.json`
- [ ] Updated `docs/cron-jobs/cron-jobs.md`

---

## 3. PR Description Template

```markdown
## What

Brief description of the change (1-2 sentences).

## Why

Context: what problem this solves or what feature this adds.

## Changes

- File-level summary of what was modified
- Highlight any database migration included

## Checklist

- [ ] Builds clean (`pnpm build`)
- [ ] Tested locally
- [ ] Docs updated (if applicable)
- [ ] Migration tested on staging (if applicable)

## Testing

How to verify this works:
1. Step-by-step instructions
2. Expected behavior
```

---

## 4. Database Migration Process

### Step-by-Step

1. **Create migration file:**
   ```
   supabase/migrations/{NNN}_{description}.sql
   ```
   Use the next number after the latest migration (check `ls supabase/migrations/`).

2. **Write SQL** following the template in `docs/database/database-guide.md`

3. **Test locally:**
   ```bash
   # Option A: Supabase local
   supabase start
   supabase db reset  # applies all migrations

   # Option B: Run SQL directly in Supabase Dashboard SQL Editor (staging project)
   ```

4. **Take production backup** (if modifying existing data):
   ```bash
   supabase db dump -f pre_migration_backup.sql --data-only --table affected_table
   ```

5. **Apply to production:**
   - For Supabase-managed migrations: push via `supabase db push`
   - For manual application: run SQL in Supabase Dashboard SQL Editor

6. **Verify:** Check that new tables/columns appear in Supabase Table Editor

7. **Update docs:** Add new tables/columns to `docs/database/database-guide.md`

### Rollback

Never modify an existing migration. To reverse a change:

1. Create a new migration: `{NNN+1}_revert_{description}.sql`
2. Write the reverse SQL (DROP TABLE, ALTER TABLE DROP COLUMN, etc.)
3. Follow the same test -> backup -> apply -> verify process

---

## 5. Adding a New Feature (End-to-End)

### Example: Adding a new integration with auto-sync

```
1. Database migration
   └── Create tables for the integration

2. Backend
   ├── Add to PlatformType and INTEGRATION_CONFIGS
   ├── Create API routes (connect, status, sync, callback)
   ├── Add cron job if auto-sync needed
   └── Add logEvent() calls

3. Frontend
   ├── Create integration page (or use dynamic [type].tsx)
   └── Add to Integrations page list

4. Cron (if auto-sync)
   ├── Create handler at src/pages/api/cron/<name>.ts
   ├── Add to vercel.json
   ├── Add timeout guard + fairness
   └── Add logging

5. Documentation
   ├── Update integrations-registry.md
   ├── Update cron-jobs.md (if cron added)
   ├── Update database-guide.md (if migration added)
   └── Update system-architecture.md (if new external dependency)

6. Testing
   ├── Test connection flow
   ├── Test sync flow
   ├── Test error handling (invalid key, API down)
   ├── Test cron with multiple users
   └── Verify System Logs show expected events

7. Deploy
   ├── Run migration on production
   ├── Deploy code to Vercel
   ├── Verify cron triggers
   └── Monitor System Logs for first successful run
```

---

## 6. Code Patterns to Follow

### Do

- Use `logEvent()` for all significant operations
- Batch database operations (200 for inserts, 50 for updates)
- Paginate all Supabase queries that could return >100 rows
- Use service role client for crons and admin operations
- Hash PII before sending to ad platforms
- Add timeout guards in cron jobs

### Don't

- Don't expose `SERVICE_ROLE_KEY` to client-side code
- Don't modify existing migration files
- Don't skip RLS on new tables
- Don't process all items in a cron without a timeout guard
- Don't use `.limit(10000)` -- use `.range()` with pagination loop
- Don't commit `.env` files or API keys
- Don't add `console.log` for production logging -- use `logEvent()`
