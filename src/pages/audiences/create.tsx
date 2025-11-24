import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { IconPlus } from '@tabler/icons-react';

export default function CreateAudience() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [industries, setIndustries] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);

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
    if (!TrafficAPI.hasApiKey()) {
      alert('Please configure your API key in Settings first');
      router.push('/settings');
      return;
    }

    loadAttributes();
  }, [router]);

  const loadAttributes = async () => {
    try {
      const industriesData = await TrafficAPI.getAudienceAttributes('industries');
      setIndustries((industriesData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                   (industriesData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading industries:', error);
    }

    try {
      const departmentsData = await TrafficAPI.getAudienceAttributes('departments');
      setDepartments((departmentsData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                    (departmentsData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading departments:', error);
    }

    try {
      const seniorityData = await TrafficAPI.getAudienceAttributes('seniority');
      setSeniority((seniorityData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                  (seniorityData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading seniority:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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

      const data = {
        name,
        filters,
        days_back: daysBack,
        ...(segmentList.length > 0 ? { segment: segmentList } : {}),
      };

      await TrafficAPI.createAudience(data);
      alert('Audience created successfully!');
      router.push('/audiences');
    } catch (error) {
      alert('Error creating audience: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Create Audience" pageTitle="Create Audience" pagePretitle="Traffic AI">
      <div className="row row-cards">
        <div className="col-lg-8">
          <form onSubmit={handleSubmit}>
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
                        Creating...
                      </>
                    ) : (
                      <>
                        <IconPlus className="icon" />
                        Create Audience
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
