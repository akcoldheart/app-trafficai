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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
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
export type Pixel = Database['public']['Tables']['pixels']['Row'];
export type Integration = Database['public']['Tables']['integrations']['Row'];
export type PixelEvent = Database['public']['Tables']['pixel_events']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
