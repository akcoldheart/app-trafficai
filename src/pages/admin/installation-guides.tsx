import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconLoader2,
  IconBrandWordpress,
  IconShoppingBag,
  IconCode,
  IconTag,
  IconEye,
  IconDeviceFloppy,
  IconGripVertical,
} from '@tabler/icons-react';

interface InstallationGuide {
  id: string;
  platform: string;
  title: string;
  description: string;
  content: string;
  icon: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case 'wordpress':
      return <IconBrandWordpress size={20} />;
    case 'shopify':
      return <IconShoppingBag size={20} />;
    case 'gtm':
      return <IconTag size={20} />;
    case 'manual':
    default:
      return <IconCode size={20} />;
  }
}

export default function InstallationGuidesAdmin() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [guides, setGuides] = useState<InstallationGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingGuide, setEditingGuide] = useState<InstallationGuide | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Check admin access
  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') {
      router.push('/');
    }
  }, [userProfile, router]);

  useEffect(() => {
    loadGuides();
  }, []);

  const loadGuides = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/installation-guides');
      const data = await response.json();
      setGuides(data.guides || []);
    } catch (error) {
      console.error('Error loading guides:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingGuide) return;

    setSaving(true);
    try {
      const isNew = !editingGuide.id;
      const url = isNew
        ? '/api/installation-guides'
        : `/api/installation-guides/${editingGuide.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingGuide),
      });

      if (!response.ok) {
        throw new Error('Failed to save guide');
      }

      await loadGuides();
      setIsModalOpen(false);
      setEditingGuide(null);
    } catch (error) {
      console.error('Error saving guide:', error);
      alert('Failed to save guide');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this guide?')) return;

    try {
      const response = await fetch(`/api/installation-guides/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete guide');
      }

      await loadGuides();
    } catch (error) {
      console.error('Error deleting guide:', error);
      alert('Failed to delete guide');
    }
  };

  const openEditModal = (guide?: InstallationGuide) => {
    if (guide) {
      setEditingGuide({ ...guide });
    } else {
      setEditingGuide({
        id: '',
        platform: '',
        title: '',
        description: '',
        content: '',
        icon: '',
        display_order: guides.length,
        is_active: true,
        created_at: '',
        updated_at: '',
      });
    }
    setPreviewMode(false);
    setIsModalOpen(true);
  };

  if (userProfile?.role !== 'admin') {
    return null;
  }

  return (
    <Layout title="Installation Guides" pageTitle="Installation Guides" pagePretitle="Admin">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Manage Installation Guides</h3>
          <div className="card-actions">
            <button className="btn btn-primary" onClick={() => openEditModal()}>
              <IconPlus size={16} className="me-1" />
              Add Guide
            </button>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-5">
              <IconLoader2 size={32} className="text-primary" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : guides.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <IconCode size={48} className="mb-3" />
              <p>No installation guides yet</p>
              <button className="btn btn-primary" onClick={() => openEditModal()}>
                Create First Guide
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-vcenter">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Platform</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ width: 150 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guides.map((guide) => (
                    <tr key={guide.id}>
                      <td>
                        <IconGripVertical size={16} className="text-muted" />
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          {getPlatformIcon(guide.platform)}
                          <span className="text-capitalize">{guide.platform}</span>
                        </div>
                      </td>
                      <td>{guide.title}</td>
                      <td className="text-muted">{guide.description}</td>
                      <td>
                        <span className={`badge ${guide.is_active ? 'bg-green-lt text-green' : 'bg-secondary-lt'}`}>
                          {guide.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="btn-group">
                          <button
                            className="btn btn-sm btn-ghost-primary"
                            onClick={() => openEditModal(guide)}
                            title="Edit"
                          >
                            <IconEdit size={16} />
                          </button>
                          <button
                            className="btn btn-sm btn-ghost-danger"
                            onClick={() => handleDelete(guide.id)}
                            title="Delete"
                          >
                            <IconTrash size={16} />
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

      {/* Edit Modal */}
      {isModalOpen && editingGuide && (
        <>
          <div
            className="modal modal-blur show"
            style={{ display: 'block' }}
            tabIndex={-1}
          >
            <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {editingGuide.id ? 'Edit Installation Guide' : 'New Installation Guide'}
                  </h5>
                  <div className="d-flex gap-2">
                    <button
                      className={`btn btn-sm ${previewMode ? 'btn-primary' : 'btn-ghost-primary'}`}
                      onClick={() => setPreviewMode(!previewMode)}
                    >
                      <IconEye size={16} className="me-1" />
                      {previewMode ? 'Edit' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => setIsModalOpen(false)}
                    />
                  </div>
                </div>
                <div className="modal-body">
                  {previewMode ? (
                    <div className="installation-guide-preview">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownPreview(editingGuide.content),
                        }}
                      />
                    </div>
                  ) : (
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label required">Platform ID</label>
                        <input
                          type="text"
                          className="form-control"
                          value={editingGuide.platform}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, platform: e.target.value.toLowerCase() })
                          }
                          placeholder="e.g., wordpress, shopify, manual"
                        />
                        <small className="text-muted">Lowercase, no spaces</small>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label required">Title</label>
                        <input
                          type="text"
                          className="form-control"
                          value={editingGuide.title}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, title: e.target.value })
                          }
                          placeholder="e.g., WordPress Installation"
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Description</label>
                        <input
                          type="text"
                          className="form-control"
                          value={editingGuide.description}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, description: e.target.value })
                          }
                          placeholder="Short description shown on card"
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Display Order</label>
                        <input
                          type="number"
                          className="form-control"
                          value={editingGuide.display_order}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, display_order: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Status</label>
                        <select
                          className="form-select"
                          value={editingGuide.is_active ? 'active' : 'inactive'}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, is_active: e.target.value === 'active' })
                          }
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                      <div className="col-12">
                        <label className="form-label required">Content (Markdown)</label>
                        <textarea
                          className="form-control"
                          rows={20}
                          value={editingGuide.content}
                          onChange={(e) =>
                            setEditingGuide({ ...editingGuide, content: e.target.value })
                          }
                          placeholder="Write installation guide in Markdown format..."
                          style={{ fontFamily: 'monospace' }}
                        />
                        <small className="text-muted">
                          Supports Markdown: ## Headers, **bold**, `code`, ```code blocks```, lists
                        </small>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost-secondary"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={saving || !editingGuide.platform || !editingGuide.title || !editingGuide.content}
                  >
                    {saving ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <IconDeviceFloppy size={16} className="me-1" />
                        Save Guide
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .installation-guide-preview h2 {
          font-size: 1.5rem;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid var(--tblr-border-color);
          padding-bottom: 0.5rem;
        }
        .installation-guide-preview h3 {
          font-size: 1.25rem;
          margin-top: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .installation-guide-preview h4 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .installation-guide-preview pre {
          background: var(--tblr-bg-surface-dark);
          color: var(--tblr-light);
          padding: 1rem;
          border-radius: 0.375rem;
          overflow-x: auto;
        }
        .installation-guide-preview code {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.875rem;
        }
        .installation-guide-preview ul,
        .installation-guide-preview ol {
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .installation-guide-preview li {
          margin-bottom: 0.5rem;
        }
        .installation-guide-preview p {
          margin-bottom: 1rem;
        }
      `}</style>
    </Layout>
  );
}

// Simple markdown renderer for preview
function renderMarkdownPreview(content: string): string {
  let html = content;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-secondary-lt px-1 rounded">$1</code>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^\d+\.\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/^-\s+(.*$)/gim, '<li>$1</li>');

  // Line breaks to paragraphs
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<h') || p.startsWith('<pre') || p.startsWith('<li') || p.startsWith('<ul') || p.startsWith('<ol')) {
      return p;
    }
    return `<p>${p}</p>`;
  }).join('');

  // Wrap list items
  html = html.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
