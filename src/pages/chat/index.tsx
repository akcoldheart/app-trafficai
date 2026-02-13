import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { ConversationList } from '@/components/chat';
import { ChatAPI, ChatConversation } from '@/lib/chat-api';
import { useAuth } from '@/contexts/AuthContext';
import { IconMessage, IconRefresh, IconInbox, IconArchive, IconGitMerge, IconPlus, IconSend, IconLoader2, IconSearch, IconUser, IconX } from '@tabler/icons-react';

interface UserOption {
  id: string;
  email: string;
  role: string;
}

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

  // New Message modal state
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSelectUser = (email: string) => {
    setSelectedUserEmail(email);
    setUserSearch(email);
    setShowUserDropdown(false);
  };

  const handleClearUser = () => {
    setSelectedUserEmail('');
    setUserSearch('');
    setShowUserDropdown(false);
  };

  const handleOpenNewMessage = async () => {
    setShowNewMessageModal(true);
    setSelectedUserEmail('');
    setUserSearch('');
    setShowUserDropdown(false);
    setNewMessage('');
    setSendError(null);

    if (users.length === 0) {
      setUsersLoading(true);
      try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        if (response.ok) {
          const nonAdmins = (data.users || []).filter((u: UserOption) => u.role !== 'admin');
          setUsers(nonAdmins);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setUsersLoading(false);
      }
    }
  };

  const handleSendNewMessage = async () => {
    if (!selectedUserEmail || !newMessage.trim()) return;

    setSending(true);
    setSendError(null);

    try {
      const selectedUser = users.find(u => u.email === selectedUserEmail);
      const result = await ChatAPI.createConversation({
        user_email: selectedUserEmail,
        user_name: selectedUser?.email,
        message: newMessage.trim(),
      });

      setShowNewMessageModal(false);
      router.push(`/chat/${result.data.id}`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const pageActions = (
    <div className="btn-list">
      {isAdmin && (
        <button
          className="btn btn-primary"
          onClick={handleOpenNewMessage}
        >
          <IconPlus size={16} className="me-1" />
          New Message
        </button>
      )}
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
    <Layout title="Messages" pageTitle="Messages" pageActions={pageActions}>
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

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <IconMessage size={20} className="me-2" />
                  New Message
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowNewMessageModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">To</label>
                  {usersLoading ? (
                    <div className="d-flex align-items-center text-muted py-2">
                      <IconLoader2 size={16} className="me-2 spin" />
                      Loading users...
                    </div>
                  ) : (
                    <div className="position-relative" ref={dropdownRef}>
                      <div className="input-group">
                        <span className="input-group-text">
                          <IconSearch size={16} />
                        </span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search by email or type a new one..."
                          value={userSearch}
                          onChange={(e) => {
                            setUserSearch(e.target.value);
                            setSelectedUserEmail('');
                            setShowUserDropdown(true);
                          }}
                          onFocus={() => setShowUserDropdown(true)}
                          autoComplete="off"
                        />
                        {userSearch && (
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={handleClearUser}
                            title="Clear"
                          >
                            <IconX size={16} />
                          </button>
                        )}
                      </div>
                      {showUserDropdown && userSearch && (
                        <div
                          className="dropdown-menu show w-100"
                          style={{ maxHeight: '200px', overflowY: 'auto', position: 'absolute', zIndex: 1050 }}
                        >
                          {filteredUsers.length > 0 ? (
                            filteredUsers.slice(0, 8).map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                className="dropdown-item d-flex align-items-center"
                                onClick={() => handleSelectUser(u.email)}
                              >
                                <span className="avatar avatar-xs me-2 bg-blue-lt">
                                  <IconUser size={14} />
                                </span>
                                <span>{u.email}</span>
                                <span className="badge bg-muted-lt ms-auto">{u.role}</span>
                              </button>
                            ))
                          ) : (
                            <div className="dropdown-item disabled text-muted">
                              No users match &quot;{userSearch}&quot;
                            </div>
                          )}
                          {/* Allow using the typed email directly if it looks like an email */}
                          {userSearch.includes('@') && !filteredUsers.some(u => u.email === userSearch) && (
                            <>
                              <div className="dropdown-divider" />
                              <button
                                type="button"
                                className="dropdown-item d-flex align-items-center text-primary"
                                onClick={() => handleSelectUser(userSearch)}
                              >
                                <IconSend size={14} className="me-2" />
                                Send to &quot;{userSearch}&quot;
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {selectedUserEmail && (
                        <div className="mt-2">
                          <span className="badge bg-primary-lt">
                            <IconUser size={12} className="me-1" />
                            {selectedUserEmail}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Message</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                </div>
                {sendError && (
                  <div className="alert alert-danger py-2 mb-0">
                    {sendError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewMessageModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSendNewMessage}
                  disabled={!selectedUserEmail || !newMessage.trim() || sending}
                >
                  {sending ? (
                    <>
                      <IconLoader2 size={16} className="me-1 spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <IconSend size={16} className="me-1" />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
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
