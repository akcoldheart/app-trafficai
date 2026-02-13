'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { IconMessage, IconX, IconSend, IconMinus } from '@tabler/icons-react';

interface Message {
  id: string;
  conversation_id: string;
  body: string;
  sender_type: 'customer' | 'agent' | 'bot';
  sender_name: string | null;
  is_private: boolean;
  created_at: string;
}

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
}

const CHAT_CONFIG = {
  title: 'Chat with us',
  subtitle: 'We typically reply within a few minutes',
  greeting: 'Hi there! How can we help you today?',
  placeholder: 'Type your message...',
  primaryColor: '#7c3aed',
};

export default function ChatBubble() {
  const { user, userProfile } = useAuth();

  // Admins use the Messages menu in sidebar — no need for chat bubble
  if (userProfile?.role === 'admin') return null;

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [showForm, setShowForm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const supabase = createClient();

  // Keep ref in sync so realtime callback sees latest value
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check for existing conversation in localStorage
  useEffect(() => {
    const savedConvId = localStorage.getItem('chat_conversation_id');
    if (savedConvId) {
      loadConversation(savedConvId);
    }
  }, []);

  // Track message IDs we've already processed to prevent duplicates
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Subscribe to realtime messages
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Only add if not private (customer shouldn't see agent notes)
          // AND not already processed (prevents duplicates from our own sends)
          if (!newMsg.is_private && !processedMessageIds.current.has(newMsg.id)) {
            // Only add messages from agents/bots via realtime
            // Customer messages are handled by sendMessage directly
            if (newMsg.sender_type !== 'customer') {
              processedMessageIds.current.add(newMsg.id);
              setMessages((prev) => {
                // Double-check for duplicates
                if (prev.some(m => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
              // Increment unread if chat window is not open
              if (!isOpenRef.current) {
                setUnreadCount((prev) => prev + 1);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, supabase]);

  const loadConversation = async (convId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: conv, error: convError } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', convId)
        .single();

      if (convError) {
        console.error('Error loading conversation:', convError);
        localStorage.removeItem('chat_conversation_id');
        setShowForm(true);
        return;
      }

      if (!conv) {
        localStorage.removeItem('chat_conversation_id');
        setShowForm(true);
        return;
      }

      setConversation(conv);
      setShowForm(false);

      // Load messages
      const { data: msgs, error: msgsError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .eq('is_private', false)
        .order('created_at', { ascending: true });

      if (msgsError) {
        console.error('Error loading messages:', msgsError);
      }

      const allMsgs = msgs || [];
      setMessages(allMsgs);

      // Check for unread agent/bot messages since last seen
      if (!isOpenRef.current) {
        const lastSeen = localStorage.getItem(`chat_last_seen_${convId}`);
        const unseenCount = allMsgs.filter(
          (m) => m.sender_type !== 'customer' && (!lastSeen || m.created_at > lastSeen)
        ).length;
        if (unseenCount > 0) {
          setUnreadCount(unseenCount);
        }
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
      localStorage.removeItem('chat_conversation_id');
      setShowForm(true);
    } finally {
      setLoading(false);
    }
  };

  const startConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim()) return;

    setLoading(true);
    setError(null);
    try {
      // First, check if there's an existing OPEN conversation for this email
      const { data: existingConv } = await supabase
        .from('chat_conversations')
        .select('*')
        .ilike('customer_email', customerEmail.toLowerCase().trim())
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let conv = existingConv;

      if (existingConv) {
        // Use existing conversation
        setConversation(existingConv);
        localStorage.setItem('chat_conversation_id', existingConv.id);
        setShowForm(false);

        // Load existing messages
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', existingConv.id)
          .eq('is_private', false)
          .order('created_at', { ascending: true });

        setMessages(msgs || []);
      } else {
        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from('chat_conversations')
          .insert({
            customer_name: customerName || null,
            customer_email: customerEmail.toLowerCase().trim(),
            customer_metadata: {
              page_url: window.location.href,
              user_agent: navigator.userAgent,
            },
            source: 'widget',
            page_url: window.location.href,
          })
          .select()
          .single();

        if (convError) {
          console.error('Supabase error:', convError);
          throw new Error(convError.message || 'Failed to start conversation');
        }

        if (!newConv) {
          throw new Error('No conversation data returned');
        }

        conv = newConv;
        setConversation(newConv);
        localStorage.setItem('chat_conversation_id', newConv.id);
        setShowForm(false);

        // Add greeting message as bot
        const { data: greeting } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: newConv.id,
            body: CHAT_CONFIG.greeting,
            sender_type: 'bot',
            sender_name: 'Traffic AI',
          })
          .select()
          .single();

        if (greeting) {
          setMessages([greeting]);
        }
      }
    } catch (err) {
      console.error('Error starting conversation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start chat. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversation?.id || sending) return;

    const messageBody = newMessage.trim();
    setNewMessage('');
    setSending(true);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversation.id,
      body: messageBody,
      sender_type: 'customer',
      sender_name: customerName || customerEmail,
      is_private: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      // Send via API to trigger auto-reply logic
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          body: messageBody,
          sender_type: 'customer',
          sender_name: customerName || customerEmail,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send message');
      }

      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? result.data : m))
      );
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(messageBody);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Pre-fill email if user is logged in
  useEffect(() => {
    if (user?.email && !customerEmail) {
      setCustomerEmail(user.email);
      if (user.user_metadata?.full_name) {
        setCustomerName(user.user_metadata.full_name);
      }
    }
  }, [user]);

  // Poll for new conversations/messages for logged-in users
  // Handles: admin-created conversations, messages arriving while page was closed, etc.
  useEffect(() => {
    if (!user?.email) return;

    let active = true;

    const checkForNewMessages = async () => {
      if (!active || isOpenRef.current) return;

      try {
        const email = user.email!.toLowerCase();

        // Find latest open conversation for this user (case-insensitive email match)
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('id')
          .ilike('customer_email', email)
          .eq('status', 'open')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (!conv || !active) return;

        // Ensure conversation is in localStorage (enables realtime subscription)
        const savedId = localStorage.getItem('chat_conversation_id');
        if (savedId !== conv.id) {
          localStorage.setItem('chat_conversation_id', conv.id);
        }

        // If no conversation loaded in state yet, load it
        if (!conversation) {
          loadConversation(conv.id);
          return;
        }

        // Count unread agent/bot messages since last seen
        const lastSeen = localStorage.getItem(`chat_last_seen_${conv.id}`);
        let query = supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('is_private', false)
          .neq('sender_type', 'customer');

        if (lastSeen) {
          query = query.gt('created_at', lastSeen);
        }

        const { count } = await query;
        if (active && count !== null && count > 0) {
          setUnreadCount(count);
        }
      } catch {
        // Silent fail - don't break UX
      }
    };

    // Check immediately, then every 15 seconds
    checkForNewMessages();
    const interval = setInterval(checkForNewMessages, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, conversation?.id]);

  const handleOpenChat = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnreadCount(0);
    if (conversation?.id) {
      localStorage.setItem(`chat_last_seen_${conversation.id}`, new Date().toISOString());
    }
  };

  const notificationBadge = unreadCount > 0 ? (
    <span className="chat-unread-badge">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  ) : null;

  if (isMinimized) {
    return (
      <button
        className="chat-bubble-btn minimized"
        onClick={handleOpenChat}
        style={{ backgroundColor: CHAT_CONFIG.primaryColor }}
      >
        <IconMessage size={24} />
        {notificationBadge}
        <style jsx>{styles}</style>
      </button>
    );
  }

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          className="chat-bubble-btn"
          onClick={handleOpenChat}
          style={{ backgroundColor: CHAT_CONFIG.primaryColor }}
        >
          <IconMessage size={24} />
          {notificationBadge}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header" style={{ backgroundColor: CHAT_CONFIG.primaryColor }}>
            <div className="chat-header-content">
              <h4>{CHAT_CONFIG.title}</h4>
              <p>{CHAT_CONFIG.subtitle}</p>
            </div>
            <div className="chat-header-actions">
              <button onClick={() => {
                setIsMinimized(true);
                if (conversation?.id) localStorage.setItem(`chat_last_seen_${conversation.id}`, new Date().toISOString());
              }} className="header-btn">
                <IconMinus size={18} />
              </button>
              <button onClick={() => {
                setIsOpen(false);
                if (conversation?.id) localStorage.setItem(`chat_last_seen_${conversation.id}`, new Date().toISOString());
              }} className="header-btn">
                <IconX size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="chat-body">
            {loading ? (
              <div className="chat-loading">
                <div className="spinner" />
                <p>Loading...</p>
              </div>
            ) : showForm ? (
              <form onSubmit={startConversation} className="chat-form">
                <p className="form-intro">{CHAT_CONFIG.greeting}</p>
                {error && (
                  <div className="chat-error">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="error-dismiss"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="chat-input"
                  />
                </div>
                <div className="form-group">
                  <input
                    type="email"
                    placeholder="Your email *"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    required
                    className="chat-input"
                  />
                </div>
                <button
                  type="submit"
                  className="start-chat-btn"
                  style={{ backgroundColor: CHAT_CONFIG.primaryColor }}
                  disabled={loading}
                >
                  Start Chat
                </button>
              </form>
            ) : (
              <div className="messages-container">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender_type === 'customer' ? 'sent' : 'received'}`}
                  >
                    <div
                      className="message-bubble"
                      style={
                        msg.sender_type === 'customer'
                          ? { backgroundColor: CHAT_CONFIG.primaryColor }
                          : {}
                      }
                    >
                      {msg.body}
                    </div>
                    <span className="message-time">{formatTime(msg.created_at)}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Footer - Message Input */}
          {!showForm && !loading && (
            <form onSubmit={sendMessage} className="chat-footer">
              <input
                type="text"
                placeholder={CHAT_CONFIG.placeholder}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="message-input"
                disabled={sending}
              />
              <button
                type="submit"
                className="send-btn"
                style={{ backgroundColor: CHAT_CONFIG.primaryColor }}
                disabled={!newMessage.trim() || sending}
              >
                <IconSend size={18} />
              </button>
            </form>
          )}
        </div>
      )}

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
  .chat-bubble-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s, box-shadow 0.2s;
    z-index: 9999;
  }
  .chat-bubble-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
  .chat-bubble-btn.minimized {
    width: 48px;
    height: 48px;
  }

  .chat-unread-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: #e03131;
    color: white;
    font-size: 11px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    box-shadow: 0 2px 6px rgba(224, 49, 49, 0.4);
    animation: badge-pop 0.3s ease;
  }
  @keyframes badge-pop {
    0% { transform: scale(0); }
    60% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  .chat-window {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 370px;
    max-width: calc(100vw - 40px);
    height: 520px;
    max-height: calc(100vh - 100px);
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 9999;
  }

  .chat-header {
    padding: 16px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .chat-header-content h4 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
  }
  .chat-header-content p {
    margin: 0;
    font-size: 13px;
    opacity: 0.9;
  }
  .chat-header-actions {
    display: flex;
    gap: 4px;
  }
  .header-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .header-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .chat-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #f8f9fa;
  }

  .chat-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #666;
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .chat-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .chat-error p {
    color: #dc2626;
    font-size: 13px;
    margin: 0 0 8px 0;
  }
  .error-dismiss {
    background: none;
    border: none;
    color: #dc2626;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .chat-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
  }
  .form-intro {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 14px;
    line-height: 1.5;
  }
  .form-group {
    display: flex;
    flex-direction: column;
  }
  .chat-input {
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
  }
  .chat-input:focus {
    outline: none;
    border-color: #7c3aed;
  }
  .start-chat-btn {
    padding: 12px;
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 4px;
  }
  .start-chat-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .messages-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message {
    display: flex;
    flex-direction: column;
    max-width: 80%;
  }
  .message.sent {
    align-self: flex-end;
    align-items: flex-end;
  }
  .message.received {
    align-self: flex-start;
    align-items: flex-start;
  }
  .message-bubble {
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.4;
    word-break: break-word;
  }
  .message.sent .message-bubble {
    color: white;
    border-bottom-right-radius: 4px;
  }
  .message.received .message-bubble {
    background: white;
    color: #333;
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  .message-time {
    font-size: 11px;
    color: #999;
    margin-top: 4px;
  }

  .chat-footer {
    padding: 12px;
    background: white;
    border-top: 1px solid #eee;
    display: flex;
    gap: 8px;
  }
  .message-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid #ddd;
    border-radius: 20px;
    font-size: 14px;
  }
  .message-input:focus {
    outline: none;
    border-color: #7c3aed;
  }
  .send-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
