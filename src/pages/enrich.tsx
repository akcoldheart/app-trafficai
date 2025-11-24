import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { TrafficAPI, Contact } from '@/lib/api';
import { IconSearch } from '@tabler/icons-react';

interface EnrichResult extends Contact {
  first_name?: string;
  last_name?: string;
  email?: string;
  b2b_email?: string;
  business_email?: string;
  personal_email?: string;
  company_name?: string;
  company?: string;
  job_title?: string;
  b2b_phone?: string;
  personal_phone?: string;
  phone?: string;
  city?: string;
  state?: string;
  industry?: string;
  linkedin_url?: string;
}

export default function Enrich() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EnrichResult[]>([]);
  const [resultsCount, setResultsCount] = useState(0);
  const [searched, setSearched] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [orMatch, setOrMatch] = useState(false);

  useEffect(() => {
    if (!TrafficAPI.hasApiKey()) {
      alert('Please configure your API key in Settings first');
      router.push('/settings');
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Build filter object
    const filter: Record<string, string> = {};
    if (email) filter.email = email;
    if (firstName) filter.first_name = firstName;
    if (lastName) filter.last_name = lastName;
    if (phone) filter.phone = phone;
    if (companyName) filter.company_name = companyName;
    if (companyDomain) filter.company_domain = companyDomain;
    if (city) filter.personal_city = city;
    if (state) filter.personal_state = state;
    if (linkedinUrl) filter.linkedin_url = linkedinUrl;

    if (Object.keys(filter).length === 0) {
      alert('Please enter at least one search criteria');
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const data = await TrafficAPI.enrichContact(filter, { is_or_match: orMatch });
      const resultList = (data as unknown as { Result?: EnrichResult[] }).Result || [];
      setResults(resultList);
      setResultsCount((data as unknown as { Found?: number }).Found || resultList.length);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setResultsCount(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Contact Enrichment" pageTitle="Contact Enrichment" pagePretitle="Traffic AI">
      <div className="row row-cards">
        {/* Search Form */}
        <div className="col-lg-4">
          <form onSubmit={handleSubmit}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Search Filters</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john.doe@example.com"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555-123-4567"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Company Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Company Domain</label>
                  <input
                    type="text"
                    className="form-control"
                    value={companyDomain}
                    onChange={(e) => setCompanyDomain(e.target.value)}
                    placeholder="acme.com"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="form-control"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="CA"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">LinkedIn URL</label>
                  <input
                    type="url"
                    className="form-control"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/johndoe"
                  />
                </div>

                <hr />

                <div className="mb-3">
                  <label className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={orMatch}
                      onChange={(e) => setOrMatch(e.target.checked)}
                    />
                    <span className="form-check-label">Use OR matching</span>
                  </label>
                  <small className="form-hint">
                    When enabled, returns contacts matching ANY criteria. Otherwise, all criteria must match.
                  </small>
                </div>
              </div>
              <div className="card-footer">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Searching...
                    </>
                  ) : (
                    <>
                      <IconSearch className="icon" />
                      Search Contacts
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Results</h3>
              <div className="card-actions">
                <span className="badge bg-blue">{resultsCount} results</span>
              </div>
            </div>
            <div className="card-body p-0">
              {!searched ? (
                <div className="text-center text-muted py-5">
                  <IconSearch className="icon icon-lg mb-2" />
                  <p>Enter search criteria and click &quot;Search Contacts&quot; to find matching records</p>
                </div>
              ) : loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border" role="status"></div>
                  <p className="mt-2 text-muted">Searching contacts...</p>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <IconSearch className="icon icon-lg mb-2" />
                  <p>No matching contacts found</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {results.map((contact, idx) => {
                    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown';
                    const contactEmail =
                      contact.email || contact.b2b_email || contact.business_email || contact.personal_email || '-';
                    const company = contact.company_name || contact.company || '-';
                    const jobTitle = contact.job_title || '-';
                    const contactPhone = contact.b2b_phone || contact.personal_phone || contact.phone || '-';
                    const location = [contact.city, contact.state].filter(Boolean).join(', ') || '-';
                    const linkedin = contact.linkedin_url || '';

                    return (
                      <div key={idx} className="list-group-item">
                        <div className="row align-items-center">
                          <div className="col-auto">
                            <span className="avatar bg-primary-lt">
                              {name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .substring(0, 2)
                                .toUpperCase()}
                            </span>
                          </div>
                          <div className="col">
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <h4 className="mb-1">{name}</h4>
                                <div className="text-muted small">
                                  {jobTitle} at {company}
                                </div>
                              </div>
                              {linkedin && (
                                <a href={linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">
                                  LinkedIn
                                </a>
                              )}
                            </div>
                            <div className="row mt-2 small">
                              <div className="col-md-4">
                                <strong>Email:</strong>{' '}
                                {contactEmail !== '-' ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : contactEmail}
                              </div>
                              <div className="col-md-4">
                                <strong>Phone:</strong>{' '}
                                {contactPhone !== '-' ? <a href={`tel:${contactPhone}`}>{contactPhone}</a> : contactPhone}
                              </div>
                              <div className="col-md-4">
                                <strong>Location:</strong> {location}
                              </div>
                            </div>
                            {contact.industry && (
                              <div className="mt-1">
                                <span className="badge bg-azure-lt">{contact.industry}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Help Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Search Tips</h3>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <h4>Available Search Fields</h4>
                  <ul className="text-muted">
                    <li>
                      <strong>Personal:</strong> Email, name, phone, LinkedIn URL
                    </li>
                    <li>
                      <strong>Location:</strong> City, state, ZIP, address
                    </li>
                    <li>
                      <strong>Company:</strong> Company name, domain
                    </li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <h4>Matching Modes</h4>
                  <ul className="text-muted">
                    <li>
                      <strong>AND (default):</strong> All criteria must match
                    </li>
                    <li>
                      <strong>OR:</strong> Any criteria can match (enable checkbox)
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
