import { IconRobot, IconLock } from '@tabler/icons-react';
import type { ChatMessage } from '@/lib/chat-api';

interface ChatMessageDisplayProps {
  message: ChatMessage;
  showAvatar?: boolean;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function ChatMessageDisplay({
  message,
  showAvatar = true,
}: ChatMessageDisplayProps) {
  const isFromCustomer = message.sender_type === 'customer';
  const isNote = message.is_private;
  const isBot = message.sender_type === 'bot';

  const senderName = message.sender_name || (isFromCustomer ? 'Customer' : 'Agent');
  const initials = getInitials(message.sender_name);

  return (
    <div className={`chat-message ${isFromCustomer ? 'from-customer' : 'from-agent'} ${isNote ? 'is-note' : ''}`}>
      {showAvatar && (
        <div className="message-avatar">
          {isBot ? (
            <span className="avatar avatar-sm bg-purple-lt">
              <IconRobot size={18} />
            </span>
          ) : (
            <span className={`avatar avatar-sm ${isFromCustomer ? 'bg-secondary-lt' : 'bg-primary-lt'}`}>
              {initials}
            </span>
          )}
        </div>
      )}
      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-sender">{senderName}</span>
          {isNote && (
            <span className="badge bg-yellow-lt text-yellow ms-2">
              <IconLock size={12} className="me-1" />
              Private note
            </span>
          )}
          {isBot && (
            <span className="badge bg-purple-lt text-purple ms-2">
              Bot
            </span>
          )}
          <span className="message-time">{formatTime(message.created_at)}</span>
        </div>
        <div className={`message-bubble ${isNote ? 'note-bubble' : ''}`}>
          <div className="message-body">{message.body}</div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-link"
                >
                  {attachment.filename}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .chat-message {
          display: flex;
          margin-bottom: 16px;
          max-width: 85%;
        }
        .chat-message.from-customer {
          align-self: flex-start;
        }
        .chat-message.from-agent {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .message-avatar {
          flex-shrink: 0;
          margin: 0 12px;
        }
        .message-avatar .avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 500;
        }
        .message-content-wrapper {
          display: flex;
          flex-direction: column;
        }
        .from-agent .message-content-wrapper {
          align-items: flex-end;
        }
        .message-header {
          display: flex;
          align-items: center;
          margin-bottom: 4px;
          font-size: 12px;
        }
        .message-sender {
          font-weight: 500;
          color: var(--tblr-body-color);
        }
        .message-time {
          color: var(--tblr-muted);
          margin-left: 8px;
        }
        .message-bubble {
          padding: 10px 14px;
          border-radius: 12px;
          background-color: var(--tblr-bg-surface-secondary);
        }
        .from-agent .message-bubble {
          background-color: var(--tblr-primary);
          color: white;
        }
        .note-bubble {
          background-color: #fef3cd !important;
          color: #856404 !important;
          border: 1px dashed #ffc107;
        }
        .message-body {
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
        }
        .message-attachments {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .attachment-link {
          font-size: 12px;
          padding: 4px 8px;
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
          text-decoration: none;
        }
        .from-agent .attachment-link {
          background-color: rgba(255, 255, 255, 0.2);
          color: white;
        }
      `}</style>
    </div>
  );
}
