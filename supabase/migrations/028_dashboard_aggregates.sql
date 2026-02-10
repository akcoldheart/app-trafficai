-- Migration: PostgreSQL functions for dashboard aggregate queries
-- Moves heavy aggregation from JS to the database for better performance

-- Function: Get visitor counts grouped by user_id
-- Replaces fetching ALL visitor rows just to count by user in JS
CREATE OR REPLACE FUNCTION public.get_visitor_counts_by_user()
RETURNS TABLE(user_id UUID, visitor_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT v.user_id, COUNT(*)::BIGINT as visitor_count
  FROM public.visitors v
  GROUP BY v.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get average lead score (optionally per user)
-- Replaces fetching 1000 lead_score rows to compute average in JS
CREATE OR REPLACE FUNCTION public.get_avg_lead_score(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  result INTEGER;
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(ROUND(AVG(lead_score))::INTEGER, 0) INTO result
    FROM public.visitors
    WHERE user_id = p_user_id AND lead_score IS NOT NULL;
  ELSE
    SELECT COALESCE(ROUND(AVG(lead_score))::INTEGER, 0) INTO result
    FROM public.visitors
    WHERE lead_score IS NOT NULL;
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get event stats aggregated by day for last N days
-- Replaces fetching up to 10,000 raw event rows to aggregate in JS
CREATE OR REPLACE FUNCTION public.get_event_stats_by_day(
  p_pixel_ids UUID[],
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  event_date DATE,
  total_events BIGINT,
  pageview_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(pe.created_at) as event_date,
    COUNT(*)::BIGINT as total_events,
    COUNT(*) FILTER (WHERE pe.event_type = 'pageview')::BIGINT as pageview_count
  FROM public.pixel_events pe
  WHERE pe.pixel_id = ANY(p_pixel_ids)
    AND pe.created_at >= (CURRENT_DATE - p_days * INTERVAL '1 day')
  GROUP BY DATE(pe.created_at)
  ORDER BY event_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get event type breakdown for a set of pixels over last N days
CREATE OR REPLACE FUNCTION public.get_event_type_counts(
  p_pixel_ids UUID[],
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  event_type TEXT,
  event_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.event_type,
    COUNT(*)::BIGINT as event_count
  FROM public.pixel_events pe
  WHERE pe.pixel_id = ANY(p_pixel_ids)
    AND pe.created_at >= (CURRENT_DATE - p_days * INTERVAL '1 day')
  GROUP BY pe.event_type
  ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function: Get top pages for a set of pixels over last N days
CREATE OR REPLACE FUNCTION public.get_top_pages(
  p_pixel_ids UUID[],
  p_days INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(
  page_path TEXT,
  view_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Extract pathname from URL (everything after the domain)
    REGEXP_REPLACE(pe.page_url, '^https?://[^/]+', '') as page_path,
    COUNT(*)::BIGINT as view_count
  FROM public.pixel_events pe
  WHERE pe.pixel_id = ANY(p_pixel_ids)
    AND pe.event_type = 'pageview'
    AND pe.page_url IS NOT NULL
    AND pe.created_at >= (CURRENT_DATE - p_days * INTERVAL '1 day')
  GROUP BY REGEXP_REPLACE(pe.page_url, '^https?://[^/]+', '')
  ORDER BY view_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_visitor_counts_by_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visitor_counts_by_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_avg_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_avg_lead_score(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_event_stats_by_day(UUID[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_stats_by_day(UUID[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_event_type_counts(UUID[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_type_counts(UUID[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_top_pages(UUID[], INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_pages(UUID[], INTEGER, INTEGER) TO service_role;

COMMENT ON FUNCTION public.get_visitor_counts_by_user IS 'Returns visitor counts grouped by user for admin dashboard';
COMMENT ON FUNCTION public.get_avg_lead_score IS 'Returns average lead score, optionally filtered by user';
COMMENT ON FUNCTION public.get_event_stats_by_day IS 'Returns daily event counts for chart data';
COMMENT ON FUNCTION public.get_event_type_counts IS 'Returns event type breakdown for pie/bar charts';
COMMENT ON FUNCTION public.get_top_pages IS 'Returns top visited pages';
