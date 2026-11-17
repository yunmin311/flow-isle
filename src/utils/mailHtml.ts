// Adapted from Fly Island v3.0.8 MailPanel.tsx (MIT); see THIRD_PARTY_NOTICES.md.
import createDOMPurify from 'dompurify'

export function safeMailLink(value: string): string | null {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function sanitizeMailHtml(content: string, remoteImages = false, images: [string, string][] = []): string {
  const purifier = createDOMPurify(window)
  const embedded = new Map(images)
  const layoutTables = new WeakSet<Element>()
  const placeholders = new WeakSet<Element>()
  // Classify while the original table structure is available. Header cells in a
  // nested data table must not turn its outer newsletter container into a grid.
  const isLayoutTable = (table: Element) => {
    const own = (selector: string) => [...table.querySelectorAll(selector)].filter(el => el.closest('table') === table)
    if (['presentation', 'none'].includes(table.getAttribute('role') ?? '')) return true
    if (own('th, caption').length) return false
    const rows = own('tr')
    return Boolean(table.querySelector('table, img')) || rows.length <= 1 || rows.every(row => row.children.length <= 1)
  }
  purifier.addHook('afterSanitizeAttributes', node => {
    // Keep a small, URL-free subset of email typography. Never allow positioning,
    // CSS URLs, visibility tricks, fixed dimensions or styles that escape the body.
    if (!placeholders.has(node)) node.removeAttribute('class')
    if (node.nodeName === 'TABLE' && isLayoutTable(node)) layoutTables.add(node)
    node.removeAttribute('role')
    if (node instanceof HTMLElement) {
      const original = node.style
      const safe = document.createElement('span').style
      for (const property of ['text-align', 'font-weight', 'font-style', 'text-decoration', 'border-collapse', 'vertical-align']) {
        const value = original.getPropertyValue(property)
        if (/^[a-z0-9 -]{1,40}$/i.test(value)) safe.setProperty(property, value)
      }
      node.removeAttribute('style')
      if (safe.cssText) node.setAttribute('style', safe.cssText)
    }
    if (node.nodeName === 'A') {
      const href = safeMailLink(node.getAttribute('href') ?? '')
      if (href) node.setAttribute('href', href)
      else node.removeAttribute('href')
    }
    if (node.nodeName !== 'IMG') return
    const src = node.getAttribute('src') ?? ''
    const cid = src.toLowerCase().startsWith('cid:') ? src.slice(4).replace(/^<|>$/g, '') : null
    const raster = cid ? embedded.get(cid) : undefined
    const inline = raster && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(raster) ? raster : null
    const url = safeMailLink(src.startsWith('//') ? 'https:' + src : src)
    if (!remoteImages || !(inline || url)) {
      const placeholder = document.createElement('span')
      placeholders.add(placeholder)
      placeholder.className = 'mail-image-placeholder'
      placeholder.textContent = `${node.getAttribute('alt') || '邮件图片'} · ${remoteImages ? '无法显示' : '图片未加载'}`
      node.replaceWith(placeholder)
      return
    }
    node.setAttribute('src', inline || url!)
    node.setAttribute('loading', 'lazy')
    node.setAttribute('referrerpolicy', 'no-referrer')
    node.removeAttribute('width'); node.removeAttribute('height')
  })
  const fragment = purifier.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'a', 'hr', 'img'],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'src', 'alt', 'style', 'role', 'class'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, RETURN_DOM_FRAGMENT: true,
  })
  // Only generated classes enter the result; email-supplied classes cannot opt
  // into our reader styles. Data grids keep their own horizontal scroll area.
  for (const table of fragment.querySelectorAll('table')) {
    if (layoutTables.has(table)) table.className = 'mail-layout-table'
    else {
      const wrapper = document.createElement('div')
      wrapper.className = 'mail-data-table'
      wrapper.tabIndex = 0
      wrapper.setAttribute('role', 'region')
      wrapper.setAttribute('aria-label', '邮件表格，可横向滚动')
      table.before(wrapper)
      wrapper.append(table)
    }
  }
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}
