import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './use-auth'
import { WhatsAppContact } from '@/lib/types'

export const useContacts = (searchQuery: string = '') => {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<WhatsAppContact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchContacts = async () => {
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
      if (data) setContacts(data as WhatsAppContact[])
      setLoading(false)
    }

    fetchContacts()

    const channel = supabase
      .channel('contacts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_contacts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchContacts()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, searchQuery])

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
