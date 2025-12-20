import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { IconRobot, IconPlus, IconEdit, IconTrash, IconRefresh, IconCheck, IconX } from '@tabler/icons-react';

interface AutoReply {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export default function AutoRepliesPage() {
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingReply, setEditingReply] = useState<AutoReply | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    keywords: '',
    priority: 0,
    is_active: true,
  });

  const fetchAutoReplies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/chat/auto-replies');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAutoReplies(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load auto-replies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutoReplies();
  }, [fetchAutoReplies]);

  const openAddModal = () => {
    setEditingReply(null);
    setFormData({
      question: '',
      answer: '',
      keywords: '',
      priority: 0,
      is_active: true,
    });
    setShowModal(true);
  };

  const openEditModal = (reply: AutoReply) => {
    setEditingReply(reply);
    setFormData({
      question: reply.question,
      answer: reply.answer,
      keywords: reply.keywords.join(', '),
      priority: reply.priority,
      is_active: reply.is_active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReply(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const keywords = formData.keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);

      const payload = {
        question: formData.question,
        answer: formData.answer,
        keywords,
        is_active: formData.is_active,
        priority: formData.priority,
        ...(editingReply && { id: editingReply.id }),
      };

      console.log('Submitting auto-reply:', payload);

      const response = await fetch('/api/chat/auto-replies', {
        method: editingReply ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      console.log('API response:', response.status, result);

      if (!response.ok) throw new Error(result.error || 'Failed to save');

      closeModal();
      fetchAutoReplies();
    } catch (err) {
      console.error('Submit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save auto-reply');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this auto-reply?')) return;

    try {
      const response = await fetch(`/api/chat/auto-replies?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }

      fetchAutoReplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete auto-reply');
    }
  };

  const toggleActive = async (reply: AutoReply) => {
    try {
      const response = await fetch('/api/chat/auto-replies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reply.id,
          is_active: !reply.is_active,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error);
      }

      fetchAutoReplies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update auto-reply');
    }
  };

  const pageActions = (
    <div className="btn-list">
      <button
        className="btn btn-ghost-secondary"
        onClick={fetchAutoReplies}
        disabled={loading}
      >
        <IconRefresh size={16} className={`me-1 ${loading ? 'spin' : ''}`} />
        Refresh
      </button>
      <button className="btn btn-primary" onClick={openAddModal}>
        <IconPlus size={16} className="me-1" />
        Add Q&A
      </button>
    </div>
  );

  return (
    <Layout title="Auto Replies" pageTitle="Auto Replies" pagePretitle="Chat Settings" pageActions={pageActions}>
      <div className="row">
        <div className="col-12">
          {/* Info Card */}
          <div className="alert alert-info mb-3">
            <div className="d-flex">
              <IconRobot size={24} className="me-2 flex-shrink-0" />
              <div>
                <h4 className="alert-title">How Auto-Replies Work</h4>
                <div className="text-secondary">
                  When a customer sends their <strong>first message</strong>, the bot will try to match it against these Q&A pairs using keywords.
                  If a match is found, the corresponding answer is sent automatically. Otherwise, a default acknowledgment is sent.
                </div>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert-danger alert-dismissible mb-3">
              {error}
              <button type="button" className="btn-close" onClick={() => setError(null)} />
            </div>
          )}

          {/* Auto-Replies List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconRobot size={20} className="me-2" />
                Q&A Pairs ({autoReplies.length})
              </h3>
            </div>

            {loading ? (
              <div className="card-body text-center py-5">
                <div className="spinner-border text-primary" role="status" />
                <p className="text-muted mt-2">Loading auto-replies...</p>
              </div>
            ) : autoReplies.length === 0 ? (
              <div className="card-body text-center py-5">
                <IconRobot size={48} className="text-muted mb-3" />
                <h3>No Auto-Replies Yet</h3>
                <p className="text-muted">Add Q&A pairs to automatically respond to common questions.</p>
                <button className="btn btn-primary" onClick={openAddModal}>
                  <IconPlus size={16} className="me-1" />
                  Add Your First Q&A
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Question</th>
                      <th>Answer</th>
                      <th>Keywords</th>
                      <th>Priority</th>
                      <th className="w-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoReplies.map((reply) => (
                      <tr key={reply.id}>
                        <td>
                          <button
                            className={`btn btn-sm ${reply.is_active ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => toggleActive(reply)}
                            title={reply.is_active ? 'Click to disable' : 'Click to enable'}
                          >
                            {reply.is_active ? <IconCheck size={14} /> : <IconX size={14} />}
                          </button>
                        </td>
                        <td>
                          <div className="text-truncate" style={{ maxWidth: '200px' }} title={reply.question}>
                            {reply.question}
                          </div>
                        </td>
                        <td>
                          <div className="text-truncate" style={{ maxWidth: '250px' }} title={reply.answer}>
                            {reply.answer}
                          </div>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {reply.keywords.slice(0, 3).map((keyword, i) => (
                              <span key={i} className="badge bg-secondary-lt">{keyword}</span>
                            ))}
                            {reply.keywords.length > 3 && (
                              <span className="badge bg-secondary-lt">+{reply.keywords.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td>{reply.priority}</td>
                        <td>
                          <div className="btn-list flex-nowrap">
                            <button
                              className="btn btn-ghost-primary btn-sm"
                              onClick={() => openEditModal(reply)}
                            >
                              <IconEdit size={14} />
                            </button>
                            <button
                              className="btn btn-ghost-danger btn-sm"
                              onClick={() => handleDelete(reply.id)}
                            >
                              <IconTrash size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <>
          <div className="modal-backdrop fade show" onClick={closeModal} />
          <div className="modal fade show" style={{ display: 'block', zIndex: 1055 }} tabIndex={-1}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {editingReply ? 'Edit Q&A' : 'Add New Q&A'}
                  </h5>
                  <button type="button" className="btn-close" onClick={closeModal} />
                </div>
                <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {error && (
                    <div className="alert alert-danger alert-dismissible mb-3">
                      {error}
                      <button type="button" className="btn-close" onClick={() => setError(null)} />
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label required">Question / Trigger</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., What is pixel creation?"
                      value={formData.question}
                      onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                      required
                    />
                    <small className="form-hint">The question this auto-reply should match</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label required">Answer</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      placeholder="e.g., Pixel creation allows you to track visitors on your website..."
                      value={formData.answer}
                      onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                      required
                    />
                    <small className="form-hint">The response the bot will send</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Keywords (comma-separated)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., pixel, tracking, create pixel"
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    />
                    <small className="form-hint">Keywords to match in customer messages (case-insensitive)</small>
                  </div>

                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Priority</label>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                      />
                      <small className="form-hint">Higher priority = checked first</small>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Status</label>
                      <label className="form-check form-switch mt-2">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        />
                        <span className="form-check-label">
                          {formData.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : (editingReply ? 'Save Changes' : 'Add Q&A')}
                  </button>
                </div>
              </form>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </Layout>
  );
}
