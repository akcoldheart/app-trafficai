import { useRouter } from 'next/router';
import { IconMessage, IconCheck, IconClock } from '@tabler/icons-react';
import type { ChatConversation } from '@/lib/chat-api';

interface ConversationListProps {
  conversations: ChatConversation[];
  selectedId?: string;
  loading?: boolean;
  onSelect?: (conversation: ChatConversation) => void;
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getCustomerName(conversation: ChatConversation): string {
  if (conversation.customer_name) return conversation.customer_name;
  if (conversation.customer_email) return conversation.customer_email;
  return 'Anonymous';
}

function getCustomerInitials(conversation: ChatConversation): string {
  const name = getCustomerName(conversation);
  if (name === 'Anonymous') return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function ConversationList({
  conversations,
  selectedId,
  loading,
  onSelect,
}: ConversationListProps) {
  const router = useRouter();
  const handleSelect = (conversation: ChatConversation) => {
    if (onSelect) {
      onSelect(conversation);
    } else {
      router.push(`/chat/${conversation.id}`);
    }
  };

  if (loading) {
    return (
      <div className="conversation-list">
        <div className="text-center py-4 text-muted">
          <div className="spinner-border spinner-border-sm me-2" role="status" />
          Loading conversations...
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="conversation-list">
        <div className="text-center py-4 text-muted">
          <IconMessage size={48} stroke={1} className="mb-2 opacity-50" />
          <p className="mb-0">No conversations yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className={`conversation-item ${selectedId === conversation.id ? 'active' : ''} ${!conversation.read ? 'unread' : ''}`}
          onClick={() => handleSelect(conversation)}
        >
          <div className="conversation-avatar">
            <span className="avatar avatar-sm bg-primary-lt">
              {getCustomerInitials(conversation)}
            </span>
          </div>
          <div className="conversation-content">
            <div className="conversation-header">
              <span className="conversation-name">
                {getCustomerName(conversation)}
              </span>
              <span className="conversation-time">
                {formatTimeAgo(conversation.last_message_at || conversation.updated_at)}
              </span>
            </div>
            <div className="conversation-preview">
              {conversation.preview || 'No messages yet'}
            </div>
            <div className="conversation-meta">
              {conversation.status === 'closed' ? (
                <span className="badge bg-green-lt text-green">
                  <IconCheck size={12} className="me-1" />
                  Closed
                </span>
              ) : (
                <span className="badge bg-blue-lt text-blue">
                  <IconClock size={12} className="me-1" />
                  Open
                </span>
              )}
              {conversation.source && conversation.source !== 'widget' && (
                <span className="badge bg-secondary-lt ms-1">
                  {conversation.source}
                </span>
              )}
              {!conversation.read && (
                <span className="badge bg-red-lt text-red ms-1">New</span>
              )}
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .conversation-list {
          display: flex;
          flex-direction: column;
        }
        .conversation-item {
          display: flex;
          padding: 12px 16px;
          border-bottom: 1px solid var(--tblr-border-color);
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .conversation-item:hover {
          background-color: var(--tblr-bg-surface-secondary);
        }
        .conversation-item.active {
          background-color: var(--tblr-primary-lt);
        }
        .conversation-item.unread {
          background-color: rgba(var(--tblr-primary-rgb), 0.05);
        }
        .conversation-item.unread .conversation-name {
          font-weight: 600;
        }
        .conversation-avatar {
          flex-shrink: 0;
          margin-right: 12px;
        }
        .conversation-avatar .avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 500;
        }
        .conversation-content {
          flex: 1;
          min-width: 0;
        }
        .conversation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .conversation-name {
          font-weight: 500;
          color: var(--tblr-body-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .conversation-time {
          font-size: 12px;
          color: var(--tblr-muted);
          flex-shrink: 0;
          margin-left: 8px;
        }
        .conversation-preview {
          font-size: 13px;
          color: var(--tblr-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }
        .conversation-meta {
          display: flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>
    </div>
  );
}
