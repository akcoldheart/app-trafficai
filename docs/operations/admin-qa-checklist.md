# Admin QA Checklist

> Regular quality assurance tasks for the admin to keep the system running smoothly.

---

## Daily QA (5 minutes)

- [ ] **System Logs page:** Open `app.trafficai.io/admin/logs` and scan for any `error` status entries in the last 24 hours
- [ ] **Visitor sync coverage:** Verify `visitors_api_sync` events exist for today -- each active pixel should have at least one entry
- [ ] **Cron health:** Check Vercel Dashboard > Crons -- all 4 crons should show recent successful executions
- [ ] **Error spike:** If more than 5 errors in 24 hours, investigate immediately

---

## Weekly QA (15 minutes)

### User Coverage Check
- [ ] **All users syncing:** In System Logs, verify every paying user has `visitors_api_sync` entries within the last 24 hours
- [ ] **Missing users:** If a user has no sync logs for 24h+, check:
  - Is their pixel `status = 'active'`?
  - Is `visitors_api_url` populated?
  - Is `visitors_api_last_fetch_status` showing an error?

### Integration Health
- [ ] **Klaviyo auto-syncs:** Filter logs by `klaviyo_auto_sync_visitors` -- are enabled users getting synced?
- [ ] **RingCentral SMS:** Check `ringcentral_sms_log` table for any `status = 'failed'` entries this week
- [ ] **Token expiry:** Look for integration errors mentioning "unauthorized", "expired", or "401"

### Database Check
- [ ] **Supabase Dashboard:** Check database size and connection count
- [ ] **System logs table size:** If growing beyond 100K rows, run cleanup (see Runbook)

### Payment Health
- [ ] **Stripe Dashboard:** Check for failed payments or subscription issues
- [ ] **Trial expirations:** Review users approaching trial end

---

## Monthly QA (30 minutes)

### Full System Audit
- [ ] **All integrations:** Run through each integration type in System Logs -- are all types working?
- [ ] **Pixel inventory:** Count active pixels vs total pixels -- is the ratio healthy?
- [ ] **Visitor growth:** Check total visitor count trend -- is it growing as expected?
- [ ] **Lead score distribution:** Spot-check visitor lead scores -- are they realistic?

### Performance Review
- [ ] **Cron duration:** Check Vercel function logs -- are crons completing well within 300s?
- [ ] **Timeout skips:** Look for `[cron/fetch-visitors] Timeout approaching` in Vercel logs -- if frequent, consider optimizing
- [ ] **API response times:** Spot-check Vercel function duration for key API routes

### Security Review
- [ ] **User roles:** Verify no unauthorized users have admin role
- [ ] **API keys:** Verify `user_api_keys` table has a valid, non-expired key
- [ ] **Environment variables:** Confirm all required env vars are set in Vercel
- [ ] **Supabase RLS:** Spot-check that new tables have RLS policies enabled

### Backup Verification
- [ ] **Supabase backups:** Confirm daily backups are running (Dashboard > Backups)
- [ ] **Test restore:** Quarterly, test restoring a backup to a staging instance
- [ ] **Environment vars backup:** Export and securely store current env vars

### Documentation Review
- [ ] **Check for undocumented features:** If any new integrations or crons were added, verify docs are updated
- [ ] **Migration log:** Verify latest migration is documented in `database/database-guide.md`

---

## Quarterly QA (1 hour)

### Deep Audit
- [ ] **Orphaned data:** Check for visitors with no associated pixel, or pixels with no user
- [ ] **Stale integrations:** Identify `platform_integrations` with `is_connected = true` but `last_synced_at` older than 30 days
- [ ] **Log retention:** Clean system_logs older than 90 days
- [ ] **Dependency updates:** Check for critical security updates in `package.json` dependencies
- [ ] **Supabase plan review:** Is the current plan sufficient for database size and API usage?

### Disaster Recovery Test
- [ ] **Backup restore test:** Restore a Supabase backup to a test instance
- [ ] **Vercel rollback test:** Practice rolling back a deployment
- [ ] **Cron recovery test:** Verify crons resume correctly after a deployment
- [ ] **Document findings:** Update runbook with any new learnings

---

## After Every Deployment

- [ ] **Verify crons:** Check Vercel Dashboard > Crons -- all 4 should trigger on next schedule
- [ ] **Smoke test:** Load the admin panel, check System Logs page works
- [ ] **Check new migration:** If a migration was deployed, verify it ran successfully in Supabase
- [ ] **Monitor for 1 hour:** Watch System Logs for any new errors introduced by the deploy
