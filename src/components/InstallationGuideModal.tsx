import { useState, useEffect } from 'react';
import {
  IconBrandWordpress,
  IconShoppingBag,
  IconCode,
  IconTag,
  IconExternalLink,
  IconLoader2,
} from '@tabler/icons-react';

interface InstallationGuide {
  id: string;
  platform: string;
  title: string;
  description: string;
  content: string;
  icon: string;
}

interface InstallationGuideModalProps {
  platform: string;
  isOpen: boolean;
  onClose: () => void;
  pixelCode?: string;
}

// Simple markdown renderer for basic formatting
function renderMarkdown(content: string, pixelCode?: string): string {
  let html = content;

  // Replace pixel code placeholder
  if (pixelCode) {
    html = html.replace(/YOUR_PIXEL_URL/g, pixelCode);
  }

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 class="mt-4 mb-2">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 class="mt-4 mb-3">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 class="mt-4 mb-3">$1</h2>');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="bg-dark text-light p-3 rounded mb-3"><code>${escapeHtml(code.trim())}</code></pre>`;
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

  // Wrap consecutive list items
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (match.includes('1.')) {
      return `<ol class="mb-3">${match}</ol>`;
    }
    return `<ul class="mb-3">${match}</ul>`;
  });

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mb-3">');
  html = '<p class="mb-3">' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p class="mb-3"><\/p>/g, '');
  html = html.replace(/<p class="mb-3">(<h[234])/g, '$1');
  html = html.replace(/(<\/h[234]>)<\/p>/g, '$1');
  html = html.replace(/<p class="mb-3">(<pre)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p class="mb-3">(<[uo]l)/g, '$1');
  html = html.replace(/(<\/[uo]l>)<\/p>/g, '$1');

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

function getPlatformIcon(platform: string) {
  switch (platform) {
    case 'wordpress':
      return <IconBrandWordpress size={24} />;
    case 'shopify':
      return <IconShoppingBag size={24} />;
    case 'gtm':
      return <IconTag size={24} />;
    case 'manual':
    default:
      return <IconCode size={24} />;
  }
}

export default function InstallationGuideModal({
  platform,
  isOpen,
  onClose,
  pixelCode,
}: InstallationGuideModalProps) {
  const [guide, setGuide] = useState<InstallationGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && platform) {
      loadGuide();
    }
  }, [isOpen, platform]);

  const loadGuide = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/installation-guides?platform=${platform}`);
      const data = await response.json();
      if (data.guides && data.guides.length > 0) {
        setGuide(data.guides[0]);
      } else {
        setError('Installation guide not found');
      }
    } catch (err) {
      setError('Failed to load installation guide');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal modal-blur show"
        style={{ display: 'block' }}
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div className="d-flex align-items-center gap-2">
                {getPlatformIcon(platform)}
                <h5 className="modal-title">
                  {guide?.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Installation`}
                </h5>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              {loading ? (
                <div className="text-center py-5">
                  <IconLoader2 size={32} className="text-primary" style={{ animation: 'spin 1s linear infinite' }} />
                  <p className="text-muted mt-2">Loading guide...</p>
                </div>
              ) : error ? (
                <div className="alert alert-warning">
                  <h4>Guide Not Available</h4>
                  <p>{error}</p>
                  <p className="mb-0">Please contact support for installation assistance.</p>
                </div>
              ) : guide ? (
                <div
                  className="installation-guide-content"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(guide.content, pixelCode),
                  }}
                />
              ) : null}
            </div>
            <div className="modal-footer">
              <a
                href="mailto:support@trafficai.io?subject=Installation Help"
                className="btn btn-ghost-primary"
              >
                <IconExternalLink size={16} className="me-1" />
                Need Help?
              </a>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .installation-guide-content h2 {
          font-size: 1.5rem;
          border-bottom: 1px solid var(--tblr-border-color);
          padding-bottom: 0.5rem;
        }
        .installation-guide-content h3 {
          font-size: 1.25rem;
        }
        .installation-guide-content h4 {
          font-size: 1.1rem;
          font-weight: 600;
        }
        .installation-guide-content pre {
          overflow-x: auto;
        }
        .installation-guide-content code {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 0.875rem;
        }
        .installation-guide-content ul,
        .installation-guide-content ol {
          padding-left: 1.5rem;
        }
        .installation-guide-content li {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </>
  );
}
