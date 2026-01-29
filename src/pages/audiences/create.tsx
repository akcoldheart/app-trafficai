import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI } from '@/lib/api';
import { IconPlus, IconInfoCircle } from '@tabler/icons-react';

export default function CreateAudience() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [loading, setLoading] = useState(false);

  // Static fallback options for dropdowns
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

  const [industries, setIndustries] = useState<string[]>(STATIC_INDUSTRIES);
  const [departments, setDepartments] = useState<string[]>(STATIC_DEPARTMENTS);
  const [seniority, setSeniority] = useState<string[]>(STATIC_SENIORITY);

  // Form state
  const [name, setName] = useState('');
  const [daysBack, setDaysBack] = useState(7);
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [gender, setGender] = useState('');
  const [cities, setCities] = useState('');
  const [states, setStates] = useState('');
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedSeniority, setSelectedSeniority] = useState<string[]>([]);
  const [segments, setSegments] = useState('');

  useEffect(() => {

    loadAttributes();
  }, [router]);

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

  const loadAttributes = async () => {
    try {
      const industriesData = await TrafficAPI.getAudienceAttributes('industries');
      const extracted = extractAttributes(industriesData);
      if (extracted.length > 0) setIndustries(extracted);
    } catch (error) {
      console.error('Error loading industries, using static list:', error);
      // Keep static fallback (already set as default)
    }

    try {
      const departmentsData = await TrafficAPI.getAudienceAttributes('departments');
      const extracted = extractAttributes(departmentsData);
      if (extracted.length > 0) setDepartments(extracted);
    } catch (error) {
      console.error('Error loading departments, using static list:', error);
    }

    try {
      const seniorityData = await TrafficAPI.getAudienceAttributes('seniority');
      const extracted = extractAttributes(seniorityData);
      if (extracted.length > 0) setSeniority(extracted);
    } catch (error) {
      console.error('Error loading seniority, using static list:', error);
    }
  };

  const buildFormData = () => {
    const filters: Record<string, unknown> = {};

    // Age filter
    if (minAge || maxAge) {
      filters.age = {};
      if (minAge) (filters.age as Record<string, number>).minAge = parseInt(minAge);
      if (maxAge) (filters.age as Record<string, number>).maxAge = parseInt(maxAge);
    }

    // Gender filter
    if (gender) filters.gender = gender;

    // City filter
    if (cities) {
      filters.city = cities.split(',').map((c) => c.trim()).filter((c) => c);
    }

    // State filter
    if (states) {
      filters.state = states.split(',').map((s) => s.trim()).filter((s) => s);
    }

    // Business profile filters
    const businessProfile: Record<string, string[]> = {};
    if (selectedIndustries.length > 0) businessProfile.industry = selectedIndustries;
    if (selectedDepartments.length > 0) businessProfile.department = selectedDepartments;
    if (selectedSeniority.length > 0) businessProfile.seniority = selectedSeniority;
    if (Object.keys(businessProfile).length > 0) filters.businessProfile = businessProfile;

    // Segments
    const segmentList = segments ? segments.split(',').map((s) => s.trim()).filter((s) => s) : [];

    return {
      filters,
      days_back: daysBack,
      ...(segmentList.length > 0 ? { segment: segmentList } : {}),
    };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = buildFormData();

      if (isAdmin) {
        // Admin can create audience directly
        const data = {
          name,
          ...formData,
        };

        await TrafficAPI.createAudience(data);
        alert('Audience created successfully!');
        router.push('/audiences');
      } else {
        // Non-admin users submit a request
        const response = await fetch('/api/audience-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_type: 'standard',
            name,
            form_data: formData,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to submit audience request');
        }

        alert('Your audience request has been submitted for admin approval.');
        router.push('/audiences');
      }
    } catch (error) {
      alert('Error: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Create Audience" pageTitle="Create Audience" pagePretitle="Traffic AI">
      <div className="row row-cards">
        <div className="col-lg-8">
          <form onSubmit={handleSubmit}>
            {!isAdmin && (
              <div className="alert alert-info mb-3">
                <div className="d-flex align-items-start">
                  <IconInfoCircle size={20} className="me-2 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="alert-title">Request Mode</h4>
                    <p className="mb-0">
                      Your audience request will be submitted for admin approval. Once approved,
                      the audience will be created and available in your Audiences list.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Audience Details</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label required">Audience Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Tech Professionals in NYC"
                    required
                  />
                  <small className="form-hint">Give your audience a descriptive name</small>
                </div>

                <div className="mb-3">
                  <label className="form-label">Days Back</label>
                  <input
                    type="number"
                    className="form-control"
                    value={daysBack}
                    onChange={(e) => setDaysBack(parseInt(e.target.value) || 7)}
                    min={1}
                    max={365}
                  />
                  <small className="form-hint">Number of days to look back for data (1-365)</small>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Demographic Filters</h3>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label">Minimum Age</label>
                      <input
                        type="number"
                        className="form-control"
                        value={minAge}
                        onChange={(e) => setMinAge(e.target.value)}
                        placeholder="e.g., 25"
                        min={18}
                        max={100}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label">Maximum Age</label>
                      <input
                        type="number"
                        className="form-control"
                        value={maxAge}
                        onChange={(e) => setMaxAge(e.target.value)}
                        placeholder="e.g., 65"
                        min={18}
                        max={100}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Gender</label>
                  <select
                    className="form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Location Filters</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Cities</label>
                  <input
                    type="text"
                    className="form-control"
                    value={cities}
                    onChange={(e) => setCities(e.target.value)}
                    placeholder="e.g., New York, San Francisco, Los Angeles"
                  />
                  <small className="form-hint">Enter city names separated by commas</small>
                </div>

                <div className="mb-3">
                  <label className="form-label">States</label>
                  <input
                    type="text"
                    className="form-control"
                    value={states}
                    onChange={(e) => setStates(e.target.value)}
                    placeholder="e.g., CA, NY, TX"
                  />
                  <small className="form-hint">Enter state codes separated by commas</small>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Business Profile Filters</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Industries</label>
                  <select
                    className="form-select"
                    multiple
                    value={selectedIndustries}
                    onChange={(e) =>
                      setSelectedIndustries(Array.from(e.target.selectedOptions, (o) => o.value))
                    }
                  >
                    {industries.map((industry) => (
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
                    value={selectedDepartments}
                    onChange={(e) =>
                      setSelectedDepartments(Array.from(e.target.selectedOptions, (o) => o.value))
                    }
                  >
                    {departments.map((dept) => (
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
                    value={selectedSeniority}
                    onChange={(e) =>
                      setSelectedSeniority(Array.from(e.target.selectedOptions, (o) => o.value))
                    }
                  >
                    {seniority.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <small className="form-hint">Hold Ctrl/Cmd to select multiple levels</small>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Segments</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Segment IDs</label>
                  <input
                    type="text"
                    className="form-control"
                    value={segments}
                    onChange={(e) => setSegments(e.target.value)}
                    placeholder="e.g., 100073, 100074"
                  />
                  <small className="form-hint">Enter segment IDs separated by commas</small>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div className="d-flex justify-content-between">
                  <Link href="/audiences" className="btn btn-outline-secondary">
                    Cancel
                  </Link>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                        {isAdmin ? 'Creating...' : 'Submitting...'}
                      </>
                    ) : (
                      <>
                        <IconPlus className="icon" />
                        {isAdmin ? 'Create Audience' : 'Submit Request'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Help</h3>
            </div>
            <div className="card-body">
              <h4>Creating an Audience</h4>
              <p className="text-muted">
                Audiences allow you to target specific groups of people based on demographics, location, and business profile.
              </p>

              <h4>Filter Tips</h4>
              <ul className="text-muted">
                <li><strong>Age Range:</strong> Set minimum and maximum age to target specific demographics</li>
                <li><strong>Location:</strong> Target by city or state for geographic targeting</li>
                <li><strong>Industries:</strong> Focus on specific business sectors</li>
                <li><strong>Seniority:</strong> Target decision-makers or specific job levels</li>
              </ul>

              <div className="alert alert-info mt-3">
                <h4 className="alert-title">Note</h4>
                <p className="mb-0">All filters are optional. Leave blank to not filter by that criteria.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
