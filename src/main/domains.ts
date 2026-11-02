export function getServiceDomains(type: string): string[] {
  switch (type) {
    case 'messenger':
      return ['messenger.com', 'facebook.com']
    case 'whatsapp':
      return ['whatsapp.com', 'whatsapp.net']
    case 'telegram':
      return ['telegram.org', 'telegram.me', 't.me']
    case 'slack':
      return ['slack.com']
    case 'instagram':
      return ['instagram.com']
    case 'gadugadu':
      return ['gg.pl']
    case 'linkedin':
      return ['linkedin.com']
    case 'teams':
      return ['teams.microsoft.com', 'microsoft.com', 'microsoftonline.com', 'login.windows.net']
    default:
      return []
  }
}
