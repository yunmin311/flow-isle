/** Chat reminders are ephemeral, independently of whether a preview is available. */
export function isTransientSocialNotification(app?: string, aumid?: string): boolean {
  const name = (app ?? '').trim().toLowerCase()
  const id = (aumid ?? '').trim().toLowerCase()
  return ['qq', '微信', 'wechat', 'weixin'].includes(name)
    || ['flowisle.social.qq', 'flowisle.social.wechat'].includes(id)
}
