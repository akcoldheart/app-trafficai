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

export type UserRole = 'admin' | 'team' | 'partner';
export type PixelStatus = 'active' | 'inactive' | 'pending';
export type IntegrationType = 'facebook' | 'google' | 'email' | 'crm' | 'webhook';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          company_website: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          company_website?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
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
