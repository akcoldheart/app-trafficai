import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { ConversationList } from '@/components/chat';
import { ChatAPI, ChatConversation } from '@/lib/chat-api';
import { useAuth } from '@/contexts/AuthContext';
import { IconMessage, IconRefresh, IconInbox, IconArchive, IconGitMerge } from '@tabler/icons-react';

type FilterStatus = 'open' | 'closed' | 'all';

export default function ChatInbox() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('open');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ChatAPI.getConversations(filter);
      setConversations(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelectConversation = (conversation: ChatConversation) => {
    router.push(`/chat/${conversation.id}`);
  };

  const handleMergeDuplicates = async () => {
    if (!confirm('This will merge all conversations from the same email into one. Continue?')) {
      return;
    }

    setMerging(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/chat/conversations/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to merge conversations');
      }

      setSuccessMessage(
        `Merged ${data.conversationsMerged} duplicate conversation(s), moved ${data.messagesMoved} message(s).`
      );

      // Refresh the list
      fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge conversations');
    } finally {
      setMerging(false);
    }
  };

  const pageActions = (
    <div className="btn-list">
      {isAdmin && (
        <button
          className="btn btn-outline-warning"
          onClick={handleMergeDuplicates}
          disabled={merging || loading}
          title="Merge all conversations from the same email into one"
        >
          <IconGitMerge size={16} className={`me-1 ${merging ? 'spin' : ''}`} />
          {merging ? 'Merging...' : 'Merge Duplicates'}
        </button>
      )}
      <button
        className="btn btn-ghost-secondary"
        onClick={fetchConversations}
        disabled={loading}
      >
        <IconRefresh size={16} className={`me-1 ${loading ? 'spin' : ''}`} />
        Refresh
      </button>
    </div>
  );

  return (
    <Layout title="Messages" pageTitle="Messages" pagePretitle="Chat" pageActions={pageActions}>
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <IconMessage size={20} className="me-2" />
                <h3 className="card-title mb-0">Conversations</h3>
              </div>
              <div className="card-actions">
                <div className="btn-group" role="group">
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'open' ? 'btn-primary' : 'btn-ghost-secondary'}`}
                    onClick={() => setFilter('open')}
                  >
                    <IconInbox size={14} className="me-1" />
                    Open
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'closed' ? 'btn-primary' : 'btn-ghost-secondary'}`}
                    onClick={() => setFilter('closed')}
                  >
                    <IconArchive size={14} className="me-1" />
                    Closed
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost-secondary'}`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            {successMessage && (
              <div className="card-body pb-0">
                <div className="alert alert-success alert-dismissible mb-0">
                  {successMessage}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setSuccessMessage(null)}
                  />
                </div>
              </div>
            )}

            {error ? (
              <div className="card-body">
                <div className="alert alert-danger mb-0">
                  {error}
                </div>
              </div>
            ) : (
              <ConversationList
                conversations={conversations}
                loading={loading}
                onSelect={handleSelectConversation}
              />
            )}
          </div>
        </div>
      </div>

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
