import { useLanguage, TranslationKey } from '@/hooks/use-language'
import { useAppointments } from '@/hooks/use-appointments'
import { format, isFuture, isPast, isToday } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export default function Agenda() {
  const { t, language } = useLanguage()
  const { appointments, deleteAppointment } = useAppointments()
  const dateLocale = language === 'pt' ? ptBR : enUS

  const upcoming = appointments.filter(
    (a) => isFuture(new Date(a.start_time)) || isToday(new Date(a.start_time)),
  )
  const past = appointments.filter(
    (a) => isPast(new Date(a.start_time)) && !isToday(new Date(a.start_time)),
  )

  const AppointmentCard = ({ apt }: { apt: any }) => (
    <div className="flex flex-col sm:flex-row gap-4 p-5 bg-card border border-border shadow-subtle rounded-2xl items-start sm:items-center justify-between hover:shadow-elevation transition-shadow">
      <div className="flex gap-4 items-center">
        <div className="bg-primary/10 p-3 rounded-xl text-primary shrink-0">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-lg">{apt.title}</h3>
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {format(new Date(apt.start_time), 'dd MMM yyyy, HH:mm', { locale: dateLocale })}
            </span>
            {apt.status === 'scheduled' && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 text-[10px]">
                Scheduled
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 w-full sm:w-auto mt-2 sm:mt-0 justify-between sm:justify-end">
        {apt.contact && (
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarImage src={apt.contact.profile_picture_url || ''} />
              <AvatarFallback>{apt.contact.push_name?.charAt(0) || '#'}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">{apt.contact.push_name}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => deleteAppointment(apt.id)}
          className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h2 className="text-4xl font-bold tracking-tight text-foreground">
          {t('agenda' as TranslationKey) || 'Agenda'}
        </h2>
        <p className="text-muted-foreground mt-2 font-medium text-base">
          {t('agenda_desc' as TranslationKey) || 'Manage your upcoming meetings.'}
        </p>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-bold text-foreground">Upcoming</h3>
        {upcoming.length > 0 ? (
          <div className="flex flex-col gap-4">
            {upcoming.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-muted/30 border border-dashed rounded-2xl">
            <p className="text-muted-foreground font-medium">
              {t('no_appointments' as TranslationKey) || 'No upcoming appointments.'}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-6 pt-6 border-t border-border/40">
        <h3 className="text-xl font-bold text-muted-foreground">Past</h3>
        {past.length > 0 ? (
          <div className="flex flex-col gap-4 opacity-75">
            {past.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm font-medium">No past appointments.</p>
        )}
      </div>
    </div>
  )
}
