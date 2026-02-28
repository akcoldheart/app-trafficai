import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI, Audience } from '@/lib/api';
import {
  IconPlus,
  IconMoon,
  IconRefresh,
  IconTrash,
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
  IconUser,
  IconLoader2,
  IconEdit,
  IconEye,
} from '@tabler/icons-react';
import type { AudienceRequest, RequestStatus } from '@/lib/supabase/types';

interface EditFormData {
  name: string;
  request_type: 'standard' | 'custom';
  // Standard fields
  days_back: number;
  minAge: string;
  maxAge: string;
  gender: string;
  cities: string;
  states: string;
  industries: string[];
  departments: string[];
  seniority: string[];
  segments: string;
  // Custom fields
  topic: string;
  description: string;
}

export default function Audiences() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceRequests, setAudienceRequests] = useState<AudienceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'audiences' | 'requests'>('audiences');
  const [processing, setProcessing] = useState(false);
  const pageSize = 20;

  // Static fallback options for dropdowns (used when API is unavailable)
  const STATIC_INDUSTRIES = [
    'Accounting', 'Advertising', 'Aerospace', 'Agriculture', 'Automotive',
    'Banking', 'Biotechnology', 'Broadcasting', 'Business Services', 'Chemicals',
    'Communications', 'Computer Hardware', 'Computer Software', 'Construction',
    'Consulting', 'Consumer Products', 'Education', 'Electronics', 'Energy',
    'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage',
    'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Internet',
    'Legal', 'Manufacturing', 'Marketing', 'Media', 'Medical Devices',
    'Mining', 'Non-Profit', 'Pharmaceuticals', 'Real Estate', 'Real Estate Agents And Brokers',
    'Retail', 'Semiconductors', 'Technology', 'Telecommunications', 'Transportation',
    'Travel', 'Utilities', 'Venture Capital', 'Wholesale',
  ];

  const STATIC_DEPARTMENTS = [
    'Accounting', 'Administrative', 'Business Development', 'Community And Social Services',
    'Customer Service', 'Engineering', 'Executive', 'Finance', 'General Management',
    'Human Resources', 'Information Technology', 'Legal', 'Marketing',
    'Operations', 'Product Management', 'Project Management', 'Public Relations',
    'Purchasing', 'Quality Assurance', 'Research & Development', 'Sales',
    'Strategy', 'Supply Chain', 'Training',
  ];

  const STATIC_SENIORITY = [
    'Entry', 'Individual Contributor', 'Manager', 'Senior Manager',
    'Director', 'Senior Director', 'VP', 'SVP', 'EVP', 'C-Level', 'Owner', 'Partner',
  ];

  // Attribute options for dropdowns
  const [industryOptions, setIndustryOptions] = useState<string[]>(STATIC_INDUSTRIES);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(STATIC_DEPARTMENTS);
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>(STATIC_SENIORITY);
  const [attributesLoaded, setAttributesLoaded] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AudienceRequest | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '',
    request_type: 'standard',
    days_back: 7,
    minAge: '',
    maxAge: '',
    gender: '',
    cities: '',
    states: '',
    industries: [],
    departments: [],
    seniority: [],
    segments: '',
    topic: '',
    description: '',
  });
  const [adminNotes, setAdminNotes] = useState('');

  // Manual audience creation state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAudienceUrl, setManualAudienceUrl] = useState('');
  const [manualAudienceName, setManualAudienceName] = useState('');
  const [manualAudienceData, setManualAudienceData] = useState<string>('');
  const [fetchingManualAudience, setFetchingManualAudience] = useState(false);
  const [creatingManualAudience, setCreatingManualAudience] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>(''); // For linking to a user's request
  const [urlPreview, setUrlPreview] = useState<{ total_pages: number; estimated_total_records: number; records_per_page: number } | null>(null);
  const [importProgress, setImportProgress] = useState<string>('');
  const [reimportingId, setReimportingId] = useState<string | null>(null);
  const [reimportProgress, setReimportProgress] = useState<string>('');

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper to extract attributes from various response formats
  const extractAttributes = (data: unknown): string[] => {
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.Attributes)) return obj.Attributes;
      if (Array.isArray(obj.attributes)) return obj.attributes;
      if (Array.isArray(obj.data)) return obj.data;
    }
    return [];
  };

  // Load attribute options for dropdowns (use API if available, fallback to static)
  const loadAttributes = useCallback(async () => {
    if (attributesLoaded) return;

    try {
      const industriesData = await TrafficAPI.getAudienceAttributes('industries');
      const extracted = extractAttributes(industriesData);
      if (extracted.length > 0) setIndustryOptions(extracted);
    } catch (error) {
      console.error('Error loading industries, using static list:', error);
      // Keep static fallback (already set as default)
    }

    try {
      const departmentsData = await TrafficAPI.getAudienceAttributes('departments');
      const extracted = extractAttributes(departmentsData);
      if (extracted.length > 0) setDepartmentOptions(extracted);
    } catch (error) {
      console.error('Error loading departments, using static list:', error);
    }

    try {
      const seniorityData = await TrafficAPI.getAudienceAttributes('seniority');
      const extracted = extractAttributes(seniorityData);
      if (extracted.length > 0) setSeniorityOptions(extracted);
    } catch (error) {
      console.error('Error loading seniority, using static list:', error);
    }

    setAttributesLoaded(true);
  }, [attributesLoaded]);

  // Fetch audience data from manual URL (via server proxy to avoid CORS)
  // Uses preview mode first to check size, then fetches full data for small sets
  const handleFetchManualAudience = async () => {
    if (!manualAudienceUrl) return;

    setFetchingManualAudience(true);
    setUrlPreview(null);
    try {
      // First: preview mode to check dataset size
      const previewResponse = await fetch('/api/proxy/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: manualAudienceUrl, preview: true }),
      });

      const previewData = await previewResponse.json();

      if (!previewResponse.ok) {
        throw new Error(previewData.error || `HTTP error: ${previewResponse.status}`);
      }

      // If it's a preview response (large dataset), show info and let user use server-side import
      if (previewData.preview && previewData.total_pages > 50) {
        setUrlPreview({
          total_pages: previewData.total_pages,
          estimated_total_records: previewData.estimated_total_records,
          records_per_page: previewData.records_per_page,
        });
        showToast(`Large dataset detected: ~${previewData.estimated_total_records.toLocaleString()} records across ${previewData.total_pages} pages. Click "Create Audience" to import directly.`, 'info');
        return;
      }

      // Medium paginated dataset (2-50 pages): do a full fetch to get all pages
      if (previewData.preview && previewData.total_pages > 1) {
        const fullResponse = await fetch('/api/proxy/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: manualAudienceUrl }),
        });

        const fullData = await fullResponse.json();
        if (!fullResponse.ok) {
          throw new Error(fullData.error || `HTTP error: ${fullResponse.status}`);
        }

        setManualAudienceData(JSON.stringify(fullData, null, 2));
        showToast(`Data fetched successfully! ${fullData.total_records?.toLocaleString() || ''} contacts loaded.`, 'success');
        return;
      }

      // Small dataset or single page - fetch was already complete
      // If proxy returned full data or non-paginated response, put it in textarea
      setManualAudienceData(JSON.stringify(previewData, null, 2));
      showToast('Data fetched successfully!', 'success');
    } catch (error) {
      showToast('Error fetching data: ' + (error as Error).message, 'error');
    } finally {
      setFetchingManualAudience(false);
    }
  };

  // Create manual audience from fetched/uploaded data
  const handleCreateManualAudience = async () => {
    if (!manualAudienceName) {
      showToast('Please provide an audience name', 'error');
      return;
    }

    // Use editingRequest if available, otherwise use selectedRequestId from dropdown
    const linkedRequestId = editingRequest?.id || selectedRequestId || null;

    // If URL is provided and it's a large dataset (or no JSON data), use chunked server-side import
    if (manualAudienceUrl && (urlPreview || !manualAudienceData)) {
      setCreatingManualAudience(true);
      setImportProgress('Initializing import...');
      try {
        const importApi = async (body: Record<string, unknown>) => {
          const resp = await fetch('/api/admin/audiences/import-from-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
          });
          const ct = resp.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Import failed');
            return json;
          }
          const text = await resp.text();
          throw new Error(text || `HTTP error: ${resp.status}`);
        };

        // Step 1: Init - creates audience record, fetches page 1
        const initResult = await importApi({
          url: manualAudienceUrl,
          name: manualAudienceName,
          request_id: linkedRequestId,
        });

        const { audience_id: newAudienceId, total_pages: totalPages } = initResult;
        let totalRecords = initResult.records_fetched || 0;

        // Step 2: Fetch remaining pages in chunks of 50
        const CHUNK_SIZE = 10;
        if (totalPages > 1) {
          for (let pageStart = 2; pageStart <= totalPages; pageStart += CHUNK_SIZE) {
            const pageEnd = Math.min(pageStart + CHUNK_SIZE - 1, totalPages);
            setImportProgress(`Fetching pages ${pageStart}-${pageEnd} of ${totalPages}...`);

            const chunkResult = await importApi({
              url: manualAudienceUrl,
              audience_id: newAudienceId,
              page_start: pageStart,
              page_end: pageEnd,
            });

            totalRecords = chunkResult.total_records || totalRecords;
          }
        }

        // Step 3: Finalize
        setImportProgress(`Finalizing ${totalRecords.toLocaleString()} contacts...`);
        const finalResult = await importApi({
          audience_id: newAudienceId,
          finalize: true,
          url: manualAudienceUrl,
          request_id: linkedRequestId,
        });

        showToast(`Audience imported! ${finalResult.audience.total_records.toLocaleString()} contacts.`, 'success');
      } catch (error) {
        showToast('Error importing: ' + (error as Error).message, 'error');
        setCreatingManualAudience(false);
        setImportProgress('');
        return;
      }
    } else {
      // Use existing flow for pasted JSON data
      if (!manualAudienceData) {
        showToast('Please provide audience data (paste JSON or fetch from URL)', 'error');
        return;
      }

      setCreatingManualAudience(true);
      try {
        let audienceData;
        try {
          audienceData = JSON.parse(manualAudienceData);
        } catch {
          showToast('Invalid JSON data', 'error');
          setCreatingManualAudience(false);
          return;
        }

        // Extract just the contacts array to avoid sending unnecessary metadata
        let contacts: Record<string, unknown>[] = [];
        if (Array.isArray(audienceData)) {
          contacts = audienceData;
        } else if (audienceData && typeof audienceData === 'object') {
          contacts = audienceData.contacts || audienceData.Data || audienceData.data || audienceData.records || audienceData.sample_contacts || [];
        }

        if (contacts.length === 0) {
          showToast('No contacts found in data', 'error');
          setCreatingManualAudience(false);
          return;
        }

        // Strip empty/null fields from each contact to reduce payload size
        contacts = contacts.map((contact: Record<string, unknown>) => {
          const cleaned: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(contact)) {
            if (value !== null && value !== undefined && value !== '') {
              cleaned[key] = value;
            }
          }
          return cleaned;
        });

        // Helper to send a batch to the API
        const sendBatch = async (batchContacts: Record<string, unknown>[], appendToAudienceId?: string) => {
          const response = await fetch('/api/admin/audiences/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: manualAudienceName,
              data: { contacts: batchContacts },
              request_id: linkedRequestId,
              ...(appendToAudienceId ? { append_to_audience_id: appendToAudienceId } : {}),
              ...(manualAudienceUrl ? { source_url: manualAudienceUrl } : {}),
            }),
          });

          const ct = response.headers.get('content-type');
          if (ct && ct.includes('application/json')) {
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Failed to create audience');
            return json;
          } else {
            const text = await response.text();
            throw new Error(text || `HTTP error: ${response.status}`);
          }
        };

        // Batch contacts to stay under Vercel's ~4.5MB payload limit
        const BATCH_SIZE = 500;
        let result;

        if (contacts.length <= BATCH_SIZE) {
          result = await sendBatch(contacts);
        } else {
          const firstBatch = contacts.slice(0, BATCH_SIZE);
          result = await sendBatch(firstBatch);
          const audienceId = result.audience?.id;

          for (let i = BATCH_SIZE; i < contacts.length; i += BATCH_SIZE) {
            const batch = contacts.slice(i, i + BATCH_SIZE);
            await sendBatch(batch, audienceId);
          }
        }

        showToast('Audience created successfully!', 'success');
      } catch (error) {
        showToast('Error creating audience: ' + (error as Error).message, 'error');
        setCreatingManualAudience(false);
        setImportProgress('');
        return;
      }
    }

    // Common cleanup after successful creation/import
    setShowManualModal(false);
    setManualAudienceUrl('');
    setManualAudienceName('');
    setManualAudienceData('');
    setSelectedRequestId('');
    setUrlPreview(null);
    setImportProgress('');
    setCreatingManualAudience(false);

    // Refresh audiences list
    await loadAudiences(currentPage);
    // If linked to a request, refresh requests
    if (editingRequest || linkedRequestId) {
      await loadAudienceRequests();
      if (editingRequest) {
        setShowEditModal(false);
        setEditingRequest(null);
      }
    }
  };

  // Ref to hold local audiences for merging when external API completes
  const localAudiencesRef = useRef<Audience[]>([]);

  const loadAudiences = useCallback(async (page = 1) => {
    setLoading(true);
    setCurrentPage(page);

    // Start external API fetch in background (non-blocking, with 10s timeout)
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 10000);
    TrafficAPI.getAudiences(page, pageSize)
      .then((data) => {
        clearTimeout(apiTimeout);
        const apiAudiences = data.Data || [];
        if (apiAudiences.length > 0) {
          // Merge with local audiences already displayed
          const merged = [...localAudiencesRef.current, ...apiAudiences];
          const totalCount = (data.total_records || 0) + localAudiencesRef.current.length;
          setAudiences(merged);
          setTotalRecords(totalCount);
          setTotalPages(Math.ceil(totalCount / pageSize));
        }
      })
      .catch((err) => {
        clearTimeout(apiTimeout);
        console.error('Error loading audiences from API:', err);
      });

    try {
      // Fetch local manual audiences (fast — hits our own Supabase)
      let localAudiences: Audience[] = [];
      try {
        const response = await fetch('/api/audience-requests?status=approved&has_manual=true');
        const localData = await response.json();
        if (response.ok && localData.requests) {
          localAudiences = localData.requests
            .filter((req: AudienceRequest) => {
              const formData = req.form_data as Record<string, unknown>;
              return formData?.manual_audience;
            })
            .map((req: AudienceRequest) => {
              const formData = req.form_data as Record<string, unknown>;
              const manualAudience = formData.manual_audience as Record<string, unknown>;
              const userInfo = req.user as unknown as { email?: string } | undefined;
              return {
                id: req.audience_id || (manualAudience?.id as string) || req.id,
                audienceId: req.audience_id || (manualAudience?.id as string),
                name: req.name,
                total_records: (manualAudience?.total_records as number) || 0,
                created_at: req.created_at,
                filters: { manual_upload: true },
                isManual: true,
                user_email: userInfo?.email || null,
                source_url: (manualAudience?.source_url as string) || undefined,
              };
            });
        }
      } catch (localError) {
        console.error('Error loading local audiences:', localError);
      }

      // Fetch actual contact counts from audience_contacts table
      const manualIds = localAudiences
        .map(a => a.audienceId || a.id)
        .filter(Boolean);

      if (manualIds.length > 0) {
        try {
          const countsResp = await fetch(`/api/audiences/manual/counts?ids=${manualIds.join(',')}`);
          if (countsResp.ok) {
            const { counts } = await countsResp.json();
            for (const a of localAudiences) {
              const aid = a.audienceId || a.id;
              if (counts[aid] !== undefined && counts[aid] > 0) {
                a.total_records = counts[aid];
              }
            }
          }
        } catch (countErr) {
          console.error('Error fetching audience counts:', countErr);
        }
      }

      // Store for merging when external API completes
      localAudiencesRef.current = localAudiences;

      // Show local audiences immediately — don't wait for external API
      setAudiences(localAudiences);
      setTotalRecords(localAudiences.length);
      setTotalPages(Math.ceil(localAudiences.length / pageSize));
    } catch (error) {
      console.error('Error loading audiences:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudienceRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/audience-requests');
      const data = await response.json();
      if (response.ok) {
        setAudienceRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error loading audience requests:', error);
    }
  }, []);

  // Initial data load - only run once on mount
  useEffect(() => {
    loadAudiences();
    loadAudienceRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load attributes for admin modal when admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      loadAttributes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Handle tab query parameter from URL
  useEffect(() => {
    if (router.query.tab === 'requests') {
      setActiveTab('requests');
      // Clear the query parameter from URL
      router.replace('/audiences', undefined, { shallow: true });
    }
  }, [router.query.tab, router]);

  const handleDelete = async () => {
    if (!deleteId || deleting) {
      return;
    }

    setDeleting(true);
    try {
      // Check if it's a manual audience
      const isManualAudience = deleteId.startsWith('manual_');

      if (isManualAudience) {
        // Delete manual audience from local database
        const response = await fetch(`/api/audiences/manual/${deleteId}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to delete audience');
        }
      } else {
        // Delete from external API
        await TrafficAPI.deleteAudience(deleteId);
      }

      setShowDeleteModal(false);
      setDeleteId(null);
      showToast('Audience deleted successfully', 'success');
      loadAudiences(currentPage);
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Error deleting audience: ' + (error as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleReimport = async (audienceId: string, audienceName: string, sourceUrl: string) => {
    if (reimportingId) return;
    setReimportingId(audienceId);
    setReimportProgress('Clearing old contacts...');

    try {
      const importApi = async (body: Record<string, unknown>) => {
        const resp = await fetch('/api/admin/audiences/import-from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const ct = resp.headers.get('content-type');
        if (ct && ct.includes('application/json')) {
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || 'Import failed');
          return json;
        }
        const text = await resp.text();
        throw new Error(text || `HTTP error: ${resp.status}`);
      };

      // Step 0: Clear existing contacts for this audience
      const clearResp = await fetch(`/api/admin/audiences/clear-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ audience_id: audienceId }),
      });
      if (!clearResp.ok) {
        const err = await clearResp.json();
        throw new Error(err.error || 'Failed to clear contacts');
      }

      // Step 1: Init - re-create with same audience_id
      setReimportProgress('Fetching page 1...');
      const initResult = await importApi({
        url: sourceUrl,
        name: audienceName,
        audience_id: audienceId,
        reimport: true,
      });

      const totalPages = initResult.total_pages || 1;
      let totalFetched = initResult.records_fetched || 0;

      // Step 2: Fetch remaining pages in chunks
      const CHUNK_SIZE = 10;
      if (totalPages > 1) {
        for (let pageStart = 2; pageStart <= totalPages; pageStart += CHUNK_SIZE) {
          const pageEnd = Math.min(pageStart + CHUNK_SIZE - 1, totalPages);
          const pct = Math.round(((pageStart - 1) / totalPages) * 100);
          setReimportProgress(`Re-importing "${audienceName}" — pages ${pageStart}-${pageEnd} of ${totalPages} (${pct}%, ${totalFetched.toLocaleString()} contacts so far)`);

          const chunkResult = await importApi({
            url: sourceUrl,
            audience_id: audienceId,
            page_start: pageStart,
            page_end: pageEnd,
          });

          totalFetched += chunkResult.chunk_records || 0;
        }
      }

      // Step 3: Finalize
      setReimportProgress(`Finalizing ${totalFetched.toLocaleString()} contacts...`);
      const finalResult = await importApi({
        audience_id: audienceId,
        finalize: true,
        url: sourceUrl,
      });

      setReimportProgress('');
      showToast(`Re-import complete! ${finalResult.audience.total_records.toLocaleString()} contacts.`, 'success');
      loadAudiences(currentPage);
    } catch (error) {
      setReimportProgress('');
      showToast('Re-import error: ' + (error as Error).message, 'error');
    } finally {
      setReimportingId(null);
    }
  };

  const openEditModal = (request: AudienceRequest) => {
    setEditingRequest(request);
    const formData = request.form_data as Record<string, unknown>;
    const filters = (formData.filters || {}) as Record<string, unknown>;
    const businessProfile = (filters.businessProfile || {}) as Record<string, string[]>;
    const age = (filters.age || {}) as Record<string, number>;

    if (request.request_type === 'custom') {
      setEditFormData({
        name: request.name,
        request_type: 'custom',
        days_back: 7,
        minAge: '',
        maxAge: '',
        gender: '',
        cities: '',
        states: '',
        industries: [],
        departments: [],
        seniority: [],
        segments: '',
        topic: (formData.topic as string) || request.name,
        description: (formData.description as string) || '',
      });
    } else {
      setEditFormData({
        name: request.name,
        request_type: 'standard',
        days_back: (formData.days_back as number) || 7,
        minAge: age.minAge?.toString() || '',
        maxAge: age.maxAge?.toString() || '',
        gender: (filters.gender as string) || '',
        cities: Array.isArray(filters.city) ? (filters.city as string[]).join(', ') : '',
        states: Array.isArray(filters.state) ? (filters.state as string[]).join(', ') : '',
        industries: businessProfile.industry || [],
        departments: businessProfile.department || [],
        seniority: businessProfile.seniority || [],
        segments: Array.isArray(formData.segment) ? (formData.segment as string[]).join(', ') : '',
        topic: '',
        description: '',
      });
    }
    setAdminNotes('');
    setShowEditModal(true);
  };

  const buildEditedFormData = (): Record<string, unknown> => {
    if (editFormData.request_type === 'custom') {
      return {
        topic: editFormData.topic,
        description: editFormData.description,
      };
    }

    const filters: Record<string, unknown> = {};

    // Age filter
    if (editFormData.minAge || editFormData.maxAge) {
      filters.age = {};
      if (editFormData.minAge) (filters.age as Record<string, number>).minAge = parseInt(editFormData.minAge);
      if (editFormData.maxAge) (filters.age as Record<string, number>).maxAge = parseInt(editFormData.maxAge);
    }

    // Gender filter
    if (editFormData.gender) filters.gender = editFormData.gender;

    // City filter
    if (editFormData.cities) {
      filters.city = editFormData.cities.split(',').map((c) => c.trim()).filter((c) => c);
    }

    // State filter
    if (editFormData.states) {
      filters.state = editFormData.states.split(',').map((s) => s.trim()).filter((s) => s);
    }

    // Business profile filters
    const businessProfile: Record<string, string[]> = {};
    if (editFormData.industries.length > 0) businessProfile.industry = editFormData.industries;
    if (editFormData.departments.length > 0) businessProfile.department = editFormData.departments;
    if (editFormData.seniority.length > 0) businessProfile.seniority = editFormData.seniority;
    if (Object.keys(businessProfile).length > 0) filters.businessProfile = businessProfile;

    // Segments
    const segmentList = editFormData.segments ? editFormData.segments.split(',').map((s) => s.trim()).filter((s) => s) : [];

    return {
      filters,
      days_back: editFormData.days_back,
      ...(segmentList.length > 0 ? { segment: segmentList } : {}),
    };
  };

  const handleApproveWithEdit = async () => {
    if (!editingRequest) return;

    setProcessing(true);
    try {
      const editedFormData = buildEditedFormData();
      const response = await fetch(`/api/admin/audience-requests/${editingRequest.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_notes: adminNotes,
          edited_name: editFormData.name,
          edited_form_data: editedFormData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      setShowEditModal(false);
      setEditingRequest(null);
      await Promise.all([loadAudiences(currentPage), loadAudienceRequests()]);
      setActiveTab('audiences');
      showToast('Request approved! Audience created successfully.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRequest = async (request: AudienceRequest) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return;

    setProcessing(true);
    try {
      const response = await fetch(`/api/admin/audience-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }

      setAudienceRequests(audienceRequests.map(r =>
        r.id === request.id ? { ...r, status: 'rejected' as RequestStatus, admin_notes: reason } : r
      ));
      showToast('Request rejected.', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) return;

    try {
      const response = await fetch(`/api/audience-requests/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete request');
      }

      setAudienceRequests(audienceRequests.filter(r => r.id !== id));
      showToast('Request cancelled successfully', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const getRequestStatusBadgeClass = (status: RequestStatus) => {
    switch (status) {
      case 'approved': return 'bg-green-lt text-green';
      case 'rejected': return 'bg-red-lt text-red';
      case 'pending': return 'bg-yellow-lt text-yellow';
      default: return 'bg-secondary-lt';
    }
  };

  const pendingRequestCount = audienceRequests.filter(r => r.status === 'pending').length;
  const start = audiences.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalRecords);

  return (
    <Layout title="Audiences" pageTitle="Audiences">
      <div className="row row-cards">
        {/* Header Actions */}
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="mb-1">Manage Audiences</h3>
                  <p className="text-muted mb-0">View, create, and manage your target audiences</p>
                </div>
                <div className="btn-list">
                  <Link href="/audiences/custom" className="btn btn-outline-primary">
                    <IconMoon className="icon" />
                    {isAdmin ? 'Custom Audience' : 'Request Custom'}
                  </Link>
                  <Link href="/audiences/create" className="btn btn-primary">
                    <IconPlus className="icon" />
                    {isAdmin ? 'Create Audience' : 'Request Audience'}
                  </Link>
                  {isAdmin && (
                    <button
                      className="btn btn-outline-primary"
                      onClick={() => {
                        // Clear any previous editing request to create standalone audience
                        setEditingRequest(null);
                        setManualAudienceName('');
                        setSelectedRequestId('');
                        setManualAudienceData('');
                        setManualAudienceUrl('');
                        setShowManualModal(true);
                      }}
                    >
                      <IconPlus className="icon" />
                      Manual Upload
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs - Show when admin or when user has requests */}
        {(isAdmin || audienceRequests.length > 0) && (
          <div className="col-12">
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'audiences' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audiences')}
                >
                  <IconUsers className="icon me-1" />
                  Audiences ({totalRecords})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
                  onClick={() => setActiveTab('requests')}
                >
                  <IconClock className="icon me-1" />
                  Requests
                  {pendingRequestCount > 0 && (
                    <span className="badge bg-yellow-lt text-yellow ms-2">{pendingRequestCount}</span>
                  )}
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* Audiences Tab */}
        {activeTab === 'audiences' && (
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">{isAdmin ? 'All Audiences' : 'Your Audiences'}</h3>
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={() => loadAudiences(currentPage)}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      {isAdmin && <th>User</th>}
                      <th>Total Records</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th className="w-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="text-center py-4">
                          <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                          Loading audiences...
                        </td>
                      </tr>
                    ) : audiences.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted py-4">
                          No audiences found. <Link href="/audiences/create">{isAdmin ? 'Create your first audience' : 'Request your first audience'}</Link>
                        </td>
                      </tr>
                    ) : (
                      audiences.map((audience) => {
                        const id = audience.id || audience.audienceId || '';
                        return (
                          <tr key={id}>
                            <td>
                              <div className="d-flex align-items-center">
                                <span className={`avatar avatar-sm ${audience.isManual && isAdmin ? 'bg-purple-lt' : 'bg-primary-lt'} me-2`}>
                                  <IconUsers className="icon" />
                                </span>
                                <div>
                                  <span className="text-reset">{audience.name || 'Unnamed Audience'}</span>
                                  {audience.isManual && isAdmin && (
                                    <span className="badge bg-purple-lt text-purple ms-2">Manual</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="text-muted">
                                {(audience as unknown as { user_email?: string }).user_email || '-'}
                              </td>
                            )}
                            <td>{audience.total_records?.toLocaleString() || '-'}</td>
                            <td>
                              <span className={`badge ${
                                audience.isManual && isAdmin ? 'bg-purple' :
                                (audience as unknown as { status?: string }).status === 'ready' ? 'bg-green' :
                                (audience as unknown as { status?: string }).status === 'processing' ? 'bg-yellow' : 'bg-blue'
                              }`}>
                                {audience.isManual && isAdmin ? 'Manual' : ((audience as unknown as { status?: string }).status || 'Active')}
                              </span>
                            </td>
                            <td className="text-muted">
                              {audience.created_at ? new Date(audience.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td>
                              <div className="btn-list flex-nowrap">
                                <Link href={`/audiences/${id}`} className="btn btn-sm">View</Link>
                                {audience.isManual && audience.source_url && isAdmin && (
                                  <button
                                    className="btn btn-sm btn-outline-primary"
                                    title="Re-import from source URL"
                                    disabled={reimportingId === id}
                                    onClick={() => handleReimport(id, audience.name, audience.source_url!)}
                                  >
                                    {reimportingId === id ? (
                                      <span className="spinner-border spinner-border-sm" role="status"></span>
                                    ) : (
                                      <IconRefresh className="icon icon-sm" />
                                    )}
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => {
                                    setDeleteId(id);
                                    setShowDeleteModal(true);
                                  }}
                                >
                                  <IconTrash className="icon icon-sm" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card-footer d-flex align-items-center">
                <p className="m-0 text-muted">
                  Showing {start} to {end} of {totalRecords} entries
                </p>
                <ul className="pagination m-0 ms-auto">
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => loadAudiences(currentPage - 1)}>
                      prev
                    </button>
                  </li>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                    <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => loadAudiences(page)}>
                        {page}
                      </button>
                    </li>
                  ))}
                  <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => loadAudiences(currentPage + 1)}>
                      next
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {isAdmin ? 'All Audience Requests' : 'Your Requests'}
                </h3>
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={loadAudienceRequests}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      {isAdmin && <th>User</th>}
                      <th>Status</th>
                      <th>Submitted</th>
                      <th className="w-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audienceRequests.filter(r => r.status === 'pending').length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted py-4">
                          No pending requests
                        </td>
                      </tr>
                    ) : (
                      audienceRequests.filter(r => r.status === 'pending').map((request) => (
                        <tr key={request.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className={`avatar avatar-sm me-2 ${getRequestStatusBadgeClass(request.status)}`}>
                                {request.status === 'pending' && <IconClock className="icon" />}
                                {request.status === 'approved' && <IconCheck className="icon" />}
                                {request.status === 'rejected' && <IconX className="icon" />}
                              </span>
                              <div>
                                <div className="text-reset">{request.name}</div>
                                {request.request_type === 'custom' && (
                                  <small className="text-muted">
                                    {(request.form_data as { description?: string })?.description?.substring(0, 50)}...
                                  </small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${request.request_type === 'custom' ? 'bg-purple-lt' : 'bg-blue-lt'}`}>
                              {request.request_type}
                            </span>
                          </td>
                          {isAdmin && (
                            <td>
                              <div className="d-flex align-items-center">
                                <IconUser size={14} className="me-1 text-muted" />
                                <span className="small">{request.user?.email || 'Unknown'}</span>
                              </div>
                            </td>
                          )}
                          <td>
                            <span className={`badge ${getRequestStatusBadgeClass(request.status)}`}>
                              {request.status}
                            </span>
                          </td>
                          <td className="text-muted">
                            {new Date(request.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <div className="btn-list flex-nowrap">
                              {isAdmin && request.status === 'pending' && (
                                <>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openEditModal(request)}
                                    disabled={processing}
                                    title="View & Approve"
                                  >
                                    <IconEye size={14} className="me-1" />
                                    Review
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRejectRequest(request)}
                                    disabled={processing}
                                    title="Reject"
                                  >
                                    <IconX size={14} />
                                  </button>
                                </>
                              )}
                              {!isAdmin && request.status === 'pending' && (
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleDeleteRequest(request.id)}
                                  title="Cancel Request"
                                >
                                  <IconTrash size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1040 }}
            onClick={() => !deleting && setShowDeleteModal(false)}
          ></div>
          <div
            className="modal modal-blur fade show"
            style={{ display: 'block', zIndex: 1050 }}
            tabIndex={-1}
          >
            <div className="modal-dialog modal-sm modal-dialog-centered">
              <div className="modal-content">
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => !deleting && setShowDeleteModal(false)}
                  disabled={deleting}
                ></button>
                <div className="modal-status bg-danger"></div>
                <div className="modal-body text-center py-4">
                  <IconTrash className="icon mb-2 text-danger icon-lg" />
                  <h3>Are you sure?</h3>
                  <div className="text-muted">
                    Do you really want to delete this audience? This action cannot be undone.
                  </div>
                  {deleteId && (
                    <div className="text-muted small mt-2">
                      ID: <code>{deleteId}</code>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <div className="w-100">
                    <div className="row">
                      <div className="col">
                        <button
                          className="btn w-100"
                          onClick={() => setShowDeleteModal(false)}
                          disabled={deleting}
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="col">
                        <button
                          className="btn btn-danger w-100"
                          onClick={() => handleDelete()}
                          disabled={deleting}
                        >
                          {deleting ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit/Review Modal */}
      {showEditModal && editingRequest && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1040 }}
            onClick={() => setShowEditModal(false)}
          />
          <div
            className="card"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '85vh',
              zIndex: 1050,
              display: 'flex',
              flexDirection: 'column',
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h3 className="card-title">
                <IconEdit className="icon me-2" />
                Review Audience Request
              </h3>
              <div className="card-actions">
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)} />
              </div>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
                <div className="alert alert-info mb-3">
                  <strong>Requester:</strong> {editingRequest.user?.email || 'Unknown'}
                  <span className="ms-3"><strong>Type:</strong> {editingRequest.request_type}</span>
                </div>

                {editingRequest.data_points?.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label">Requested Data Points</label>
                    <div className="d-flex flex-wrap gap-2">
                      {editingRequest.data_points.map((dp) => (
                        <span key={dp} className="badge bg-purple-lt text-purple" style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '6px 12px',
                          textTransform: 'capitalize',
                        }}>
                          {dp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {editFormData.request_type === 'custom' ? (
                  // Custom Audience Form
                  <>
                    <div className="mb-3">
                      <label className="form-label">Topic Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={editFormData.topic}
                        onChange={(e) => setEditFormData({ ...editFormData, topic: e.target.value, name: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={editFormData.description}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  // Standard Audience Form
                  <>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="mb-3">
                          <label className="form-label">Audience Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Days Back</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.days_back}
                            onChange={(e) => setEditFormData({ ...editFormData, days_back: parseInt(e.target.value) || 7 })}
                            min={1}
                            max={365}
                          />
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Demographics</h4>
                    <div className="row">
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Min Age</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.minAge}
                            onChange={(e) => setEditFormData({ ...editFormData, minAge: e.target.value })}
                            placeholder="e.g., 25"
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Max Age</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.maxAge}
                            onChange={(e) => setEditFormData({ ...editFormData, maxAge: e.target.value })}
                            placeholder="e.g., 65"
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Gender</label>
                          <select
                            className="form-select"
                            value={editFormData.gender}
                            onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                          >
                            <option value="">Any</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Location</h4>
                    <div className="row">
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">Cities</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.cities}
                            onChange={(e) => setEditFormData({ ...editFormData, cities: e.target.value })}
                            placeholder="e.g., New York, Los Angeles"
                          />
                          <small className="form-hint">Comma-separated</small>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">States</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.states}
                            onChange={(e) => setEditFormData({ ...editFormData, states: e.target.value })}
                            placeholder="e.g., CA, NY, TX"
                          />
                          <small className="form-hint">Comma-separated</small>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Business Profile</h4>
                    <div className="mb-3">
                      <label className="form-label">Industries</label>
                      <select
                        className="form-select"
                        multiple
                        size={6}
                        value={editFormData.industries}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          industries: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {industryOptions.map((industry) => (
                          <option key={industry} value={industry}>
                            {industry}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple industries</small>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Departments</label>
                      <select
                        className="form-select"
                        multiple
                        size={6}
                        value={editFormData.departments}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          departments: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {departmentOptions.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple departments</small>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Seniority Level</label>
                      <select
                        className="form-select"
                        multiple
                        size={5}
                        value={editFormData.seniority}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          seniority: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {seniorityOptions.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple levels</small>
                    </div>

                    <h4 className="mb-3">Segments</h4>
                    <div className="mb-3">
                      <label className="form-label">Segment IDs</label>
                      <input
                        type="text"
                        className="form-control"
                        value={editFormData.segments}
                        onChange={(e) => setEditFormData({ ...editFormData, segments: e.target.value })}
                        placeholder="e.g., 100073, 100074"
                      />
                      <small className="form-hint">Comma-separated</small>
                    </div>
                  </>
                )}

                <hr className="my-3" />
                <div className="mb-3">
                  <label className="form-label">Admin Notes (optional)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add any notes about this approval..."
                  />
                </div>
              </div>
            <div className="card-footer">
              <div className="d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => {
                    setManualAudienceName(editFormData.name || editingRequest?.name || '');
                    setShowManualModal(true);
                  }}
                  disabled={processing}
                >
                  <IconPlus size={16} className="me-1" />
                  Manual Upload
                </button>
                <div className="d-flex gap-2">
                  <button type="button" className="btn" onClick={() => setShowEditModal(false)} disabled={processing}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleApproveWithEdit}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Creating...
                      </>
                    ) : (
                      <>
                        <IconCheck size={16} className="me-1" />
                        Approve & Create Audience
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual Audience Upload Modal */}
      {showManualModal && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1050 }}
            onClick={() => setShowManualModal(false)}
          />
          <div
            className="card"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1060,
              width: '700px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="card-header">
              <h3 className="card-title">
                <IconPlus size={20} className="me-2" />
                Manual Audience Upload
              </h3>
              <div className="card-actions">
                <button type="button" className="btn-close" onClick={() => setShowManualModal(false)} />
              </div>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
              {/* Assign to Request - shown first when opened from main button */}
              {editingRequest ? (
                <div className="alert alert-info mb-3">
                  <strong>Note:</strong> This audience will be assigned to request: {editingRequest.name}
                </div>
              ) : (
                <div className="mb-3">
                  <label className="form-label">Assign to Request (Optional)</label>
                  <select
                    className="form-select"
                    value={selectedRequestId}
                    onChange={(e) => setSelectedRequestId(e.target.value)}
                  >
                    <option value="">-- No request (standalone audience) --</option>
                    {audienceRequests
                      .filter(r => r.status === 'pending')
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.user?.email || 'Unknown user'})
                        </option>
                      ))
                    }
                  </select>
                  <small className="form-hint">
                    Select a pending request to fulfill. The audience will be visible to that user.
                  </small>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">Audience Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className="form-control"
                  value={manualAudienceName}
                  onChange={(e) => setManualAudienceName(e.target.value)}
                  placeholder="Enter audience name"
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Fetch from URL (Optional)</label>
                <div className="input-group">
                  <input
                    type="url"
                    className="form-control"
                    value={manualAudienceUrl}
                    onChange={(e) => setManualAudienceUrl(e.target.value)}
                    placeholder="https://api.example.com/audience-data"
                  />
                  <button
                    className="btn btn-outline-primary"
                    onClick={handleFetchManualAudience}
                    disabled={fetchingManualAudience || !manualAudienceUrl}
                  >
                    {fetchingManualAudience ? (
                      <IconLoader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      'Fetch'
                    )}
                  </button>
                </div>
                <small className="form-hint">Enter a URL to fetch audience data, or paste JSON below. API key from Settings will be used automatically.</small>
              </div>

              {/* Show preview info for large datasets */}
              {urlPreview && (
                <div className="mb-3">
                  <div className="alert alert-info">
                    <strong>Large dataset detected</strong>
                    <div>~{urlPreview.estimated_total_records.toLocaleString()} records across {urlPreview.total_pages} pages ({urlPreview.records_per_page} per page)</div>
                    <small>Data will be fetched and saved directly on the server. No need to paste JSON.</small>
                  </div>
                </div>
              )}

              {/* Only show JSON textarea if no URL preview (small dataset or manual paste) */}
              {!urlPreview && (
                <div className="mb-3">
                  <label className="form-label">Audience Data (JSON) {!manualAudienceUrl && <span className="text-danger">*</span>}</label>
                  <textarea
                    className="form-control font-monospace"
                    rows={10}
                    value={manualAudienceData}
                    onChange={(e) => setManualAudienceData(e.target.value)}
                    placeholder={`Paste audience JSON data here...

Example format:
{
  "contacts": [
    {
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company": "Acme Corp"
    }
  ]
}`}
                  />
                </div>
              )}

              {/* Import progress */}
              {importProgress && (
                <div className="mb-3">
                  <div className="alert alert-warning">
                    <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                    {importProgress}
                  </div>
                </div>
              )}
            </div>
            <div className="card-footer">
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn" onClick={() => { setShowManualModal(false); setUrlPreview(null); setImportProgress(''); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateManualAudience}
                  disabled={creatingManualAudience || !manualAudienceName || (!manualAudienceData && !urlPreview && !manualAudienceUrl)}
                >
                  {creatingManualAudience ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      {urlPreview ? 'Importing...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} className="me-1" />
                      {urlPreview ? 'Import Audience' : 'Create Audience'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast Notification */}
      {/* Persistent re-import progress banner */}
      {reimportProgress && (
        <div
          className="position-fixed d-flex align-items-center gap-3 px-4 py-3 bg-primary text-white shadow-lg"
          style={{
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10000,
          }}
        >
          <span className="spinner-border spinner-border-sm flex-shrink-0" role="status"></span>
          <span className="fw-medium">{reimportProgress}</span>
        </div>
      )}

      {toast && (
        <div
          className={`toast show position-fixed`}
          style={{
            top: reimportProgress ? '60px' : '20px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px',
          }}
        >
          <div className={`toast-header ${
            toast.type === 'success' ? 'bg-success text-white' :
            toast.type === 'error' ? 'bg-danger text-white' :
            'bg-info text-white'
          }`}>
            <strong className="me-auto">
              {toast.type === 'success' ? 'Success' :
               toast.type === 'error' ? 'Error' : 'Info'}
            </strong>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => setToast(null)}
            ></button>
          </div>
          <div className="toast-body">
            {toast.message}
          </div>
        </div>
      )}

      <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}
