/** Small admin UI kit. All text is rendered by React (escaped); no HTML injection paths. */
import React, {useEffect, useState} from 'react';

export function Card({title, subtitle, actions, children}: {title?: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode}) {
  return <section className="card">{(title || actions) && <header className="card-head"><div>{title && <h2>{title}</h2>}{subtitle && <p className="muted">{subtitle}</p>}</div>{actions && <div className="row">{actions}</div>}</header>}{children}</section>;
}
export function Stat({label, value, hint}: {label: string; value: React.ReactNode; hint?: string}) {
  return <div className="stat"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{hint && <span className="stat-hint">{hint}</span>}</div>;
}
export function Pill({tone = 'neutral', children}: {tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
export function Notice({kind, children, onClose}: {kind: 'error' | 'ok' | 'info'; children: React.ReactNode; onClose?: () => void}) {
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`notice notice-${kind}`}><span>{children}</span>{onClose && <button className="link" onClick={onClose} aria-label="Dismiss">✕</button>}</div>;
}
export function Field({label, children, hint}: {label: string; children: React.ReactNode; hint?: string}) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}
/** Async loader with error + retry; avoids stale updates after unmount. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{data: T | null; error: unknown; loading: boolean}>({data: null, error: null, loading: true});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    set(s => ({...s, loading: true, error: null}));
    fn().then(data => live && set({data, error: null, loading: false}), error => live && set({data: null, error, loading: false}));
    return () => {live = false;};
  }, [...deps, tick]);
  return {...state, reload: () => setTick(t => t + 1)};
}
/** Destructive actions require typing a confirmation word. */
export function ConfirmButton({label, word, onConfirm, disabled, danger = true}: {label: string; word: string; onConfirm: () => void; disabled?: boolean; danger?: boolean}) {
  const [open, setOpen] = useState(false), [typed, setTyped] = useState('');
  if (!open) return <button className={danger ? 'btn danger' : 'btn'} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return <span className="confirm">
    <input aria-label={`Type ${word} to confirm`} placeholder={`Type ${word}`} value={typed} onChange={e => setTyped(e.target.value)} autoFocus />
    <button className="btn danger" disabled={typed !== word || disabled} onClick={() => {setOpen(false); setTyped(''); onConfirm();}}>Confirm</button>
    <button className="btn ghost" onClick={() => {setOpen(false); setTyped('');}}>Cancel</button>
  </span>;
}
export const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? '—' : n.toLocaleString(undefined, {maximumFractionDigits: digits}));
export const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);
export const when = (t: {toMillis?: () => number} | number | null | undefined) => {
  const ms = typeof t === 'number' ? t : t?.toMillis?.();
  return ms ? new Date(ms).toLocaleString() : '—';
};
export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
