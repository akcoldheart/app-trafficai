import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Service role client to bypass RLS for admin operations
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get authenticated user
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Proxy auth error:', authError);
    return res.status(401).json({ error: 'Unauthorized', details: authError?.message });
  }

  // Check if user is admin by looking up their role
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role_id')
    .eq('id', user.id)
    .single();

  if (userError) {
    console.error('Proxy user lookup error:', userError);
    return res.status(500).json({ error: 'Failed to verify user role' });
  }

  if (userData?.role_id) {
    const { data: roleData } = await supabase
      .from('roles')
      .select('name')
      .eq('id', userData.role_id)
      .single();

    if (roleData?.name !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  } else {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { url, apiKey: providedApiKey } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Get API key - first check if provided, then any available key (using service role to bypass RLS)
  let apiKey = providedApiKey;
  if (!apiKey) {
    // Use service role client to get any available API key (bypasses RLS)
    // This allows any admin to use API keys configured by other admins
    const { data: anyApiKey } = await supabaseAdmin
      .from('user_api_keys')
      .select('api_key')
      .limit(1)
      .single();

    apiKey = anyApiKey?.api_key;

    if (!apiKey) {
      return res.status(400).json({
        error: 'No API key configured. Please add an API key in Settings first.'
      });
    }
  }

  // Build headers - include API key for external APIs
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // Add API key authentication for known external APIs
  if (apiKey) {
    // audiencelab.io uses Bearer token
    if (parsedUrl.hostname.includes('audiencelab.io')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    // Add X-API-Key header as fallback for other APIs
    headers['X-API-Key'] = apiKey;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch: ${response.status} ${response.statusText}`
      });
    }

    const contentType = response.headers.get('content-type');
    let data: Record<string, unknown>;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      // Try to parse as JSON anyway
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(400).json({ error: 'Response is not valid JSON' });
      }
    }

    // Handle pagination for audiencelab.io API
    // If response has pagination metadata, fetch all remaining pages
    if (parsedUrl.hostname.includes('audiencelab.io')) {
      const totalPages = Number(data.total_pages || data.TotalPages || data.totalPages || 0);
      const currentPage = Number(data.page || data.Page || data.current_page || 1);

      console.log(`[Proxy] audiencelab.io pagination check - totalPages: ${totalPages}, currentPage: ${currentPage}`);

      if (totalPages > 1 && currentPage === 1) {
        // Collect all records from first page
        let allRecords = (data.Data || data.data || data.records || data.contacts || []) as unknown[];
        console.log(`[Proxy] Page 1 records: ${allRecords.length}, fetching ${totalPages - 1} more pages...`);

        // Fetch remaining pages in parallel batches of 5
        const batchSize = 5;
        for (let batchStart = 2; batchStart <= totalPages; batchStart += batchSize) {
          const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
          const pagePromises = [];

          for (let page = batchStart; page <= batchEnd; page++) {
            const nextPageUrl = new URL(url);
            nextPageUrl.searchParams.set('page', String(page));

            pagePromises.push(
              fetch(nextPageUrl.toString(), { method: 'GET', headers })
                .then(async (pageResponse) => {
                  if (pageResponse.ok) {
                    const pageData = await pageResponse.json();
                    return (pageData.Data || pageData.data || pageData.records || pageData.contacts || []) as unknown[];
                  }
                  return [];
                })
                .catch((err) => {
                  console.error(`[Proxy] Error fetching page ${page}:`, err);
                  return [];
                })
            );
          }

          const batchResults = await Promise.all(pagePromises);
          for (const records of batchResults) {
            allRecords = allRecords.concat(records);
          }
          console.log(`[Proxy] Fetched pages ${batchStart}-${batchEnd}, total records so far: ${allRecords.length}`);
        }

        console.log(`[Proxy] All pages fetched. Total records: ${allRecords.length}`);

        // Return combined data with all records
        return res.status(200).json({
          ...data,
          Data: allRecords,
          data: allRecords,
          total_records: allRecords.length,
          fetched_all_pages: true,
          original_total_pages: totalPages,
        });
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy fetch error:', error);
    return res.status(500).json({
      error: 'Failed to fetch data: ' + (error as Error).message
    });
  }
}
