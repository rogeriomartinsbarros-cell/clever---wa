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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { contactId, text, forceSend, mediaUrl, fileName, mimeType } = await req.json()
    if (!contactId || (!text && !mediaUrl)) throw new Error('Missing contactId, text or mediaUrl')

    const { data: integration } = await supabaseClient
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!integration || !integration.instance_name) {
      throw new Error('Integration not found or not connected')
    }

    const evoUrlRaw = integration.evolution_api_url || Deno.env.get('EVOLUTION_API_URL')
    const evoUrl = evoUrlRaw ? evoUrlRaw.replace(/\/$/, '') : ''
    const evoKey = integration.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY')

    const { data: contact } = await supabaseClient
      .from('whatsapp_contacts')
      .select('remote_jid')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .single()

    if (!contact || !contact.remote_jid) throw new Error('Contact not found')

    // Check message history to bypass validation if a relationship exists
    const { data: messagesHistory } = await supabaseClient
      .from('whatsapp_messages')
      .select('id')
      .eq('contact_id', contactId)
      .limit(1)

    const hasHistory = messagesHistory && messagesHistory.length > 0
    let targetJid = contact.remote_jid

    if (!hasHistory && !forceSend) {
      const numberToCheck = contact.remote_jid.split('@')[0]
      const numericNumber = numberToCheck.replace(/\D/g, '')
      let numbersToTest = [numericNumber]

      // BR 9th digit logic
      if (
        numericNumber.startsWith('55') &&
        (numericNumber.length === 12 || numericNumber.length === 13)
      ) {
        const ddd = numericNumber.substring(2, 4)
        const body = numericNumber.substring(4)
        if (body.length === 8) {
          numbersToTest.push(`55${ddd}9${body}`)
        } else if (body.length === 9 && body.startsWith('9')) {
          numbersToTest.push(`55${ddd}${body.substring(1)}`)
        }
      }

      let validationSuccess = false
      let apiFailed = false

      for (const num of numbersToTest) {
        let checkRes = await fetch(`${evoUrl}/chat/onWhatsApp/${integration.instance_name}`, {
          method: 'POST',
          headers: { apikey: evoKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ numbers: [num] }),
        })

        if (!checkRes.ok && checkRes.status === 404) {
          checkRes = await fetch(`${evoUrl}/chat/whatsappNumbers/${integration.instance_name}`, {
            method: 'POST',
            headers: { apikey: evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ numbers: [num] }),
          })
        }

        if (checkRes.ok) {
          const checkData = await checkRes.json()
          const exists = Array.isArray(checkData) && checkData.length > 0 && checkData[0].exists
          if (exists) {
            validationSuccess = true
            targetJid = checkData[0].jid || `${num}@s.whatsapp.net`
            break
          }
        } else {
          apiFailed = true
        }
      }

      if (!validationSuccess) {
        if (apiFailed) {
          console.warn('Evolution API failed to verify number, but we will block unless forced.')
        }
        return new Response(
          JSON.stringify({ error: 'Number not found on WhatsApp', needsForceSend: true }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
    }

    if (targetJid !== contact.remote_jid) {
      // Update contact if we found a better formatted JID to ensure database consistency
      const { error: updateErr } = await supabaseClient
        .from('whatsapp_contacts')
        .update({ remote_jid: targetJid })
        .eq('id', contactId)

      if (updateErr) {
        console.warn('Failed to update remote_jid (possibly duplicate):', updateErr)
      }
    }

    // Proceed to send the message
    let response
    if (mediaUrl) {
      response = await fetch(`${evoUrl}/message/sendMedia/${integration.instance_name}`, {
        method: 'POST',
        headers: {
          apikey: evoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: targetJid,
          mediatype: 'image',
          mimetype: mimeType || 'image/jpeg',
          caption: text || '',
          media: mediaUrl,
          fileName: fileName || 'image.jpg',
        }),
      })
    } else {
      response = await fetch(`${evoUrl}/message/sendText/${integration.instance_name}`, {
        method: 'POST',
        headers: {
          apikey: evoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: targetJid,
          text: text,
        }),
      })
    }

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Evolution API error: ${errText}`)
    }

    const result = await response.json()
    const messageId = result?.key?.id || result?.id || crypto.randomUUID()
    const timestamp = new Date().toISOString()

    // Optimistically save the message
    await supabaseClient.from('whatsapp_messages').upsert(
      {
        user_id: user.id,
        contact_id: contactId,
        message_id: messageId,
        from_me: true,
        text: text,
        type: 'text',
        timestamp: timestamp,
        raw: result,
      },
      { onConflict: 'user_id,message_id' },
    )

    // Update contact pipeline stage, clear unread count and set last message preview
    await supabaseClient
      .from('whatsapp_contacts')
      .update({
        pipeline_stage: 'Em Conversa',
        last_message_at: timestamp,
        last_message_text: text || '[Media]',
        last_message_from_me: true,
        unread_count: 0,
      })
      .eq('id', contactId)

    return new Response(JSON.stringify({ success: true, messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
