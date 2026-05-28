export interface UserIntegration {
  id: string
  user_id: string
  evolution_api_url: string | null
  evolution_api_key: string | null
  instance_name: string | null
  status: 'DISCONNECTED' | 'WAITING_QR' | 'CONNECTED'
  is_setup_completed?: boolean
  is_webhook_enabled?: boolean
  created_at: string
}

export interface AIAgent {
  id: string
  user_id: string
  name: string
  description: string | null
  system_prompt: string
  gemini_api_key: string
  is_active: boolean
  business_hours?: any
  emergency_contacts?: string | null
  knowledge_base?: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppContact {
  id: string
  user_id: string
  remote_jid: string
  phone_number: string | null
  push_name: string | null
  profile_picture_url: string | null
  last_message_at: string | null
  classification: string | null
  score: number | null
  ai_analysis_summary: string | null
  ai_agent_id: string | null
  pipeline_stage?: string | null
  is_returning_client?: boolean
  profession?: string | null
  birthday?: string | null
  hobbies?: string | null
  music_preferences?: string | null
  sports_team?: string | null
  food_preferences?: string | null
  family_members?: string | null
  relationship_notes?: string | null
  consent_status?: 'pending' | 'granted' | 'denied' | null
  consent_at?: string | null
  created_at: string
}

export interface Appointment {
  id: string
  user_id: string
  contact_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: 'scheduled' | 'completed' | 'cancelled'
  google_event_id: string | null
  created_at: string
  contact?: WhatsAppContact
}

export interface WhatsAppMessage {
  id: string
  user_id: string
  contact_id: string
  message_id: string
  from_me: boolean
  text: string | null
  type: string | null
  timestamp: string
  raw: any
}
