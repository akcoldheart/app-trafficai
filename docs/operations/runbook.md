# Operations Runbook

> Procedures for monitoring, backup, incident response, and routine maintenance.

---

## 1. Health Monitoring

### Daily Checks (Automated via System Logs Page)

| Check | How | Healthy Signal |
|-------|-----|----------------|
| Cron execution | System Logs > filter `visitors_api_sync` | Entries every hour for each active pixel |
| Klaviyo sync | System Logs > filter `klaviyo_auto_sync` | Entries every 30 min if auto-sync enabled |
| RingCentral SMS | System Logs > filter event type `ringcentral` | SMS log entries every 10 min |
| Error rate | System Logs > filter Status = `error` | Zero or near-zero errors |
| Vercel cron | Vercel Dashboard > Crons tab | Green status, no timeouts |

### Weekly Checks

| Check | How | Action |
|-------|-----|--------|
| All users syncing | System Logs > check each user has recent `visitors_api_sync` entries | If a user is missing, check their pixel `status` and `visitors_api_url` |
| Integration health | System Logs > look for repeated `error` status per user | Contact user if their API key/token expired |
| Database size | Supabase Dashboard > Database > Size | Monitor growth rate |
| Vercel usage | Vercel Dashboard > Usage | Monitor function invocations and bandwidth |

### Red Flags

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| No `visitors_api_sync` logs for 2+ hours | Cron not running or all pixels failing | Check Vercel Cron logs, check API key validity |
| User missing from sync logs for 24h+ | Their pixel(s) getting skipped by timeout | Verify the round-robin is working, check total pixel count |
| Spike in error logs | External API down or token expired | Check AudienceLab status, check per-user token validity |
| `system_logs` table growing very fast | Too many info-level logs | Consider adding log retention policy |

---

## 2. Backup Procedures

### Database Backups

**Supabase handles daily automated backups** (included in all paid plans):

- **Point-in-time recovery (PITR):** Available on Pro plan -- restores to any second within retention window
- **Daily backups:** Available on all paid plans -- downloadable from Supabase Dashboard

#### Manual Backup (On-Demand)

For critical operations (before major migrations, bulk deletes, etc.):

```bash
# Export full database via Supabase CLI
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Export specific tables
supabase db dump -f visitors_backup.sql --data-only --table visitors
supabase db dump -f integrations_backup.sql --data-only --table platform_integrations
```

#### Pre-Migration Backup Checklist

Before running any migration in production:

1. Verify Supabase has a recent daily backup (check Dashboard > Backups)
2. If the migration modifies or deletes data, take a manual backup of affected tables
3. Test migration on staging/local first
4. Document rollback SQL in case migration needs to be reversed

### Code Backups

- **Git:** All code is version-controlled in Git
- **Vercel:** Each deployment creates an immutable snapshot (rollback via Vercel Dashboard)
- **Environment variables:** Backed up in Vercel project settings (consider exporting periodically)

### Backup Schedule

| What | Frequency | Method | Retention |
|------|-----------|--------|-----------|
| Database (full) | Daily | Supabase automated | Per plan (7-30 days) |
| Database (manual) | Before migrations | `supabase db dump` | Keep indefinitely |
| Code | Every commit | Git | Indefinite |
| Deployments | Every deploy | Vercel snapshots | Indefinite |
| Environment vars | Monthly | Manual export | Store securely |

---

## 3. Incident Response

### Severity Levels

| Level | Definition | Response Time | Examples |
|-------|-----------|---------------|----------|
| **P0 - Critical** | Full outage, data loss risk | Immediate | Database down, auth broken, cron deleting data |
| **P1 - High** | Major feature broken | Within 1 hour | All visitor syncs failing, payments broken |
| **P2 - Medium** | Single user/integration affected | Within 4 hours | One user's Klaviyo sync failing, single pixel error |
| **P3 - Low** | Minor issue, workaround exists | Within 24 hours | UI bug, non-critical log error |

### Response Procedure

#### P0/P1: Critical/High

1. **Identify:** Check System Logs page + Vercel function logs
2. **Contain:** If a cron is causing damage, disable it in `vercel.json` and redeploy
3. **Communicate:** Notify affected users
4. **Fix:** Deploy hotfix
5. **Verify:** Check System Logs for resumed normal operation
6. **Post-mortem:** Document what happened, root cause, and prevention

#### P2/P3: Medium/Low

1. **Log:** Create a ticket/issue
2. **Investigate:** Check System Logs, Vercel logs, and relevant code
3. **Fix:** Deploy in next release cycle
4. **Verify:** Monitor System Logs after deploy

### Rollback Procedure

```bash
# Rollback to previous Vercel deployment
# Option 1: Via Vercel Dashboard > Deployments > select previous > Promote to Production

# Option 2: Via CLI
vercel rollback
```

For database rollbacks:
1. Identify the problematic migration
2. Write a reverse migration (new migration file, do NOT modify the original)
3. Test on staging
4. Deploy

---

## 4. Common Operational Tasks

### Force-Sync a Specific User's Visitors

```bash
# Via admin API endpoint
curl -X POST "https://app.trafficai.io/api/admin/pixels/{PIXEL_ID}/fetch-visitors" \
  -H "Cookie: <admin-session-cookie>"
```

Or use the Pixel detail page in admin panel and click "Sync Visitors."

### Check Why a User Isn't Syncing

1. **System Logs page:** Search for the user's email -- any recent entries?
2. **Pixels table:** Is their pixel `status = 'active'`? Is `visitors_api_url` set?
3. **`visitors_api_last_fetch_status`:** Does it show an error message?
4. **Cron logs (Vercel):** Is the cron completing or timing out before reaching this pixel?
5. **API key:** Is the AudienceLab API key still valid? (Check `user_api_keys` table)

### Reconnect a Failed Integration

1. Check System Logs for the error (usually expired token or invalid API key)
2. For OAuth integrations (Facebook, RingCentral, Google Ads): User must re-authorize
3. For API key integrations: User must update their key in the Integrations page
4. After reconnection, verify via System Logs that the next cron run succeeds

### Clear Old System Logs

```sql
-- Delete logs older than 30 days (run in Supabase SQL Editor)
DELETE FROM system_logs
WHERE created_at < NOW() - INTERVAL '30 days';
```

Consider setting up a scheduled cleanup to prevent table bloat.

---

## 5. Monitoring Dashboards

| Dashboard | URL | What to Monitor |
|-----------|-----|-----------------|
| Supabase | `app.supabase.com` > Project | Database size, API requests, auth users |
| Vercel | `vercel.com` > Project | Cron executions, function errors, bandwidth |
| System Logs | `app.trafficai.io/admin/logs` | Per-user sync status, error rates |
| Stripe | `dashboard.stripe.com` | Payment failures, subscription churn |

---

## 6. Scaling Considerations

| Metric | Current Limit | When to Act | Action |
|--------|--------------|-------------|--------|
| Active pixels | ~90 per cron run (300s / 3s delay) | >50 pixels | Already handled by round-robin + timeout guard |
| Visitors per pixel | ~10K before queries slow | >5K per pixel | Add DB indexes, consider archiving old visitors |
| SMS per cron run | ~500 (10 min / 1.2s rate limit) | >300 active templates | Split into multiple cron invocations |
| System logs table | Grows ~3K rows/day | >500K rows | Implement 30-day retention cleanup |
| API function timeout | 300s (Vercel) | Processing takes >270s regularly | Reduce delay between pixels, optimize fetcher |
