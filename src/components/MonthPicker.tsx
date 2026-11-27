'use client';
import { MONTHS, nextMonth, prevMonth } from '@/lib/calc';
import { Button } from './ui';

const sel = 'h-8 rounded-md border border-line bg-panel px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gold/40';

/** Setas para andar mês a mês + listas para pular direto para qualquer mês/ano */
export function MonthPicker({ y, m, onChange }: { y: number; m: number; onChange: (y: number, m: number) => void }) {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let i = Math.min(now - 4, y); i <= Math.max(now + 2, y); i++) years.push(i);
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" aria-label="Mês anterior" onClick={() => { const p = prevMonth(y, m); onChange(p.y, p.m); }}>‹</Button>
      <select aria-label="Mês" className={sel} value={m} onChange={(e) => onChange(y, Number(e.target.value))}>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select aria-label="Ano" className={sel} value={y} onChange={(e) => onChange(Number(e.target.value), m)}>
        {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
      </select>
      <Button size="sm" variant="outline" aria-label="Próximo mês" onClick={() => { const n = nextMonth(y, m); onChange(n.y, n.m); }}>›</Button>
    </div>
  );
}
