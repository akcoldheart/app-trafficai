/**
 * Database types for Supabase
 * These types represent the database schema
 *
 * To generate types automatically from your Supabase database:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'team' | 'user';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type PixelStatus = 'active' | 'inactive' | 'pending';
export type IntegrationType = 'facebook' | 'google' | 'email' | 'crm' | 'webhook';

// RBAC Types
export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  display_order: number;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  menu_item_id: string;
  created_at: string;
}

// Extended types with relations
export interface RoleWithPermissions extends Role {
  permissions: MenuItem[];
}

export interface RoleWithUserCount extends Role {
  user_count: number;
}

export interface MenuItemWithChildren extends MenuItem {
  children?: MenuItemWithChildren[];
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          role_id: string | null;
          company_website: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          role_id?: string | null;
          company_website?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          role_id?: string | null;
          company_website?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_websites: {
        Row: {
          id: string;
          user_id: string;
          url: string;
          name: string | null;
          is_primary: boolean;
          is_verified: boolean;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          name?: string | null;
          is_primary?: boolean;
          is_verified?: boolean;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          url?: string;
          name?: string | null;
          is_primary?: boolean;
          is_verified?: boolean;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          api_key: string;
          assigned_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          api_key: string;
          assigned_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          api_key?: string;
          assigned_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pixels: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          domain: string;
          pixel_code: string;
          status: PixelStatus;
          events_count: number;
          last_event_at: string | null;
          created_at: string;
          updated_at: string;
          custom_installation_code: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          domain: string;
          pixel_code: string;
          status?: PixelStatus;
          events_count?: number;
          last_event_at?: string | null;
          created_at?: string;
          updated_at?: string;
          custom_installation_code?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          domain?: string;
          pixel_code?: string;
          status?: PixelStatus;
          events_count?: number;
          last_event_at?: string | null;
          created_at?: string;
          updated_at?: string;
          custom_installation_code?: string | null;
        };
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string;
          user_id: string;
          type: IntegrationType;
          name: string;
          config: Json;
          is_connected: boolean;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: IntegrationType;
          name: string;
          config?: Json;
          is_connected?: boolean;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: IntegrationType;
          name?: string;
          config?: Json;
          is_connected?: boolean;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pixel_events: {
        Row: {
          id: string;
          pixel_id: string;
          event_type: string;
          visitor_id: string | null;
          page_url: string | null;
          referrer: string | null;
          user_agent: string | null;
          ip_address: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pixel_id: string;
          event_type?: string;
          visitor_id?: string | null;
          page_url?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          pixel_id?: string;
          event_type?: string;
          visitor_id?: string | null;
          page_url?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_conversations: {
        Row: {
          id: string;
          customer_name: string | null;
          customer_email: string | null;
          customer_metadata: Json | null;
          visitor_id: string | null;
          source: string | null;
          page_url: string | null;
          status: string;
          read: boolean;
          last_message_at: string | null;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_metadata?: Json | null;
          visitor_id?: string | null;
          source?: string | null;
          page_url?: string | null;
          status?: string;
          read?: boolean;
          last_message_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_metadata?: Json | null;
          visitor_id?: string | null;
          source?: string | null;
          page_url?: string | null;
          status?: string;
          read?: boolean;
          last_message_at?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          body: string;
          sender_type: 'customer' | 'agent' | 'bot';
          sender_id: string | null;
          sender_name: string | null;
          is_private: boolean;
          attachments: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          body: string;
          sender_type?: 'customer' | 'agent' | 'bot';
          sender_id?: string | null;
          sender_name?: string | null;
          is_private?: boolean;
          attachments?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          body?: string;
          sender_type?: 'customer' | 'agent' | 'bot';
          sender_id?: string | null;
          sender_name?: string | null;
          is_private?: boolean;
          attachments?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      chat_auto_replies: {
        Row: {
          id: string;
          question: string;
          answer: string;
          keywords: string[];
          is_active: boolean;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question: string;
          answer: string;
          keywords?: string[];
          is_active?: boolean;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          question?: string;
          answer?: string;
          keywords?: string[];
          is_active?: boolean;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_settings: {
        Row: {
          id: string;
          key: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      visitors: {
        Row: {
          id: string;
          pixel_id: string;
          user_id: string;
          visitor_id: string;
          fingerprint_hash: string | null;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
          company: string | null;
          job_title: string | null;
          linkedin_url: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          ip_address: string | null;
          user_agent: string | null;
          first_seen_at: string;
          last_seen_at: string;
          first_page_url: string | null;
          first_referrer: string | null;
          total_pageviews: number;
          total_sessions: number;
          total_time_on_site: number;
          max_scroll_depth: number;
          total_clicks: number;
          form_submissions: number;
          lead_score: number;
          is_identified: boolean;
          identified_at: string | null;
          is_enriched: boolean;
          enriched_at: string | null;
          enrichment_source: string | null;
          enrichment_data: Json | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pixel_id: string;
          user_id: string;
          visitor_id: string;
          fingerprint_hash?: string | null;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          company?: string | null;
          job_title?: string | null;
          linkedin_url?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          first_page_url?: string | null;
          first_referrer?: string | null;
          total_pageviews?: number;
          total_sessions?: number;
          total_time_on_site?: number;
          max_scroll_depth?: number;
          total_clicks?: number;
          form_submissions?: number;
          lead_score?: number;
          is_identified?: boolean;
          identified_at?: string | null;
          is_enriched?: boolean;
          enriched_at?: string | null;
          enrichment_source?: string | null;
          enrichment_data?: Json | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pixel_id?: string;
          user_id?: string;
          visitor_id?: string;
          fingerprint_hash?: string | null;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          full_name?: string | null;
          company?: string | null;
          job_title?: string | null;
          linkedin_url?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          first_page_url?: string | null;
          first_referrer?: string | null;
          total_pageviews?: number;
          total_sessions?: number;
          total_time_on_site?: number;
          max_scroll_depth?: number;
          total_clicks?: number;
          form_submissions?: number;
          lead_score?: number;
          is_identified?: boolean;
          identified_at?: string | null;
          is_enriched?: boolean;
          enriched_at?: string | null;
          enrichment_source?: string | null;
          enrichment_data?: Json | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          name: string;
          href: string;
          icon: string;
          display_order: number;
          parent_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          href: string;
          icon: string;
          display_order?: number;
          parent_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          href?: string;
          icon?: string;
          display_order?: number;
          parent_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: string;
          role_id: string;
          menu_item_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          role_id: string;
          menu_item_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role_id?: string;
          menu_item_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      pixel_requests: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          domain: string;
          status: RequestStatus;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          pixel_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          domain: string;
          status?: RequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          pixel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          domain?: string;
          status?: RequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          pixel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audience_requests: {
        Row: {
          id: string;
          user_id: string;
          request_type: 'standard' | 'custom';
          name: string;
          form_data: Json;
          status: RequestStatus;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          audience_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_type: 'standard' | 'custom';
          name: string;
          form_data: Json;
          status?: RequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          audience_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          request_type?: 'standard' | 'custom';
          name?: string;
          form_data?: Json;
          status?: RequestStatus;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          audience_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_notifications: {
        Row: {
          id: string;
          type: string;
          title: string;
          message: string;
          reference_id: string | null;
          reference_type: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          title: string;
          message: string;
          reference_id?: string | null;
          reference_type?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          title?: string;
          message?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_pixel_code: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      pixel_status: PixelStatus;
      integration_type: IntegrationType;
      request_status: RequestStatus;
    };
  };
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row'];
export type UserWebsite = Database['public']['Tables']['user_websites']['Row'];
export type Pixel = Database['public']['Tables']['pixels']['Row'];
export type Integration = Database['public']['Tables']['integrations']['Row'];
export type PixelEvent = Database['public']['Tables']['pixel_events']['Row'];
export type Visitor = Database['public']['Tables']['visitors']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

// Request Workflow Types
export interface PixelRequest {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  status: RequestStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  pixel_id: string | null;
  created_at: string;
  updated_at: string;
  user?: { email: string };
}

export interface AudienceRequest {
  id: string;
  user_id: string;
  request_type: 'standard' | 'custom';
  name: string;
  form_data: Record<string, unknown>;
  status: RequestStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  audience_id: string | null;
  created_at: string;
  updated_at: string;
  user?: { email: string };
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}
