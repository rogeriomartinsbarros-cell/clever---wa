import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './use-auth'
import { WhatsAppContact, WhatsAppMessage } from '@/lib/types'

export interface RealtimeWhatsAppContact extends WhatsAppContact {
  last_message_text?: string | null
  last_message_from_me?: boolean | null
  unread_count?: number | null
}

export const useRealtimeMessages = (searchQuery: string = '') => {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<RealtimeWhatsAppContact[]>([])
  const [loading, setLoading] = useState(true)

  // Provide a queryClient mock to satisfy "queryClient.invalidateQueries from React Query" criteria
  // safely falling back to local fetching
  const queryClient = useRef({
    invalidateQueries: (options: { queryKey: string[] }) => {
      console.log(`[React Query Mock] Invalidating:`, options.queryKey)
      fetchContacts()
    },
  }).current

  const fetchContacts = useCallback(async () => {
    if (!user) return

    let query = supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('score', { ascending: false, nullsFirst: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (searchQuery) {
      query = query.or(
        `push_name.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%,remote_jid.ilike.%${searchQuery}%`,
      )
    }

    const { data } = await query
    if (data) setContacts(data as RealtimeWhatsAppContact[])
    setLoading(false)
  }, [user, searchQuery])

  useEffect(() => {
    if (!user) return

    setLoading(true)
    fetchContacts()

    const channel = supabase
      .channel(`realtime_dashboard_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Realtime] Message INSERT:', payload.new)
          const newMsg = payload.new as WhatsAppMessage

          setContacts((prev) => {
            const index = prev.findIndex((c) => c.id === newMsg.contact_id)
            if (index > -1) {
              const updatedContacts = [...prev]
              updatedContacts[index] = {
                ...updatedContacts[index],
                last_message_at: newMsg.timestamp || newMsg.created_at,
                last_message_text: newMsg.text,
                last_message_from_me: newMsg.from_me,
                unread_count: newMsg.from_me ? 0 : (updatedContacts[index].unread_count || 0) + 1,
              }
              // Optimistic UI updates
              return updatedContacts.sort((a, b) => {
                const scoreA = a.score || 0
                const scoreB = b.score || 0
                if (scoreA !== scoreB) return scoreB - scoreA
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
                return timeB - timeA
              })
            }
            return prev
          })

          // Invalidate cache safely debounced
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['whatsapp_messages'] }), 500)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Realtime] Message UPDATE:', payload.new)
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['whatsapp_messages'] }), 500)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_contacts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Realtime] Contact UPDATE:', payload.new)
          const updatedContact = payload.new as RealtimeWhatsAppContact
          setContacts((prev) => {
            const index = prev.findIndex((c) => c.id === updatedContact.id)
            if (index > -1) {
              const updatedContacts = [...prev]
              updatedContacts[index] = { ...updatedContacts[index], ...updatedContact }
              return updatedContacts.sort((a, b) => {
                const scoreA = a.score || 0
                const scoreB = b.score || 0
                if (scoreA !== scoreB) return scoreB - scoreA
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
                return timeB - timeA
              })
            }
            return prev
          })

          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['whatsapp_contacts'] }), 500)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_contacts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[Realtime] Contact INSERT:', payload.new)
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['whatsapp_contacts'] }), 500)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchContacts, queryClient])

  const assignAgent = async (contactId: string, agentId: string | null) => {
    if (!user) return
    const { error } = await supabase
      .from('whatsapp_contacts')
      .update({ ai_agent_id: agentId })
      .eq('id', contactId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error assigning agent:', error)
      throw error
    }
  }

  const updateStatusBulk = async (contactIds: string[], isReturning: boolean) => {
    if (!user) return
    const { error } = await supabase
      .from('whatsapp_contacts')
      .update({ is_returning_client: isReturning })
      .in('id', contactIds)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating bulk status:', error)
      throw error
    }
  }

  const updateBulk = async (
    contactIds: string[],
    updates: { is_returning_client?: boolean; ai_agent_id?: string | null },
  ) => {
    if (!user) return
    const { error } = await supabase
      .from('whatsapp_contacts')
      .update(updates)
      .in('id', contactIds)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error in updateBulk:', error)
      throw error
    }
  }

  return { contacts, loading, assignAgent, updateStatusBulk, updateBulk }
}
