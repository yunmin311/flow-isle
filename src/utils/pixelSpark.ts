// 轻量「液态高光 × 像素微粒」粒子层：
// 与 PixelTime / 陪伴动物共用 3px 像素格基准，仅在关键节点（开始/完成专注、完成任务、收藏星标、电台开播）轻触发，
// 全程 pointer-events: none 并按 prefers-reduced-motion 自动静默。

export type SparkTone = 'accent' | 'break' | 'gold' | 'specular'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  maxLife: number
}

let overlayCanvas: HTMLCanvasElement | null = null
let rafId: number | null = null
const particles: Particle[] = []
let lastTs = 0
let lastBurstAt = 0

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function paletteFor(tone: SparkTone): string[] {
  const accent = readCssVar('--v2-accent', '#ad461e')
  const brk = readCssVar('--v2-break', '#537b51')
  const alert = readCssVar('--v2-alert', '#c96a32')
  const ink = readCssVar('--v2-ink', '#35291f')
  const specular = 'rgba(255, 255, 255, 0.92)'
  if (tone === 'break') return [brk, brk, specular, accent]
  if (tone === 'gold') return [alert, accent, specular, ink]
  if (tone === 'specular') return [specular, accent, brk]
  return [accent, accent, specular, alert]
}

function ensureCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (overlayCanvas && document.body.contains(overlayCanvas)) return overlayCanvas
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;'
  document.body.appendChild(canvas)
  overlayCanvas = canvas
  return canvas
}

function tick(now: number) {
  const canvas = overlayCanvas
  if (!canvas) {
    rafId = null
    return
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = window.innerWidth
  const h = window.innerHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    rafId = null
    return
  }

  const dt = lastTs ? Math.min(32, now - lastTs) : 16
  lastTs = now
  const dtNorm = dt / 16.67

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life += dt
    if (p.life >= p.maxLife) {
      particles.splice(i, 1)
      continue
    }
    p.vx *= Math.pow(0.93, dtNorm)
    p.vy = p.vy * Math.pow(0.93, dtNorm) + 0.045 * dtNorm
    p.x += p.vx * dtNorm
    p.y += p.vy * dtNorm

    const t = p.life / p.maxLife
    const alpha = t < 0.18 ? t / 0.18 : Math.max(0, 1 - Math.pow((t - 0.18) / 0.82, 1.5))
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    const px = Math.round(p.x - p.size / 2)
    const py = Math.round(p.y - p.size / 2)
    ctx.fillRect(px, py, p.size, p.size)
  }

  ctx.globalAlpha = 1
  if (particles.length > 0) {
    rafId = window.requestAnimationFrame(tick)
  } else {
    rafId = null
    lastTs = 0
    ctx.clearRect(0, 0, w, h)
  }
}

export function triggerPixelBurstAt(x: number, y: number, tone: SparkTone = 'accent', count = 8) {
  if (typeof window === 'undefined' || reducedMotion()) return
  const canvas = ensureCanvas()
  if (!canvas) return
  lastBurstAt = performance.now()
  const colors = paletteFor(tone)

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45
    const speed = 1.05 + Math.random() * 1.45
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.45,
      size: i % 3 === 0 ? 2 : 3,
      color: colors[i % colors.length],
      life: 0,
      maxLife: 380 + Math.random() * 140,
    })
  }

  if (rafId === null) {
    lastTs = 0
    rafId = window.requestAnimationFrame(tick)
  }
}

export function triggerPixelBurstAtElement(
  el: HTMLElement | null | undefined,
  tone: SparkTone = 'accent',
  count = 6,
  anchor: 'center' | 'right' = 'center',
) {
  if (typeof window === 'undefined' || !el || reducedMotion()) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const x = anchor === 'right' ? rect.right - 14 : rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  triggerPixelBurstAt(x, y, tone, count)
}

export function triggerPixelBurstFromEvent(event?: Event | null, tone: SparkTone = 'accent', count = 8) {
  if (typeof window === 'undefined' || !event || reducedMotion()) return
  const target = (event.currentTarget ?? event.target) as HTMLElement | null
  if (target && typeof target.getBoundingClientRect === 'function') {
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      triggerPixelBurstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, tone, count)
      return
    }
  }
  if ('clientX' in event && typeof (event as MouseEvent).clientX === 'number') {
    const me = event as MouseEvent
    if (me.clientX || me.clientY) triggerPixelBurstAt(me.clientX, me.clientY, tone, count)
  }
}

const GLOBAL_SPARK_SELECTOR = [
  'button:not(:disabled)',
  '.switch',
  '.capture-switch',
  '.heat-cell:not(.empty)',
  '.station-item',
].join(', ')

/**
 * 全站轻像素微粒交互（撒花/采花）：挂载在面板根节点，
 * 自动为按钮、切换、开关、日历格、电台卡片等点击补上轻巧像素微粒，
 * 并通过 120ms 防重守卫避免与组件内显式触发叠加。
 */
export function installGlobalPixelSpark(root: HTMLElement): () => void {
  const onClick = (event: MouseEvent) => {
    if (reducedMotion()) return
    if (performance.now() - lastBurstAt < 120) return
    const rawTarget = event.target as HTMLElement | null
    if (!rawTarget) return
    const interactive = rawTarget.closest<HTMLElement>(GLOBAL_SPARK_SELECTOR)
    if (!interactive) return
    if (interactive.matches('.btn-close, .search-clear, .error-dismiss, .day-detail-close')) return

    let tone: SparkTone = 'accent'
    let count = 5
    if (interactive.matches('.primary-action, .confirm-btn, .update-btn.primary, .play-btn')) {
      count = 8
    } else if (interactive.matches('.pin-btn, .badge-btn')) {
      tone = 'gold'
      count = 7
    } else if (interactive.matches('.check-circle, .task-checkbox, .subtask-checkbox, .queue-btn.done, .done-btn')) {
      tone = 'break'
      count = 7
    } else if (interactive.matches('.nav-btn, .tab, .tab-item, .mode-btn, .settings-tabs button')) {
      count = 5
    }

    if (event.clientX > 0 || event.clientY > 0) {
      triggerPixelBurstAt(event.clientX, event.clientY, tone, count)
    } else {
      const rect = interactive.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        triggerPixelBurstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, tone, count)
      }
    }
  }

  let lastDetentAt = 0
  let lastDetentKey = ''

  const onRangeInput = (event: Event) => {
    if (reducedMotion()) return
    const target = event.target as HTMLInputElement | null
    if (!target || target.tagName !== 'INPUT' || target.type !== 'range') return
    const min = Number(target.min || 0)
    const max = Number(target.max || 100)
    const val = Number(target.value)
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return
    const pct = Math.round(((val - min) / (max - min)) * 100)
    const detent = pct <= 1 ? 0 : pct >= 99 ? 100 : Math.abs(pct - 50) <= 1 ? 50 : -1
    if (detent === -1) {
      lastDetentKey = ''
      return
    }
    const key = `${target.className}:${detent}`
    const now = performance.now()
    if (key === lastDetentKey || now - lastDetentAt < 350) return
    lastDetentKey = key
    lastDetentAt = now
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      triggerPixelBurstAt(rect.left + (rect.width * detent) / 100, rect.top + rect.height / 2, 'accent', 3)
    }
  }

  root.addEventListener('click', onClick, false)
  root.addEventListener('input', onRangeInput, false)
  return () => {
    root.removeEventListener('click', onClick, false)
    root.removeEventListener('input', onRangeInput, false)
  }
}
