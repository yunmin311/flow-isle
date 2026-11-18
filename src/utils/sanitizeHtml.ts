import DOMPurify from 'dompurify'

// Pasted rich text must not be able to restyle the app, submit forms or embed foreign documents.
const FORBID_TAGS = [
  'style', 'link', 'meta', 'base', 'form', 'button', 'textarea', 'select', 'option',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'svg', 'math',
]

let hookInstalled = false

function isMonochromeColor(raw: string): boolean {
  const s = raw.trim().toLowerCase()
  if (!s || s === 'inherit' || s === 'currentcolor' || s === 'initial' || s === 'unset') return true
  if (s === 'black' || s === 'white') return true
  let r: number, g: number, b: number
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/)
  if (rgbMatch) {
    r = Number(rgbMatch[1]); g = Number(rgbMatch[2]); b = Number(rgbMatch[3])
  } else {
    const hex = s.replace('#', '')
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    } else {
      return false
    }
  }
  return Math.max(r, g, b) - Math.min(r, g, b) <= 26
}

function cleanInlineStyles(el: HTMLElement) {
  const style = el.style
  if (!style || style.length === 0) return
  style.removeProperty('background')
  style.removeProperty('background-color')
  style.removeProperty('background-image')
  style.removeProperty('font-family')
  if (style.color && isMonochromeColor(style.color)) {
    style.removeProperty('color')
  }
  if (!el.getAttribute('style')?.trim()) {
    el.removeAttribute('style')
  }
}

function ensureHook() {
  if (hookInstalled) return
  hookInstalled = true
  // The editor only creates checkbox inputs; any other input type comes from pasted content.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'INPUT' && (node as Element).getAttribute('type') !== 'checkbox') {
      node.parentNode?.removeChild(node)
      return
    }
    if (node instanceof HTMLElement && node.tagName !== 'PRE' && node.tagName !== 'CODE' && node.tagName !== 'MARK') {
      cleanInlineStyles(node)
    }
  })
}

export function sanitizeHtml(html: string): string {
  ensureHook()
  return DOMPurify.sanitize(html, { FORBID_TAGS })
}
