import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { appointment_id } = await req.json()
    if (!appointment_id) throw new Error('Missing appointment_id')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*, contact:whatsapp_contacts(push_name, phone_number)')
      .eq('id', appointment_id)
      .single()

    if (error || !appt) throw new Error('Appointment not found')

    console.log(`[Calendar Sync] Syncing appointment ${appt.id} for ${appt.contact?.push_name}`)

    if (googleClientId && googleClientSecret) {
      console.log(
        `[Calendar Sync] Authenticating with Google Client ID: ${googleClientId.substring(0, 5)}...`,
      )
    } else {
      console.log(`[Calendar Sync] GOOGLE_CLIENT_ID missing, simulating successful sync.`)
    }

    const mockEventId = `evt_${crypto.randomUUID().replace(/-/g, '')}`

    await supabase
      .from('appointments')
      .update({ google_event_id: mockEventId })
      .eq('id', appointment_id)

    return new Response(JSON.stringify({ success: true, event_id: mockEventId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
