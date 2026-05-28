import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useAgents } from '@/hooks/use-agents'
import { useLanguage, TranslationKey } from '@/hooks/use-language'
import { WhatsAppContact, WhatsAppMessage, Appointment } from '@/lib/types'
import { useAppointments } from '@/hooks/use-appointments'
import { AppointmentModal } from '@/components/appointments/AppointmentModal'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Send,
  Sparkles,
  Loader2,
  Briefcase,
  Cake,
  Music,
  Trophy,
  Utensils,
  Users,
  StickyNote,
  PanelRight,
  X,
  Info,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { agents } = useAgents()
  const { t, language } = useLanguage()
  const dateLocale = language === 'pt' ? ptBR : enUS

  const [contact, setContact] = useState<WhatsAppContact | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [forceSendMode, setForceSendMode] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { appointments, refresh: refreshAppointments } = useAppointments(id)

  const [formData, setFormData] = useState({
    profession: '',
    birthday: '',
    hobbies: '',
    music_preferences: '',
    sports_team: '',
    food_preferences: '',
    family_members: '',
    relationship_notes: '',
    consent_status: 'pending' as 'pending' | 'granted' | 'denied',
  })

  useEffect(() => {
    if (!user || !id) return

    const fetchChat = async () => {
      const { data: contactData } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', id)
        .single()

      if (contactData) {
        setContact(contactData)

        // Reset unread count when opening the chat
        if ((contactData as any).unread_count > 0) {
          await supabase.from('whatsapp_contacts').update({ unread_count: 0 }).eq('id', id)
        }

        setFormData({
          profession: contactData.profession || '',
          birthday: contactData.birthday || '',
          hobbies: contactData.hobbies || '',
          music_preferences: contactData.music_preferences || '',
          sports_team: contactData.sports_team || '',
          food_preferences: contactData.food_preferences || '',
          family_members: contactData.family_members || '',
          relationship_notes: contactData.relationship_notes || '',
          consent_status: contactData.consent_status || 'pending',
        })
      }

      const { data: messagesData } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('contact_id', id)
        .order('timestamp', { ascending: true })

      if (messagesData) setMessages(messagesData)
      setLoading(false)
      scrollToBottom()
    }

    fetchChat()

    const channel = supabase
      .channel(`chat_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `contact_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as WhatsAppMessage]
          })
          scrollToBottom()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, id])

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const handleAgentChange = async (value: string) => {
    const newAgentId = value === 'none_disable' ? null : value
    const { error } = await supabase
      .from('whatsapp_contacts')
      .update({ ai_agent_id: newAgentId })
      .eq('id', id)

    if (error) {
      toast.error(t('error_save' as TranslationKey) || 'Failed to save changes')
    } else {
      setContact((prev) => (prev ? { ...prev, ai_agent_id: newAgentId } : null))
      toast.success(
        newAgentId
          ? t('agent_assigned' as TranslationKey) || 'Agent assigned'
          : t('agent_removed' as TranslationKey) || 'Agent removed',
      )
    }
  }

  const handleSaveProfile = async () => {
    if (!contact) return

    const updates: any = { ...formData }
    if (formData.consent_status !== contact.consent_status) {
      updates.consent_at = new Date().toISOString()
    }

    const { error } = await supabase.from('whatsapp_contacts').update(updates).eq('id', contact.id)

    if (error) {
      toast.error(t('error_save' as TranslationKey) || 'Failed to save changes')
    } else {
      setContact({ ...contact, ...formData })
      toast.success(t('profile_saved' as TranslationKey) || 'Profile saved successfully')
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !contact) return

    const text = newMessage.trim()
    setNewMessage('')
    setIsSending(true)

    try {
      const { data, error } = await supabase.functions.invoke('evolution-send-message', {
        body: { contactId: contact.id, text, forceSend: forceSendMode },
      })

      if (error) {
        let isNumberNotFound = false
        let needsForceSend = false

        if (error.message?.includes('Number not found on WhatsApp')) {
          isNumberNotFound = true
        }

        if ((error as any).context instanceof Response && (error as any).context.status === 400) {
          try {
            const errorData = await (error as any).context.clone().json()
            if (errorData?.error?.includes('Number not found on WhatsApp')) {
              isNumberNotFound = true
              needsForceSend = errorData?.needsForceSend
            }
          } catch (e) {
            // Ignore parse error
          }
        }

        if (isNumberNotFound) {
          if (needsForceSend) {
            setForceSendMode(true)
            setNewMessage(text)
            toast.error(
              t('number_not_on_whatsapp_force' as TranslationKey) ||
                'Validation failed. Click send again to force send.',
            )
          } else {
            toast.error(
              t('number_not_on_whatsapp' as TranslationKey) || 'Number not found on WhatsApp.',
            )
          }
          return
        }
        throw error
      }

      if (data?.error) {
        if (data.error.includes('Number not found on WhatsApp')) {
          if (data.needsForceSend) {
            setForceSendMode(true)
            setNewMessage(text)
            toast.error(
              t('number_not_on_whatsapp_force' as TranslationKey) ||
                'Validation failed. Click send again to force send.',
            )
          } else {
            toast.error(
              t('number_not_on_whatsapp' as TranslationKey) || 'Number not found on WhatsApp.',
            )
          }
          return
        }
        throw new Error(data.error)
      }

      setForceSendMode(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return format(date, 'HH:mm')
  }

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (isToday(date)) return language === 'pt' ? 'Hoje' : 'Today'
    if (isYesterday(date)) return language === 'pt' ? 'Ontem' : 'Yesterday'
    return format(date, 'dd/MM/yyyy', { locale: dateLocale })
  }

  const formatBirthday = (dateStr: string) => {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    if (!y || !m || !d) return dateStr
    return `${d}/${m}/${y}`
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground font-medium">{t('no_contacts_found')}</p>
        <Button
          variant="outline"
          onClick={() => navigate('/app/contacts')}
          className="rounded-full"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('return_home')}
        </Button>
      </div>
    )
  }

  const groupedMessages: { [key: string]: WhatsAppMessage[] } = {}
  messages.forEach((msg) => {
    const dateStr = formatMessageDate(msg.timestamp || msg.created_at || new Date().toISOString())
    if (!groupedMessages[dateStr]) groupedMessages[dateStr] = []
    groupedMessages[dateStr].push(msg)
  })

  return (
    <div className="max-w-[1400px] mx-auto h-[calc(100vh-theme(spacing.20))] sm:h-[calc(100vh-theme(spacing.24))] p-4 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-apple relative">
      <div className="flex w-full h-full gap-4 sm:gap-6 relative">
        {/* Main Chat Area */}
        <div
          className={cn(
            'w-full h-full flex flex-col bg-card border border-border/60 shadow-elevation rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden transition-all duration-300',
            isProfileOpen ? 'hidden lg:flex lg:w-[calc(100%-24rem)] shrink-0' : 'flex-1',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-5 bg-background/50 backdrop-blur-xl border-b border-border/40 z-10 shrink-0">
            <div className="flex items-center gap-3 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full shrink-0 -ml-2 hover:bg-muted"
                onClick={() => navigate('/app/contacts')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border border-border shadow-sm">
                <AvatarImage src={contact.profile_picture_url || ''} />
                <AvatarFallback className="bg-muted text-foreground font-bold text-lg">
                  {contact.push_name?.charAt(0) || '#'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col max-w-[130px] sm:max-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[15px] sm:text-[17px] tracking-tight truncate text-foreground leading-tight">
                    {contact.push_name || t('unknown')}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="p-0.5 rounded-full cursor-help">
                        {contact.consent_status === 'granted' && (
                          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                        )}
                        {contact.consent_status === 'denied' && (
                          <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {(!contact.consent_status || contact.consent_status === 'pending') && (
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {contact.consent_status === 'granted'
                          ? t('consent_granted' as TranslationKey)
                          : contact.consent_status === 'denied'
                            ? t('consent_denied' as TranslationKey)
                            : t('consent_pending' as TranslationKey)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-muted-foreground truncate">
                  {contact.phone_number
                    ? `+${contact.phone_number}`
                    : contact.remote_jid.split('@')[0]}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 bg-muted/30 p-1 sm:p-1.5 rounded-full border border-border/40 shrink-0">
              <div className="hidden sm:flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary shrink-0 ml-1">
                <Sparkles className="h-4 w-4" />
              </div>
              <Select
                value={contact.ai_agent_id || 'none_disable'}
                onValueChange={handleAgentChange}
              >
                <SelectTrigger className="w-[110px] sm:w-[150px] h-8 sm:h-9 rounded-full bg-transparent border-transparent shadow-none font-bold text-[11px] sm:text-[13px] hover:bg-muted/60 transition-colors focus:ring-0 focus:ring-offset-0 px-2 sm:px-3">
                  <SelectValue placeholder={t('no_agent' as TranslationKey) || 'No Agent'} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border/60 shadow-elevation">
                  <SelectItem
                    value="none_disable"
                    className="font-bold text-muted-foreground text-xs sm:text-sm cursor-pointer hover:bg-accent focus:bg-accent rounded-xl py-2.5"
                  >
                    {t('no_agent' as TranslationKey) || 'No Agent'}
                  </SelectItem>
                  {agents.map((agent) => (
                    <SelectItem
                      key={agent.id}
                      value={agent.id}
                      className="font-bold text-foreground text-xs sm:text-sm cursor-pointer hover:bg-accent focus:bg-accent rounded-xl py-2.5"
                    >
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="w-px h-5 bg-border/60 mx-0.5 sm:mx-1"></div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className={cn(
                  'rounded-full h-8 w-8 sm:h-9 sm:w-9 transition-colors hover:bg-muted/80',
                  isProfileOpen &&
                    'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary',
                )}
                title={t('profile' as TranslationKey) || 'Profile'}
              >
                <PanelRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-zinc-50/30 dark:bg-background/30 scrollbar-thin">
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date} className="space-y-6">
                <div className="flex justify-center my-4">
                  <span className="bg-card border border-border/40 text-muted-foreground text-[11px] font-bold px-3 py-1 rounded-full shadow-sm tracking-tight">
                    {date}
                  </span>
                </div>
                {msgs.map((msg, i) => {
                  const isMe = msg.from_me
                  const showAvatar = !isMe && (i === 0 || msgs[i - 1].from_me !== isMe)
                  return (
                    <div
                      key={msg.id}
                      className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'flex max-w-[85%] sm:max-w-[70%] gap-2.5',
                          isMe ? 'flex-row-reverse' : 'flex-row',
                        )}
                      >
                        {!isMe && (
                          <div className="shrink-0 w-8 sm:w-10 flex flex-col justify-end">
                            {showAvatar && (
                              <Avatar className="h-8 w-8 border border-border/40 shadow-sm mb-1">
                                <AvatarImage src={contact.profile_picture_url || ''} />
                                <AvatarFallback className="bg-muted text-[10px] text-foreground font-bold">
                                  {contact.push_name?.charAt(0) || '#'}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        )}
                        <div
                          className={cn(
                            'relative px-4 sm:px-5 py-2.5 sm:py-3 rounded-[1.25rem] sm:rounded-[1.5rem] flex flex-col shadow-sm text-[14px] sm:text-[15px] leading-relaxed font-medium',
                            isMe
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-card border border-border/60 text-foreground rounded-bl-sm',
                          )}
                        >
                          <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                          <span
                            className={cn(
                              'text-[10px] sm:text-[11px] mt-1.5 self-end font-bold opacity-70 tracking-tight',
                              isMe ? 'text-primary-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {formatMessageTime(
                              msg.timestamp || msg.created_at || new Date().toISOString(),
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 sm:p-5 bg-background/50 backdrop-blur-xl border-t border-border/40 shrink-0 z-10">
            <form onSubmit={handleSendMessage} className="flex gap-2.5 sm:gap-3 items-end">
              <div className="relative flex-1">
                <Input
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value)
                    if (forceSendMode) setForceSendMode(false)
                  }}
                  placeholder={t('type_message' as TranslationKey) || 'Type a message...'}
                  className={cn(
                    'w-full bg-card border-border shadow-sm rounded-2xl sm:rounded-full h-12 sm:h-14 px-5 sm:px-6 text-[14px] sm:text-[15px] font-medium pr-12 focus-visible:ring-primary/20 transition-all',
                    forceSendMode && 'border-orange-500/50 focus-visible:ring-orange-500/20',
                  )}
                />
              </div>
              <Button
                type="submit"
                disabled={isSending || !newMessage.trim()}
                size="icon"
                className={cn(
                  'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl sm:rounded-full shrink-0 shadow-subtle hover:scale-105 transition-all duration-300',
                  forceSendMode && 'bg-orange-500 hover:bg-orange-600 text-white',
                )}
                title={forceSendMode ? 'Force Send' : 'Send'}
              >
                {isSending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5 ml-0.5" />
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Profile Sidebar */}
        {isProfileOpen && (
          <div className="w-full lg:w-96 shrink-0 h-full flex flex-col bg-card border border-border/60 shadow-elevation rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden animate-in slide-in-from-right-8 duration-300 absolute lg:relative z-20">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 bg-background/50 backdrop-blur-xl shrink-0">
              <h3 className="font-bold text-lg tracking-tight">
                {t('profile' as TranslationKey) || 'Profile'}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full -mr-2 hover:bg-muted/80"
                onClick={() => setIsProfileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-6 bg-muted/50 rounded-xl p-1">
                  <TabsTrigger value="summary" className="rounded-lg font-semibold">
                    {t('summary' as TranslationKey) || 'Summary'}
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="rounded-lg font-semibold">
                    {t('edit' as TranslationKey) || 'Edit'}
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="summary"
                  className="space-y-3.5 mt-0 outline-none animate-in fade-in"
                >
                  {contact.profession && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl shrink-0 mt-0.5">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('profession' as TranslationKey) || 'Profession'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {contact.profession}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.birthday && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl shrink-0 mt-0.5">
                        <Cake className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('birthday' as TranslationKey) || 'Birthday'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {formatBirthday(contact.birthday)}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.family_members && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl shrink-0 mt-0.5">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('family_members' as TranslationKey) || 'Family'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug whitespace-pre-wrap">
                          {contact.family_members}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.hobbies && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('hobbies' as TranslationKey) || 'Hobbies'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {contact.hobbies}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.music_preferences && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-xl shrink-0 mt-0.5">
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('music_preferences' as TranslationKey) || 'Music'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {contact.music_preferences}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.sports_team && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl shrink-0 mt-0.5">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('sports_team' as TranslationKey) || 'Sports'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {contact.sports_team}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.food_preferences && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl shrink-0 mt-0.5">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('food_preferences' as TranslationKey) || 'Food'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-snug">
                          {contact.food_preferences}
                        </p>
                      </div>
                    </div>
                  )}

                  {contact.relationship_notes && (
                    <div className="flex items-start gap-3.5 p-3.5 rounded-[1.25rem] bg-card border border-border/50 shadow-sm hover:border-primary/20 transition-colors">
                      <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0 mt-0.5">
                        <StickyNote className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          {t('relationship_notes' as TranslationKey) || 'Notes'}
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">
                          {contact.relationship_notes}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t('appointments' as TranslationKey) || 'Appointments'}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAppointmentModalOpen(true)}
                      className="h-7 text-xs font-semibold px-2 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      + {t('add_appointment' as TranslationKey) || 'Add'}
                    </Button>
                  </div>

                  {appointments && appointments.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {appointments.slice(0, 3).map((apt: Appointment) => (
                        <div
                          key={apt.id}
                          className="p-3 rounded-xl bg-card border border-border/50 shadow-sm flex flex-col gap-1"
                        >
                          <span className="font-semibold text-sm">{apt.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(apt.start_time), "dd/MM/yyyy 'às' HH:mm", {
                              locale: dateLocale,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-muted/30 rounded-xl border border-border/40 border-dashed">
                      <p className="text-xs text-muted-foreground font-medium">
                        {t('no_appointments' as TranslationKey) || 'No appointments.'}
                      </p>
                    </div>
                  )}

                  <div className="h-px w-full bg-border/40 my-4" />

                  {!contact.profession &&
                    !contact.birthday &&
                    !contact.hobbies &&
                    !contact.music_preferences &&
                    !contact.sports_team &&
                    !contact.food_preferences &&
                    !contact.family_members &&
                    !contact.relationship_notes && (
                      <div className="text-center py-12 px-4">
                        <div className="bg-muted/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Info className="w-6 h-6 text-muted-foreground/70" />
                        </div>
                        <p className="text-sm text-foreground font-semibold">
                          {t('no_profile_data' as TranslationKey) ||
                            'No profile details added yet.'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Switch to the Edit tab to add personal rapport details.
                        </p>
                      </div>
                    )}
                </TabsContent>

                <TabsContent
                  value="edit"
                  className="space-y-5 mt-0 outline-none animate-in fade-in pb-8"
                >
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('consent_status' as TranslationKey) || 'Consent Status (LGPD)'}
                    </Label>
                    <Select
                      value={formData.consent_status || 'pending'}
                      onValueChange={(val: any) =>
                        setFormData((p) => ({ ...p, consent_status: val }))
                      }
                    >
                      <SelectTrigger className="rounded-xl h-11 bg-card shadow-sm font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">
                          {t('consent_pending' as TranslationKey) || 'Pending'}
                        </SelectItem>
                        <SelectItem value="granted">
                          {t('consent_granted' as TranslationKey) || 'Granted'}
                        </SelectItem>
                        <SelectItem value="denied">
                          {t('consent_denied' as TranslationKey) || 'Denied'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('profession' as TranslationKey) || 'Profession'}
                    </Label>
                    <Input
                      value={formData.profession}
                      onChange={(e) => setFormData((p) => ({ ...p, profession: e.target.value }))}
                      className="rounded-xl h-11 bg-card shadow-sm font-medium"
                      placeholder="e.g. Software Engineer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('birthday' as TranslationKey) || 'Birthday'}
                    </Label>
                    <Input
                      type="date"
                      value={formData.birthday}
                      onChange={(e) => setFormData((p) => ({ ...p, birthday: e.target.value }))}
                      className="rounded-xl h-11 bg-card shadow-sm font-medium block w-full"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('family_members' as TranslationKey) || 'Family Members'}
                    </Label>
                    <Textarea
                      value={formData.family_members}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, family_members: e.target.value }))
                      }
                      className="rounded-xl min-h-[80px] bg-card shadow-sm font-medium resize-none"
                      placeholder="e.g. Spouse: Jane, Kids: Leo & Mia"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('hobbies' as TranslationKey) || 'Hobbies'}
                    </Label>
                    <Input
                      value={formData.hobbies}
                      onChange={(e) => setFormData((p) => ({ ...p, hobbies: e.target.value }))}
                      className="rounded-xl h-11 bg-card shadow-sm font-medium"
                      placeholder="e.g. Photography, Hiking"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('music_preferences' as TranslationKey) || 'Music'}
                    </Label>
                    <Input
                      value={formData.music_preferences}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, music_preferences: e.target.value }))
                      }
                      className="rounded-xl h-11 bg-card shadow-sm font-medium"
                      placeholder="e.g. Jazz, Classic Rock"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('sports_team' as TranslationKey) || 'Sports Team'}
                    </Label>
                    <Input
                      value={formData.sports_team}
                      onChange={(e) => setFormData((p) => ({ ...p, sports_team: e.target.value }))}
                      className="rounded-xl h-11 bg-card shadow-sm font-medium"
                      placeholder="e.g. Lakers, Real Madrid"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('food_preferences' as TranslationKey) || 'Food & Gastronomy'}
                    </Label>
                    <Input
                      value={formData.food_preferences}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, food_preferences: e.target.value }))
                      }
                      className="rounded-xl h-11 bg-card shadow-sm font-medium"
                      placeholder="e.g. Sushi, Italian, Vegan"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                      {t('relationship_notes' as TranslationKey) || 'Relationship Notes'}
                    </Label>
                    <Textarea
                      value={formData.relationship_notes}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, relationship_notes: e.target.value }))
                      }
                      className="rounded-xl min-h-[120px] bg-card shadow-sm font-medium resize-none"
                      placeholder="General observations, how we met, preferences..."
                    />
                  </div>

                  <Button
                    onClick={handleSaveProfile}
                    className="w-full mt-2 rounded-xl h-12 font-bold shadow-subtle hover:scale-[1.02] transition-transform"
                  >
                    {t('save_profile' as TranslationKey) || 'Save Profile'}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {isAppointmentModalOpen && (
        <AppointmentModal
          open={isAppointmentModalOpen}
          onOpenChange={setIsAppointmentModalOpen}
          contactId={contact.id}
          onSuccess={refreshAppointments}
        />
      )}
    </div>
  )
}
