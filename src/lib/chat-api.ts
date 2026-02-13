/**
 * Chat API Service
 * Handles all chat-related API calls through Next.js API routes (Supabase backend)
 */

// Types matching Supabase schema
export interface ChatConversation {
  id: string;
  customer_name?: string;
  customer_email?: string;
  customer_metadata?: Record<string, unknown>;
  visitor_id?: string;
  assignee_id?: string;
  status: 'open' | 'closed' | 'archived';
  subject?: string;
  preview?: string;
  read: boolean;
  last_message_at?: string;
  source?: string;
  page_url?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'bot' | 'note';
  sender_id?: string;
  sender_name?: string;
  body: string;
  is_private: boolean;
  attachments?: Array<{ id: string; filename: string; url: string }>;
  seen_at?: string;
  created_at: string;
}

export interface ConversationsResponse {
  data: ChatConversation[];
  pagination?: {
    page: number;
    page_size: number;
    total_pages: number;
    total_entries: number;
  };
}

export interface ConversationResponse {
  data: ChatConversation;
}

export interface SendMessageData {
  conversation_id: string;
  body: string;
  sender_type?: 'agent' | 'note';
  is_private?: boolean;
}

// Generic fetch wrapper for chat API routes
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  };

  try {
    const response = await fetch(`/api/chat${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 401) {
        throw new Error('Please log in to continue');
      }
      if (response.status === 403) {
        throw new Error(errorData.error || 'You do not have permission to perform this action');
      }

      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Chat API Error:', error);
    throw error;
  }
}

// ==================== CONVERSATIONS ====================

/**
 * Get all conversations (paginated)
 */
export async function getConversations(
  status: 'open' | 'closed' | 'all' = 'open',
  page = 1,
  pageSize = 20
): Promise<ConversationsResponse> {
  const params = new URLSearchParams({
    status,
    page: String(page),
    page_size: String(pageSize),
  });
  return request<ConversationsResponse>(`/conversations?${params}`, { method: 'GET' });
}

/**
 * Get conversation by ID with messages
 */
export async function getConversation(id: string): Promise<ConversationResponse> {
  return request<ConversationResponse>(`/conversations/${id}`, { method: 'GET' });
}

/**
 * Update conversation (close, assign, etc.)
 */
export async function updateConversation(
  id: string,
  updates: Partial<ChatConversation>
): Promise<{ data: ChatConversation }> {
  return request<{ data: ChatConversation }>(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * Close a conversation
 */
export async function closeConversation(id: string): Promise<{ data: ChatConversation }> {
  return updateConversation(id, { status: 'closed' });
}

/**
 * Reopen a conversation
 */
export async function reopenConversation(id: string): Promise<{ data: ChatConversation }> {
  return updateConversation(id, { status: 'open' });
}

// ==================== MESSAGES ====================

/**
 * Send a new message (as agent)
 */
export async function sendMessage(data: SendMessageData): Promise<{ data: ChatMessage }> {
  return request<{ data: ChatMessage }>('/messages', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      sender_type: data.sender_type || 'agent',
    }),
  });
}

/**
 * Create a new conversation (admin-initiated)
 */
export async function createConversation(data: {
  user_email: string;
  user_name?: string;
  message: string;
}): Promise<{ data: ChatConversation; existing: boolean }> {
  return request<{ data: ChatConversation; existing: boolean }>('/conversations/admin-create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Get unread conversation count
 */
export async function getUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>('/conversations/unread', { method: 'GET' });
}

// Export all as ChatAPI namespace
export const ChatAPI = {
  getConversations,
  getConversation,
  updateConversation,
  closeConversation,
  reopenConversation,
  sendMessage,
  createConversation,
  getUnreadCount,
};

export default ChatAPI;
