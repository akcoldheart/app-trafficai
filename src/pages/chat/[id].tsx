import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { ChatMessageDisplay, MessageComposer } from '@/components/chat';
import { ChatAPI, ChatConversation, ChatMessage } from '@/lib/chat-api';
import { createClient } from '@/lib/supabase/client';
import {
  IconArrowLeft,
  IconRefresh,
  IconCheck,
  IconReload,
  IconUser,
  IconMail,
  IconWorld,
  IconClock,
} from '@tabler/icons-react';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConversationDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const fetchConversation = useCallback(async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setError(null);
    try {
      const response = await ChatAPI.getConversation(id);
      setConversation(response.data);
      setMessages(response.data.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    const channel = supabase
      .channel(`admin-chat:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (body: string, isPrivate: boolean) => {
    if (!id || typeof id !== 'string') return;

    const response = await ChatAPI.sendMessage({
      conversation_id: id,
      body,
      sender_type: isPrivate ? 'note' : 'agent',
      is_private: isPrivate,
    });

    // Message will be added via realtime subscription
    // But also add optimistically in case realtime is slow
    setMessages((prev) => {
      if (prev.some(m => m.id === response.data.id)) return prev;
      return [...prev, response.data];
    });
  };

  const handleCloseConversation = async () => {
    if (!id || typeof id !== 'string') return;

    setActionLoading(true);
    try {
      const response = await ChatAPI.closeConversation(id);
      setConversation(response.data);
    } catch (err) {
      console.error('Failed to close conversation:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenConversation = async () => {
    if (!id || typeof id !== 'string') return;

    setActionLoading(true);
    try {
      const response = await ChatAPI.reopenConversation(id);
      setConversation(response.data);
    } catch (err) {
      console.error('Failed to reopen conversation:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const pageActions = (
    <div className="btn-list">
      <button
        className="btn btn-ghost-secondary"
        onClick={fetchConversation}
        disabled={loading}
      >
        <IconRefresh size={16} className={loading ? 'spin' : ''} />
      </button>
      {conversation?.status === 'closed' ? (
        <button
          className="btn btn-primary"
          onClick={handleReopenConversation}
          disabled={actionLoading}
        >
          <IconReload size={16} className="me-1" />
          Reopen
        </button>
      ) : (
        <button
          className="btn btn-success"
          onClick={handleCloseConversation}
          disabled={actionLoading}
        >
          <IconCheck size={16} className="me-1" />
          Close
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <Layout title="Loading..." pageTitle="Conversation" pagePretitle="Chat">
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <p className="mt-3 text-muted">Loading conversation...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !conversation) {
    return (
      <Layout title="Error" pageTitle="Conversation" pagePretitle="Chat">
        <div className="card">
          <div className="card-body">
            <div className="alert alert-danger mb-3">
              {error || 'Conversation not found'}
            </div>
            <Link href="/chat" className="btn btn-secondary">
              <IconArrowLeft size={16} className="me-1" />
              Back to Messages
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const customerName = conversation.customer_name || conversation.customer_email || 'Anonymous';
  const metadata = conversation.customer_metadata || {};

  return (
    <Layout
      title={`Chat with ${customerName}`}
      pageTitle={customerName}
      pagePretitle="Conversation"
      pageActions={pageActions}
    >
      <div className="row g-3">
        {/* Messages Panel */}
        <div className="col-lg-8">
          <div className="card chat-card">
            <div className="card-header d-flex align-items-center">
              <Link href="/chat" className="btn btn-ghost-secondary btn-sm me-2">
                <IconArrowLeft size={16} />
              </Link>
              <div>
                <h3 className="card-title mb-0">{customerName}</h3>
                <span className={`badge ${conversation.status === 'closed' ? 'bg-green-lt text-green' : 'bg-blue-lt text-blue'}`}>
                  {conversation.status || 'open'}
                </span>
              </div>
            </div>

            <div className="chat-messages-container">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    No messages yet
                  </div>
                ) : (
                  messages.map((message) => (
                    <ChatMessageDisplay
                      key={message.id}
                      message={message}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <MessageComposer
              conversationId={conversation.id}
              onSend={handleSendMessage}
              disabled={conversation.status === 'closed'}
              placeholder={
                conversation.status === 'closed'
                  ? 'Reopen conversation to reply'
                  : 'Type your message...'
              }
            />
          </div>
        </div>

        {/* Customer Info Panel */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Customer Info</h3>
            </div>
            <div className="card-body">
              <div className="d-flex align-items-center mb-3">
                <span className="avatar avatar-lg bg-primary-lt me-3">
                  <IconUser size={24} />
                </span>
                <div>
                  <h4 className="mb-0">{conversation.customer_name || 'Anonymous'}</h4>
                  {conversation.customer_email && (
                    <span className="text-muted">{conversation.customer_email}</span>
                  )}
                </div>
              </div>

              <div className="hr-text">Details</div>

              <div className="datagrid">
                {conversation.customer_email && (
                  <div className="datagrid-item">
                    <div className="datagrid-title">
                      <IconMail size={14} className="me-1" />
                      Email
                    </div>
                    <div className="datagrid-content">{conversation.customer_email}</div>
                  </div>
                )}

                {conversation.page_url && (
                  <div className="datagrid-item">
                    <div className="datagrid-title">
                      <IconWorld size={14} className="me-1" />
                      Page URL
                    </div>
                    <div className="datagrid-content text-truncate" title={conversation.page_url}>
                      {conversation.page_url}
                    </div>
                  </div>
                )}

                {metadata.user_agent && (
                  <div className="datagrid-item">
                    <div className="datagrid-title">Browser</div>
                    <div className="datagrid-content text-truncate">
                      {String(metadata.user_agent).substring(0, 50)}...
                    </div>
                  </div>
                )}

                <div className="datagrid-item">
                  <div className="datagrid-title">
                    <IconClock size={14} className="me-1" />
                    Started
                  </div>
                  <div className="datagrid-content">
                    {formatDate(conversation.created_at)}
                  </div>
                </div>

                {conversation.last_message_at && (
                  <div className="datagrid-item">
                    <div className="datagrid-title">Last Message</div>
                    <div className="datagrid-content">
                      {formatDate(conversation.last_message_at)}
                    </div>
                  </div>
                )}

                {conversation.source && (
                  <div className="datagrid-item">
                    <div className="datagrid-title">Source</div>
                    <div className="datagrid-content">
                      <span className="badge bg-secondary-lt">{conversation.source}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chat-card {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 250px);
          min-height: 500px;
        }
        .chat-messages-container {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
        }
      `}</style>

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
