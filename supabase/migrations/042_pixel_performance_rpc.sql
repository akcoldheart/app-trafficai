-- Migration: RPC function for pixel-level performance stats on admin dashboard
-- Returns visitor counts, identified counts, and avg lead score per pixel

CREATE OR REPLACE FUNCTION public.get_pixel_performance()
RETURNS TABLE(
  pixel_id UUID,
  visitor_count BIGINT,
  identified_count BIGINT,
  avg_lead_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.pixel_id,
    COUNT(*)::BIGINT AS visitor_count,
    COUNT(*) FILTER (WHERE v.is_identified = true)::BIGINT AS identified_count,
    COALESCE(ROUND(AVG(v.lead_score) FILTER (WHERE v.lead_score IS NOT NULL))::INTEGER, 0) AS avg_lead_score
  FROM public.visitors v
  WHERE v.pixel_id IS NOT NULL
  GROUP BY v.pixel_id
  ORDER BY visitor_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_pixel_performance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pixel_performance() TO service_role;

COMMENT ON FUNCTION public.get_pixel_performance IS 'Returns visitor stats grouped by pixel for admin dashboard top-performing pixels table';
