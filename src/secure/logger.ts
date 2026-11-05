/**
 * Redacting logger (Secure Engine).
 *
 * - Production builds log nothing to the console (no debug leakage through logcat).
 * - Development logs are redacted: e-mail addresses, bearer/JWT-like tokens, Firebase API
 *   keys and long opaque strings are masked; only allow-listed context keys are printed.
 * - Message text from the decoder must never be passed here.
 */
declare const __DEV__: boolean | undefined;
const DEV = typeof __DEV__ !== 'undefined' ? !!__DEV__ : process.env.NODE_ENV !== 'production';

const SAFE_KEYS = new Set(['outcome', 'quarantined', 'name', 'code', 'domain', 'status', 'attempt', 'delayMs', 'count', 'type', 'reason', 'phase', 'revision']);
export function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[api-key]')
    .replace(/\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [token]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[opaque]');
}
export function safeContext(ctx?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!ctx) return out;
  for (const [k, v] of Object.entries(ctx)) {
    if (!SAFE_KEYS.has(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = redact(v).slice(0, 120);
  }
  return out;
}
type Level = 'debug' | 'info' | 'warn' | 'error';
let sink: ((level: Level, scope: string, message: string, ctx: Record<string, string | number | boolean>) => void) | null = DEV
  ? (level, scope, message, ctx) => {(level === 'error' ? console.warn : console.log)(`[genz:${scope}] ${message}`, ctx);}
  : null;
function write(level: Level, scope: string, message: string, ctx?: Record<string, unknown>) {
  if (!sink) return;
  try {sink(level, scope, redact(message), safeContext(ctx));} catch {}
}
export const logger = {
  debug: (scope: string, message: string, ctx?: Record<string, unknown>) => write('debug', scope, message, ctx),
  info: (scope: string, message: string, ctx?: Record<string, unknown>) => write('info', scope, message, ctx),
  warn: (scope: string, message: string, ctx?: Record<string, unknown>) => write('warn', scope, message, ctx),
  error: (scope: string, message: string, ctx?: Record<string, unknown>) => write('error', scope, message, ctx),
  /** Tests/diagnostics can capture output; pass null to silence. */
  setSink: (next: typeof sink) => {sink = next;},
};
