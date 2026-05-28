ALTER TABLE public.whatsapp_contacts
ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'pending' CHECK (consent_status IN ('pending', 'granted', 'denied')),
ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
