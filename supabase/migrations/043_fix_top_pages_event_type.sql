-- Fix: get_top_pages RPC only matched 'pageview' but webhook events
-- may use 'page_view' (with underscore). Match both variants.
-- Also count all events with a page_url regardless of event_type,
-- since clicks/scrolls/etc. on a page also indicate page activity.

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
    REGEXP_REPLACE(pe.page_url, '^https?://[^/]+', '') as page_path,
    COUNT(*)::BIGINT as view_count
  FROM public.pixel_events pe
  WHERE pe.pixel_id = ANY(p_pixel_ids)
    AND pe.page_url IS NOT NULL
    AND pe.page_url <> ''
    AND pe.created_at >= (CURRENT_DATE - p_days * INTERVAL '1 day')
  GROUP BY REGEXP_REPLACE(pe.page_url, '^https?://[^/]+', '')
  ORDER BY view_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
