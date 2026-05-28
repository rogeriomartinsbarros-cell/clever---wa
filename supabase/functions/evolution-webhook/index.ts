import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processAiResponse } from '../_shared/ai-handler.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    if (!bodyText) {
      return new Response('ok', { headers: corsHeaders })
    }

    const body = JSON.parse(bodyText)
    console.log(`[Webhook] Received event:`, bodyText.substring(0, 150))

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const instanceName = body.instance || body[0]?.instance
    let userId = null

    if (instanceName) {
      const { data: integ } = await supabase
        .from('user_integrations')
        .select('user_id')
        .eq('instance_name', instanceName)
        .single()
      if (integ) userId = integ.user_id
    }

    if (!userId) {
      // Fallback
      const url = new URL(req.url)
      userId = url.searchParams.get('userId')
    }

    if (!userId) {
      console.error(`[Webhook] No user found for instance: ${instanceName}`)
      return new Response(JSON.stringify({ error: 'User/Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle Evolution API Webhook payload
    const event = body.event || body[0]?.event
    const data = body.data || body[0]?.data || body

    if (event === 'messages.upsert' || event === 'messages.update' || (data.message && data.key)) {
      const msg = data.message || data
      const remoteJid = msg.key?.remoteJid || msg.remoteJid
      const fromMe = msg.key?.fromMe || msg.fromMe
      const messageId = msg.key?.id || msg.id
      const pushName = msg.pushName || ''

      let timestamp = new Date().toISOString()
      if (msg.messageTimestamp) {
        timestamp = new Date(msg.messageTimestamp * 1000).toISOString()
      } else if (msg.timestamp) {
        timestamp = new Date(msg.timestamp * 1000).toISOString()
      }

      let text = ''
      if (msg.message?.conversation) text = msg.message.conversation
      else if (msg.message?.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text
      else if (msg.text) text = msg.text

      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') {
        return new Response('ok', { headers: corsHeaders })
      }

      // Upsert contact
      const { data: contact } = await supabase
        .from('whatsapp_contacts')
        .select('id, push_name, unread_count')
        .eq('user_id', userId)
        .eq('remote_jid', remoteJid)
        .single()

      let contactId = contact?.id
      let currentUnread = contact?.unread_count || 0

      if (!contactId) {
        const { data: newContact } = await supabase
          .from('whatsapp_contacts')
          .insert({
            user_id: userId,
            remote_jid: remoteJid,
            push_name: pushName,
            pipeline_stage: 'Novos Contatos',
          })
          .select('id, unread_count')
          .single()
        contactId = newContact?.id
        currentUnread = 0
      }

      if (contactId && text) {
        const { error: msgError } = await supabase.from('whatsapp_messages').upsert(
          {
            user_id: userId,
            contact_id: contactId,
            message_id: messageId,
            from_me: fromMe,
            text: text,
            type: 'text',
            timestamp: timestamp,
            raw: msg,
          },
          { onConflict: 'user_id,message_id' },
        )

        if (!msgError) {
          const updatePayload: any = {
            last_message_at: timestamp,
            last_message_text: text,
            last_message_from_me: fromMe,
          }

          if (!fromMe) {
            updatePayload.unread_count = currentUnread + 1
          }

          if (pushName && contact?.push_name !== pushName) {
            updatePayload.push_name = pushName
          }

          await supabase.from('whatsapp_contacts').update(updatePayload).eq('id', contactId)

          if (!fromMe) {
            // Trigger AI handler
            processAiResponse(userId, contactId, supabaseUrl, supabaseKey).catch((e) => {
              console.error('[Webhook AI Error]', e)
            })
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[Webhook Error]', error.message)
    // Always return 200 to evolution API to prevent endless retries
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
