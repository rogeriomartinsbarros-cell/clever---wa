import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './use-auth'
import { Appointment } from '@/lib/types'

export const useAppointments = (contactId?: string) => {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAppointments = async () => {
    if (!user) return
    let query = supabase
      .from('appointments')
      .select('*, contact:whatsapp_contacts(*)')
      .eq('user_id', user.id)
      .order('start_time', { ascending: true })

    if (contactId) {
      query = query.eq('contact_id', contactId)
    }

    const { data } = await query
    if (data) setAppointments(data as Appointment[])
    setLoading(false)
  }

  useEffect(() => {
    fetchAppointments()
  }, [user, contactId])

  const createAppointment = async (apptData: Partial<Appointment>) => {
    if (!user) return
    const { data, error } = await supabase
      .from('appointments')
      .insert({ ...apptData, user_id: user.id })
      .select()
      .single()

    if (error) throw error

    // Trigger calendar and email sync Edge Functions
    await supabase.functions.invoke('google-calendar-sync', { body: { appointment_id: data.id } })
    await supabase.functions.invoke('send-appointment-email', { body: { appointment_id: data.id } })

    await fetchAppointments()
    return data
  }

  const deleteAppointment = async (id: string) => {
    if (!user) return
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) throw error
    await fetchAppointments()
  }

  return { appointments, loading, createAppointment, deleteAppointment, refresh: fetchAppointments }
}
