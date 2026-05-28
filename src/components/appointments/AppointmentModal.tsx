import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage, TranslationKey } from '@/hooks/use-language'
import { useAppointments } from '@/hooks/use-appointments'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function AppointmentModal({ open, onOpenChange, contactId, onSuccess }: any) {
  const { t } = useLanguage()
  const { createAppointment } = useAppointments()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    description: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.date || !formData.time || !contactId) return

    setLoading(true)
    try {
      const startTime = new Date(`${formData.date}T${formData.time}`).toISOString()
      const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString() // Default 1 hour

      await createAppointment({
        contact_id: contactId,
        title: formData.title,
        description: formData.description,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
      })

      toast.success(t('profile_saved' as TranslationKey) || 'Appointment scheduled successfully!')
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(t('error_save' as TranslationKey) || 'Failed to schedule appointment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('add_appointment' as TranslationKey) || 'Add Appointment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('title' as TranslationKey) || 'Title'}</Label>
            <Input
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Meeting, Call..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                required
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                required
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Notes, agenda..."
            />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('cancel' as TranslationKey) || 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t('save_changes' as TranslationKey) || 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
