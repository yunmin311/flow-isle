export const webInboxes: ReadonlyMap<string, string> = new Map([
  ['qq', 'https://mail.qq.com/'],
  ['163', 'https://mail.163.com/'],
  ['126', 'https://mail.126.com/'],
  ['gmail', 'https://mail.google.com/mail/#inbox'],
  ['outlook', 'https://outlook.live.com/mail/0/inbox'],
])

const providerLabels: ReadonlyMap<string, string> = new Map([
  ['qq', 'QQ邮箱'],
  ['163', '163邮箱'],
  ['126', '126邮箱'],
  ['gmail', 'Gmail'],
  ['outlook', 'Outlook'],
])

export function emailInboxUrl(provider?: string | null): string | null {
  const key = (provider ?? '').trim().toLowerCase()
  return webInboxes.get(key) ?? null
}

export function emailProviderLabel(provider?: string | null): string {
  const key = (provider ?? '').trim().toLowerCase()
  if (!key) return '邮件'
  return providerLabels.get(key) ?? (key === 'custom' ? '邮箱' : key.toUpperCase())
}

export function formatEmailSourceTag(
  address?: string | null,
  provider?: string | null,
): string {
  const addr = (address ?? '').trim()
  if (addr) return addr
  return emailProviderLabel(provider)
}
