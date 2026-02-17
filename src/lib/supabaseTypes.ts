export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cloud_bookmarks: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          favicon: string | null
          folder: string
          id: string
          title: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          favicon?: string | null
          folder?: string
          id?: string
          title?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          favicon?: string | null
          folder?: string
          id?: string
          title?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      cloud_deleted_entities: {
        Row: {
          id: string
          user_id: string
          entity_type: string
          entity_id: string
          deleted_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entity_type: string
          entity_id: string
          deleted_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entity_type?: string
          entity_id?: string
          deleted_at?: string
        }
        Relationships: []
      }
      cloud_scheduled_actions: {
        Row: {
          created_at: string | null
          description: string | null
          destination: Json
          enabled: boolean
          entity_id: string
          id: string
          name: string
          original_created_at: number
          recurrence: string
          recurrence_anchor: Json | null
          trigger_time: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          destination: Json
          enabled?: boolean
          entity_id: string
          id?: string
          name: string
          original_created_at: number
          recurrence?: string
          recurrence_anchor?: Json | null
          trigger_time: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          destination?: Json
          enabled?: boolean
          entity_id?: string
          id?: string
          name?: string
          original_created_at?: number
          recurrence?: string
          recurrence_anchor?: Json | null
          trigger_time?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cloud_shortcuts: {
        Row: {
          id: string
          user_id: string
          entity_id: string
          type: string
          name: string
          content_uri: string | null
          file_type: string | null
          mime_type: string | null
          phone_number: string | null
          contact_name: string | null
          message_app: string | null
          quick_messages: Json | null
          resume_enabled: boolean | null
          auto_advance_interval: number | null
          image_count: number | null
          icon_type: string | null
          icon_value: string | null
          usage_count: number
          original_created_at: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entity_id: string
          type: string
          name: string
          content_uri?: string | null
          file_type?: string | null
          mime_type?: string | null
          phone_number?: string | null
          contact_name?: string | null
          message_app?: string | null
          quick_messages?: Json | null
          resume_enabled?: boolean | null
          auto_advance_interval?: number | null
          image_count?: number | null
          icon_type?: string | null
          icon_value?: string | null
          usage_count?: number
          original_created_at: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entity_id?: string
          type?: string
          name?: string
          content_uri?: string | null
          file_type?: string | null
          mime_type?: string | null
          phone_number?: string | null
          contact_name?: string | null
          message_app?: string | null
          quick_messages?: Json | null
          resume_enabled?: boolean | null
          auto_advance_interval?: number | null
          image_count?: number | null
          icon_type?: string | null
          icon_value?: string | null
          usage_count?: number
          original_created_at?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cloud_trash: {
        Row: {
          created_at: string
          deleted_at: string
          description: string | null
          entity_id: string
          folder: string
          id: string
          original_created_at: string
          retention_days: number
          title: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          description?: string | null
          entity_id: string
          folder?: string
          id?: string
          original_created_at?: string
          retention_days?: number
          title?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          description?: string | null
          entity_id?: string
          folder?: string
          id?: string
          original_created_at?: string
          retention_days?: number
          title?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
