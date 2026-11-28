'use client';
// Bloco "Como usar" recolhível no topo das telas de gestão. Lembra se foi fechado.
import { useEffect, useState } from 'react';

export function HowTo({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem(`howto-${id}`) !== 'fechado'); } catch {} }, [id]);
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(`howto-${id}`, next ? 'aberto' : 'fechado'); } catch {}
  }
  return (
    <div className="mb-5 rounded-xl border border-gold/30 bg-gold/5">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold" aria-expanded={open}>
        <span>📘 {title}</span>
        <span className="text-xs font-normal text-mute">{open ? 'Recolher' : 'Ver tutorial'}</span>
      </button>
      {open && <div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-ink/90 [&_b]:font-semibold [&_li]:ml-4 [&_li]:list-disc">{children}</div>}
    </div>
  );
}
