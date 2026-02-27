import { createClient as createServiceClient } from '@supabase/supabase-js';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export type LogType = 'webhook' | 'api' | 'stripe' | 'error' | 'info' | 'audience';
export type LogStatus = 'success' | 'error' | 'warning' | 'info';

export interface LogEntry {
  id?: string;
  type: LogType;
  event_name: string;
  status: LogStatus;
  message: string;
  request_data?: Record<string, unknown>;
  response_data?: Record<string, unknown>;
  error_details?: string;
  user_id?: string;
  ip_address?: string;
  created_at?: string;
}

/**
 * Log an event to the database
 */
export async function logEvent(entry: Omit<LogEntry, 'id' | 'created_at'>): Promise<void> {
  try {
    const supabase = getServiceClient();

    const { error } = await supabase
      .from('system_logs')
      .insert({
        type: entry.type,
        event_name: entry.event_name,
        status: entry.status,
        message: entry.message,
        request_data: entry.request_data || null,
        response_data: entry.response_data || null,
        error_details: entry.error_details || null,
        user_id: entry.user_id || null,
        ip_address: entry.ip_address || null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      // Don't throw - just log to console if database logging fails
      console.error('Failed to save log to database:', error);
    }
  } catch (err) {
    console.error('Error in logEvent:', err);
  }
}

/**
 * Log a Stripe webhook event
 */
export async function logStripeWebhook(
  eventType: string,
  status: LogStatus,
  message: string,
  data?: {
    eventId?: string;
    customerId?: string;
    userId?: string;
    subscriptionId?: string;
    sessionId?: string;
    error?: string;
    requestData?: Record<string, unknown>;
    responseData?: Record<string, unknown>;
  }
): Promise<void> {
  await logEvent({
    type: 'stripe',
    event_name: eventType,
    status,
    message,
    user_id: data?.userId,
    request_data: {
      event_id: data?.eventId,
      customer_id: data?.customerId,
      subscription_id: data?.subscriptionId,
      session_id: data?.sessionId,
      ...data?.requestData,
    },
    response_data: data?.responseData,
    error_details: data?.error,
  });
}

/**
 * Log an API request
 */
export async function logApiRequest(
  endpoint: string,
  method: string,
  status: LogStatus,
  message: string,
  data?: {
    userId?: string;
    ipAddress?: string;
    requestData?: Record<string, unknown>;
    responseData?: Record<string, unknown>;
    error?: string;
  }
): Promise<void> {
  await logEvent({
    type: 'api',
    event_name: `${method} ${endpoint}`,
    status,
    message,
    user_id: data?.userId,
    ip_address: data?.ipAddress,
    request_data: data?.requestData,
    response_data: data?.responseData,
    error_details: data?.error,
  });
}
