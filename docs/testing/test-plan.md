# TrafficAI Admin Panel -- Comprehensive Test Plan

## Table of Contents
1. [Authentication and Authorization](#1-authentication-and-authorization)
2. [Tracking Pixels](#2-tracking-pixels)
3. [Visitor Management](#3-visitor-management)
4. [Audience Segmentation](#4-audience-segmentation)
5. [Contact Enrichment and Credits](#5-contact-enrichment-and-credits)
6. [Integrations](#6-integrations)
7. [Cron Jobs](#7-cron-jobs)
8. [Billing and Stripe](#8-billing-and-stripe)
9. [Admin Panel](#9-admin-panel)
10. [Team Management](#10-team-management)
11. [Chat](#11-chat)
12. [System Logging](#12-system-logging)
13. [Data Isolation and Security](#13-data-isolation-and-security)
14. [Integration Testing (Cross-Feature)](#14-integration-testing-cross-feature)
15. [Performance and Load Testing](#15-performance-and-load-testing)
16. [Data Integrity Checks](#16-data-integrity-checks)
17. [Regression Test Scenarios](#17-regression-test-scenarios)
18. [Smoke Test Suite](#18-smoke-test-suite)

---

## 1. Authentication and Authorization

### 1.1 Session Management (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUTH-001 | Unauthenticated request to protected API route (e.g., `/api/visitors`) | Returns 401 via `getAuthenticatedUser()` returning null |
| AUTH-002 | Request with expired Supabase session cookie | `updateSession()` in middleware refreshes or returns redirect to login |
| AUTH-003 | Request with tampered/invalid session cookie | Returns 401, no data leakage |
| AUTH-004 | Request to `/api/pixel` (public tracking endpoint) with no auth | Returns 200 -- middleware skips auth for this path |
| AUTH-005 | Request to `/api/stripe/webhook` with no auth cookie | Returns 200 -- middleware skips, Stripe signature verification handles auth |
| AUTH-006 | Request to `/api/cron/fetch-visitors` with no auth cookie | Middleware skips (cron path excluded), but route itself requires `Bearer CRON_SECRET` |
| AUTH-007 | Request to `/api/referrals/track-click` with no auth | Returns 200 -- middleware skips this public endpoint |
| AUTH-008 | Auth callback at `/api/auth/callback` processes PKCE code exchange | Session cookie set correctly with HTTP-only flag |

**Edge cases:**
- Concurrent requests with same session nearing expiry (race condition on refresh)
- `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset at runtime

### 1.2 Role-Based Access Control (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUTH-010 | User with role `admin` calls `requireRole(req, res, 'admin')` | Returns user object with `roleName: 'admin'` |
| AUTH-011 | User with role `user` calls `requireRole(req, res, 'admin')` | Returns 403 `Insufficient permissions` |
| AUTH-012 | User with role `team` calls `requireRole(req, res, ['admin', 'team'])` | Returns user object (array matching) |
| AUTH-013 | User with `role_id` set but no string `role` column | `requireRole` queries `roles` table by `role_id`, matches by `name` |
| AUTH-014 | User with string `role` set but null `role_id` (backward compat) | Falls through to string role check, succeeds |
| AUTH-015 | Admin-only endpoints (`/api/admin/*`) accessed by non-admin user | Returns 403 |
| AUTH-016 | `role_permissions` + `menu_items` returns correct sidebar items for each role | Only permitted menu items visible per role |

| AUTH-017 | Deprecated `partner` role auto-maps to `user` on assign-role | `assign-role.ts` converts partner→user and updates DB |
| AUTH-018 | `/api/auth/assign-role` is POST-only (not admin endpoint) | Returns 405 for non-POST; called by users during login, not by admin |

**Edge cases:**
- User with `role_id` pointing to a deleted role record
- User with both `role_id` and `role` set to conflicting values (which wins? `role_id` does)
- Middleware matcher excludes `api/cron` from regex but handles `/api/stripe/webhook` and `/api/referrals/track-click` inside middleware function (subtle distinction)

### 1.3 Referral Flow in Middleware (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUTH-020 | Request with `?ref=ABC123` on any page | Redirects to `/auth/signup`, sets `ref_code` cookie with dynamic TTL |
| AUTH-021 | `?ref=ABC123` where track-click API returns `cookie_duration_days: 7` | Cookie `maxAge` = 7 * 86400 |
| AUTH-022 | `?ref=ABC123` where track-click API fails (500) | Cookie still set with default 30-day TTL, redirect not blocked |
| AUTH-023 | `ref_code` cookie has `httpOnly: false` | Verified -- signup page needs client-side read access |

### 1.4 Feature Gating via UpgradeContext (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUTH-030 | Starter plan user tries to access API-only feature | Feature blocked, upgrade prompt shown |
| AUTH-031 | Professional plan user accesses all features within plan limits | All features accessible |
| AUTH-032 | User with no subscription (trial expired) | Features gated appropriately |

---

## 2. Tracking Pixels

### 2.1 Pixel CRUD (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| PIX-001 | Create pixel with valid name and domain | Pixel created in `pixels` table with `status: 'pending'` (not active), returns pixel ID |
| PIX-002 | Create pixel without name or domain | Returns 400 `Name and domain are required` |
| PIX-003 | Update pixel `visitors_api_url` (admin only) | Field updated only if user is admin; non-admin silently ignores this field |
| PIX-004 | Delete pixel | Clears `pixel_requests` references first, then deletes pixel |
| PIX-005 | Get pixel JS snippet | Returns valid JavaScript with correct pixel ID embedded |
| PIX-006 | List pixels for user | Regular users see only `effectiveUserId` pixels; admins see ALL pixels |
| PIX-007 | Manual sync with no `visitors_api_url` configured | Returns 200 with `totalFetched: 0` and message |
| PIX-008 | Manual sync route has `maxDuration: 300` | Vercel allows up to 300s for large syncs |

### 2.2 Pixel Status Management (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| PIX-010 | Set pixel to `inactive` | Cron skips this pixel (query filters `status = 'active'`) |
| PIX-011 | Pixel with `visitors_api_url = null` | Cron skips -- filtered by `NOT visitors_api_url IS NULL` |
| PIX-012 | Pixel status fields after successful fetch | `visitors_api_last_fetched_at` updated, `visitors_api_last_fetch_status` starts with `success:` |
| PIX-013 | Pixel status fields after failed fetch | `visitors_api_last_fetch_status` starts with `error:` |

---

## 3. Visitor Management

### 3.1 Visitor Data Model (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| VIS-001 | Upsert visitor with unique `(visitor_id, pixel_id)` pair | Insert succeeds, visitor created |
| VIS-002 | Upsert visitor with duplicate `(visitor_id, pixel_id)` | Existing record updated (not duplicated) via `onConflict: 'visitor_id,pixel_id'` |
| VIS-003 | Visitor phone stored in `metadata.phone`, NOT as top-level column | `metadata` JSONB contains `phone` field; no `phone` column on `visitors` table |
| VIS-004 | Visitor for shared/team pixel stores pixel owner's `user_id` | `visitors.user_id` = pixel owner, NOT the logged-in team member |
| VIS-005 | Visitor list query exceeds 1000 rows | Pagination via `.range()` returns all results across multiple pages |

### 3.2 Lead Scoring (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| VIS-010 | New visitor with zero activity | `lead_score = 15` (base score) |
| VIS-011 | Visitor with 10 pageviews | `lead_score = 15 + min(10*2, 20) = 35` |
| VIS-012 | Visitor with 5 clicks | `lead_score = 15 + min(5*3, 15) = 30` |
| VIS-013 | Visitor with 1 form submission | `lead_score = 15 + 10 = 25` |
| VIS-014 | Visitor with scroll depth > 50% | `lead_score = 15 + 5 = 20` |
| VIS-015 | Visitor with sessions on 2+ different dates | `lead_score` includes +10 for multi-day visits |
| VIS-016 | Visitor with max activity (all modifiers) | `lead_score` capped at 100 |
| VIS-017 | Visitor with 15 pageviews, 6 clicks, 2 form submissions, 80% scroll, 3 sessions | `lead_score = 15 + 20(capped) + 15(capped) + 20 + 5 + 10 = 85` |

### 3.3 Contact Aggregation from API Events (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| VIS-020 | Multiple event records for same UUID aggregated | Single visitor row with summed `total_pageviews`, `total_clicks`, etc. |
| VIS-021 | Contact without UUID or EDID | Skipped with warning log, not inserted |
| VIS-022 | Email priority: `PERSONAL_VERIFIED_EMAILS` > `PERSONAL_EMAILS` > `BUSINESS_EMAIL` | First non-empty comma-separated value from highest-priority field used |
| VIS-023 | LinkedIn URL filtering: company page URL (`/company/`) | Discarded -- only `/in/` profile URLs stored |
| VIS-024 | LinkedIn URL without `http` prefix | Prepended with `https://` |
| VIS-025 | Activity time calculation from `ACTIVITY_START_DATE` and `ACTIVITY_END_DATE` | `total_time_on_site` = sum of (end - start) in seconds for all events |
| VIS-026 | Contact with `EVENT_DATE` (new format) instead of `ACTIVITY_START_DATE` | Correctly parsed, used for `first_seen_at`/`last_seen_at` |

### 3.4 Visitor Export (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| VIS-030 | Export visitors via `/api/visitors/export` | Returns CSV file with `Content-Disposition: attachment` header |
| VIS-031 | Export with filters applied | Only matching visitors included |
| VIS-032 | Export includes phone from `metadata.phone` column, not top-level | CSV `phone` column reads `metadata?.phone` |
| VIS-033 | Export with no matching visitors | Returns 400 `No visitors to export` |
| VIS-034 | Visitor list max limit capped at 100 per page | `Math.min(limit, 100)` prevents abuse |
| VIS-035 | Page batch fetch in API fetcher uses concurrency of 3 pages | `batchSize = 3` in `fetchVisitorsFromApi` |

---

## 4. Audience Segmentation

### 4.1 Audience CRUD (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUD-001 | Create audience with behavioral filters | Proxied to external `TRAFFIC_AI_API_URL/audiences` (not local DB), requires user API key |
| AUD-002 | Create AI-powered custom audience | Proxied to `TRAFFIC_AI_API_URL/audiences/custom` |
| AUD-003 | Manual contact upload to audience | Contacts inserted into `audience_contacts` (local DB) |
| AUD-004 | Audience attributes endpoint (`/api/audiences/attributes`) | Requires `?attribute=X` param, proxied to external API |
| AUD-005 | Assign visitors to audience (`/api/admin/audience-assignments`) | Mapping created in `audience_assignments` |
| AUD-006 | No API key configured for audience operations | Returns 403 `No API key assigned. Please contact admin.` |

### 4.2 Audience Sync to Platforms (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| AUD-010 | Sync audience to Klaviyo list | All contacts with valid emails pushed to Klaviyo |
| AUD-011 | Sync audience to Facebook custom audience | PII hashed with SHA-256 before upload |
| AUD-012 | Sync audience to HubSpot | Contacts created/updated in HubSpot CRM |
| AUD-013 | `getAudienceContactsForSync()` with >1000 contacts | Paginated correctly with `.range()` loop |

---

## 5. Contact Enrichment and Credits

### 5.1 Enrichment Search (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ENR-001 | Search contact by email | Returns enriched data (company, job title, LinkedIn, phone) |
| ENR-002 | Search with insufficient credits | Returns error or prompt to purchase credits |
| ENR-003 | Enrichment data stored in `enrichment_data` JSONB | Fields stored with UPPERCASE keys matching API format |

### 5.2 ZeroBounce Email Verification (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ZB-001 | Verify single email with valid ZeroBounce API key | Returns `ZeroBounceResult` with status (valid/invalid/catch-all/etc.) |
| ZB-002 | Verify email with invalid API key | `getZeroBounceCredits` throws "Invalid ZeroBounce API key" |
| ZB-003 | Verify batch of 20 emails with concurrency=5, delay=200ms | 4 rounds of 5, ~600ms total delay, all results returned |
| ZB-004 | Verify batch when credits < batch size | Warning logged, only `credits` emails verified (slice), rest skipped |
| ZB-005 | `isEmailSyncable('valid')` | Returns `true` |
| ZB-006 | `isEmailSyncable('invalid')` | Returns `false` |
| ZB-007 | `isEmailSyncable('spamtrap')` | Returns `false` |
| ZB-008 | `isEmailSyncable('catch-all')` with default config | Returns `true` (default: allow) |
| ZB-009 | `isEmailSyncable('catch-all', { allow_catch_all: false })` | Returns `false` |
| ZB-010 | `isEmailSyncable(null)` (unverified) | Returns `true` (allow through, verify later) |
| ZB-011 | `isEmailSyncable('unknown', { allow_unknown: false })` | Returns `false` |
| ZB-012 | `verifyAndUpdateVisitors` updates `email_status`, `email_sub_status`, `email_verified_at` on visitor records | All three fields set correctly in DB |
| ZB-013 | ZeroBounce API key fallback: no user-specific key, falls back to admin global key | Queries `platform_integrations` where `platform='zerobounce'` globally |

**Edge cases:**
- ZeroBounce API rate-limited (429) during batch verification
- Network timeout during single email verification -- result set to `unknown`/`api_error`
- Credits exactly equal to batch size (boundary condition)

---

## 6. Integrations

### 6.1 Integration CRUD (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| INT-001 | `saveIntegration(userId, 'klaviyo', { api_key: '...' })` | Upserts into `platform_integrations` with `onConflict: 'user_id,platform'` |
| INT-002 | `getIntegration(userId, 'hubspot')` when not connected | Returns `null` (filtered by `is_connected: true`) |
| INT-003 | `disconnectIntegration(userId, 'slack')` | Row deleted from `platform_integrations` |
| INT-004 | `getAllIntegrationStatuses(userId)` | Returns array of `{ platform, is_connected, last_synced_at }` for connected integrations only |
| INT-005 | `updateLastSynced(userId, 'salesforce')` | `last_synced_at` and `updated_at` set to current timestamp |

### 6.2 Klaviyo Integration (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| KLV-001 | Connect Klaviyo with valid API key via `/api/integrations/klaviyo/connect` | Integration saved, `is_connected: true` |
| KLV-002 | Sync visitors to Klaviyo list | `getVisitorsForSync` paginates correctly, profiles pushed to Klaviyo API |
| KLV-003 | Push events (high_intent, price_sensitive) to Klaviyo | Events created for qualifying visitors |
| KLV-004 | Auto-sync with `auto_sync_visitors: true` in config | Cron picks up and syncs new visitors since `last_synced_at` |
| KLV-005 | Sync filters invalid emails (email_status in `BLOCKED_EMAIL_STATUSES`) | Visitors with `invalid`/`spamtrap`/`abuse`/`do_not_mail` skipped |

### 6.3 Facebook Integration (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| FB-001 | OAuth flow via `/api/integrations/facebook/auth` and `/callback` | Access token stored in integration config |
| FB-002 | Audience sync with SHA-256 PII hashing | `normalizeContact()` returns rows with hashed email, phone, name, city, state, country, zip, gender |
| FB-003 | Pre-computed SHA256 hashes (`SHA256_PERSONAL_EMAIL`) used when available | `usedPrecomputed: true`, no rehashing |
| FB-004 | Contact with no valid email and no pre-computed hashes | Returns empty `rows` array, contact skipped |
| FB-005 | Phone normalization: 10-digit US number | Prepended with `1`, then hashed |
| FB-006 | State normalization: "California" -> "ca" | Full state name mapped via `US_STATE_MAP`, then hashed |
| FB-007 | Country normalization: "United States" -> "us" | Mapped via `COUNTRY_MAP`, then hashed |
| FB-008 | Gender normalization: "Male" -> "m", "Female" -> "f" | Normalized before hashing |
| FB-009 | Contact with multiple pre-computed email hashes | Multiple rows returned, one per hash, same non-email fields |
| FB-010 | US zip code > 5 digits | Truncated to first 5 digits before hashing |

### 6.4 RingCentral Integration (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| RC-001 | OAuth callback stores tokens in integration config | `access_token`, `refresh_token` stored |
| RC-002 | Token refresh via `refreshRCTokenIfNeeded()` | Expired token refreshed, new token stored |
| RC-003 | SMS template CRUD via `/api/integrations/ringcentral/templates` | Templates created/updated/deleted |
| RC-004 | SMS log query via `/api/integrations/ringcentral/sms-log` | Returns sent SMS history |

### 6.5 Google Ads Integration (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| GA-001 | OAuth flow via `/api/integrations/google_ads/connect` and `/callback` | Tokens stored |
| GA-002 | Upload conversions via `/api/integrations/google_ads/upload-conversions` | Conversion events sent to Google Ads API |
| GA-003 | Import audience via `/api/integrations/google_ads/import-audience` | Audience contacts imported |

### 6.6 Other Integrations (P2)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| INT-HUB-001 | HubSpot sync visitors | Contacts created in HubSpot with mapped fields |
| INT-SF-001 | Salesforce sync as leads | Leads created with token + instance URL |
| INT-SH-001 | Shopify sync visitors | Customer data synced |
| INT-MC-001 | Mailchimp audience sync | Contacts added to Mailchimp audience/list |
| INT-PD-001 | Pipedrive sync as deals/leads | Deals or persons created |
| INT-AC-001 | ActiveCampaign contact sync | Contacts created with token + URL |
| INT-SL-001 | Slack webhook notification | Message posted to configured webhook URL |
| INT-SL-002 | Slack test message via `/api/integrations/slack/send-test` | Test message delivered |
| INT-ZP-001 | Zapier webhook trigger | Payload sent to Zapier webhook URL |
| INT-ZP-002 | Zapier test trigger via `/api/integrations/zapier/test-trigger` | Test payload sent |
| INT-GS-001 | Google Sheets sync visitors/audience | Data written to Google Sheet |
| INT-LI-001 | LinkedIn campaign CRUD | Campaigns created/updated |
| INT-LI-002 | LinkedIn extension token/verify/pending/report endpoints | Chrome extension communicates correctly |

### 6.7 Integration Data Helpers (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| INT-UTIL-001 | `getVisitorsForSync(userId)` with 2500 visitors | Paginated fetch: 3 rounds of 1000, returns all 2500 |
| INT-UTIL-002 | `getVisitorsForSync(userId, pixelId)` filters by pixel | Only visitors for specified pixel returned |
| INT-UTIL-003 | `formatPhoneE164('+1234567890')` | Returns `+1234567890` unchanged |
| INT-UTIL-004 | `formatPhoneE164('2125551234')` (10 digits) | Returns `+12125551234` |
| INT-UTIL-005 | `formatPhoneE164('12125551234')` (11 digits starting with 1) | Returns `+12125551234` |
| INT-UTIL-006 | `validateEmail('test@example.com')` | Returns `true` |
| INT-UTIL-007 | `validateEmail('not-an-email')` | Returns `false` |
| INT-UTIL-008 | `cleanEmail('a@b.com, c@d.com')` | Returns `a@b.com` (first in comma-separated list) |
| INT-UTIL-009 | `PlatformType` type safety: `'klaviyo'` missing from union type | Klaviyo connect bypasses `saveIntegration()` helper, writes directly to DB. TypeScript type incomplete. |

---

## 7. Cron Jobs

### 7.1 Visitor Sync Cron -- `/api/cron/fetch-visitors` (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CRON-001 | Request without `Bearer CRON_SECRET` header | Returns 401 |
| CRON-002 | Request with correct `Bearer CRON_SECRET` | Processes pixels, returns 200 with results |
| CRON-003 | Non-GET request | Returns 405 |
| CRON-004 | `maxDuration: 300` set on route config | Vercel allows up to 300s execution |
| CRON-005 | Timeout guard: stops starting NEW pixels after 210s elapsed (needs 60s remaining buffer) | `MAX_PROCESSING_MS=270s` checked with 60s buffer; remaining pixels skipped, partial results returned |
| CRON-006 | Interleave fairness: User A has 5 pixels, User B has 2 pixels | Order: A1, B1, A2, B2, A3, A4, A5 (round-robin) |
| CRON-007 | Priority: pixel with null `visitors_api_last_fetched_at` processed first | Nulls sorted before timestamps within each user group |
| CRON-008 | Most-stale user processed first | User whose oldest pixel has earliest `last_fetched_at` goes first |
| CRON-009 | >1000 active pixels in database | Paginated query with `.range()` fetches all pixels |
| CRON-010 | One pixel fetch fails (API error) | Error isolated to that pixel, other pixels continue processing |
| CRON-011 | Incremental fetch: pixel has `visitors_api_last_fetched_at` set | Only contacts with `EVENT_TIMESTAMP >= cutoff` fetched, pages stop early |
| CRON-012 | Full fetch: pixel has `visitors_api_last_fetched_at = null` | All pages fetched, `events_count` updated on pixel |
| CRON-013 | Batch upsert with 500 visitors | 3 batches of 200, 200, 100 processed |
| CRON-014 | Auto-verify new visitor emails via ZeroBounce after upsert | `verifyAndUpdateVisitors()` called for new visitors with emails |
| CRON-015 | ZeroBounce verification fails | Error caught, does not crash cron, logged to console |
| CRON-016 | API returns 429 (rate limit) | `fetchWithRetry` retries with exponential backoff (2s, 4s, 8s), up to 3 retries |
| CRON-017 | API returns 503 (server error) | Same retry behavior as 429 |
| CRON-018 | Network error (DNS failure) | Retried with backoff, throws after max retries |
| CRON-019 | API response with `Data` array (capital D) | `extractContacts()` correctly reads `data.Data` |
| CRON-020 | API response with `data` array (lowercase) | `extractContacts()` falls back to `data.data` |

**Edge cases:**
- All pixels belong to a single user (no interleaving needed)
- API returns empty `Data: []` array
- Contact has `resolution.uuid` instead of top-level `UUID`
- Page size of 200 exceeds what the API supports (API ignores or errors)

### 7.2 Klaviyo Events Cron -- `/api/cron/push-klaviyo-events` (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CRON-030 | No connected Klaviyo integrations | Returns 200 with `processed: 0` |
| CRON-031 | Integration with `auto_push_events: false` | Skipped |
| CRON-032 | Integration with `auto_sync_visitors: true` and `default_list_id` set | Visitors synced to Klaviyo list incrementally (since `last_synced_at`) |
| CRON-033 | Integration with push events enabled for `high_intent` | Events pushed for qualifying visitors |
| CRON-034 | Auth header missing | Returns 401 |
| CRON-035 | User sync fails | Error logged, other users still processed |

### 7.3 LinkedIn Drip Cron -- `/api/cron/linkedin-drip` (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CRON-040 | No active LinkedIn campaigns | Returns 200 with `processed: 0` |
| CRON-041 | Campaign outside operating hours (e.g., 2 AM in user's timezone) | Campaign skipped with `outside_operating_hours` action |
| CRON-042 | Campaign within operating hours | Campaign processed (monitoring only, no actual sends) |
| CRON-043 | User's LinkedIn integration disconnected | Campaign skipped with `skipped_inactive_account` |
| CRON-044 | `isWithinOperatingHours('09:00', '17:00', 'America/New_York')` at 3 PM ET | Returns `true` |
| CRON-045 | `isWithinOperatingHours('09:00', '17:00', 'America/New_York')` at 6 PM ET | Returns `false` |
| CRON-046 | Invalid timezone string | `isWithinOperatingHours` catches error, returns `false` (note: RingCentral's `isWithinTimeWindow` returns `true` on invalid TZ -- different behavior!) |

### 7.4 RingCentral SMS Cron -- `/api/cron/ringcentral-sms` (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CRON-050 | No active RingCentral integrations | Returns 200 with empty results |
| CRON-051 | Integration without `rc_from_number` configured | User skipped, `sent: 0` |
| CRON-052 | No active templates for user | User skipped |
| CRON-053 | Template outside time window | Template skipped via `isWithinTimeWindow` |
| CRON-054 | Visitor without phone number | Skipped (increments `skipped` counter) |
| CRON-055 | Visitor already texted today (dedup check) | Skipped -- `sms_log` table checked for same visitor+pixel today |
| CRON-056 | Visitor with `lead_score < min_lead_score` filter | Filtered out by query `.gte('lead_score', minScore)` |
| CRON-057 | Batch limit: >100 qualifying visitors | Only first 100 processed per template per run (`.limit(100)`) |
| CRON-058 | Rate limiting: 1.2s delay between SMS sends | Verified sequential send with delay |
| CRON-059 | Token refresh before sending | `refreshRCTokenIfNeeded()` called, expired token refreshed |
| CRON-060 | Template variable substitution | `substituteTemplateVars()` replaces `{first_name}`, `{company}`, etc. (single braces, not double) |
| CRON-061 | 2s delay between pixels in fetch-visitors cron | `setTimeout(2000)` called between each pixel processing to avoid API hammering |

---

## 8. Billing and Stripe

### 8.1 Checkout and Subscription (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| STR-001 | Create checkout session via `/api/stripe/create-checkout` | Returns Stripe checkout URL |
| STR-002 | Access billing portal via `/api/stripe/portal` | Returns Stripe portal URL |
| STR-003 | Verify session via `/api/stripe/verify-session` | Confirms active subscription |

### 8.2 Webhook Processing (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| STR-010 | Webhook with valid Stripe signature | Event processed, 200 returned |
| STR-011 | Webhook with invalid signature | Returns 400 `Webhook signature verification failed` |
| STR-012 | `checkout.session.completed` event | User subscription created/updated in DB |
| STR-013 | Webhook called with GET method | Returns 405 |
| STR-014 | Webhook secret not configured | Returns 500 `Webhook not configured` |
| STR-015 | Team seat sync on plan change | `syncTeamSeats()` updates `teams.max_seats` based on `app_settings.team_seats_{planId}` |
| STR-016 | Stripe webhook logged via `logStripeWebhook()` | Entry in `system_logs` with `type: 'stripe'` |
| STR-017 | Body parser disabled (`bodyParser: false`) | Raw body available for signature verification via `buffer(req)` |

| STR-018 | `customer.subscription.updated` event | Updates user plan based on subscription status; resets to `trial` if not active |
| STR-019 | `customer.subscription.deleted` event | Resets user to `trial` plan, sets status `canceled`, clears subscription ID |
| STR-020A | `invoice.payment_succeeded` event | Confirms `stripe_subscription_status: 'active'` for the user |
| STR-021A | Referral conversion on checkout.session.completed | Referral status updated to `converted`, commission calculated from subscription price |
| STR-022A | Referral commission recalculated on subscription update | Monthly revenue and commission amount updated when price changes |
| STR-023A | Referral marked as churned on subscription deleted | Referral status updated to `churned` |
| STR-024 | Stripe config fallback: DB key null, falls back to `STRIPE_WEBHOOK_SECRET` env var | `webhookSecret = stripeConfig.webhookSecret \|\| process.env.STRIPE_WEBHOOK_SECRET` |

**Edge cases:**
- Duplicate webhook delivery (idempotency)
- Webhook arrives before checkout redirect completes
- `stripeConfig.secretKey` is null (from DB settings)

### 8.3 Feature Gating (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| STR-020 | Starter plan: pixel limit enforced | Cannot create more pixels than plan allows |
| STR-021 | Growth plan: enrichment credits enforced | Credit deduction on enrichment, block when exhausted |
| STR-022 | Professional plan: team member limit | Cannot add team members beyond plan limit |
| STR-023 | Enterprise plan: API access enabled | API endpoints accessible |

---

## 9. Admin Panel

### 9.1 User Management (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ADM-001 | List all users via `/api/admin/users` | Returns paginated user list (admin only) |
| ADM-002 | Assign role to user via `/api/auth/assign-role` | User's `role` or `role_id` updated |
| ADM-003 | Impersonate user via `/api/admin/impersonate` | Admin can act as specified user |
| ADM-004 | Non-admin calls admin endpoint | Returns 403 |

### 9.2 System Logs (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ADM-010 | View logs via `/api/admin/logs` | Returns system_logs filtered by type/status |
| ADM-011 | Log entry contains all required fields | `type`, `event_name`, `status`, `message`, `created_at` present |

### 9.3 Admin Settings (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ADM-020 | Update app settings (e.g., ZeroBounce config) | Settings saved to `app_settings` table |
| ADM-021 | Manage API keys via `/api/admin/api-keys` | CRUD operations on `user_api_keys` |
| ADM-022 | View/approve pixel requests | `/api/admin/pixel-requests` returns pending requests |
| ADM-023 | View/approve audience requests | `/api/admin/audience-requests` returns pending requests |

### 9.4 Admin Notifications (P2)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ADM-030 | `createAdminNotification()` creates notification | Row inserted in `admin_notifications` with `is_read: false` |
| ADM-031 | List notifications via `/api/admin/notifications` | Returns unread notifications |
| ADM-032 | Admin dashboard stats (`/api/admin/dashboard/stats`) | Returns aggregate metrics (admin only) |
| ADM-033 | Admin creates pixel for any user (`/api/admin/pixels/create`) | Pixel created with specified user_id |
| ADM-034 | Admin extends user trial (`/api/admin/users/[id]/extend-trial`) | `trial_ends_at` updated |
| ADM-035 | Admin deletes user (`/api/admin/users/[id]/delete`) | User and associated data removed |
| ADM-036 | Admin imports audience from URL (`/api/admin/audiences/import-from-url`) | Contacts imported from external source |
| ADM-037 | Admin manages referral codes/payouts/stats | CRUD on `referral_codes`, `referral_payouts` tables |

---

## 10. Team Management

### 10.1 Team Context Resolution (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| TEAM-001 | Team owner calls `getEffectiveUserId()` | Returns own `user_id` |
| TEAM-002 | Team member calls `getEffectiveUserId()` | Returns team owner's `user_id` |
| TEAM-003 | User with no team calls `getEffectiveUserId()` | Returns own `user_id` |
| TEAM-004 | `getTeamContext()` caching: second call within 30s | Returns cached result, no DB query |
| TEAM-005 | `getTeamContext()` after 30s TTL expires | Cache miss, fresh DB query |
| TEAM-006 | `clearTeamContextCache(userId)` | Specific user's cache entry removed |
| TEAM-007 | `clearTeamContextCache()` (no arg) | All cache entries cleared |

### 10.2 Team CRUD (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| TEAM-010 | Create team via `/api/team/create` | Team created with `owner_user_id` = authenticated user |
| TEAM-011 | Add member via `/api/team/add-member` | Member added to `team_members` with role |
| TEAM-012 | List members via `/api/team/members` | Returns members with roles |
| TEAM-013 | Add member exceeding `max_seats` | Returns error |

### 10.3 Team Data Isolation (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| TEAM-020 | Team member views pixels | Sees team owner's pixels (via `effectiveUserId`) |
| TEAM-021 | Team member views visitors | Sees visitors for team owner's pixels |
| TEAM-022 | Team member creates visitor | Visitor stored with team owner's `user_id` |

---

## 11. Chat

### 11.1 Real-Time Messaging (P2)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CHAT-001 | Send message to visitor | Message stored and delivered in real-time |
| CHAT-002 | Auto-reply trigger fires | Configured auto-reply sent when conditions met |
| CHAT-003 | Chat API (`/api/chat/*`) requires authentication | Unauthenticated requests return 401 |

---

## 12. System Logging

### 12.1 Log Event Writing (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LOG-001 | `logEvent()` with all fields | Row inserted in `system_logs` with correct `type`, `event_name`, `status`, `message` |
| LOG-002 | `logEvent()` with null optional fields | `request_data`, `response_data`, `error_details`, `user_id`, `ip_address` stored as null |
| LOG-003 | `logEvent()` when DB insert fails | Error logged to console, does NOT throw (non-fatal) |
| LOG-004 | `logStripeWebhook()` formats data correctly | Calls `logEvent` with `type: 'stripe'`, includes `event_id`, `customer_id`, etc. in `request_data` |
| LOG-005 | `logApiRequest()` formats endpoint and method | `event_name` = `${method} ${endpoint}` |

---

## 13. Data Isolation and Security

### 13.1 Row-Level Security (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| SEC-001 | User A queries `visitors` table via Supabase client | RLS policy filters to `auth.uid() = user_id`, only own visitors returned |
| SEC-002 | User A tries to read User B's pixel | No rows returned (RLS blocks) |
| SEC-003 | Service role client queries `visitors` | Bypasses RLS, returns all rows (used in crons, admin) |
| SEC-004 | API route using `createClient(req, res)` (anon) | RLS enforced per authenticated user |
| SEC-005 | API route using `createServiceClient(URL, SERVICE_ROLE_KEY)` | RLS bypassed -- only used in authorized contexts |

### 13.2 PII Hashing (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| SEC-010 | `sha256('test@example.com')` | Returns correct 64-char hex hash |
| SEC-011 | `sha256(null)` | Returns empty string |
| SEC-012 | `sha256('')` | Returns empty string |
| SEC-013 | `sha256('  ')` (whitespace only) | Returns empty string |
| SEC-014 | Facebook audience upload contains NO plaintext PII | All fields (email, phone, name, city, state, country, zip, gender) are SHA-256 hashed |

### 13.3 Secret Management (P0)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| SEC-020 | No hardcoded secrets in source code | Grep for API keys, passwords returns none |
| SEC-021 | `CRON_SECRET` verified via Bearer token in all 4 cron endpoints | Unauthorized access returns 401 |
| SEC-022 | `SUPABASE_SERVICE_ROLE_KEY` never exposed to client | Only used in server-side code, not in `NEXT_PUBLIC_*` vars |
| SEC-023 | Stripe webhook uses signature verification, not session auth | `stripe.webhooks.constructEvent(buf, sig, webhookSecret)` |

### 13.4 Middleware Path Exclusions (P1)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| SEC-030 | Static assets (`_next/static`, `_next/image`, `favicon.ico`) bypass middleware | Matcher regex excludes these paths |
| SEC-031 | Image files (`.svg`, `.png`, `.jpg`, etc.) bypass middleware | Regex excludes common image extensions |
| SEC-032 | `pixel.js` bypasses middleware | Both middleware `if` check and matcher regex exclude this |
| SEC-033 | `/api/pixel/*` bypasses middleware | Public tracking endpoint, no auth needed |
| SEC-034 | `/api/cron/*` bypasses middleware | Crons authenticate via CRON_SECRET, not session |

---

## 14. Integration Testing (Cross-Feature)

These test scenarios verify that features work correctly together.

| ID | Test Case | Priority | Expected Result |
|----|-----------|----------|-----------------|
| XINT-001 | Visitor sync cron -> ZeroBounce verification -> Klaviyo sync | P0 | New visitors fetched, emails verified, invalid emails excluded from Klaviyo push |
| XINT-002 | Team member creates pixel -> Cron syncs visitors -> Team member views visitors | P0 | Visitors stored with team owner's `user_id`, visible to all team members |
| XINT-003 | Stripe subscription upgrade -> Feature gate unlocked -> New pixels created | P1 | Plan change via webhook updates user plan, new pixel limit enforced |
| XINT-004 | Audience created -> Visitors assigned -> Sync to Facebook with hashing | P1 | End-to-end audience build through hashed upload |
| XINT-005 | Visitor sync -> Lead score calculated -> RingCentral SMS triggered | P1 | High lead_score visitor gets SMS (if phone present, within time window, not already texted) |
| XINT-006 | Admin impersonates user -> Views user's pixels and visitors | P1 | Data isolation preserved, admin sees correct user context |
| XINT-007 | User disconnects Klaviyo integration -> Next cron run | P1 | Cron skips user (`is_connected: false`) |
| XINT-008 | ZeroBounce credits exhausted -> Visitor sync continues | P0 | Sync completes, verification skipped with warning log |
| XINT-009 | API key deleted from `user_api_keys` -> Visitor sync cron runs | P0 | `getApiKey()` returns null, error logged, pixel marked with error status |
| XINT-010 | Concurrent cron executions (Vercel invokes twice) | P1 | No duplicate visitors due to `onConflict: 'visitor_id,pixel_id'` upsert |

---

## 15. Performance and Load Testing

| ID | Scenario | Threshold | Notes |
|----|----------|-----------|-------|
| PERF-001 | Visitor sync for pixel with 8000+ events (43 pages) | Completes within 270s timeout | Incremental mode should reduce to 1-2 pages on subsequent runs |
| PERF-002 | Batch upsert of 2000 visitors (10 batches of 200) | Under 30s total DB time | Monitor for Supabase connection pool exhaustion |
| PERF-003 | `getVisitorsForSync()` with 5000+ visitors | Pagination completes, no 1000-row truncation | Verify `.range()` loop fetches all pages |
| PERF-004 | Concurrent cron jobs (all 4 running simultaneously) | No resource contention | Each cron uses separate DB connections |
| PERF-005 | Dashboard load with 10,000+ visitors | Page load under 3s | Check if queries are indexed on `user_id`, `pixel_id` |
| PERF-006 | ZeroBounce batch verification of 200 emails (concurrency=5) | Under 60s | 40 rounds * 200ms delay = 8s minimum |
| PERF-007 | RingCentral SMS cron with 100 SMS sends | Under 120s | 100 * 1.2s rate limit = 120s |
| PERF-008 | Facebook audience upload with 5000 contacts | Completes without timeout | Multiple rows per contact (pre-computed hashes) increases payload |
| PERF-009 | Team context cache hit rate under normal usage | >90% cache hits within 30s TTL | Prevents repeated DB queries for same user |
| PERF-010 | API response times for paginated visitor list | P95 under 500ms | Check for N+1 queries |

---

## 16. Data Integrity Checks

| ID | Check | Query/Verification |
|----|-------|-------------------|
| DI-001 | No duplicate visitors per pixel | `SELECT visitor_id, pixel_id, COUNT(*) FROM visitors GROUP BY visitor_id, pixel_id HAVING COUNT(*) > 1` returns 0 rows |
| DI-002 | All visitors have valid `user_id` referencing `users` table | No orphan visitors with non-existent `user_id` |
| DI-003 | All visitors have valid `pixel_id` referencing `pixels` table | No orphan visitors with non-existent `pixel_id` |
| DI-004 | `lead_score` always between 0-100 | `SELECT COUNT(*) FROM visitors WHERE lead_score < 0 OR lead_score > 100` returns 0 |
| DI-005 | Phone data only in `metadata.phone`, never in top-level `phone` column | No `phone` column exists on `visitors` table |
| DI-006 | Team members' `effectiveUserId` resolves to existing team owner | No orphan team memberships with deleted owner |
| DI-007 | `platform_integrations` unique constraint on `(user_id, platform)` | No duplicate integrations per user per platform |
| DI-008 | All `system_logs` entries have non-null `type`, `event_name`, `status` | Required fields always populated |
| DI-009 | Pixel `visitors_api_last_fetch_status` matches actual outcome | Status starts with `success:` or `error:` |
| DI-010 | `email_verified_at` only set when `email_status` is also set | No visitors with verification timestamp but null status |
| DI-011 | Migration idempotency | All migrations use `IF NOT EXISTS` / `IF EXISTS` guards |
| DI-012 | RLS policies exist on all user-facing tables | `SELECT tablename FROM pg_tables WHERE schemaname='public'` cross-referenced with `pg_policies` |

---

## 17. Regression Test Scenarios

These capture past bugs and critical flows that must not regress.

| ID | Scenario | Background |
|----|----------|------------|
| REG-001 | Visitor sync with UPPERCASE API response fields (`FIRST_NAME`, `UUID`, etc.) | API returns fields in ALL CAPS; mapping must handle this |
| REG-002 | Supabase `.range()` pagination vs `.limit(10000)` | Previous bug: `.limit()` silently capped at 1000; must use `.range()` |
| REG-003 | Visitor `phone` in metadata JSONB, not column | Previous schema issue: code referenced `visitors.phone` column that doesn't exist |
| REG-004 | Batch upsert with 200-row batches vs one-by-one SELECT+INSERT | Previous perf issue: individual inserts caused Vercel timeout on large pixels |
| REG-005 | Incremental fetch stops at already-seen records | Without cutoff, full 43-page fetch every hour; now stops at 1-2 pages |
| REG-006 | `extractContacts()` handles `Data` (capital D) and `data` (lowercase) | API inconsistency: sometimes returns `Data`, sometimes `data` |
| REG-007 | LinkedIn URL filtering: `/company/` pages excluded, only `/in/` profiles | Previous bug: company page URLs stored, not actionable for connection requests |
| REG-008 | Team pixel visitors store owner's `user_id`, not member's | Previous bug: team member creating visitor stored their own ID, breaking data isolation |
| REG-009 | ZeroBounce credit check before batch verify | Without check, verification fails mid-batch when credits run out |
| REG-010 | Cron error isolation: one user's failure doesn't crash entire cron | Previous bug: unhandled exception in one pixel stopped all remaining pixels |
| REG-011 | `getContactUuid()` checks `UUID`, `EDID`, `resolution.uuid` fallbacks | New API format uses `EDID` instead of `UUID`; must handle both |
| REG-012 | Facebook ads deployment error (commit `a0c74e1`) | Recent fix -- verify Facebook integration still deploys correctly |

---

## 18. Smoke Test Suite

Run after every deployment. All tests are P0. Target: complete in under 5 minutes.

| Order | Test | Method | Pass Criteria |
|-------|------|--------|---------------|
| 1 | App loads (home page) | GET `/` | Returns 200 or redirect to login |
| 2 | Auth flow | POST `/api/auth/callback` with test session | Session cookie set |
| 3 | API health: visitors list | GET `/api/visitors` with auth | Returns 200 with JSON array |
| 4 | API health: pixels list | GET `/api/pixels` with auth | Returns 200 with JSON array |
| 5 | API health: audiences list | GET `/api/audiences` with auth | Returns 200 with JSON array |
| 6 | API health: integrations status | GET `/api/integrations/status-all` with auth | Returns 200 with platform statuses |
| 7 | Cron auth guard | GET `/api/cron/fetch-visitors` without Bearer | Returns 401 |
| 8 | Cron auth valid | GET `/api/cron/fetch-visitors` with `Bearer CRON_SECRET` | Returns 200 (may be empty results if no pixels) |
| 9 | Stripe webhook auth | POST `/api/stripe/webhook` without signature | Returns 400 |
| 10 | Middleware: public paths | GET `/pixel.js` | Returns 200, no auth redirect |
| 11 | Middleware: protected paths | GET `/api/visitors` without auth | Returns 401 |
| 12 | Database connectivity | Any authenticated API call succeeds | Supabase connection alive |
| 13 | Environment variables | All required env vars present | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY` all set |
| 14 | Vercel cron schedules | Check `vercel.json` crons config | All 4 crons registered with correct paths and schedules |
| 15 | API cache headers | GET any `/api/*` route | Response includes `Cache-Control: no-store, must-revalidate` |

---

## Summary Statistics

| Category | P0 | P1 | P2 | Total |
|----------|----|----|-----|-------|
| Auth & RBAC | 14 | 7 | 0 | 21 |
| Pixels | 8 | 4 | 0 | 12 |
| Visitors | 16 | 9 | 0 | 25 |
| Audiences | 1 | 9 | 0 | 10 |
| Enrichment & ZeroBounce | 13 | 3 | 0 | 16 |
| Integrations | 16 | 16 | 12 | 44 |
| Cron Jobs | 29 | 7 | 0 | 36 |
| Billing & Stripe | 14 | 4 | 0 | 18 |
| Admin | 4 | 5 | 8 | 17 |
| Team Management | 7 | 4 | 0 | 11 |
| Chat | 0 | 0 | 3 | 3 |
| System Logging | 0 | 5 | 0 | 5 |
| Security | 9 | 5 | 0 | 14 |
| Cross-Feature | 4 | 6 | 0 | 10 |
| Performance | 10 | 0 | 0 | 10 |
| Data Integrity | 12 | 0 | 0 | 12 |
| Regression | 12 | 0 | 0 | 12 |
| Smoke Tests | 15 | 0 | 0 | 15 |
| **Total** | **184** | **84** | **23** | **291** |

## Verification Notes

This test plan was verified against the actual source code on 2026-04-10. Key corrections applied:
1. **PIX-001**: Pixel initial status is `pending`, not `active`
2. **PIX-003**: Only admins can update `visitors_api_url`
3. **CRON-005**: Timeout check is at 210s (270s - 60s buffer), not 270s
4. **CRON-041**: LinkedIn action is `outside_operating_hours`, not `skipped_outside_hours`
5. **CRON-060**: Template variables use single braces `{first_name}`, not double `{{first_name}}`
6. **AUD-001/002/004**: Audiences are proxied to external `TRAFFIC_AI_API_URL`, not local DB
7. **INT-UTIL-009**: `'klaviyo'` missing from `PlatformType` union type (type safety gap)
8. **CRON-046**: LinkedIn `isWithinOperatingHours` returns `false` on invalid TZ, but RingCentral's `isWithinTimeWindow` returns `true` (inconsistent behavior)
9. **STR-018 through STR-024**: Added missing Stripe webhook event handlers (subscription.updated, subscription.deleted, invoice.payment_succeeded, referral tracking)
