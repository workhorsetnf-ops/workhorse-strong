// Report crashes and script errors to the coach's Problems page (Update 167).
// Each distinct error is sent once per app session, at most 20 per session,
// and known browser noise is skipped.
import { supabase } from './supabase'

const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i, /AbortError/i, /The operation was aborted/i]
const seen = new Set()
let sent = 0

export function shouldReport(message) {
  const m = String(message || '').trim()
  if (!m || IGNORE.some(r => r.test(m))) return false
  if (seen.has(m) || sent >= 20) return false
  seen.add(m); sent++
  return true
}
export function deviceLabel(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other'
  const app = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches ? 'home-screen app' : 'browser'
  return `${os} · ${app}`
}

export function reportError(err, kind = 'error') {
  try {
    const message = String(err?.message || err || '').slice(0, 500)
    if (!shouldReport(message)) return
    supabase.rpc('log_app_error', {
      p_message: message, p_stack: String(err?.stack || '').slice(0, 4000), p_kind: kind,
      p_path: typeof location !== 'undefined' ? location.pathname : '', p_device: deviceLabel(),
    }).then(() => {}, () => {})
  } catch { /* reporting must never break the app */ }
}

export function installErrorReporting() {
  if (typeof window === 'undefined' || window.__wsErrors) return
  window.__wsErrors = true
  window.addEventListener('error', e => reportError(e.error || e.message, 'error'))
  window.addEventListener('unhandledrejection', e => reportError(e.reason, 'promise'))
}
