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
          language: string
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
          language?: string
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
          language?: string
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
          allow_section_switching: boolean
          created_at: string
          description: string | null
          description_translations: Json | null
          exam_category: string | null
          exam_instruction: string | null
          exam_instruction_translations: Json | null
          id: string
          instruction: string | null
          instruction_translations: Json | null
          is_published: boolean
          name: string
          primary_language: string
          published_languages: string[]
          supported_languages: string[]
          total_time_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_section_switching?: boolean
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          exam_category?: string | null
          exam_instruction?: string | null
          exam_instruction_translations?: Json | null
          id?: string
          instruction?: string | null
          instruction_translations?: Json | null
          is_published?: boolean
          name: string
          primary_language?: string
          published_languages?: string[]
          supported_languages?: string[]
          total_time_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_section_switching?: boolean
          created_at?: string
          description?: string | null
          description_translations?: Json | null
          exam_category?: string | null
          exam_instruction?: string | null
          exam_instruction_translations?: Json | null
          id?: string
          instruction?: string | null
          instruction_translations?: Json | null
          is_published?: boolean
          name?: string
          primary_language?: string
          published_languages?: string[]
          supported_languages?: string[]
          total_time_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_exams: {
        Row: {
          auto_start: boolean
          celebrate_seq: number
          created_at: string
          current_question_extra_seconds: number
          current_question_index: number
          current_question_unlocked_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          instruction: string | null
          leaderboard_visibility: string
          name: string
          origin_exam_id: string | null
          present_show_leaderboard: boolean
          present_show_river: boolean
          primary_language: string
          privacy_mode: boolean
          report_public: boolean
          report_share_token: string | null
          scheduled_start_at: string | null
          share_code: string
          started_at: string | null
          status: string
          supported_languages: string[]
          total_questions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_start?: boolean
          celebrate_seq?: number
          created_at?: string
          current_question_extra_seconds?: number
          current_question_index?: number
          current_question_unlocked_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          instruction?: string | null
          leaderboard_visibility?: string
          name: string
          origin_exam_id?: string | null
          present_show_leaderboard?: boolean
          present_show_river?: boolean
          primary_language?: string
          privacy_mode?: boolean
          report_public?: boolean
          report_share_token?: string | null
          scheduled_start_at?: string | null
          share_code?: string
          started_at?: string | null
          status?: string
          supported_languages?: string[]
          total_questions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_start?: boolean
          celebrate_seq?: number
          created_at?: string
          current_question_extra_seconds?: number
          current_question_index?: number
          current_question_unlocked_at?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          instruction?: string | null
          leaderboard_visibility?: string
          name?: string
          origin_exam_id?: string | null
          present_show_leaderboard?: boolean
          present_show_river?: boolean
          primary_language?: string
          privacy_mode?: boolean
          report_public?: boolean
          report_share_token?: string | null
          scheduled_start_at?: string | null
          share_code?: string
          started_at?: string | null
          status?: string
          supported_languages?: string[]
          total_questions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_exams_origin_exam_id_fkey"
            columns: ["origin_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_confusion_signals: {
        Row: {
          created_at: string
          live_exam_id: string
          live_question_id: string
          question_ordinal: number
          user_id: string
        }
        Insert: {
          created_at?: string
          live_exam_id: string
          live_question_id: string
          question_ordinal?: number
          user_id: string
        }
        Update: {
          created_at?: string
          live_exam_id?: string
          live_question_id?: string
          question_ordinal?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_confusion_signals_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_presence: {
        Row: {
          last_seen_at: string
          live_exam_id: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          live_exam_id: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          live_exam_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_presence_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_unlock_log: {
        Row: {
          extra_seconds: number
          live_exam_id: string
          question_ordinal: number
          undone_at: string | null
          unlocked_at: string
        }
        Insert: {
          extra_seconds?: number
          live_exam_id: string
          question_ordinal: number
          undone_at?: string | null
          unlocked_at: string
        }
        Update: {
          extra_seconds?: number
          live_exam_id?: string
          question_ordinal?: number
          undone_at?: string | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_unlock_log_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants: {
        Row: {
          display_name: string
          id: string
          is_active: boolean
          joined_at: string
          live_exam_id: string
          rank: number | null
          total_answered: number
          total_correct: number
          total_time_ms: number
          user_id: string
        }
        Insert: {
          display_name?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          live_exam_id: string
          rank?: number | null
          total_answered?: number
          total_correct?: number
          total_time_ms?: number
          user_id: string
        }
        Update: {
          display_name?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          live_exam_id?: string
          rank?: number | null
          total_answered?: number
          total_correct?: number
          total_time_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_question_analytics: {
        Row: {
          avg_time_correct_ms: number | null
          computed_at: string
          confusion_count: number
          correct_count: number
          fast_correct: number
          fast_wrong: number
          fastest_time_ms: number | null
          fastest_user_id: string | null
          fastest_user_name: string | null
          id: string
          impulsive_wrong: number
          live_exam_id: string
          live_question_id: string
          median_time_ms: number | null
          option_distribution: Json | null
          skipped_count: number
          slow_correct: number
          slow_wrong: number
          time_histogram: Json
          total_responses: number
          wrong_count: number
        }
        Insert: {
          avg_time_correct_ms?: number | null
          computed_at?: string
          confusion_count?: number
          correct_count?: number
          fast_correct?: number
          fast_wrong?: number
          fastest_time_ms?: number | null
          fastest_user_id?: string | null
          fastest_user_name?: string | null
          id?: string
          impulsive_wrong?: number
          live_exam_id: string
          live_question_id: string
          median_time_ms?: number | null
          option_distribution?: Json | null
          skipped_count?: number
          slow_correct?: number
          slow_wrong?: number
          time_histogram?: Json
          total_responses?: number
          wrong_count?: number
        }
        Update: {
          avg_time_correct_ms?: number | null
          computed_at?: string
          confusion_count?: number
          correct_count?: number
          fast_correct?: number
          fast_wrong?: number
          fastest_time_ms?: number | null
          fastest_user_id?: string | null
          fastest_user_name?: string | null
          id?: string
          impulsive_wrong?: number
          live_exam_id?: string
          live_question_id?: string
          median_time_ms?: number | null
          option_distribution?: Json | null
          skipped_count?: number
          slow_correct?: number
          slow_wrong?: number
          time_histogram?: Json
          total_responses?: number
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_question_analytics_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_question_analytics_live_question_id_fkey"
            columns: ["live_question_id"]
            isOneToOne: false
            referencedRelation: "live_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_questions: {
        Row: {
          answer_type: string
          correct_answer: Json | null
          created_at: string
          global_index: number
          id: string
          image_url: string | null
          image_urls: string[] | null
          live_section_id: string
          option_image_urls: Json | null
          options: Json | null
          q_no: number
          question_group_id: string | null
          section_label: string | null
          text: string
          time_seconds: number
        }
        Insert: {
          answer_type?: string
          correct_answer?: Json | null
          created_at?: string
          global_index?: number
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          live_section_id: string
          option_image_urls?: Json | null
          options?: Json | null
          q_no: number
          question_group_id?: string | null
          section_label?: string | null
          text: string
          time_seconds?: number
        }
        Update: {
          answer_type?: string
          correct_answer?: Json | null
          created_at?: string
          global_index?: number
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          live_section_id?: string
          option_image_urls?: Json | null
          options?: Json | null
          q_no?: number
          question_group_id?: string | null
          section_label?: string | null
          text?: string
          time_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_live_section_id_fkey"
            columns: ["live_section_id"]
            isOneToOne: false
            referencedRelation: "live_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      live_responses: {
        Row: {
          id: string
          is_correct: boolean | null
          live_exam_id: string
          live_question_id: string
          question_ordinal: number
          selected_answer: Json | null
          submitted_at: string
          time_taken_ms: number
          user_id: string
        }
        Insert: {
          id?: string
          is_correct?: boolean | null
          live_exam_id: string
          live_question_id: string
          question_ordinal?: number
          selected_answer?: Json | null
          submitted_at?: string
          time_taken_ms?: number
          user_id: string
        }
        Update: {
          id?: string
          is_correct?: boolean | null
          live_exam_id?: string
          live_question_id?: string
          question_ordinal?: number
          selected_answer?: Json | null
          submitted_at?: string
          time_taken_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_responses_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_responses_live_question_id_fkey"
            columns: ["live_question_id"]
            isOneToOne: false
            referencedRelation: "live_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sections: {
        Row: {
          created_at: string
          id: string
          language: string
          live_exam_id: string
          name: string
          pdf_url: string | null
          section_group_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          live_exam_id: string
          name: string
          pdf_url?: string | null
          section_group_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          live_exam_id?: string
          name?: string
          pdf_url?: string | null
          section_group_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_sections_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
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
          image_region: Json | null
          image_url: string | null
          image_urls: string[] | null
          is_excluded: boolean | null
          is_finalized: boolean | null
          option_image_urls: Json | null
          options: Json | null
          q_no: number
          question_group_id: string | null
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
          image_region?: Json | null
          image_url?: string | null
          image_urls?: string[] | null
          is_excluded?: boolean | null
          is_finalized?: boolean | null
          option_image_urls?: Json | null
          options?: Json | null
          q_no: number
          question_group_id?: string | null
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
          image_region?: Json | null
          image_url?: string | null
          image_urls?: string[] | null
          is_excluded?: boolean | null
          is_finalized?: boolean | null
          option_image_urls?: Json | null
          options?: Json | null
          q_no?: number
          question_group_id?: string | null
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
          language: string
          name: string
          parsing_completed_at: string | null
          parsing_started_at: string | null
          parsing_status: string | null
          pdf_name: string | null
          pdf_url: string | null
          questions_requiring_review: number | null
          section_group_id: string | null
          sort_order: number
          time_minutes: number
          total_questions: number | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          is_finalized?: boolean | null
          language?: string
          name: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          parsing_status?: string | null
          pdf_name?: string | null
          pdf_url?: string | null
          questions_requiring_review?: number | null
          section_group_id?: string | null
          sort_order?: number
          time_minutes: number
          total_questions?: number | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          is_finalized?: boolean | null
          language?: string
          name?: string
          parsing_completed_at?: string | null
          parsing_started_at?: string | null
          parsing_status?: string | null
          pdf_name?: string | null
          pdf_url?: string | null
          questions_requiring_review?: number | null
          section_group_id?: string | null
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
      live_questions_student: {
        Row: {
          answer_type: string
          created_at: string
          global_index: number
          id: string
          image_url: string | null
          image_urls: string[] | null
          live_section_id: string
          options: Json | null
          q_no: number
          question_group_id: string | null
          section_label: string | null
          text: string
          time_seconds: number
        }
        Relationships: [
          {
            foreignKeyName: "live_questions_live_section_id_fkey"
            columns: ["live_section_id"]
            isOneToOne: false
            referencedRelation: "live_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      live_participants_public: {
        Row: {
          display_name: string | null
          id: string | null
          is_active: boolean | null
          joined_at: string | null
          live_exam_id: string | null
          rank: number | null
          total_answered: number | null
          total_correct: number | null
          total_time_ms: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_participants_live_exam_id_fkey"
            columns: ["live_exam_id"]
            isOneToOne: false
            referencedRelation: "live_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          id: string | null
          is_admin_gold: boolean | null
          is_verified: boolean | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      compute_live_question_analytics: {
        Args: { p_live_exam_id: string; p_live_question_id: string }
        Returns: {
          avg_time_correct_ms: number | null
          computed_at: string
          correct_count: number
          fastest_time_ms: number | null
          fastest_user_id: string | null
          fastest_user_name: string | null
          id: string
          live_exam_id: string
          live_question_id: string
          option_distribution: Json | null
          skipped_count: number
          total_responses: number
          wrong_count: number
        }
      }
      compute_live_rankings: {
        Args: { p_live_exam_id: string }
        Returns: undefined
      }
      end_live_question_time: {
        Args: { p_live_exam_id: string }
        Returns: Database["public"]["Tables"]["live_exams"]["Row"]
      }
      end_live_session: {
        Args: { p_live_exam_id: string }
        Returns: {
          created_at: string
          current_question_index: number
          current_question_unlocked_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          instruction: string | null
          name: string
          primary_language: string
          share_code: string
          started_at: string | null
          status: string
          supported_languages: string[]
          total_questions: number
          updated_at: string
          user_id: string
        }
      }
      get_my_live_responses: {
        Args: { p_live_exam_id: string }
        Returns: {
          id: string
          is_correct: boolean | null
          live_exam_id: string
          live_question_id: string
          question_ordinal: number
          selected_answer: Json | null
          submitted_at: string
          time_taken_ms: number
          user_id: string
        }[]
      }
      get_revealed_live_answers: {
        Args: { p_live_exam_id: string }
        Returns: {
          correct_answer: Json
          live_question_id: string
        }[]
      }
      grade_live_answer: {
        Args: { p_correct: Json; p_selected: Json }
        Returns: boolean
      }
      flag_live_confusion: {
        Args: { p_live_exam_id: string }
        Returns: undefined
      }
      live_anon_name: {
        Args: { p_ordinal: number }
        Returns: string
      }
      live_question_grace_seconds: {
        Args: Record<string, never>
        Returns: number
      }
      live_question_visual_end: {
        Args: {
          p_extra_seconds: number
          p_time_seconds: number
          p_unlocked_at: string
        }
        Returns: string
      }
      live_ordinal_min_seconds: {
        Args: { p_live_exam_id: string; p_ordinal: number }
        Returns: number
      }
      compute_live_moments: {
        Args: { p_live_exam_id: string; p_ordinal: number }
        Returns: undefined
      }
      get_live_moments: {
        Args: { p_live_exam_id: string }
        Returns: {
          question_ordinal: number
          kind: string
          user_id: string | null
          display_name: string | null
          value: number
          priority: number
        }[]
      }
      celebrate_live_exam: {
        Args: { p_live_exam_id: string }
        Returns: number
      }
      reorder_live_section_questions: {
        Args: { p_section_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      build_live_exam_report: {
        Args: { p_live_exam_id: string }
        Returns: Json
      }
      get_live_exam_report: {
        Args: { p_live_exam_id: string }
        Returns: Json
      }
      get_live_exam_report_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      set_live_report_sharing: {
        Args: { p_live_exam_id: string; p_enabled: boolean }
        Returns: string
      }
      renumber_live_global_indexes: {
        Args: { p_live_exam_id: string }
        Returns: undefined
      }
      live_refresh_fastest_names: {
        Args: { p_live_exam_id: string }
        Returns: undefined
      }
      add_live_question_time: {
        Args: { p_live_exam_id: string; p_seconds: number }
        Returns: Database["public"]["Tables"]["live_exams"]["Row"]
      }
      undo_last_live_unlock: {
        Args: { p_live_exam_id: string }
        Returns: Database["public"]["Tables"]["live_exams"]["Row"]
      }
      live_question_deadline: {
        Args: {
          p_extra_seconds: number
          p_time_seconds: number
          p_unlocked_at: string
        }
        Returns: string
      }
      live_open_question_tally: {
        Args: { p_live_exam_id: string }
        Returns: Json
      }
      live_session_sync: {
        Args: { p_beat?: boolean; p_live_exam_id: string }
        Returns: Json
      }
      start_live_session: {
        Args: { p_live_exam_id: string }
        Returns: {
          created_at: string
          current_question_index: number
          current_question_unlocked_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          instruction: string | null
          name: string
          primary_language: string
          share_code: string
          started_at: string | null
          status: string
          supported_languages: string[]
          total_questions: number
          updated_at: string
          user_id: string
        }
      }
      submit_live_response: {
        Args: {
          p_live_exam_id: string
          p_live_question_id: string
          p_selected_answer: Json
        }
        Returns: {
          id: string
          is_correct: boolean | null
          live_exam_id: string
          live_question_id: string
          question_ordinal: number
          selected_answer: Json | null
          submitted_at: string
          time_taken_ms: number
          user_id: string
        }
      }
      unlock_next_live_question: {
        Args: { p_live_exam_id: string }
        Returns: {
          created_at: string
          current_question_index: number
          current_question_unlocked_at: string | null
          description: string | null
          ended_at: string | null
          id: string
          instruction: string | null
          name: string
          primary_language: string
          share_code: string
          started_at: string | null
          status: string
          supported_languages: string[]
          total_questions: number
          updated_at: string
          user_id: string
        }
      }
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
