'use client';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-gold text-white hover:brightness-110 dark:text-black',
        variant === 'outline' && 'border border-line bg-panel hover:border-gold/60',
        variant === 'ghost' && 'text-mute hover:bg-line/40 hover:text-ink',
        variant === 'danger' && 'border border-bad/40 text-bad hover:bg-bad/10',
        className,
      )}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:border-gold/50">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--gold))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-mute">{hint}</span>}
      </span>
    </label>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('card p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  gold: 'bg-gold/15 text-gold',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  mute: 'bg-line/60 text-mute',
};
export function Badge({ tone = 'mute', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone])}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className={cx('mt-1 text-xs', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-mute')}>{sub}</div>}
    </div>
  );
}

export function Progress({ value, tone = 'gold' }: { value: number; tone?: 'gold' | 'good' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line/70">
      <div className={cx('h-full rounded-full', { gold: 'bg-gold', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-10 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-mute">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('card w-full shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
          </div>
          <button aria-label="Fechar" className="rounded-md px-2 text-xl leading-none text-mute hover:text-ink" onClick={onClose}>×</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line p-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            value === it.id ? 'border-gold font-medium text-ink' : 'border-transparent text-mute hover:text-ink',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ text }: { text: string }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold">{text}</span>;
}

export function Spinner() {
  return <div className="flex justify-center p-10 text-sm text-mute">Carregando…</div>;
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <div className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{error}</div>;
}
