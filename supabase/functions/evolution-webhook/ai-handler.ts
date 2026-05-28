import { createClient } from 'jsr:@supabase/supabase-js@2'

export async function processAiResponse(
  userId: string,
  contactId: string,
  supabaseUrl: string,
  supabaseKey: string,
) {
  console.log(
    `[AI Handler] Starting processAiResponse for userId: ${userId}, contactId: ${contactId}`,
  )
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select(
        'ai_agent_id, remote_jid, is_returning_client, ai_analysis_summary, consent_status, profession, birthday, hobbies, music_preferences, sports_team, food_preferences, family_members',
      )
      .eq('id', contactId)
      .single()

    if (contactError || !contact) {
      console.error(
        `[AI Handler] Exiting: Contact not found or error loading (contactId: ${contactId}). Error:`,
        contactError,
      )
      return
    }

    if (!contact.ai_agent_id) {
      console.log(
        `[AI Handler] Exiting: AI agent is disabled by default for contact ${contactId}. No ai_agent_id assigned.`,
      )
      return
    }

    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', contact.ai_agent_id)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.log(
        `[AI Handler] Exiting: Assigned agent ${contact.ai_agent_id} is either inactive, deleted, or error loading.`,
      )
      return
    }

    const apiKey = agent.gemini_api_key || Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error(
        `[AI Handler] Exiting: GEMINI_API_KEY missing from agent and environment secrets.`,
      )
      return
    }

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('text, from_me')
      .eq('contact_id', contactId)
      .order('timestamp', { ascending: false })
      .limit(12)

    if (!messages || messages.length === 0) {
      console.log(`[AI Handler] Exiting: No messages found for contact ${contactId}.`)
      return
    }

    const history = messages
      .reverse()
      .map((m) => `${m.from_me ? 'Me' : 'Contact'}: ${m.text}`)
      .join('\n')

    let prompt = `
System Instructions:
${agent.system_prompt}

IMPORTANT TONE INSTRUCTIONS:
Be highly humanized, empathetic, welcoming, and focused on solving the user's problem in a conversational way. Do not sound robotic.
`

    if (agent.knowledge_base) {
      prompt += `\n\nKNOWLEDGE BASE / BUSINESS INFO (Use this to answer queries accurately):\n${agent.knowledge_base}`
    }

    if (agent.emergency_contacts) {
      prompt += `\n\nEMERGENCY CONTACTS (Provide these to the user ONLY if they urgently need human assistance or escalation):\n${agent.emergency_contacts}`
    }

    if (agent.business_hours?.enabled && agent.business_hours.schedule) {
      const tz = agent.business_hours.timezone || 'America/Sao_Paulo'
      const now = new Date()

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'long',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      })
      const timeParts = formatter.formatToParts(now)
      const weekday = timeParts.find((p) => p.type === 'weekday')?.value.toLowerCase()
      const hour = parseInt(timeParts.find((p) => p.type === 'hour')?.value || '0', 10)
      const minute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10)

      let isOutside = false
      if (weekday && agent.business_hours.schedule[weekday]) {
        const dayConfig = agent.business_hours.schedule[weekday]
        if (!dayConfig.active) {
          isOutside = true
        } else {
          const [startH, startM] = dayConfig.start.split(':').map(Number)
          const [endH, endM] = dayConfig.end.split(':').map(Number)
          const currentMins = hour * 60 + minute
          const startMins = startH * 60 + startM
          const endMins = endH * 60 + endM
          if (currentMins < startMins || currentMins > endMins) {
            isOutside = true
          }
        }
      }

      if (isOutside) {
        prompt += `\n\nATTENTION: It is currently OUTSIDE of our business hours. The user's time is ${hour}:${minute.toString().padStart(2, '0')} on ${weekday}. Kindly inform the user that the team is away and we will reply as soon as we return during business hours. Be polite and humanized.`
      } else {
        prompt += `\n\nATTENTION: It is currently WITHIN business hours. Answer normally.`
      }
    }

    if (contact.is_returning_client) {
      prompt += `\n\nNote: This is a Returning Client. Adopt a Welcoming tone.`
    } else {
      prompt += `\n\nNote: This is a New Lead.`
    }

    if (contact.ai_analysis_summary) {
      prompt += `\n\nContext from previous interactions: ${contact.ai_analysis_summary}`
    }

    prompt += `\n\nLGPD / PRIVACY INSTRUCTIONS:
If the user asks what personal data we have about them, summarize this information naturally:
Profession: ${contact.profession || 'Not provided'}
Birthday: ${contact.birthday || 'Not provided'}
Hobbies: ${contact.hobbies || 'Not provided'}
Music: ${contact.music_preferences || 'Not provided'}
Sports: ${contact.sports_team || 'Not provided'}
Food: ${contact.food_preferences || 'Not provided'}
Family: ${contact.family_members || 'Not provided'}

If the user explicitly agrees, consents, or gives permission to save their data, or if you ask for it and they say "yes" (e.g., "Sim", "Pode", "Concordo", "Pode salvar"), YOU MUST include this exact JSON block at the very end of your response:
[UPDATE_CONSENT] {"status": "granted"}

If the user explicitly refuses, revokes consent, or asks to delete their data, YOU MUST include this exact JSON block at the very end of your response:
[UPDATE_CONSENT] {"status": "denied"}
`

    if (contact.consent_status !== 'granted') {
      prompt += `\nNote: The user's current consent status is ${contact.consent_status || 'pending'}. You may politely inform them that we store some preferences to offer a personalized experience and ask if they are okay with it, if appropriate for the conversation flow.`
    }

    prompt += `\n\nSCHEDULING INSTRUCTIONS:
If the user wants to schedule an appointment/meeting and you both agreed on a date and time, YOU MUST include this exact JSON block at the very end of your response:
[BOOK_APPOINTMENT] {"title": "Meeting with Client", "start_time": "YYYY-MM-DDTHH:mm:00Z"}
Use the current year and timezone information to format the date correctly in UTC format. Only do this once confirmed.

You are acting as "Me" in the following conversation.
Respond ONLY with the exact text of your next reply. Do not use quotes, explanations, or the prefix "Me:".

CONVERSATION HISTORY:
${history}
`

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
    console.log(`[AI Handler] Calling Gemini API at gemini-1.5-flash...`)

    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error(`[AI Handler] Exiting: Gemini API error: Status ${aiRes.status}`, errText)
      return
    }

    const aiData = await aiRes.json()
    let responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!responseText) {
      console.error(`[AI Handler] Exiting: Empty response from Gemini.`)
      return
    }

    console.log(`[AI Handler] Gemini generated text: "${responseText}"`)

    const consentMatch = responseText.match(/\[UPDATE_CONSENT\]\s*({.*})/)
    if (consentMatch) {
      try {
        const consentData = JSON.parse(consentMatch[1])
        responseText = responseText.replace(consentMatch[0], '').trim()

        if (consentData.status === 'granted' || consentData.status === 'denied') {
          await supabase
            .from('whatsapp_contacts')
            .update({
              consent_status: consentData.status,
              consent_at: new Date().toISOString(),
            })
            .eq('id', contactId)
          console.log(`[AI Handler] Updated consent status to ${consentData.status}`)
        }
      } catch (e) {
        console.error('[AI Handler] Error parsing consent block', e)
      }
    }

    const bookingMatch = responseText.match(/\[BOOK_APPOINTMENT\]\s*({.*})/)
    if (bookingMatch) {
      try {
        const bookingData = JSON.parse(bookingMatch[1])
        responseText = responseText.replace(bookingMatch[0], '').trim()

        const endDateTime = new Date(
          new Date(bookingData.start_time).getTime() + 60 * 60 * 1000,
        ).toISOString()

        const { data: appt, error: apptError } = await supabase
          .from('appointments')
          .insert({
            user_id: userId,
            contact_id: contactId,
            title: bookingData.title || 'Meeting',
            start_time: bookingData.start_time,
            end_time: endDateTime,
            status: 'scheduled',
          })
          .select()
          .single()

        if (appt) {
          console.log(`[AI Handler] Successfully booked appointment: ${appt.id}`)
          supabase.functions
            .invoke('google-calendar-sync', { body: { appointment_id: appt.id } })
            .catch(console.error)
          supabase.functions
            .invoke('send-appointment-email', { body: { appointment_id: appt.id } })
            .catch(console.error)
        } else if (apptError) {
          console.error(`[AI Handler] Error creating appointment:`, apptError)
        }
      } catch (e) {
        console.error('[AI Handler] Error parsing booking block', e)
      }
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!integration || !integration.instance_name) {
      console.error(`[AI Handler] Exiting: Missing integration details.`)
      return
    }

    const evoUrl = (
      integration.evolution_api_url ||
      Deno.env.get('EVOLUTION_API_URL') ||
      ''
    ).replace(/\/$/, '')
    const evoKey = integration.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY')

    const sendRes = await fetch(`${evoUrl}/message/sendText/${integration.instance_name}`, {
      method: 'POST',
      headers: {
        apikey: evoKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: contact.remote_jid,
        text: responseText,
      }),
    })

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      console.error(
        `[AI Handler] Exiting: Failed to send via Evolution API. HTTP ${sendRes.status}`,
        errText,
      )
      return
    }

    const result = await sendRes.json()
    const messageId = result?.key?.id || result?.id || crypto.randomUUID()

    await supabase.from('whatsapp_messages').upsert(
      {
        user_id: userId,
        contact_id: contactId,
        message_id: messageId,
        from_me: true,
        text: responseText,
        type: 'text',
        timestamp: new Date().toISOString(),
        raw: result,
      },
      { onConflict: 'user_id,message_id' },
    )

    await supabase
      .from('whatsapp_contacts')
      .update({
        pipeline_stage: 'Em Conversa',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', contactId)

    console.log(`[AI Handler] Successfully auto-responded to contact ${contactId}`)
  } catch (error) {
    console.error('[AI Handler] Unhandled exception in processAiResponse:', error)
  }
}
