import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { IconSend, IconLock, IconLockOpen } from '@tabler/icons-react';

interface MessageComposerProps {
  conversationId: string;
  onSend: (message: string, isPrivate: boolean) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageComposer({
  conversationId,
  onSend,
  disabled = false,
  placeholder = 'Type your message...',
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [message]);

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem(`chat_draft_${conversationId}`);
    if (draft) {
      setMessage(draft);
    }
  }, [conversationId]);

  // Save draft to localStorage
  useEffect(() => {
    if (message) {
      localStorage.setItem(`chat_draft_${conversationId}`, message);
    } else {
      localStorage.removeItem(`chat_draft_${conversationId}`);
    }
  }, [message, conversationId]);

  const handleSend = async () => {
    if (!message.trim() || sending || disabled) return;

    setSending(true);
    try {
      await onSend(message.trim(), isPrivate);
      setMessage('');
      localStorage.removeItem(`chat_draft_${conversationId}`);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`message-composer ${isPrivate ? 'private-mode' : ''}`}>
      <div className="composer-toolbar">
        <button
          type="button"
          className={`btn btn-sm ${isPrivate ? 'btn-warning' : 'btn-ghost-secondary'}`}
          onClick={() => setIsPrivate(!isPrivate)}
          title={isPrivate ? 'Switch to public reply' : 'Switch to private note'}
        >
          {isPrivate ? (
            <>
              <IconLock size={16} className="me-1" />
              Private Note
            </>
          ) : (
            <>
              <IconLockOpen size={16} className="me-1" />
              Reply
            </>
          )}
        </button>
      </div>
      <div className="composer-input-wrapper">
        <textarea
          ref={textareaRef}
          className="composer-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isPrivate ? 'Write a private note (not visible to customer)...' : placeholder}
          disabled={disabled || sending}
          rows={1}
        />
        <button
          type="button"
          className="btn btn-primary composer-send-btn"
          onClick={handleSend}
          disabled={!message.trim() || sending || disabled}
        >
          {sending ? (
            <span className="spinner-border spinner-border-sm" />
          ) : (
            <IconSend size={18} />
          )}
        </button>
      </div>
      {isPrivate && (
        <div className="composer-note-hint">
          This note is only visible to your team
        </div>
      )}

      <style jsx>{`
        .message-composer {
          padding: 12px 16px;
          border-top: 1px solid var(--tblr-border-color);
          background-color: var(--tblr-bg-surface);
        }
        .message-composer.private-mode {
          background-color: #fef3cd;
        }
        .composer-toolbar {
          margin-bottom: 8px;
        }
        .composer-input-wrapper {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .composer-textarea {
          flex: 1;
          border: 1px solid var(--tblr-border-color);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          min-height: 42px;
          max-height: 150px;
          background-color: var(--tblr-bg-forms);
        }
        .private-mode .composer-textarea {
          background-color: white;
          border-color: #ffc107;
        }
        .composer-textarea:focus {
          outline: none;
          border-color: var(--tblr-primary);
          box-shadow: 0 0 0 2px rgba(var(--tblr-primary-rgb), 0.25);
        }
        .private-mode .composer-textarea:focus {
          border-color: #ffc107;
          box-shadow: 0 0 0 2px rgba(255, 193, 7, 0.25);
        }
        .composer-textarea:disabled {
          background-color: var(--tblr-bg-surface-secondary);
          cursor: not-allowed;
        }
        .composer-send-btn {
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .composer-note-hint {
          margin-top: 6px;
          font-size: 12px;
          color: #856404;
        }
      `}</style>
    </div>
  );
}
