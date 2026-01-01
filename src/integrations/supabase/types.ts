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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      attempts: {
        Row: {
          accuracy_percentage: number | null
          avg_time_per_question: number | null
          created_at: string
          id: string
          score: number | null
          section_id: string
          started_at: string
          submitted_at: string | null
          time_spent_seconds: number | null
          total_questions: number | null
          user_id: string
        }
        Insert: {
          accuracy_percentage?: number | null
          avg_time_per_question?: number | null
          created_at?: string
          id?: string
          score?: number | null
          section_id: string
          started_at?: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          total_questions?: number | null
          user_id: string
        }
        Update: {
          accuracy_percentage?: number | null
          avg_time_per_question?: number | null
          created_at?: string
          id?: string
          score?: number | null
          section_id?: string
          started_at?: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          total_questions?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parsed_questions: {
        Row: {
          answer_hint: string | null
          answer_type: string
          confidence: number | null
          correct_answer: Json | null
          created_at: string
          final_order: number | null
          id: string
          image_url: string | null
          is_excluded: boolean | null
          is_finalized: boolean | null
          options: Json | null
          q_no: number
          requires_review: boolean | null
          section_id: string
          section_label: string | null
          text: string
        }
        Insert: {
          answer_hint?: string | null
          answer_type: string
          confidence?: number | null
          correct_answer?: Json | null
          created_at?: string
          final_order?: number | null
          id?: string
          image_url?: string | null
          is_excluded?: boolean | null
          is_finalized?: boolean | null
          options?: Json | null
          q_no: number
          requires_review?: boolean | null
          section_id: string
          section_label?: string | null
          text: string
        }
        Update: {
          answer_hint?: string | null
          answer_type?: string
          confidence?: number | null
          correct_answer?: Json | null
          created_at?: string
          final_order?: number | null
          id?: string
          image_url?: string | null
          is_excluded?: boolean | null
          is_finalized?: boolean | null
          options?: Json | null
          q_no?: number
          requires_review?: boolean | null
          section_id?: string
          section_label?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "parsed_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          is_marked_for_review: boolean | null
          question_id: string
          selected_answer: Json | null
          time_spent_seconds: number | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          is_marked_for_review?: boolean | null
          question_id: string
          selected_answer?: Json | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          is_marked_for_review?: boolean | null
          question_id?: string
          selected_answer?: Json | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "parsed_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          is_finalized: boolean | null
          name: string
          parsing_completed_at: string | null
          parsing_started_at: string | null
          parsing_status: string | null
          pdf_name: string | null
          pdf_url: string | null
          questions_requiring_review: number | null
          sort_order: number
          time_minutes: number
          total_questions: number | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          is_finalized?: boolean | null
          name: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          parsing_status?: string | null
          pdf_name?: string | null
          pdf_url?: string | null
          questions_requiring_review?: number | null
          sort_order?: number
          time_minutes: number
          total_questions?: number | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          is_finalized?: boolean | null
          name?: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          parsing_status?: string | null
          pdf_name?: string | null
          pdf_url?: string | null
          questions_requiring_review?: number | null
          sort_order?: number
          time_minutes?: number
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          updated_at: string | null
          username: string | null
          full_name: string | null
          phone_number: string | null
          avatar_url: string | null
          website: string | null
        }
        Insert: {
          id: string
          updated_at?: string | null
          username?: string | null
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          website?: string | null
        }
        Update: {
          id?: string
          updated_at?: string | null
          username?: string | null
          full_name?: string | null
          phone_number?: string | null
          avatar_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
