-- Migration 044: Dashboard visitor aggregate RPCs
-- Replaces pixel_events-based dashboard queries with visitors-based ones

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_visitors_pixel_id_created_at
  ON visitors (pixel_id, created_at DESC);

-- 1. get_visitor_stats_by_day: replaces get_event_stats_by_day
--    Drop first because return type changed (total_pageviews → day_pageviews)
DROP FUNCTION IF EXISTS get_visitor_stats_by_day(UUID[], INTEGER);
CREATE OR REPLACE FUNCTION get_visitor_stats_by_day(p_pixel_ids UUID[], p_days INTEGER DEFAULT 7)
RETURNS TABLE(visit_date DATE, new_visitors BIGINT, day_pageviews BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    DATE(v.created_at)                       AS visit_date,
    COUNT(*)                                 AS new_visitors,
    COALESCE(SUM(v.total_pageviews), 0)      AS day_pageviews
  FROM visitors v
  WHERE v.pixel_id = ANY(p_pixel_ids)
    AND v.created_at >= (CURRENT_DATE - p_days)
  GROUP BY DATE(v.created_at)
  ORDER BY visit_date;
$$;

-- 2. get_visitor_activity_counts: replaces get_event_type_counts
CREATE OR REPLACE FUNCTION get_visitor_activity_counts(p_pixel_ids UUID[], p_days INTEGER DEFAULT 7)
RETURNS TABLE(activity_type TEXT, activity_count BIGINT)
LANGUAGE sql STABLE
AS $$
  WITH totals AS (
    SELECT
      COALESCE(SUM(v.total_pageviews), 0)    AS pageviews,
      COALESCE(SUM(v.total_clicks), 0)       AS clicks,
      COALESCE(SUM(v.total_sessions), 0)     AS sessions,
      COALESCE(SUM(v.form_submissions), 0)   AS form_submissions
    FROM visitors v
    WHERE v.pixel_id = ANY(p_pixel_ids)
      AND v.created_at >= (CURRENT_DATE - p_days)
  )
  SELECT u.activity_type, u.activity_count
  FROM totals t,
  LATERAL (
    VALUES
      ('pageviews',         t.pageviews),
      ('clicks',            t.clicks),
      ('sessions',          t.sessions),
      ('form submissions',  t.form_submissions)
  ) AS u(activity_type, activity_count)
  WHERE u.activity_count > 0;
$$;

-- 3. get_top_entry_pages: replaces get_top_pages
--    Strips both host AND query string so paths are clean (e.g. "/pricing")
CREATE OR REPLACE FUNCTION get_top_entry_pages(p_pixel_ids UUID[], p_days INTEGER DEFAULT 7, p_limit INTEGER DEFAULT 5)
RETURNS TABLE(page_path TEXT, visitor_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(
      NULLIF(
        split_part(
          CASE
            WHEN first_page_url ~ '^https?://' THEN
              regexp_replace(first_page_url, '^https?://[^/]*', '')
            ELSE first_page_url
          END,
          '?', 1   -- strip query string
        ),
        ''
      ),
      '/'
    ) AS page_path,
    COUNT(*) AS visitor_count
  FROM visitors v
  WHERE v.pixel_id = ANY(p_pixel_ids)
    AND v.created_at >= (CURRENT_DATE - p_days)
    AND v.first_page_url IS NOT NULL
    AND v.first_page_url <> ''
  GROUP BY page_path
  ORDER BY visitor_count DESC
  LIMIT p_limit;
$$;
