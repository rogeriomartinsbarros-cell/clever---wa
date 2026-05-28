import { useState, useMemo } from 'react'
import { useContacts } from '@/hooks/use-contacts'
import { useLanguage, TranslationKey } from '@/hooks/use-language'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Search,
  Flame,
  ThermometerSun,
  Thermometer,
  Snowflake,
  Ban,
  UserRound,
  MessageSquare,
  Loader2,
  Activity,
  Clock,
  Star,
  Sparkles,
  Send,
  Edit,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR, enUS } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { getBadgeColor } from './Dashboard'
import { cn } from '@/lib/utils'
import { useAgents } from '@/hooks/use-agents'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase/client'

const CATEGORIES = [
  { id: 'All', labelKey: 'all', icon: UserRound },
  { id: 'Hot', labelKey: 'hot', icon: Flame },
  { id: 'Warm', labelKey: 'warm', icon: ThermometerSun },
  { id: 'Lukewarm', labelKey: 'lukewarm', icon: Thermometer },
  { id: 'Cold', labelKey: 'cold', icon: Snowflake },
  { id: 'Do Not Contact', labelKey: 'dnc', icon: Ban },
]

export default function Contacts() {
  const { t, language } = useLanguage()
  const dateLocale = language === 'pt' ? ptBR : enUS
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('All')
  const { contacts, loading, assignAgent, updateBulk } = useContacts(search)
  const { agents } = useAgents()
  const navigate = useNavigate()

  const [selectedContacts, setSelectedContacts] = useState<string[]>([])

  // Send Bulk Messaging states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkFile, setBulkFile] = useState<File | null>(null)
  const [isSendingBulk, setIsSendingBulk] = useState(false)
  const [progress, setProgress] = useState(0)

  // Bulk Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [bulkAgentId, setBulkAgentId] = useState('unchanged')
  const [bulkStatus, setBulkStatus] = useState('unchanged')

  const handleAssignAgent = async (contactId: string, agentId: string) => {
    try {
      await assignAgent(contactId, agentId === 'none' ? null : agentId)
      toast.success(agentId === 'none' ? t('agent_removed') : t('agent_assigned'))
    } catch (error) {
      toast.error(t('error_save'))
    }
  }

  const filteredContacts = useMemo(() => {
    if (activeTab === 'All') return contacts
    return contacts.filter((c) => c.classification === activeTab)
  }, [contacts, activeTab])

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const toggleAll = () => {
    if (selectedContacts.length === filteredContacts.length && filteredContacts.length > 0) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(filteredContacts.map((c) => c.id))
    }
  }

  const handleBulkEditSave = async () => {
    try {
      const updates: any = {}
      if (bulkAgentId !== 'unchanged') {
        updates.ai_agent_id = bulkAgentId === 'none' ? null : bulkAgentId
      }
      if (bulkStatus !== 'unchanged') {
        updates.is_returning_client = bulkStatus === 'returning'
      }

      if (Object.keys(updates).length > 0) {
        await updateBulk(selectedContacts, updates)
        toast.success(t('bulk_success'))
      }
      setIsEditModalOpen(false)
      setSelectedContacts([])
    } catch (e) {
      toast.error(t('bulk_error'))
    }
  }

  const handleSendBulk = async () => {
    if (!bulkText && !bulkFile) return
    setIsSendingBulk(true)
    setProgress(0)
    try {
      let mediaUrl = ''
      if (bulkFile) {
        const fileName = `${Date.now()}-${bulkFile.name}`
        const { error } = await supabase.storage.from('marketing-media').upload(fileName, bulkFile)
        if (error) throw error
        mediaUrl = supabase.storage.from('marketing-media').getPublicUrl(fileName).data.publicUrl
      }

      for (let i = 0; i < selectedContacts.length; i++) {
        const contactId = selectedContacts[i]
        const contact = contacts.find((c) => c.id === contactId)
        if (!contact) continue

        const text = bulkText
          .replace(/{{push_name}}/g, contact.push_name || t('friend' as TranslationKey))
          .replace(/{{name}}/g, contact.push_name || t('friend' as TranslationKey))

        await supabase.functions.invoke('evolution-send-message', {
          body: {
            contactId,
            text,
            mediaUrl,
            fileName: bulkFile?.name,
            mimeType: bulkFile?.type,
          },
        })

        setProgress(i + 1)
        if (i < selectedContacts.length - 1) {
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000))
        }
      }
      toast.success(t('bulk_success'))
      setIsBulkModalOpen(false)
      setSelectedContacts([])
      setBulkText('')
      setBulkFile(null)
    } catch (e) {
      toast.error(t('bulk_error'))
    } finally {
      setIsSendingBulk(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-apple min-h-full bg-background relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-foreground">{t('contacts')}</h2>
          <p className="text-muted-foreground mt-2 font-medium text-base">{t('manage_network')}</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder={t('search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-14 bg-card shadow-sm border-border hover:border-border/80 focus-visible:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
          <TabsList className="w-full justify-start h-auto flex-wrap bg-transparent p-0 gap-3">
            {CATEGORIES.map((cat) => {
              const count = contacts.filter(
                (c) => cat.id === 'All' || c.classification === cat.id,
              ).length
              return (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border-2 border-transparent data-[state=inactive]:bg-card data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground rounded-full px-5 py-2.5 flex items-center gap-2.5 transition-all duration-300 shadow-subtle hover:shadow-elevation"
                >
                  <cat.icon className="h-4 w-4 opacity-80" />
                  <span className="font-semibold text-[14px]">
                    {t(cat.labelKey as TranslationKey)}
                  </span>
                  <span className="bg-current/10 text-current px-2.5 py-0.5 rounded-full text-[11px] font-bold opacity-90">
                    {count}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {!loading && filteredContacts.length > 0 && (
          <div className="flex items-center gap-3 mb-6 px-2">
            <Checkbox
              id="select-all"
              checked={
                filteredContacts.length > 0 && selectedContacts.length === filteredContacts.length
              }
              onCheckedChange={toggleAll}
            />
            <label
              htmlFor="select-all"
              className="text-sm font-medium leading-none cursor-pointer text-muted-foreground"
            >
              {t('all')}
            </label>
          </div>
        )}
      </div>

      <div className="w-full">
        {loading ? (
          <div className="p-24 flex justify-center bg-card rounded-[2.5rem] border border-border shadow-subtle">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/50" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-32 bg-card rounded-[2.5rem] border border-border shadow-subtle">
            <div className="bg-muted w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <UserRound className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground">
              {t('no_contacts_found')}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-3 font-medium text-base">
              {activeTab === 'All'
                ? t('no_contacts_desc_all')
                : t('no_contacts_desc_filtered', {
                    tab: t(CATEGORIES.find((c) => c.id === activeTab)?.labelKey as TranslationKey),
                  })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className={cn(
                  'group relative flex flex-col bg-card rounded-[2rem] p-6 border transition-all duration-300 hover:-translate-y-1.5 cursor-pointer overflow-hidden',
                  selectedContacts.includes(contact.id)
                    ? 'border-primary shadow-elevation'
                    : 'border-border/60 shadow-subtle hover:shadow-elevation',
                )}
                onClick={() => navigate(`/app/chat/${contact.id}`)}
              >
                <div
                  className="absolute top-5 right-5 z-20 flex items-center justify-center p-2 -m-2"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selectedContacts.includes(contact.id)}
                    onCheckedChange={() => toggleContact(contact.id)}
                  />
                </div>
                <div className="flex justify-between items-start mb-5">
                  <Avatar className="h-14 w-14 border-2 border-background shadow-sm transition-transform duration-300 group-hover:scale-105">
                    <AvatarImage src={contact.profile_picture_url || ''} />
                    <AvatarFallback className="bg-muted text-foreground font-bold text-lg">
                      {contact.push_name?.charAt(0) || '#'}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="mb-6 flex-1">
                  <h3 className="font-bold text-xl tracking-tight text-foreground line-clamp-1 mb-1 group-hover:text-primary transition-colors duration-300">
                    {contact.push_name || t('unknown')}
                  </h3>
                  <p className="text-sm font-semibold text-muted-foreground truncate">
                    {contact.phone_number
                      ? `+${contact.phone_number}`
                      : contact.remote_jid.split('@')[0]}
                  </p>
                </div>

                <div className="flex flex-col gap-4 mt-auto pt-5 border-t border-border/40">
                  <div
                    className="w-full"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Select
                      value={contact.ai_agent_id || 'none'}
                      onValueChange={(val) => handleAssignAgent(contact.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs font-semibold bg-muted/30 border-border/50 hover:bg-muted transition-colors rounded-xl w-full">
                        <SelectValue placeholder={t('assign_agent')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-muted-foreground font-medium">
                          {t('no_agent')}
                        </SelectItem>
                        {agents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id} className="font-medium">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  agent.is_active ? 'bg-primary' : 'bg-muted-foreground',
                                )}
                              />
                              {agent.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="p-1 rounded-full bg-muted/50 cursor-help shadow-sm">
                            {contact.consent_status === 'granted' && (
                              <ShieldCheck className="h-4 w-4 text-green-500" />
                            )}
                            {contact.consent_status === 'denied' && (
                              <ShieldAlert className="h-4 w-4 text-red-500" />
                            )}
                            {(!contact.consent_status || contact.consent_status === 'pending') && (
                              <Shield className="h-4 w-4 text-muted-foreground" />
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
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-bold tracking-tight shadow-sm text-[11px] px-3 py-1 rounded-full',
                          getBadgeColor(contact.classification),
                        )}
                      >
                        {contact.classification
                          ? t(
                              contact.classification
                                .toLowerCase()
                                .replace(/ /g, '_') as TranslationKey,
                            )
                          : t('unclassified')}
                      </Badge>
                      {contact.is_returning_client ? (
                        <Badge
                          variant="secondary"
                          className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 text-[11px] px-2 py-0.5 rounded-full shadow-sm"
                        >
                          {t('returning_client' as TranslationKey)}
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[11px] px-2 py-0.5 rounded-full shadow-sm"
                        >
                          {t('new_client' as TranslationKey)}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <Activity className="h-4 w-4 text-muted-foreground/70" />
                      <span>{contact.score ?? '-'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] font-semibold text-muted-foreground/80">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {contact.last_message_at
                        ? formatDistanceToNow(new Date(contact.last_message_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          })
                        : t('no_activity')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedContacts.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-popover/95 backdrop-blur-md border border-border shadow-elevation rounded-full px-6 py-4 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <span className="font-semibold text-sm text-foreground bg-muted px-3 py-1 rounded-full whitespace-nowrap">
            {selectedContacts.length} {t('selected' as TranslationKey)}
          </span>
          <div className="w-px h-6 bg-border mx-2"></div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBulkAgentId('unchanged')
              setBulkStatus('unchanged')
              setIsEditModalOpen(true)
            }}
            className="gap-2 rounded-full whitespace-nowrap"
          >
            <Edit className="w-4 h-4" />{' '}
            <span className="hidden md:inline">{t('bulk_edit' as TranslationKey)}</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setIsBulkModalOpen(true)}
            className="gap-2 rounded-full whitespace-nowrap"
          >
            <Send className="w-4 h-4" />{' '}
            <span className="hidden md:inline">{t('send_bulk' as TranslationKey)}</span>
          </Button>
        </div>
      )}

      {/* Bulk Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulk_edit' as TranslationKey)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('assign_agent' as TranslationKey)}</label>
              <Select value={bulkAgentId} onValueChange={setBulkAgentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchanged">{t('unchanged' as TranslationKey)}</SelectItem>
                  <SelectItem value="none">{t('no_agent' as TranslationKey)}</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('status' as TranslationKey)}</label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchanged">{t('unchanged' as TranslationKey)}</SelectItem>
                  <SelectItem value="returning">
                    {t('returning_client' as TranslationKey)}
                  </SelectItem>
                  <SelectItem value="new">{t('new_client' as TranslationKey)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleBulkEditSave}>{t('save_changes' as TranslationKey)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Bulk Messaging Modal */}
      <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bulk_message' as TranslationKey)}</DialogTitle>
            <DialogDescription>{t('bulk_message_desc' as TranslationKey)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('message_text' as TranslationKey)}</label>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="Olá {{name}}, temos uma novidade para você!"
                rows={5}
                disabled={isSendingBulk}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('media_file' as TranslationKey)}</label>
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                disabled={isSendingBulk}
              />
            </div>
            {isSendingBulk && (
              <div className="flex flex-col items-center justify-center gap-2 py-4 text-primary">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm font-semibold">
                  {t('sending_bulk' as TranslationKey)} ({progress}/{selectedContacts.length})
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isSendingBulk}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleSendBulk} disabled={isSendingBulk || (!bulkText && !bulkFile)}>
              {t('send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
