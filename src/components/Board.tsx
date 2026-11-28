'use client';
import { useEffect, useRef, useState } from 'react';

/** Quadro com rolagem horizontal: barra fixa no topo (acompanha a tela) + setas laterais */
export function Board({ children }: { children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ max: 0, pos: 0 });
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const upd = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth), pos = el.scrollLeft;
      setM((p) => (p.max === max && Math.abs(p.pos - pos) < 1 ? p : { max, pos }));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    const mo = new MutationObserver(upd);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', upd);
    window.addEventListener('resize', upd);
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, []);
  const go = (left: number, smooth = false) => body.current?.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  const l = m.pos > 4, r = m.pos < m.max - 4;
  return (
    <div className="relative">
      {m.max > 0 && (
        <div className="sticky top-14 z-20 mb-2 flex items-center gap-2 rounded-lg border border-line bg-panel/95 px-2 py-1.5 backdrop-blur lg:top-2">
          <button type="button" onClick={() => go(m.pos - 300, true)} disabled={!l} className="rounded-md border border-line px-2 text-sm disabled:opacity-30" aria-label="Rolar para a esquerda">‹</button>
          <input type="range" min={0} max={m.max} value={m.pos} onChange={(e) => go(Number(e.target.value))} aria-label="Rolar o quadro" className="h-2 flex-1 cursor-pointer accent-[rgb(var(--gold))]" />
          <button type="button" onClick={() => go(m.pos + 300, true)} disabled={!r} className="rounded-md border border-line px-2 text-sm disabled:opacity-30" aria-label="Rolar para a direita">›</button>
        </div>
      )}
      <div ref={body} className="flex items-start gap-3 overflow-x-auto pb-3">{children}</div>
      {r && <button type="button" onClick={() => go(m.pos + 300, true)} className="fixed right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-line bg-panel shadow lg:block" aria-label="Rolar para a direita">›</button>}
      {l && <button type="button" onClick={() => go(m.pos - 300, true)} className="fixed left-[15.5rem] top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-line bg-panel shadow lg:block" aria-label="Rolar para a esquerda">‹</button>}
    </div>
  );
}
