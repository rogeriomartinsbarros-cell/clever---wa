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
    const emailServiceKey = Deno.env.get('EMAIL_SERVICE_KEY')

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: appt, error } = await supabase
      .from('appointments')
      .select('*, contact:whatsapp_contacts(push_name, phone_number)')
      .eq('id', appointment_id)
      .single()

    if (error || !appt) throw new Error('Appointment not found')

    const userEmail = 'rogeriomartinsbarros@gmail.com'

    console.log(`[Email Sync] Sending email to ${userEmail} for appointment ${appt.title}`)

    if (emailServiceKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${emailServiceKey}`,
        },
        body: JSON.stringify({
          from: 'Acme <onboarding@resend.dev>',
          to: [userEmail],
          subject: `Appointment Confirmed: ${appt.title}`,
          html: `<p>Your appointment with <strong>${appt.contact?.push_name}</strong> has been scheduled for ${new Date(appt.start_time).toLocaleString()}.</p>`,
        }),
      })

      if (!res.ok) {
        console.error(`[Email Sync] Failed to send email via Resend:`, await res.text())
      } else {
        console.log(`[Email Sync] Email sent successfully.`)
      }
    } else {
      console.log(`[Email Sync] EMAIL_SERVICE_KEY missing, simulating email success.`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
