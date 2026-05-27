export function extractCanonicalPhone(data: any): string | null {
  if (!data) return null

  let jid = data.remoteJid || data.jid || data.id
  if (jid) {
    if (jid.includes('@s.whatsapp.net')) {
      return jid.split('@')[0]
    }
  }

  if (data.phoneNumber) {
    return data.phoneNumber
  }

  return null
}
