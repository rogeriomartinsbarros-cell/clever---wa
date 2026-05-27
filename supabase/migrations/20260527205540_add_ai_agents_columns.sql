ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "enabled": false,
  "timezone": "America/Sao_Paulo",
  "schedule": {
    "monday": {"active": true, "start": "09:00", "end": "18:00"},
    "tuesday": {"active": true, "start": "09:00", "end": "18:00"},
    "wednesday": {"active": true, "start": "09:00", "end": "18:00"},
    "thursday": {"active": true, "start": "09:00", "end": "18:00"},
    "friday": {"active": true, "start": "09:00", "end": "18:00"},
    "saturday": {"active": false, "start": "09:00", "end": "13:00"},
    "sunday": {"active": false, "start": "09:00", "end": "13:00"}
  }
}'::jsonb;

ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS emergency_contacts TEXT;

ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS knowledge_base TEXT;
