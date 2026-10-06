export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      groups: {
        Row: {
          created_at: string
          depth: number
          icon: string
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          path: string[]
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          depth?: number
          icon?: string
          id?: string
          name: string
          owner_id?: string
          parent_id?: string | null
          path?: string[]
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          depth?: number
          icon?: string
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          path?: string[]
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string | null
          group_id: string | null
          group_name: string | null
          id: number
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      todo_shares: {
        Row: {
          created_at: string | null
          group_id: string | null
          group_name: string | null
          id: number
          owner_id: string
          permission: string | null
          shared_with_email: string
          shared_with_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          owner_id?: string
          permission?: string | null
          shared_with_email: string
          shared_with_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          owner_id?: string
          permission?: string | null
          shared_with_email?: string
          shared_with_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_shares_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          completed: boolean | null
          created_at: string | null
          group_id: string | null
          group_name: string | null
          id: number
          title: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          title: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todos_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          approved: boolean
          approved_at: string
          created_at: string
          email: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
          note_count: number
          share_count: number
          todo_count: number
        }[]
      }
      admin_set_admin: {
        Args: { p_is_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_approved: {
        Args: { p_approved: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_set_password: {
        Args: { p_password: string; p_user_id: string }
        Returns: undefined
      }
      can_access_group: {
        Args: { p_group_id: string; p_owner: string; p_require_edit?: boolean }
        Returns: boolean
      }
      ensure_default_group: { Args: { p_user_id: string }; Returns: string }
      group_access_for: {
        Args: {
          p_group_id: string
          p_owner: string
          p_require_edit?: boolean
          p_viewer: string
        }
        Returns: boolean
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_approved: { Args: { uid: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
