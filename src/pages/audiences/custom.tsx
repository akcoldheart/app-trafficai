import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI } from '@/lib/api';
import { IconPlus, IconInfoCircle, IconCheck, IconCircleCheck } from '@tabler/icons-react';

export default function CustomAudience() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const allDataPoints = ['business', 'financial', 'personal', 'family', 'housing', 'location'];
  const [dataPoints, setDataPoints] = useState<string[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isAdmin) {
        // Admin can create custom audience directly
        const result = await TrafficAPI.createCustomAudience(topic, description);
        const status = (result as unknown as { Status?: string }).Status || 'processing';
        showToast(`Custom audience created successfully! Status: ${status}`, 'success');
        setTimeout(() => router.push('/audiences'), 1500);
      } else {
        // Non-admin users submit a request
        const response = await fetch('/api/audience-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_type: 'custom',
            name: topic,
            form_data: {
              topic,
              description,
            },
            data_points: dataPoints,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to submit custom audience request');
        }

        showToast('Your custom audience request has been submitted for admin approval.', 'success');
        setTimeout(() => router.push('/audiences'), 1500);
      }
    } catch (error) {
      showToast('Error: ' + (error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Create Custom Audience" pageTitle="Create Custom Audience">
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
                      Your custom audience request will be submitted for admin approval. Once approved,
                      the audience will be created and available in your Audiences list.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Custom Audience Details</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label required">Topic</label>
                  <input
                    type="text"
                    className="form-control"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., Luxury Travel Enthusiasts"
                    required
                  />
                  <small className="form-hint">Enter a custom topic name for your audience</small>
                </div>

                <div className="mb-3">
                  <label className="form-label required">Description</label>
                  <textarea
                    className="form-control"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="e.g., Users interested in luxury travel, first-class flights, and premium hotel experiences"
                    required
                  ></textarea>
                  <small className="form-hint">
                    Provide a detailed description of the custom topic to help identify relevant users
                  </small>
                </div>
              </div>
              {!isAdmin && (
                <div className="card-body border-top">
                  <label className="form-label">Data Points</label>
                  <p className="text-muted small mb-2">
                    Optionally select data categories to collect from visitors.
                  </p>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {allDataPoints.map((point) => {
                      const isSelected = dataPoints.includes(point);
                      return (
                        <button
                          key={point}
                          type="button"
                          className="btn btn-sm"
                          disabled={loading}
                          onClick={() => {
                            setDataPoints(isSelected
                              ? dataPoints.filter((d) => d !== point)
                              : [...dataPoints, point]
                            );
                          }}
                          style={{
                            backgroundColor: isSelected ? 'rgba(32, 107, 196, 0.15)' : 'transparent',
                            border: isSelected ? '1px solid rgba(32, 107, 196, 0.5)' : '1px solid var(--tblr-border-color)',
                            color: isSelected ? '#4299e1' : 'var(--tblr-body-color)',
                            borderRadius: '20px',
                            padding: '4px 12px',
                            fontSize: '12px',
                            fontWeight: isSelected ? 600 : 400,
                            transition: 'all 0.15s ease',
                            textTransform: 'capitalize',
                          }}
                        >
                          {isSelected && <IconCheck size={12} className="me-1" />}
                          {point}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(32, 107, 196, 0.08), rgba(32, 196, 140, 0.08))',
                    border: '1px solid rgba(32, 196, 140, 0.2)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                  }}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: '12px', color: 'var(--tblr-body-color)' }}>
                      <IconCircleCheck size={16} style={{ color: '#20c997', flexShrink: 0 }} />
                      <span>
                        All identified visitors will include <strong>Name</strong>, <strong>Email</strong> &amp; <strong>Phone</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="card-footer">
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
                        {isAdmin ? 'Create Custom Audience' : 'Submit Request'}
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
              <h3 className="card-title">About Custom Audiences</h3>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Custom audiences let you define your own targeting criteria using natural language descriptions.
              </p>

              <h4>How it works</h4>
              <ol className="text-muted">
                <li>Define a topic that describes your target audience</li>
                <li>Provide a detailed description of user interests and behaviors</li>
                <li>The system will process your request and find matching users</li>
              </ol>

              <h4>Example Topics</h4>
              <ul className="text-muted">
                <li>Electric Vehicle Enthusiasts</li>
                <li>Small Business Owners</li>
                <li>Health & Fitness Professionals</li>
                <li>Tech Early Adopters</li>
                <li>Sustainable Living Advocates</li>
              </ul>

              <div className="alert alert-info mt-3">
                <h4 className="alert-title">Processing Time</h4>
                <p className="mb-0">
                  Custom audiences may take some time to process. You&apos;ll see a &quot;processing&quot; status while the
                  audience is being built.
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Tips for Better Results</h3>
            </div>
            <div className="card-body">
              <ul className="text-muted">
                <li>
                  <strong>Be specific:</strong> The more detailed your description, the better the targeting
                </li>
                <li>
                  <strong>Include behaviors:</strong> Mention specific activities or interests
                </li>
                <li>
                  <strong>Add context:</strong> Include industry, job roles, or demographics if relevant
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className="toast show position-fixed"
          style={{
            top: '20px',
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
    </Layout>
  );
}
