import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { processAiResponse } from './ai-handler.ts'

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json()
    console.log('[evolution-webhook] Received payload event:', payload.event)

    if (payload.event === 'messages.upsert') {
      const instanceName = payload.instance
      const data = payload.data

      const { data: integration, error: integrationError } = await supabase
        .from('user_integrations')
        .select('user_id')
        .eq('instance_name', instanceName)
        .single()

      if (integrationError || !integration) {
        console.error('[evolution-webhook] Integration not found for instance:', instanceName)
        return new Response('ok', { headers: corsHeaders })
      }

      const userId = integration.user_id

      const messages = Array.isArray(data.message) ? data.message : [data.message].filter(Boolean)

      for (const messageData of messages) {
        const remoteJid = messageData.key?.remoteJid
        if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
          continue
        }

        const pushName = messageData.pushName || null
        const fromMe = messageData.key?.fromMe || false
        const messageId = messageData.key?.id

        let text = null
        let type = 'unknown'

        if (messageData.message?.conversation) {
          text = messageData.message.conversation
          type = 'text'
        } else if (messageData.message?.extendedTextMessage?.text) {
          text = messageData.message.extendedTextMessage.text
          type = 'text'
        } else if (messageData.message?.imageMessage) {
          text = messageData.message.imageMessage.caption || null
          type = 'image'
        } else if (messageData.message?.videoMessage) {
          text = messageData.message.videoMessage.caption || null
          type = 'video'
        } else if (messageData.message?.audioMessage) {
          type = 'audio'
        } else if (messageData.message?.documentMessage) {
          type = 'document'
        }

        const timestamp = messageData.messageTimestamp
          ? new Date(messageData.messageTimestamp * 1000).toISOString()
          : new Date().toISOString()

        const { data: contact, error: contactError } = await supabase
          .from('whatsapp_contacts')
          .select('id, ai_agent_id')
          .eq('user_id', userId)
          .eq('remote_jid', remoteJid)
          .single()

        let contactId = contact?.id
        let aiAgentId = contact?.ai_agent_id

        if (!contact) {
          const { data: newContact, error: insertError } = await supabase
            .from('whatsapp_contacts')
            .insert({
              user_id: userId,
              remote_jid: remoteJid,
              push_name: pushName,
              phone_number: remoteJid.split('@')[0],
              last_message_at: timestamp,
            })
            .select('id, ai_agent_id')
            .single()

          if (insertError) {
            console.error('[evolution-webhook] Error inserting contact:', insertError)
            continue
          }
          contactId = newContact.id
          aiAgentId = newContact.ai_agent_id
        } else {
          await supabase
            .from('whatsapp_contacts')
            .update({
              push_name: pushName || undefined,
              last_message_at: timestamp,
            })
            .eq('id', contactId)
        }

        if (!contactId) continue

        const { error: messageError } = await supabase.from('whatsapp_messages').upsert(
          {
            user_id: userId,
            contact_id: contactId,
            message_id: messageId,
            from_me: fromMe,
            text: text,
            type: type,
            timestamp: timestamp,
            raw: messageData,
          },
          { onConflict: 'user_id,message_id' },
        )

        if (messageError) {
          console.error('[evolution-webhook] Error upserting message:', messageError)
        }

        if (!fromMe && aiAgentId) {
          processAiResponse(userId, contactId, supabaseUrl, supabaseKey).catch((err) => {
            console.error('[evolution-webhook] AI processing error:', err)
          })
        }
      }
    }

    if (payload.event === 'connection.update') {
      const instanceName = payload.instance
      const state = payload.data?.state

      if (state) {
        let status = 'WAITING_QR'
        if (state === 'open') status = 'CONNECTED'
        if (state === 'close') status = 'DISCONNECTED'

        await supabase
          .from('user_integrations')
          .update({ status })
          .eq('instance_name', instanceName)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('[evolution-webhook] Unhandled error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
