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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          active: boolean
          created_at: string
          district: string | null
          email: string
          id: string
          name: string | null
          node_name: string | null
          node_type: string | null
          password_hash: string | null
          program: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          district?: string | null
          email: string
          id?: string
          name?: string | null
          node_name?: string | null
          node_type?: string | null
          password_hash?: string | null
          program?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          district?: string | null
          email?: string
          id?: string
          name?: string | null
          node_name?: string | null
          node_type?: string | null
          password_hash?: string | null
          program?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_rows: {
        Row: {
          applications_count: number | null
          applied_to_job: boolean | null
          call_answered: boolean | null
          call_duration_seconds: number | null
          call_engaged: boolean | null
          call_id: string
          call_outcome: string | null
          call_status: string | null
          campaign_date: string | null
          campaign_day: string
          campaign_type: string | null
          channel: string
          city_campaign: string | null
          connection_id: string | null
          data: Json
          drop_reason: string | null
          id: string
          intent_score: number | null
          job_status: string | null
          language: string | null
          new_job_posted: string | null
          phases_reached: string | null
          phone: string | null
          program: string
          row_hash: string | null
          synced_at: string
          talent_insights_shown: string | null
          tried_to_apply: boolean | null
        }
        Insert: {
          applications_count?: number | null
          applied_to_job?: boolean | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          call_engaged?: boolean | null
          call_id?: string
          call_outcome?: string | null
          call_status?: string | null
          campaign_date?: string | null
          campaign_day?: string
          campaign_type?: string | null
          channel?: string
          city_campaign?: string | null
          connection_id?: string | null
          data: Json
          drop_reason?: string | null
          id?: string
          intent_score?: number | null
          job_status?: string | null
          language?: string | null
          new_job_posted?: string | null
          phases_reached?: string | null
          phone?: string | null
          program: string
          row_hash?: string | null
          synced_at?: string
          talent_insights_shown?: string | null
          tried_to_apply?: boolean | null
        }
        Update: {
          applications_count?: number | null
          applied_to_job?: boolean | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          call_engaged?: boolean | null
          call_id?: string
          call_outcome?: string | null
          call_status?: string | null
          campaign_date?: string | null
          campaign_day?: string
          campaign_type?: string | null
          channel?: string
          city_campaign?: string | null
          connection_id?: string | null
          data?: Json
          drop_reason?: string | null
          id?: string
          intent_score?: number | null
          job_status?: string | null
          language?: string | null
          new_job_posted?: string | null
          phases_reached?: string | null
          phone?: string | null
          program?: string
          row_hash?: string | null
          synced_at?: string
          talent_insights_shown?: string | null
          tried_to_apply?: boolean | null
        }
        Relationships: []
      }
      call_rows_np: {
        Row: {
          applications_count: number | null
          applied_to_job: boolean | null
          call_answered: boolean | null
          call_duration_seconds: number | null
          call_engaged: boolean | null
          call_id: string
          call_outcome: string | null
          call_status: string | null
          campaign_date: string | null
          campaign_day: string
          campaign_type: string | null
          channel: string
          city_campaign: string | null
          connection_id: string | null
          data: Json
          drop_reason: string | null
          id: string
          intent_score: number | null
          job_status: string | null
          language: string | null
          new_job_posted: string | null
          phases_reached: string | null
          phone: string | null
          program: string
          row_hash: string | null
          synced_at: string
          talent_insights_shown: string | null
          tried_to_apply: boolean | null
        }
        Insert: {
          applications_count?: number | null
          applied_to_job?: boolean | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          call_engaged?: boolean | null
          call_id?: string
          call_outcome?: string | null
          call_status?: string | null
          campaign_date?: string | null
          campaign_day?: string
          campaign_type?: string | null
          channel?: string
          city_campaign?: string | null
          connection_id?: string | null
          data: Json
          drop_reason?: string | null
          id?: string
          intent_score?: number | null
          job_status?: string | null
          language?: string | null
          new_job_posted?: string | null
          phases_reached?: string | null
          phone?: string | null
          program: string
          row_hash?: string | null
          synced_at?: string
          talent_insights_shown?: string | null
          tried_to_apply?: boolean | null
        }
        Update: {
          applications_count?: number | null
          applied_to_job?: boolean | null
          call_answered?: boolean | null
          call_duration_seconds?: number | null
          call_engaged?: boolean | null
          call_id?: string
          call_outcome?: string | null
          call_status?: string | null
          campaign_date?: string | null
          campaign_day?: string
          campaign_type?: string | null
          channel?: string
          city_campaign?: string | null
          connection_id?: string | null
          data?: Json
          drop_reason?: string | null
          id?: string
          intent_score?: number | null
          job_status?: string | null
          language?: string | null
          new_job_posted?: string | null
          phases_reached?: string | null
          phone?: string | null
          program?: string
          row_hash?: string | null
          synced_at?: string
          talent_insights_shown?: string | null
          tried_to_apply?: boolean | null
        }
        Relationships: []
      }
      campaign_requests: {
        Row: {
          agent_id: string
          agent_name: string | null
          batch_id: string | null
          batch_name: string
          campaign_date: string | null
          campaign_day: string | null
          campaign_type: string | null
          channel: string | null
          city_campaign: string | null
          cohort_filters: Json | null
          cohort_intent: string | null
          concurrency: number | null
          contact_count: number
          contacts: Json
          created_at: string
          decline_reason: string | null
          id: string
          language: string | null
          max_retries: number | null
          note: string | null
          program: string
          region: string | null
          requested_by: string | null
          retry_after_hrs: number | null
          reviewer_email: string | null
          schedule: Json | null
          selected_statuses: Json | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          batch_id?: string | null
          batch_name: string
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          channel?: string | null
          city_campaign?: string | null
          cohort_filters?: Json | null
          cohort_intent?: string | null
          concurrency?: number | null
          contact_count?: number
          contacts?: Json
          created_at?: string
          decline_reason?: string | null
          id?: string
          language?: string | null
          max_retries?: number | null
          note?: string | null
          program: string
          region?: string | null
          requested_by?: string | null
          retry_after_hrs?: number | null
          reviewer_email?: string | null
          schedule?: Json | null
          selected_statuses?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          batch_id?: string | null
          batch_name?: string
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          channel?: string | null
          city_campaign?: string | null
          cohort_filters?: Json | null
          cohort_intent?: string | null
          concurrency?: number | null
          contact_count?: number
          contacts?: Json
          created_at?: string
          decline_reason?: string | null
          id?: string
          language?: string | null
          max_retries?: number | null
          note?: string | null
          program?: string
          region?: string | null
          requested_by?: string | null
          retry_after_hrs?: number | null
          reviewer_email?: string | null
          schedule?: Json | null
          selected_statuses?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      launched_batch_inputs: {
        Row: {
          batch_id: string
          contact_name: string | null
          created_at: string
          id: string
          normalized_phone: string
          program: string
          raw: Json
          recommendations: string | null
          updated_at: string
          user_intent: string | null
        }
        Insert: {
          batch_id: string
          contact_name?: string | null
          created_at?: string
          id?: string
          normalized_phone: string
          program: string
          raw?: Json
          recommendations?: string | null
          updated_at?: string
          user_intent?: string | null
        }
        Update: {
          batch_id?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          normalized_phone?: string
          program?: string
          raw?: Json
          recommendations?: string | null
          updated_at?: string
          user_intent?: string | null
        }
        Relationships: []
      }
      launched_batches: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          batch_id: string
          batch_name: string | null
          campaign_date: string | null
          campaign_day: string | null
          campaign_type: string | null
          city_campaign: string | null
          created_at: string
          language: string | null
          program: string
          region: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          batch_id: string
          batch_name?: string | null
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          created_at?: string
          language?: string | null
          program: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          batch_id?: string
          batch_name?: string | null
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          created_at?: string
          language?: string | null
          program?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      north_star_config: {
        Row: {
          enabled: boolean
          key: string
          program: string
          sort: number
          threshold: number | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          program: string
          sort?: number
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          program?: string
          sort?: number
          threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      program_agents: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          last_error: string | null
          name: string
          program: string
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          name?: string
          program: string
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          name?: string
          program?: string
          status?: string
        }
        Relationships: []
      }
      program_export_targets: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          last_error: string | null
          last_exported_at: string | null
          program: string
          sheet_id: string
          tab_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          last_error?: string | null
          last_exported_at?: string | null
          program: string
          sheet_id?: string
          tab_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          last_error?: string | null
          last_exported_at?: string | null
          program?: string
          sheet_id?: string
          tab_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      program_sync_state: {
        Row: {
          last_error: string | null
          last_synced_at: string | null
          program: string
          row_count: number
          status: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_synced_at?: string | null
          program: string
          row_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_synced_at?: string | null
          program?: string
          row_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviewers: {
        Row: {
          added_at: string
          email: string
        }
        Insert: {
          added_at?: string
          email: string
        }
        Update: {
          added_at?: string
          email?: string
        }
        Relationships: []
      }
      sheet_connections: {
        Row: {
          channel: string
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_synced_at: string | null
          name: string
          program: string
          row_count: number | null
          sheet_id: string
          status: string
          tab_name: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name: string
          program: string
          row_count?: number | null
          sheet_id: string
          status?: string
          tab_name?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name?: string
          program?: string
          row_count?: number | null
          sheet_id?: string
          status?: string
          tab_name?: string | null
        }
        Relationships: []
      }
      transcript_reviews: {
        Row: {
          call_id: string | null
          call_outcome: string | null
          campaign_day: string | null
          campaign_type: string | null
          city_campaign: string | null
          company_name: string | null
          contact_phone: string | null
          created_at: string
          dataset: string | null
          id: string
          job_id: string | null
          job_status_correct: string | null
          job_status_in_master: string | null
          language: string | null
          output_fields_accurate: string | null
          overall_rating: number | null
          quantitative_issues: string | null
          review_type: string | null
          reviewer_email: string | null
          reviewer_name: string | null
          reviewer_notes: string | null
          summary_match: string | null
          turn_flags: string | null
        }
        Insert: {
          call_id?: string | null
          call_outcome?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          company_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dataset?: string | null
          id?: string
          job_id?: string | null
          job_status_correct?: string | null
          job_status_in_master?: string | null
          language?: string | null
          output_fields_accurate?: string | null
          overall_rating?: number | null
          quantitative_issues?: string | null
          review_type?: string | null
          reviewer_email?: string | null
          reviewer_name?: string | null
          reviewer_notes?: string | null
          summary_match?: string | null
          turn_flags?: string | null
        }
        Update: {
          call_id?: string | null
          call_outcome?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          company_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dataset?: string | null
          id?: string
          job_id?: string | null
          job_status_correct?: string | null
          job_status_in_master?: string | null
          language?: string | null
          output_fields_accurate?: string | null
          overall_rating?: number | null
          quantitative_issues?: string | null
          review_type?: string | null
          reviewer_email?: string | null
          reviewer_name?: string | null
          reviewer_notes?: string | null
          summary_match?: string | null
          turn_flags?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      kkb_grid: {
        Row: {
          applications_count: number | null
          applied_to_job: string | null
          call_answered: string | null
          call_datetime_ist: string | null
          call_duration_seconds: number | null
          call_engaged: string | null
          call_id: string | null
          call_language: string | null
          call_outcome: string | null
          call_recording_url: string | null
          call_transcript: string | null
          campaign_date: string | null
          campaign_day: string | null
          campaign_type: string | null
          city_campaign: string | null
          drop_reason: string | null
          final_summary: string | null
          intent_score: number | null
          intent_score_reasoning: string | null
          jobs_applied: string | null
          jobs_failed_to_apply: string | null
          jobs_recommended: string | null
          jobs_shown: string | null
          language: string | null
          phone: string | null
          primary_topic: string | null
          seeker_name: string | null
          tried_to_apply: string | null
          user_intent: string | null
        }
        Insert: {
          applications_count?: number | null
          applied_to_job?: never
          call_answered?: never
          call_datetime_ist?: never
          call_duration_seconds?: number | null
          call_engaged?: never
          call_id?: string | null
          call_language?: never
          call_outcome?: string | null
          call_recording_url?: never
          call_transcript?: never
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          drop_reason?: string | null
          final_summary?: never
          intent_score?: number | null
          intent_score_reasoning?: never
          jobs_applied?: never
          jobs_failed_to_apply?: never
          jobs_recommended?: never
          jobs_shown?: never
          language?: string | null
          phone?: string | null
          primary_topic?: never
          seeker_name?: never
          tried_to_apply?: never
          user_intent?: never
        }
        Update: {
          applications_count?: number | null
          applied_to_job?: never
          call_answered?: never
          call_datetime_ist?: never
          call_duration_seconds?: number | null
          call_engaged?: never
          call_id?: string | null
          call_language?: never
          call_outcome?: string | null
          call_recording_url?: never
          call_transcript?: never
          campaign_date?: string | null
          campaign_day?: string | null
          campaign_type?: string | null
          city_campaign?: string | null
          drop_reason?: string | null
          final_summary?: never
          intent_score?: number | null
          intent_score_reasoning?: never
          jobs_applied?: never
          jobs_failed_to_apply?: never
          jobs_recommended?: never
          jobs_shown?: never
          language?: string | null
          phone?: string | null
          primary_topic?: never
          seeker_name?: never
          tried_to_apply?: never
          user_intent?: never
        }
        Relationships: []
      }
    }
    Functions: {
      app_user_login: {
        Args: { _email: string; _password?: string }
        Returns: {
          district: string
          email: string
          name: string
          node_name: string
          node_type: string
          program: string
          role: string
        }[]
      }
      get_campaign_drop_causes: {
        Args: {
          _campaign: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_campaign_drop_causes_np: {
        Args: {
          _campaign: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_campaign_list: {
        Args: {
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_campaign_list_np: {
        Args: {
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_dkb_campaign_causes: {
        Args: {
          _campaign: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_dkb_campaign_causes_np: {
        Args: {
          _campaign: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_dkb_drop_analysis: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_dkb_drop_analysis_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_funnel_call_ids: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _stage?: string
          _state?: string
        }
        Returns: Json
      }
      get_funnel_call_ids_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _stage?: string
          _state?: string
        }
        Returns: Json
      }
      get_funnel_durations: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_funnel_durations_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_kkb_call_outcomes: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_kkb_call_outcomes_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_kkb_drop_analysis: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_kkb_drop_analysis_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _state?: string
        }
        Returns: Json
      }
      get_program_aggregate_payload: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_aggregate_payload_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_aggregates: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_aggregates_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_filter_options: { Args: { _program: string }; Returns: Json }
      get_program_metric_groups: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_metric_groups_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_metrics_raw: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      get_program_metrics_raw_np: {
        Args: {
          _campaign?: string
          _campaign_type?: string
          _channel?: string
          _date_from?: string
          _date_to?: string
          _program: string
          _state?: string
        }
        Returns: Json
      }
      upsert_app_user: {
        Args: {
          _active?: boolean
          _district: string
          _email: string
          _name: string
          _node_name: string
          _node_type: string
          _password?: string
          _program: string
          _role: string
        }
        Returns: string
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
